-- Add audio retention lifecycle fields to projects.
-- This migration was previously corrupted and contained a file path instead of SQL.
--
-- Keep this migration intentionally minimal and idempotent:
-- - audio_expires_at: optional timestamp for expiry windows.
-- - audio_deleted_at: timestamp marker once source audio has been deleted.

ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS audio_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audio_deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_audio_expires_at
  ON public.projects (audio_expires_at)
  WHERE audio_expires_at IS NOT NULL;
