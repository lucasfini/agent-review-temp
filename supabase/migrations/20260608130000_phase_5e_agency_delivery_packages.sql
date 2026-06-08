-- Phase 5E: Agency client delivery workflow
-- Internal-only delivery package model for manual exports and delivery tracking.

CREATE TABLE IF NOT EXISTS public.agency_delivery_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  delivery_notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agency_delivery_package_items (
  package_id UUID NOT NULL REFERENCES public.agency_delivery_packages(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_library_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, content_item_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_delivery_packages_title_not_blank'
      AND conrelid = 'public.agency_delivery_packages'::regclass
  ) THEN
    ALTER TABLE public.agency_delivery_packages
      ADD CONSTRAINT agency_delivery_packages_title_not_blank
      CHECK (length(btrim(title)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_delivery_packages_status_check'
      AND conrelid = 'public.agency_delivery_packages'::regclass
  ) THEN
    ALTER TABLE public.agency_delivery_packages
      ADD CONSTRAINT agency_delivery_packages_status_check
      CHECK (status IN ('draft', 'ready', 'delivered', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_delivery_packages_metadata_object'
      AND conrelid = 'public.agency_delivery_packages'::regclass
  ) THEN
    ALTER TABLE public.agency_delivery_packages
      ADD CONSTRAINT agency_delivery_packages_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agency_delivery_packages_org_status
  ON public.agency_delivery_packages(organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_delivery_packages_client
  ON public.agency_delivery_packages(client_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_delivery_package_items_content
  ON public.agency_delivery_package_items(content_item_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agency_delivery_packages_set_updated_at'
      AND tgrelid = 'public.agency_delivery_packages'::regclass
  ) THEN
    CREATE TRIGGER agency_delivery_packages_set_updated_at
      BEFORE UPDATE ON public.agency_delivery_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_agency_delivery_package_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.type = 'internal_agency'
  ) THEN
    RAISE EXCEPTION 'agency delivery packages must belong to an internal agency organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_clients ac
    WHERE ac.id = NEW.client_id
      AND ac.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'delivery package client must belong to the package organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_agency_delivery_package_item_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  package_record record;
  item_record record;
BEGIN
  SELECT organization_id, client_id
  INTO package_record
  FROM public.agency_delivery_packages
  WHERE id = NEW.package_id;

  IF package_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'delivery package item must reference an existing package';
  END IF;

  SELECT organization_id, client_id
  INTO item_record
  FROM public.content_library_items
  WHERE id = NEW.content_item_id;

  IF item_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'delivery package item must reference an existing content item';
  END IF;

  IF item_record.organization_id <> package_record.organization_id THEN
    RAISE EXCEPTION 'delivery package item must belong to the package organization';
  END IF;

  IF item_record.client_id IS DISTINCT FROM package_record.client_id THEN
    RAISE EXCEPTION 'delivery package item must belong to the package client';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agency_delivery_packages_enforce_references'
      AND tgrelid = 'public.agency_delivery_packages'::regclass
  ) THEN
    CREATE TRIGGER agency_delivery_packages_enforce_references
      BEFORE INSERT OR UPDATE OF organization_id, client_id ON public.agency_delivery_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_agency_delivery_package_references();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agency_delivery_package_items_enforce_references'
      AND tgrelid = 'public.agency_delivery_package_items'::regclass
  ) THEN
    CREATE TRIGGER agency_delivery_package_items_enforce_references
      BEFORE INSERT OR UPDATE OF package_id, content_item_id ON public.agency_delivery_package_items
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_agency_delivery_package_item_references();
  END IF;
END
$$;

ALTER TABLE public.agency_delivery_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_delivery_package_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_delivery_packages'
      AND policyname = 'Internal agency members can view delivery packages'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view delivery packages" ON public.agency_delivery_packages FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_delivery_packages.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_delivery_packages'
      AND policyname = 'Internal agency admins can manage delivery packages'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can manage delivery packages" ON public.agency_delivery_packages FOR ALL USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_delivery_packages.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin''))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.organization_id = agency_delivery_packages.organization_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_delivery_packages'
      AND policyname = 'Service role can manage agency_delivery_packages'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage agency_delivery_packages" ON public.agency_delivery_packages FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_delivery_package_items'
      AND policyname = 'Internal agency members can view delivery package items'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency members can view delivery package items" ON public.agency_delivery_package_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.agency_delivery_packages p JOIN public.organization_members om ON om.organization_id = p.organization_id JOIN public.organizations o ON o.id = p.organization_id WHERE p.id = agency_delivery_package_items.package_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency''))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_delivery_package_items'
      AND policyname = 'Internal agency admins can manage delivery package items'
  ) THEN
    EXECUTE 'CREATE POLICY "Internal agency admins can manage delivery package items" ON public.agency_delivery_package_items FOR ALL USING (EXISTS (SELECT 1 FROM public.agency_delivery_packages p JOIN public.organization_members om ON om.organization_id = p.organization_id JOIN public.organizations o ON o.id = p.organization_id WHERE p.id = agency_delivery_package_items.package_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin''))) WITH CHECK (EXISTS (SELECT 1 FROM public.agency_delivery_packages p JOIN public.organization_members om ON om.organization_id = p.organization_id JOIN public.organizations o ON o.id = p.organization_id WHERE p.id = agency_delivery_package_items.package_id AND om.user_id = auth.uid() AND om.status = ''active'' AND o.type = ''internal_agency'' AND om.role IN (''owner'', ''admin'', ''agency_admin'')))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_delivery_package_items'
      AND policyname = 'Service role can manage agency_delivery_package_items'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage agency_delivery_package_items" ON public.agency_delivery_package_items FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_delivery_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_delivery_package_items TO authenticated;
GRANT ALL ON public.agency_delivery_packages TO service_role;
GRANT ALL ON public.agency_delivery_package_items TO service_role;
