-- Phase 4A: Internal Agency Schema Foundation
-- Private internal agency data model for client management, imports, and production work.
--
-- Safety goals:
-- - Keep agency records scoped to organizations with type = internal_agency.
-- - Allow only active internal agency organization members to read agency tables.
-- - Keep client management mutations limited to internal agency owners/admins/agency_admins.
-- - Allow service role to manage all rows for trusted server routes.
-- - Do not expose agency records to normal SaaS organizations.

CREATE TABLE IF NOT EXISTS public.agency_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  package_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agency_client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  business_overview TEXT,
  ideal_customer_profile TEXT,
  positioning TEXT,
  offers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  competitors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_pillars_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_pain_points_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  voice_notes TEXT,
  customer_service_tone TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_connected',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.source_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  raw_text TEXT,
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_library_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_clients_name_not_blank'
      AND conrelid = 'public.agency_clients'::regclass
  ) THEN
    ALTER TABLE public.agency_clients
      ADD CONSTRAINT agency_clients_name_not_blank
      CHECK (length(btrim(name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_clients_status_check'
      AND conrelid = 'public.agency_clients'::regclass
  ) THEN
    ALTER TABLE public.agency_clients
      ADD CONSTRAINT agency_clients_status_check
      CHECK (status IN ('active', 'paused', 'archived', 'lead'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_client_profiles_offers_array'
      AND conrelid = 'public.agency_client_profiles'::regclass
  ) THEN
    ALTER TABLE public.agency_client_profiles
      ADD CONSTRAINT agency_client_profiles_offers_array
      CHECK (jsonb_typeof(offers_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_client_profiles_competitors_array'
      AND conrelid = 'public.agency_client_profiles'::regclass
  ) THEN
    ALTER TABLE public.agency_client_profiles
      ADD CONSTRAINT agency_client_profiles_competitors_array
      CHECK (jsonb_typeof(competitors_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_client_profiles_content_pillars_array'
      AND conrelid = 'public.agency_client_profiles'::regclass
  ) THEN
    ALTER TABLE public.agency_client_profiles
      ADD CONSTRAINT agency_client_profiles_content_pillars_array
      CHECK (jsonb_typeof(content_pillars_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_client_profiles_customer_pain_points_array'
      AND conrelid = 'public.agency_client_profiles'::regclass
  ) THEN
    ALTER TABLE public.agency_client_profiles
      ADD CONSTRAINT agency_client_profiles_customer_pain_points_array
      CHECK (jsonb_typeof(customer_pain_points_json) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_client_profiles_metadata_object'
      AND conrelid = 'public.agency_client_profiles'::regclass
  ) THEN
    ALTER TABLE public.agency_client_profiles
      ADD CONSTRAINT agency_client_profiles_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_integrations_provider_check'
      AND conrelid = 'public.client_integrations'::regclass
  ) THEN
    ALTER TABLE public.client_integrations
      ADD CONSTRAINT client_integrations_provider_check
      CHECK (provider IN ('slack', 'granola', 'manual', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_integrations_status_check'
      AND conrelid = 'public.client_integrations'::regclass
  ) THEN
    ALTER TABLE public.client_integrations
      ADD CONSTRAINT client_integrations_status_check
      CHECK (status IN ('not_connected', 'connected', 'needs_attention', 'disabled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_integrations_metadata_object'
      AND conrelid = 'public.client_integrations'::regclass
  ) THEN
    ALTER TABLE public.client_integrations
      ADD CONSTRAINT client_integrations_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'source_imports_provider_check'
      AND conrelid = 'public.source_imports'::regclass
  ) THEN
    ALTER TABLE public.source_imports
      ADD CONSTRAINT source_imports_provider_check
      CHECK (provider IN ('audio_upload', 'transcript', 'slack', 'granola', 'manual_note', 'url', 'document'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'source_imports_metadata_object'
      AND conrelid = 'public.source_imports'::regclass
  ) THEN
    ALTER TABLE public.source_imports
      ADD CONSTRAINT source_imports_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_tasks_title_not_blank'
      AND conrelid = 'public.production_tasks'::regclass
  ) THEN
    ALTER TABLE public.production_tasks
      ADD CONSTRAINT production_tasks_title_not_blank
      CHECK (length(btrim(title)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_tasks_status_check'
      AND conrelid = 'public.production_tasks'::regclass
  ) THEN
    ALTER TABLE public.production_tasks
      ADD CONSTRAINT production_tasks_status_check
      CHECK (status IN ('todo', 'in_progress', 'needs_review', 'ready_to_deliver', 'delivered', 'blocked', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_tasks_priority_check'
      AND conrelid = 'public.production_tasks'::regclass
  ) THEN
    ALTER TABLE public.production_tasks
      ADD CONSTRAINT production_tasks_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_tasks_metadata_object'
      AND conrelid = 'public.production_tasks'::regclass
  ) THEN
    ALTER TABLE public.production_tasks
      ADD CONSTRAINT production_tasks_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agency_clients_organization_id
  ON public.agency_clients(organization_id);

CREATE INDEX IF NOT EXISTS idx_agency_clients_status_updated
  ON public.agency_clients(organization_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_clients_org_name_unique
  ON public.agency_clients(organization_id, (lower(btrim(name))));

CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_client_profiles_client_id_unique
  ON public.agency_client_profiles(client_id);

CREATE INDEX IF NOT EXISTS idx_client_integrations_client_id
  ON public.client_integrations(client_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_integrations_client_provider_unique
  ON public.client_integrations(client_id, provider);

CREATE INDEX IF NOT EXISTS idx_source_imports_organization_id
  ON public.source_imports(organization_id);

CREATE INDEX IF NOT EXISTS idx_source_imports_client_id
  ON public.source_imports(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_imports_campaign_id
  ON public.source_imports(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_imports_created_at
  ON public.source_imports(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_production_tasks_organization_status
  ON public.production_tasks(organization_id, status, priority, due_date);

CREATE INDEX IF NOT EXISTS idx_production_tasks_client_id
  ON public.production_tasks(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_tasks_campaign_id
  ON public.production_tasks(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_tasks_content_item_id
  ON public.production_tasks(content_item_id)
  WHERE content_item_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'brand_voices_client_id_fkey'
         AND conrelid = 'public.brand_voices'::regclass
     ) THEN
    ALTER TABLE public.brand_voices
      ADD CONSTRAINT brand_voices_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.agency_clients(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'campaigns_client_id_fkey'
         AND conrelid = 'public.campaigns'::regclass
     ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.agency_clients(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF to_regclass('public.content_library_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'content_library_items_client_id_fkey'
         AND conrelid = 'public.content_library_items'::regclass
     ) THEN
    ALTER TABLE public.content_library_items
      ADD CONSTRAINT content_library_items_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.agency_clients(id) ON DELETE SET NULL NOT VALID;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_agency_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agency_clients_set_updated_at'
      AND tgrelid = 'public.agency_clients'::regclass
  ) THEN
    CREATE TRIGGER agency_clients_set_updated_at
      BEFORE UPDATE ON public.agency_clients
      FOR EACH ROW
      EXECUTE FUNCTION public.set_agency_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agency_client_profiles_set_updated_at'
      AND tgrelid = 'public.agency_client_profiles'::regclass
  ) THEN
    CREATE TRIGGER agency_client_profiles_set_updated_at
      BEFORE UPDATE ON public.agency_client_profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_agency_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'client_integrations_set_updated_at'
      AND tgrelid = 'public.client_integrations'::regclass
  ) THEN
    CREATE TRIGGER client_integrations_set_updated_at
      BEFORE UPDATE ON public.client_integrations
      FOR EACH ROW
      EXECUTE FUNCTION public.set_agency_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'production_tasks_set_updated_at'
      AND tgrelid = 'public.production_tasks'::regclass
  ) THEN
    CREATE TRIGGER production_tasks_set_updated_at
      BEFORE UPDATE ON public.production_tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.set_agency_updated_at();
  END IF;
END
$$;

ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_clients'
      AND policyname = 'Internal agency members can view agency clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view agency clients" ON public.agency_clients FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_clients.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_clients'
      AND policyname = 'Internal agency admins can insert agency clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can insert agency clients" ON public.agency_clients FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_clients.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_clients'
      AND policyname = 'Internal agency admins can update agency clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can update agency clients" ON public.agency_clients FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_clients.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin''))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_clients.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_clients'
      AND policyname = 'Internal agency admins can delete agency clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can delete agency clients" ON public.agency_clients FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_clients.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_clients'
      AND policyname = 'Service role can manage agency_clients'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage agency_clients" ON public.agency_clients FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_client_profiles'
      AND policyname = 'Internal agency members can view client profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view client profiles" ON public.agency_client_profiles FOR SELECT USING (EXISTS (SELECT 1 FROM public.agency_clients ac JOIN public.organization_members om ON om.organization_id = ac.organization_id JOIN public.organizations o ON o.id = ac.organization_id WHERE ac.id = agency_client_profiles.client_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_client_profiles'
      AND policyname = 'Internal agency admins can manage client profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can manage client profiles" ON public.agency_client_profiles FOR ALL USING (EXISTS (SELECT 1 FROM public.agency_clients ac JOIN public.organization_members om ON om.organization_id = ac.organization_id JOIN public.organizations o ON o.id = ac.organization_id WHERE ac.id = agency_client_profiles.client_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin''))) WITH CHECK (EXISTS (SELECT 1 FROM public.agency_clients ac JOIN public.organization_members om ON om.organization_id = ac.organization_id JOIN public.organizations o ON o.id = ac.organization_id WHERE ac.id = agency_client_profiles.client_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_client_profiles'
      AND policyname = 'Service role can manage agency_client_profiles'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage agency_client_profiles" ON public.agency_client_profiles FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_integrations'
      AND policyname = 'Internal agency members can view client integrations'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view client integrations" ON public.client_integrations FOR SELECT USING (EXISTS (SELECT 1 FROM public.agency_clients ac JOIN public.organization_members om ON om.organization_id = ac.organization_id JOIN public.organizations o ON o.id = ac.organization_id WHERE ac.id = client_integrations.client_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_integrations'
      AND policyname = 'Internal agency admins can manage client integrations'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can manage client integrations" ON public.client_integrations FOR ALL USING (EXISTS (SELECT 1 FROM public.agency_clients ac JOIN public.organization_members om ON om.organization_id = ac.organization_id JOIN public.organizations o ON o.id = ac.organization_id WHERE ac.id = client_integrations.client_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin''))) WITH CHECK (EXISTS (SELECT 1 FROM public.agency_clients ac JOIN public.organization_members om ON om.organization_id = ac.organization_id JOIN public.organizations o ON o.id = ac.organization_id WHERE ac.id = client_integrations.client_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_integrations'
      AND policyname = 'Service role can manage client_integrations'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage client_integrations" ON public.client_integrations FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'source_imports'
      AND policyname = 'Internal agency members can view source imports'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view source imports" ON public.source_imports FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = source_imports.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'source_imports'
      AND policyname = 'Internal agency operators can insert source imports'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency operators can insert source imports" ON public.source_imports FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = source_imports.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'', ''agency_member'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'source_imports'
      AND policyname = 'Internal agency operators can update source imports'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency operators can update source imports" ON public.source_imports FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = source_imports.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'', ''agency_member''))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = source_imports.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'', ''agency_member'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'source_imports'
      AND policyname = 'Service role can manage source_imports'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage source_imports" ON public.source_imports FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'production_tasks'
      AND policyname = 'Internal agency members can view production tasks'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view production tasks" ON public.production_tasks FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = production_tasks.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'production_tasks'
      AND policyname = 'Internal agency operators can insert production tasks'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency operators can insert production tasks" ON public.production_tasks FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = production_tasks.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'', ''agency_member'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'production_tasks'
      AND policyname = 'Internal agency operators can update production tasks'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency operators can update production tasks" ON public.production_tasks FOR UPDATE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = production_tasks.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'', ''agency_member''))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = production_tasks.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'', ''agency_member'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'production_tasks'
      AND policyname = 'Internal agency admins can delete production tasks'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can delete production tasks" ON public.production_tasks FOR DELETE USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = production_tasks.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'production_tasks'
      AND policyname = 'Service role can manage production_tasks'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage production_tasks" ON public.production_tasks FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_client_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.source_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_tasks TO authenticated;

GRANT ALL ON public.agency_clients TO service_role;
GRANT ALL ON public.agency_client_profiles TO service_role;
GRANT ALL ON public.client_integrations TO service_role;
GRANT ALL ON public.source_imports TO service_role;
GRANT ALL ON public.production_tasks TO service_role;
