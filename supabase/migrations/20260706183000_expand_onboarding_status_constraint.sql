-- Keep the profile onboarding status constraint in sync with the expanded
-- guided setup flow. Older dev/prod databases may already have a narrower
-- constraint with the same name, so replace it explicitly.

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_onboarding_status_check;

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
