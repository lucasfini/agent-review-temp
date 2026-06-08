-- Phase 6F: Lead-to-Client Conversion Workflow
-- Preserve public lead records while linking deliberate internal conversions.

ALTER TABLE public.agency_leads
  ADD COLUMN IF NOT EXISTS converted_client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agency_leads_converted_client_id
  ON public.agency_leads(converted_client_id)
  WHERE converted_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agency_leads_converted_at
  ON public.agency_leads(converted_at DESC)
  WHERE converted_at IS NOT NULL;
