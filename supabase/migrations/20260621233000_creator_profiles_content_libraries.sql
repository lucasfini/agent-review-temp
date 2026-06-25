-- Creator profiles and content library collections.
--
-- Safety goals:
-- - Keep creator profiles and libraries scoped to organizations.
-- - Leave client_id nullable for later internal agency compatibility.
-- - Backfill a default creator profile from existing organization onboarding metadata.
-- - Add nullable generation context columns so existing rows remain valid.

CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  name TEXT NOT NULL DEFAULT 'Default profile',
  website TEXT,
  positioning TEXT,
  audience TEXT,
  content_goal TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  name TEXT NOT NULL DEFAULT 'Library',
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_library_items
  ADD COLUMN IF NOT EXISTS creator_profile_id UUID,
  ADD COLUMN IF NOT EXISTS library_id UUID;

ALTER TABLE public.project_generation_jobs
  ADD COLUMN IF NOT EXISTS creator_profile_id UUID,
  ADD COLUMN IF NOT EXISTS library_id UUID;

DO $$
BEGIN
  IF to_regclass('public.creator_profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'creator_profiles_name_not_blank'
         AND conrelid = 'public.creator_profiles'::regclass
     ) THEN
    ALTER TABLE public.creator_profiles
      ADD CONSTRAINT creator_profiles_name_not_blank
      CHECK (length(btrim(name)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_libraries') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'content_libraries_name_not_blank'
         AND conrelid = 'public.content_libraries'::regclass
     ) THEN
    ALTER TABLE public.content_libraries
      ADD CONSTRAINT content_libraries_name_not_blank
      CHECK (length(btrim(name)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND to_regclass('public.creator_profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'content_library_items_creator_profile_id_fkey'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_creator_profile_id_fkey
      FOREIGN KEY (creator_profile_id) REFERENCES public.creator_profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND to_regclass('public.content_libraries') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'content_library_items_library_id_fkey'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_library_id_fkey
      FOREIGN KEY (library_id) REFERENCES public.content_libraries(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.project_generation_jobs') IS NOT NULL
     AND to_regclass('public.creator_profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'project_generation_jobs_creator_profile_id_fkey'
         AND conrelid = 'public.project_generation_jobs'::regclass
     ) THEN
    ALTER TABLE public.project_generation_jobs
      ADD CONSTRAINT project_generation_jobs_creator_profile_id_fkey
      FOREIGN KEY (creator_profile_id) REFERENCES public.creator_profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.project_generation_jobs') IS NOT NULL
     AND to_regclass('public.content_libraries') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'project_generation_jobs_library_id_fkey'
         AND conrelid = 'public.project_generation_jobs'::regclass
     ) THEN
    ALTER TABLE public.project_generation_jobs
      ADD CONSTRAINT project_generation_jobs_library_id_fkey
      FOREIGN KEY (library_id) REFERENCES public.content_libraries(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_organization_id
  ON public.creator_profiles(organization_id);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_client_id
  ON public.creator_profiles(client_id)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_profiles_org_client_name_unique
  ON public.creator_profiles(
    organization_id,
    (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (lower(btrim(name)))
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_profiles_org_client_default_unique
  ON public.creator_profiles(
    organization_id,
    (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_content_libraries_organization_id
  ON public.content_libraries(organization_id);

CREATE INDEX IF NOT EXISTS idx_content_libraries_client_id
  ON public.content_libraries(client_id)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_libraries_org_client_name_unique
  ON public.content_libraries(
    organization_id,
    (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (lower(btrim(name)))
  );

CREATE INDEX IF NOT EXISTS idx_content_library_items_creator_profile_id
  ON public.content_library_items(creator_profile_id)
  WHERE creator_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_items_library_id
  ON public.content_library_items(library_id)
  WHERE library_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_generation_jobs_creator_profile_id
  ON public.project_generation_jobs(creator_profile_id)
  WHERE creator_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_generation_jobs_library_id
  ON public.project_generation_jobs(library_id)
  WHERE library_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_creator_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_content_libraries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.creator_profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'creator_profiles_set_updated_at'
         AND tgrelid = 'public.creator_profiles'::regclass
     ) THEN
    CREATE TRIGGER creator_profiles_set_updated_at
      BEFORE UPDATE ON public.creator_profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_creator_profiles_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_libraries') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'content_libraries_set_updated_at'
         AND tgrelid = 'public.content_libraries'::regclass
     ) THEN
    CREATE TRIGGER content_libraries_set_updated_at
      BEFORE UPDATE ON public.content_libraries
      FOR EACH ROW
      EXECUTE FUNCTION public.set_content_libraries_updated_at();
  END IF;
END
$$;

WITH organization_profile_seed AS (
  SELECT
    o.id AS organization_id,
    NULL::uuid AS client_id,
    COALESCE(NULLIF(btrim(o.name), ''), 'Default profile') AS name,
    NULLIF(btrim(o.onboarding_metadata_json #>> '{profile,website}'), '') AS website,
    NULLIF(btrim(o.onboarding_metadata_json #>> '{profile,description}'), '') AS positioning,
    NULLIF(btrim(o.onboarding_metadata_json #>> '{profile,audience}'), '') AS audience,
    NULLIF(btrim(o.onboarding_metadata_json #>> '{profile,contentGoal}'), '') AS content_goal,
    true AS is_default,
    o.owner_user_id AS created_by
  FROM public.organizations o
)
INSERT INTO public.creator_profiles (
  organization_id,
  client_id,
  name,
  website,
  positioning,
  audience,
  content_goal,
  is_default,
  created_by
)
SELECT
  seed.organization_id,
  seed.client_id,
  seed.name,
  seed.website,
  seed.positioning,
  seed.audience,
  seed.content_goal,
  seed.is_default,
  seed.created_by
FROM organization_profile_seed seed
WHERE (
    seed.website IS NOT NULL
    OR seed.positioning IS NOT NULL
    OR seed.audience IS NOT NULL
    OR seed.content_goal IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.creator_profiles cp
    WHERE cp.organization_id = seed.organization_id
      AND cp.client_id IS NULL
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_libraries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_profiles'
      AND policyname = 'Active organization members can view creator profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Active organization members can view creator profiles" ON public.creator_profiles FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = creator_profiles.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_profiles'
      AND policyname = 'Organization admins can insert creator profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can insert creator profiles" ON public.creator_profiles FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = creator_profiles.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_profiles'
      AND policyname = 'Organization admins can update creator profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can update creator profiles" ON public.creator_profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = creator_profiles.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency'')))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = creator_profiles.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_profiles'
      AND policyname = 'Organization admins can delete creator profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can delete creator profiles" ON public.creator_profiles FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = creator_profiles.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creator_profiles'
      AND policyname = 'Service role can manage creator_profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage creator_profiles" ON public.creator_profiles FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_libraries'
      AND policyname = 'Active organization members can view content libraries'
  ) THEN
    EXECUTE 'CREATE POLICY "Active organization members can view content libraries" ON public.content_libraries FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = content_libraries.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_libraries'
      AND policyname = 'Organization admins can insert content libraries'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can insert content libraries" ON public.content_libraries FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_libraries.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_libraries'
      AND policyname = 'Organization admins can update content libraries'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can update content libraries" ON public.content_libraries FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_libraries.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency'')))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_libraries.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_libraries'
      AND policyname = 'Organization admins can delete content libraries'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can delete content libraries" ON public.content_libraries FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_libraries.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_libraries'
      AND policyname = 'Service role can manage content_libraries'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage content_libraries" ON public.content_libraries FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.creator_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.creator_profiles TO authenticated;
GRANT ALL ON public.creator_profiles TO service_role;

GRANT SELECT ON public.content_libraries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_libraries TO authenticated;
GRANT ALL ON public.content_libraries TO service_role;
