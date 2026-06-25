-- Phase 7E: Lead qualification, scoring, and routing
-- Add deterministic qualification fields to private public-agency lead records.

ALTER TABLE public.agency_leads
  ADD COLUMN IF NOT EXISTS qualification_score INTEGER,
  ADD COLUMN IF NOT EXISTS qualification_tier TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_leads_qualification_score_check'
      AND conrelid = 'public.agency_leads'::regclass
  ) THEN
    ALTER TABLE public.agency_leads
      ADD CONSTRAINT agency_leads_qualification_score_check
      CHECK (qualification_score IS NULL OR (qualification_score >= 0 AND qualification_score <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_leads_qualification_tier_check'
      AND conrelid = 'public.agency_leads'::regclass
  ) THEN
    ALTER TABLE public.agency_leads
      ADD CONSTRAINT agency_leads_qualification_tier_check
      CHECK (qualification_tier IS NULL OR qualification_tier IN ('high', 'medium', 'low', 'unqualified'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agency_leads_qualification_tier
  ON public.agency_leads(qualification_tier);

CREATE INDEX IF NOT EXISTS idx_agency_leads_assigned_to
  ON public.agency_leads(assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agency_leads_next_follow_up_at
  ON public.agency_leads(next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;
