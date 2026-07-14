-- User-level onboarding state for the guided signup flow.
-- Existing rows remain nullable so returning users are derived from actual
-- profile/workspace state instead of being forced through a new tour.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'profiles_onboarding_status_check'
         AND conrelid = 'public.profiles'::regclass
     ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_status_check
      CHECK (
        onboarding_status IS NULL
        OR onboarding_status IN (
          'profile_pending',
          'workspace_pending',
          'profile_intro_pending',
          'voice_intro_pending',
          'plan_intro_pending',
          'upload_intro_pending',
          'complete'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'profiles_onboarding_metadata_object'
         AND conrelid = 'public.profiles'::regclass
     ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_metadata_object
      CHECK (jsonb_typeof(onboarding_metadata_json) = 'object');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_status
  ON public.profiles(onboarding_status)
  WHERE onboarding_status IS NOT NULL;
