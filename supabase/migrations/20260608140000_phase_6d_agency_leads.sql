-- Phase 6D: Agency Lead Intake Schema and API
-- Public agency inquiries are stored as private lead records.
--
-- Safety goals:
-- - No anonymous direct table access.
-- - Public submissions go through the API, which validates and rate-limits input.
-- - Internal agency review uses service-role routes after route-level authorization.
-- - Leads do not automatically create agency clients.

CREATE TABLE IF NOT EXISTS public.agency_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  role TEXT,
  package_interest TEXT,
  budget_range TEXT,
  timeline TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'agency_website',
  status TEXT NOT NULL DEFAULT 'new',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_leads_email_not_blank'
      AND conrelid = 'public.agency_leads'::regclass
  ) THEN
    ALTER TABLE public.agency_leads
      ADD CONSTRAINT agency_leads_email_not_blank
      CHECK (length(btrim(email)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_leads_status_check'
      AND conrelid = 'public.agency_leads'::regclass
  ) THEN
    ALTER TABLE public.agency_leads
      ADD CONSTRAINT agency_leads_status_check
      CHECK (status IN ('new', 'reviewed', 'qualified', 'converted', 'archived', 'spam'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_leads_metadata_object'
      AND conrelid = 'public.agency_leads'::regclass
  ) THEN
    ALTER TABLE public.agency_leads
      ADD CONSTRAINT agency_leads_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agency_leads_email
  ON public.agency_leads(lower(email));

CREATE INDEX IF NOT EXISTS idx_agency_leads_status
  ON public.agency_leads(status);

CREATE INDEX IF NOT EXISTS idx_agency_leads_created_at
  ON public.agency_leads(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_agency_leads_updated_at()
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
    WHERE tgname = 'agency_leads_set_updated_at'
      AND tgrelid = 'public.agency_leads'::regclass
  ) THEN
    CREATE TRIGGER agency_leads_set_updated_at
      BEFORE UPDATE ON public.agency_leads
      FOR EACH ROW
      EXECUTE FUNCTION public.set_agency_leads_updated_at();
  END IF;
END
$$;

ALTER TABLE public.agency_leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_leads'
      AND policyname = 'Service role can manage agency_leads'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage agency_leads" ON public.agency_leads FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

REVOKE ALL ON public.agency_leads FROM anon;
REVOKE ALL ON public.agency_leads FROM authenticated;
