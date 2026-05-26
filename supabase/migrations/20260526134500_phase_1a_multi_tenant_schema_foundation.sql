-- Phase 1A: Multi-Tenant Schema Foundation
-- Canonical source: supabase/migrations/
--
-- Safety goals:
-- - Preserve existing user_id-based behavior.
-- - Add nullable organization_id columns for dual-write preparation.
-- - Backfill deterministic personal_legacy organizations for existing users.
-- - Keep migration idempotent.

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  type TEXT NOT NULL DEFAULT 'personal_legacy',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organizations_type_check'
         AND conrelid = 'public.organizations'::regclass
     ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_type_check
      CHECK (type IN ('personal_legacy', 'saas_customer', 'internal_agency'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique
  ON public.organizations(slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id
  ON public.organizations(owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_personal_legacy_owner_unique
  ON public.organizations(owner_user_id)
  WHERE type = 'personal_legacy' AND owner_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'organizations_set_updated_at'
         AND tgrelid = 'public.organizations'::regclass
     ) THEN
    CREATE TRIGGER organizations_set_updated_at
      BEFORE UPDATE ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.set_organizations_updated_at();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF to_regclass('public.organization_members') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_members_role_check'
         AND conrelid = 'public.organization_members'::regclass
     ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_role_check
      CHECK (role IN ('owner', 'admin', 'member', 'agency_admin', 'agency_member'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.organization_members') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_members_status_check'
         AND conrelid = 'public.organization_members'::regclass
     ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_status_check
      CHECK (status IN ('active', 'invited', 'removed'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.organization_members') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organization_members_organization_id_user_id_key'
         AND conrelid = 'public.organization_members'::regclass
     ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_organization_id_user_id_key
      UNIQUE (organization_id, user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id
  ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_user
  ON public.organization_members(organization_id, user_id);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'projects',
    'outputs',
    'usage_events',
    'billing_reservations',
    'project_generation_jobs',
    'integration_connections',
    'integration_imports',
    'narrative_goals',
    'narrative_coverage_snapshots'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID', tbl);
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.organizations (name, slug, type, owner_user_id)
SELECT
  concat(
    coalesce(
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
      'User ' || left(u.id::text, 8)
    ),
    '''s Workspace'
  ) AS name,
  'personal-' || substr(md5(u.id::text), 1, 20) AS slug,
  'personal_legacy' AS type,
  u.id AS owner_user_id
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizations o
  WHERE o.owner_user_id = u.id
    AND o.type = 'personal_legacy'
);

DROP TABLE IF EXISTS tmp_default_organizations;
CREATE TEMP TABLE tmp_default_organizations AS
SELECT DISTINCT ON (o.owner_user_id)
  o.owner_user_id,
  o.id AS organization_id
FROM public.organizations o
WHERE o.type = 'personal_legacy'
  AND o.owner_user_id IS NOT NULL
ORDER BY o.owner_user_id, o.created_at, o.id;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  status,
  invited_by,
  joined_at
)
SELECT
  t.organization_id,
  t.owner_user_id,
  'owner',
  'active',
  t.owner_user_id,
  now()
FROM tmp_default_organizations t
LEFT JOIN public.organization_members m
  ON m.organization_id = t.organization_id
 AND m.user_id = t.owner_user_id
WHERE m.id IS NULL;

DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'organization_id'
     ) THEN
    UPDATE public.projects p
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE p.organization_id IS NULL
      AND p.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.outputs') IS NOT NULL THEN
    UPDATE public.outputs o
    SET organization_id = p.organization_id
    FROM public.projects p
    WHERE o.organization_id IS NULL
      AND o.project_id = p.id
      AND p.organization_id IS NOT NULL;

    UPDATE public.outputs o
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE o.organization_id IS NULL
      AND o.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.usage_events') IS NOT NULL THEN
    UPDATE public.usage_events ue
    SET organization_id = p.organization_id
    FROM public.projects p
    WHERE ue.organization_id IS NULL
      AND ue.project_id = p.id
      AND p.organization_id IS NOT NULL;

    UPDATE public.usage_events ue
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE ue.organization_id IS NULL
      AND ue.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.billing_reservations') IS NOT NULL THEN
    UPDATE public.billing_reservations br
    SET organization_id = p.organization_id
    FROM public.projects p
    WHERE br.organization_id IS NULL
      AND br.project_id = p.id
      AND p.organization_id IS NOT NULL;

    UPDATE public.billing_reservations br
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE br.organization_id IS NULL
      AND br.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.project_generation_jobs') IS NOT NULL THEN
    UPDATE public.project_generation_jobs gj
    SET organization_id = p.organization_id
    FROM public.projects p
    WHERE gj.organization_id IS NULL
      AND gj.project_id = p.id
      AND p.organization_id IS NOT NULL;

    UPDATE public.project_generation_jobs gj
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE gj.organization_id IS NULL
      AND gj.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.integration_connections') IS NOT NULL THEN
    UPDATE public.integration_connections ic
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE ic.organization_id IS NULL
      AND ic.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.integration_imports') IS NOT NULL THEN
    UPDATE public.integration_imports ii
    SET organization_id = p.organization_id
    FROM public.projects p
    WHERE ii.organization_id IS NULL
      AND ii.project_id = p.id
      AND p.organization_id IS NOT NULL;

    UPDATE public.integration_imports ii
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE ii.organization_id IS NULL
      AND ii.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.narrative_goals') IS NOT NULL THEN
    UPDATE public.narrative_goals ng
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE ng.organization_id IS NULL
      AND ng.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.narrative_coverage_snapshots') IS NOT NULL THEN
    UPDATE public.narrative_coverage_snapshots ncs
    SET organization_id = p.organization_id
    FROM public.projects p
    WHERE ncs.organization_id IS NULL
      AND ncs.project_id = p.id
      AND p.organization_id IS NOT NULL;

    UPDATE public.narrative_coverage_snapshots ncs
    SET organization_id = t.organization_id
    FROM tmp_default_organizations t
    WHERE ncs.organization_id IS NULL
      AND ncs.user_id = t.owner_user_id;
  END IF;
END
$$;

DO $$
DECLARE
  tbl TEXT;
  fk_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'projects',
    'outputs',
    'usage_events',
    'billing_reservations',
    'project_generation_jobs',
    'integration_connections',
    'integration_imports',
    'narrative_goals',
    'narrative_coverage_snapshots'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = tbl
           AND column_name = 'organization_id'
       ) THEN
      fk_name := format('%s_organization_id_fkey', tbl);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = fk_name
          AND conrelid = format('public.%I', tbl)::regclass
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL NOT VALID',
          tbl,
          fk_name
        );
      END IF;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  tbl TEXT;
  fk_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'projects',
    'outputs',
    'usage_events',
    'billing_reservations',
    'project_generation_jobs',
    'integration_connections',
    'integration_imports',
    'narrative_goals',
    'narrative_coverage_snapshots'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      fk_name := format('%s_organization_id_fkey', tbl);
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = fk_name
          AND conrelid = format('public.%I', tbl)::regclass
      ) THEN
        BEGIN
          EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', tbl, fk_name);
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Skipping validation for %.%: %', tbl, fk_name, SQLERRM;
        END;
      END IF;
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Users can view member organizations'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view member organizations" ON public.organizations FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organizations.id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Users can view own active memberships'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own active memberships" ON public.organization_members FOR SELECT USING (user_id = auth.uid() AND status = ''active'')';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Service role can manage organizations'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage organizations" ON public.organizations FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Service role can manage organization_members'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage organization_members" ON public.organization_members FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
