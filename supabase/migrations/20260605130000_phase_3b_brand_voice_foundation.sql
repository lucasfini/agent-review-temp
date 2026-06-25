-- Phase 3B: Brand Voice Foundation
-- Organization-scoped SaaS brand voice records.
--
-- Safety goals:
-- - Keep brand voices scoped to organizations.
-- - Leave client_id nullable for later internal agency phases without creating agency tables here.
-- - Allow active organization members to read, and owners/admins to manage.

CREATE TABLE IF NOT EXISTS public.brand_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  name TEXT NOT NULL DEFAULT 'Default brand voice',
  description TEXT,
  tone TEXT,
  audience TEXT,
  content_pillars_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  writing_examples_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  banned_phrases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta_preferences TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'brand_voices_name_not_blank'
         AND conrelid = 'public.brand_voices'::regclass
     ) THEN
    ALTER TABLE public.brand_voices
      ADD CONSTRAINT brand_voices_name_not_blank
      CHECK (length(btrim(name)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'brand_voices_content_pillars_array'
         AND conrelid = 'public.brand_voices'::regclass
     ) THEN
    ALTER TABLE public.brand_voices
      ADD CONSTRAINT brand_voices_content_pillars_array
      CHECK (jsonb_typeof(content_pillars_json) = 'array');
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'brand_voices_writing_examples_array'
         AND conrelid = 'public.brand_voices'::regclass
     ) THEN
    ALTER TABLE public.brand_voices
      ADD CONSTRAINT brand_voices_writing_examples_array
      CHECK (jsonb_typeof(writing_examples_json) = 'array');
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'brand_voices_banned_phrases_array'
         AND conrelid = 'public.brand_voices'::regclass
     ) THEN
    ALTER TABLE public.brand_voices
      ADD CONSTRAINT brand_voices_banned_phrases_array
      CHECK (jsonb_typeof(banned_phrases_json) = 'array');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_brand_voices_organization_id
  ON public.brand_voices(organization_id);

CREATE INDEX IF NOT EXISTS idx_brand_voices_client_id
  ON public.brand_voices(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brand_voices_created_by
  ON public.brand_voices(created_by);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_voices_org_client_name_unique
  ON public.brand_voices(
    organization_id,
    (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (lower(btrim(name)))
  );

CREATE OR REPLACE FUNCTION public.set_brand_voices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'brand_voices_set_updated_at'
         AND tgrelid = 'public.brand_voices'::regclass
     ) THEN
    CREATE TRIGGER brand_voices_set_updated_at
      BEFORE UPDATE ON public.brand_voices
      FOR EACH ROW
      EXECUTE FUNCTION public.set_brand_voices_updated_at();
  END IF;
END
$$;

ALTER TABLE public.brand_voices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'brand_voices'
      AND policyname = 'Active organization members can view brand voices'
  ) THEN
    EXECUTE 'CREATE POLICY "Active organization members can view brand voices" ON public.brand_voices FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = brand_voices.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'brand_voices'
      AND policyname = 'Organization admins can insert brand voices'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can insert brand voices" ON public.brand_voices FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = brand_voices.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'brand_voices'
      AND policyname = 'Organization admins can update brand voices'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can update brand voices" ON public.brand_voices FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = brand_voices.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency'')))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = brand_voices.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'brand_voices'
      AND policyname = 'Organization admins can delete brand voices'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can delete brand voices" ON public.brand_voices FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = brand_voices.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'brand_voices'
      AND policyname = 'Service role can manage brand_voices'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage brand_voices" ON public.brand_voices FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.brand_voices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_voices TO authenticated;
GRANT ALL ON public.brand_voices TO service_role;
