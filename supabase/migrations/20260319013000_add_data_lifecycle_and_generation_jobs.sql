ALTER TABLE public.usage_events
  DROP CONSTRAINT IF EXISTS usage_events_user_id_fkey;

ALTER TABLE public.billing_reservations
  DROP CONSTRAINT IF EXISTS billing_reservations_user_id_fkey;

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

ALTER TABLE public.usage_events
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.billing_reservations
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.credit_transactions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.billing_reservations
  ADD CONSTRAINT billing_reservations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.project_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('analysis', 'content')),
  target_key TEXT NOT NULL,
  theme_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_generation_jobs_project_status
  ON public.project_generation_jobs(project_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_project_generation_jobs_user_date
  ON public.project_generation_jobs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.project_generation_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_generation_jobs'
      AND policyname = 'Users can view own project generation jobs'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own project generation jobs" ON public.project_generation_jobs FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_generation_jobs'
      AND policyname = 'Service role can manage project generation jobs'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can manage project generation jobs" ON public.project_generation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;

GRANT SELECT ON public.project_generation_jobs TO authenticated;
GRANT ALL ON public.project_generation_jobs TO service_role;
