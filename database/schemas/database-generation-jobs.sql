CREATE TABLE IF NOT EXISTS public.project_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('analysis', 'content')),
  target_key TEXT NOT NULL,
  theme_id TEXT,
  custom_guidance TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error_message TEXT,
  failure_notified_at TIMESTAMPTZ,
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

COMMENT ON TABLE public.project_generation_jobs IS 'Durable queue items for project-scoped analysis and content generation requests.';
COMMENT ON COLUMN public.project_generation_jobs.custom_guidance IS 'Optional per-content-type user guidance snapped at queue time for content generation jobs.';
