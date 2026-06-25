-- Phase 3E: SaaS onboarding state.
-- Keep onboarding lightweight and organization-scoped without changing access
-- patterns for existing dashboard users.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_skipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'organizations_onboarding_metadata_object'
         AND conrelid = 'public.organizations'::regclass
     ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_onboarding_metadata_object
      CHECK (jsonb_typeof(onboarding_metadata_json) = 'object');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_organizations_onboarding_completed
  ON public.organizations(onboarding_completed_at)
  WHERE onboarding_completed_at IS NOT NULL;
