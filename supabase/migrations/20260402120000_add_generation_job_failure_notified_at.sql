ALTER TABLE public.project_generation_jobs
ADD COLUMN IF NOT EXISTS failure_notified_at TIMESTAMPTZ;
