-- Phase 7D: Public agency funnel analytics events
-- First-party event records for public agency funnel conversion analysis.
--
-- Safety goals:
-- - No anonymous or authenticated direct table access.
-- - Public inserts go through the API, which validates event names and strips PII.
-- - Service role can manage all rows for API and internal review usage.

CREATE TABLE IF NOT EXISTS public.agency_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  anonymous_id TEXT,
  lead_id UUID REFERENCES public.agency_leads(id) ON DELETE SET NULL,
  path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_funnel_events_event_name_check'
      AND conrelid = 'public.agency_funnel_events'::regclass
  ) THEN
    ALTER TABLE public.agency_funnel_events
      ADD CONSTRAINT agency_funnel_events_event_name_check
      CHECK (event_name IN (
        'agency_page_view',
        'agency_cta_click',
        'agency_intake_view',
        'agency_intake_started',
        'agency_intake_submitted',
        'agency_intake_validation_error',
        'agency_thank_you_view'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_funnel_events_metadata_object'
      AND conrelid = 'public.agency_funnel_events'::regclass
  ) THEN
    ALTER TABLE public.agency_funnel_events
      ADD CONSTRAINT agency_funnel_events_metadata_object
      CHECK (jsonb_typeof(metadata_json) = 'object');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agency_funnel_events_event_name
  ON public.agency_funnel_events(event_name);

CREATE INDEX IF NOT EXISTS idx_agency_funnel_events_created_at
  ON public.agency_funnel_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agency_funnel_events_lead_id
  ON public.agency_funnel_events(lead_id);

ALTER TABLE public.agency_funnel_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_funnel_events'
      AND policyname = 'Service role can manage agency_funnel_events'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage agency_funnel_events" ON public.agency_funnel_events FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

REVOKE ALL ON public.agency_funnel_events FROM anon;
REVOKE ALL ON public.agency_funnel_events FROM authenticated;
