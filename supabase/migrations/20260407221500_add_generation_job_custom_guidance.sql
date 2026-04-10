ALTER TABLE public.project_generation_jobs
ADD COLUMN IF NOT EXISTS custom_guidance TEXT;

COMMENT ON COLUMN public.project_generation_jobs.custom_guidance IS 'Optional per-content-type user guidance snapped at queue time for content generation jobs.';
