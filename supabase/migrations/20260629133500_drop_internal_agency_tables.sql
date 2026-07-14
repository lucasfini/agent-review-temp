-- Retire unused internal agency tables.
--
-- Production was backed up before applying this cleanup:
-- artifacts/db-audit/supabase-backup-2026-06-29.dump
--
-- This keeps legacy nullable client_id columns on product tables so current
-- product code that selects or filters those columns does not break.

DO $$
DECLARE
  table_name text;
  row_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agency_funnel_events',
    'agency_delivery_package_items',
    'agency_delivery_packages',
    'agency_client_profiles',
    'client_integrations',
    'source_imports',
    'production_tasks',
    'agency_leads',
    'agency_clients'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', table_name)
      INTO row_count;

    IF row_count <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop %.% because it still has % rows',
        'public',
        table_name,
        row_count;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'brand_voices',
    'campaigns',
    'content_library_items',
    'content_libraries',
    'creator_profiles'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE client_id IS NOT NULL', table_name)
      INTO row_count;

    IF row_count <> 0 THEN
      RAISE EXCEPTION 'Refusing agency cleanup because public.% has % non-null client_id rows',
        table_name,
        row_count;
    END IF;
  END LOOP;
END
$$;

ALTER TABLE IF EXISTS public.brand_voices
  DROP CONSTRAINT IF EXISTS brand_voices_client_id_fkey;

ALTER TABLE IF EXISTS public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_client_id_fkey;

ALTER TABLE IF EXISTS public.content_library_items
  DROP CONSTRAINT IF EXISTS content_library_items_client_id_fkey;

DROP INDEX IF EXISTS public.idx_brand_voices_client_id;
DROP INDEX IF EXISTS public.idx_campaigns_client_id;
DROP INDEX IF EXISTS public.idx_content_library_items_client_id;
DROP INDEX IF EXISTS public.idx_content_libraries_client_id;
DROP INDEX IF EXISTS public.idx_creator_profiles_client_id;

DROP TABLE IF EXISTS public.agency_funnel_events;
DROP TABLE IF EXISTS public.agency_delivery_package_items;
DROP TABLE IF EXISTS public.agency_delivery_packages;
DROP TABLE IF EXISTS public.agency_client_profiles;
DROP TABLE IF EXISTS public.client_integrations;
DROP TABLE IF EXISTS public.source_imports;
DROP TABLE IF EXISTS public.production_tasks;
DROP TABLE IF EXISTS public.agency_leads;
DROP TABLE IF EXISTS public.agency_clients;

DROP FUNCTION IF EXISTS public.enforce_agency_client_internal_org();
DROP FUNCTION IF EXISTS public.enforce_agency_delivery_package_item_references();
DROP FUNCTION IF EXISTS public.enforce_agency_delivery_package_references();
DROP FUNCTION IF EXISTS public.enforce_agency_lead_internal_org();
DROP FUNCTION IF EXISTS public.enforce_agency_production_task_references();
DROP FUNCTION IF EXISTS public.enforce_agency_source_import_references();
DROP FUNCTION IF EXISTS public.set_agency_leads_updated_at();
DROP FUNCTION IF EXISTS public.set_agency_updated_at();
