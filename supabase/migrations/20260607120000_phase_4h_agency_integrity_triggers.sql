-- Phase 4H: Internal Agency System QA + Security Review
-- Harden agency data integrity below the API layer.
--
-- API routes already validate organization/client/reference scope before service-role writes.
-- These triggers enforce the same invariants for any direct authenticated writes allowed by RLS.

CREATE OR REPLACE FUNCTION public.enforce_agency_client_internal_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.type = 'internal_agency'
  ) THEN
    RAISE EXCEPTION 'agency clients must belong to an internal agency organization';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_agency_source_import_references()
RETURNS TRIGGER AS $$
DECLARE
  campaign_client_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.type = 'internal_agency'
  ) THEN
    RAISE EXCEPTION 'source imports must belong to an internal agency organization';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.agency_clients ac
    WHERE ac.id = NEW.client_id
      AND ac.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'source import client must belong to the same internal agency organization';
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    SELECT c.client_id
    INTO campaign_client_id
    FROM public.campaigns c
    WHERE c.id = NEW.campaign_id
      AND c.organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'source import campaign must belong to the same internal agency organization';
    END IF;

    IF NEW.client_id IS NOT NULL
       AND campaign_client_id IS NOT NULL
       AND campaign_client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'source import campaign must belong to the selected agency client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_agency_production_task_references()
RETURNS TRIGGER AS $$
DECLARE
  campaign_client_id UUID;
  content_item_client_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.type = 'internal_agency'
  ) THEN
    RAISE EXCEPTION 'production tasks must belong to an internal agency organization';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.agency_clients ac
    WHERE ac.id = NEW.client_id
      AND ac.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'production task client must belong to the same internal agency organization';
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    SELECT c.client_id
    INTO campaign_client_id
    FROM public.campaigns c
    WHERE c.id = NEW.campaign_id
      AND c.organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'production task campaign must belong to the same internal agency organization';
    END IF;

    IF NEW.client_id IS NOT NULL
       AND campaign_client_id IS NOT NULL
       AND campaign_client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'production task campaign must belong to the selected agency client';
    END IF;
  END IF;

  IF NEW.content_item_id IS NOT NULL THEN
    SELECT cli.client_id
    INTO content_item_client_id
    FROM public.content_library_items cli
    WHERE cli.id = NEW.content_item_id
      AND cli.organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'production task content item must belong to the same internal agency organization';
    END IF;

    IF NEW.client_id IS NOT NULL
       AND content_item_client_id IS NOT NULL
       AND content_item_client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'production task content item must belong to the selected agency client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'agency_clients_enforce_internal_org'
      AND tgrelid = 'public.agency_clients'::regclass
  ) THEN
    CREATE TRIGGER agency_clients_enforce_internal_org
      BEFORE INSERT OR UPDATE OF organization_id ON public.agency_clients
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_agency_client_internal_org();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'source_imports_enforce_agency_references'
      AND tgrelid = 'public.source_imports'::regclass
  ) THEN
    CREATE TRIGGER source_imports_enforce_agency_references
      BEFORE INSERT OR UPDATE OF organization_id, client_id, campaign_id ON public.source_imports
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_agency_source_import_references();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'production_tasks_enforce_agency_references'
      AND tgrelid = 'public.production_tasks'::regclass
  ) THEN
    CREATE TRIGGER production_tasks_enforce_agency_references
      BEFORE INSERT OR UPDATE OF organization_id, client_id, campaign_id, content_item_id ON public.production_tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_agency_production_task_references();
  END IF;
END
$$;
