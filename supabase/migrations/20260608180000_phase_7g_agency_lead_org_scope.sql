-- Phase 7G: Public agency funnel QA hardening
-- Scope public agency leads to the owning internal agency organization.
--
-- Safety goals:
-- - Internal lead review/export should not be global across internal agency orgs.
-- - Public lead submissions still go through the API and never trust a public org id.
-- - Legacy rows can be backfilled when there is exactly one internal agency org.

ALTER TABLE public.agency_leads
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agency_leads_organization_id
  ON public.agency_leads(organization_id);

UPDATE public.agency_leads
SET organization_id = (
  SELECT o.id
  FROM public.organizations o
  WHERE o.type = 'internal_agency'
  ORDER BY o.created_at ASC
  LIMIT 1
)
WHERE organization_id IS NULL
  AND (
    SELECT count(*)
    FROM public.organizations o
    WHERE o.type = 'internal_agency'
  ) = 1;

CREATE OR REPLACE FUNCTION public.enforce_agency_lead_internal_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.type = 'internal_agency'
  ) THEN
    RAISE EXCEPTION 'agency_leads.organization_id must reference an internal agency organization';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'agency_leads_enforce_internal_org'
      AND tgrelid = 'public.agency_leads'::regclass
  ) THEN
    CREATE TRIGGER agency_leads_enforce_internal_org
      BEFORE INSERT OR UPDATE ON public.agency_leads
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_agency_lead_internal_org();
  END IF;
END
$$;
