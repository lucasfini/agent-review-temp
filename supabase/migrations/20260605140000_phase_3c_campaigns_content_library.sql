-- Phase 3C: Campaigns and Content Library Foundation
-- Organization-scoped campaign planning and curated content library records.
--
-- Safety goals:
-- - Keep campaigns and content items scoped to organizations.
-- - Leave client_id nullable for later internal agency phases without creating agency tables here.
-- - Allow active organization members to read, and owners/admins to manage.
-- - Link to projects/outputs opportunistically without requiring those FKs to exist in every environment.

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  brand_voice_id UUID REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  objective TEXT,
  audience TEXT,
  channels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date DATE,
  end_date DATE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  brand_voice_id UUID REFERENCES public.brand_voices(id) ON DELETE SET NULL,
  project_id UUID,
  output_id UUID,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'note',
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  body TEXT,
  excerpt TEXT,
  source_label TEXT,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'campaigns_name_not_blank'
         AND conrelid = 'public.campaigns'::regclass
     ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_name_not_blank
      CHECK (length(btrim(name)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'campaigns_status_check'
         AND conrelid = 'public.campaigns'::regclass
     ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_status_check
      CHECK (status IN ('planned', 'active', 'paused', 'completed', 'archived'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'campaigns_channels_array'
         AND conrelid = 'public.campaigns'::regclass
     ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_channels_array
      CHECK (jsonb_typeof(channels_json) = 'array');
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'campaigns_date_order'
         AND conrelid = 'public.campaigns'::regclass
     ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_date_order
      CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_title_not_blank'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_title_not_blank
      CHECK (length(btrim(title)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_content_type_not_blank'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_content_type_not_blank
      CHECK (length(btrim(content_type)) > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_status_check'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_status_check
      CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_tags_array'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_tags_array
      CHECK (jsonb_typeof(tags_json) = 'array');
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_metadata_object'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND to_regclass('public.projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_project_id_fkey'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND to_regclass('public.outputs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'content_library_items_output_id_fkey'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_output_id_fkey
      FOREIGN KEY (output_id) REFERENCES public.outputs(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id
  ON public.campaigns(organization_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_client_id
  ON public.campaigns(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_brand_voice_id
  ON public.campaigns(brand_voice_id)
  WHERE brand_voice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_status_updated
  ON public.campaigns(organization_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_org_client_name_unique
  ON public.campaigns(
    organization_id,
    (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (lower(btrim(name)))
  );

CREATE INDEX IF NOT EXISTS idx_content_library_items_organization_id
  ON public.content_library_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_content_library_items_client_id
  ON public.content_library_items(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_items_campaign_id
  ON public.content_library_items(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_items_brand_voice_id
  ON public.content_library_items(brand_voice_id)
  WHERE brand_voice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_items_project_id
  ON public.content_library_items(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_items_output_id
  ON public.content_library_items(output_id)
  WHERE output_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_library_items_status_updated
  ON public.content_library_items(organization_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_content_library_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'campaigns_set_updated_at'
         AND tgrelid = 'public.campaigns'::regclass
     ) THEN
    CREATE TRIGGER campaigns_set_updated_at
      BEFORE UPDATE ON public.campaigns
      FOR EACH ROW
      EXECUTE FUNCTION public.set_campaigns_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgname = 'content_library_items_set_updated_at'
         AND tgrelid = 'public.content_library_items'::regclass
     ) THEN
    CREATE TRIGGER content_library_items_set_updated_at
      BEFORE UPDATE ON public.content_library_items
      FOR EACH ROW
      EXECUTE FUNCTION public.set_content_library_items_updated_at();
  END IF;
END
$$;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_library_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'Active organization members can view campaigns'
  ) THEN
    EXECUTE 'CREATE POLICY "Active organization members can view campaigns" ON public.campaigns FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = campaigns.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'Organization admins can insert campaigns'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can insert campaigns" ON public.campaigns FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = campaigns.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'Organization admins can update campaigns'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can update campaigns" ON public.campaigns FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = campaigns.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency'')))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = campaigns.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'Organization admins can delete campaigns'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can delete campaigns" ON public.campaigns FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = campaigns.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'Service role can manage campaigns'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage campaigns" ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_library_items'
      AND policyname = 'Active organization members can view content library items'
  ) THEN
    EXECUTE 'CREATE POLICY "Active organization members can view content library items" ON public.content_library_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = content_library_items.organization_id AND om.user_id = auth.uid() AND om.status = ''active''))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_library_items'
      AND policyname = 'Organization admins can insert content library items'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can insert content library items" ON public.content_library_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_library_items.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_library_items'
      AND policyname = 'Organization admins can update content library items'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can update content library items" ON public.content_library_items FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_library_items.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency'')))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_library_items.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_library_items'
      AND policyname = 'Organization admins can delete content library items'
  ) THEN
    EXECUTE 'CREATE POLICY "Organization admins can delete content library items" ON public.content_library_items FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = content_library_items.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND (om.role IN (''owner'', ''admin'') OR (om.role = ''agency_admin'' AND o.type = ''internal_agency''))))';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_library_items'
      AND policyname = 'Service role can manage content_library_items'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage content_library_items" ON public.content_library_items FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.campaigns TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

GRANT SELECT ON public.content_library_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_library_items TO authenticated;
GRANT ALL ON public.content_library_items TO service_role;
