-- Phase 3D: Generation context integration.
-- Add optional brand voice and campaign snapshots to queued generation jobs so
-- background processors can carry context into the central content generator.

ALTER TABLE public.project_generation_jobs
  ADD COLUMN IF NOT EXISTS brand_voice_id UUID,
  ADD COLUMN IF NOT EXISTS campaign_id UUID;

DO $$
BEGIN
  IF to_regclass('public.project_generation_jobs') IS NOT NULL
     AND to_regclass('public.brand_voices') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'project_generation_jobs_brand_voice_id_fkey'
         AND conrelid = 'public.project_generation_jobs'::regclass
     ) THEN
    ALTER TABLE public.project_generation_jobs
      ADD CONSTRAINT project_generation_jobs_brand_voice_id_fkey
      FOREIGN KEY (brand_voice_id) REFERENCES public.brand_voices(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.project_generation_jobs') IS NOT NULL
     AND to_regclass('public.campaigns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'project_generation_jobs_campaign_id_fkey'
         AND conrelid = 'public.project_generation_jobs'::regclass
     ) THEN
    ALTER TABLE public.project_generation_jobs
      ADD CONSTRAINT project_generation_jobs_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_project_generation_jobs_brand_voice_id
  ON public.project_generation_jobs(brand_voice_id)
  WHERE brand_voice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_generation_jobs_campaign_id
  ON public.project_generation_jobs(campaign_id)
  WHERE campaign_id IS NOT NULL;
