-- Caching tables for transcription + content generation

CREATE TABLE IF NOT EXISTS public.transcription_cache (
  fingerprint TEXT PRIMARY KEY,
  transcription_text TEXT NOT NULL,
  transcription_segments JSONB,
  speaker_data JSONB,
  duration NUMERIC,
  reference_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add reference_count column to existing tables (migration)
ALTER TABLE public.transcription_cache
ADD COLUMN IF NOT EXISTS reference_count INTEGER DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS public.content_generation_cache (
  cache_key TEXT PRIMARY KEY,
  project_id UUID NOT NULL,
  content_types TEXT[] NOT NULL,
  transcription_hash TEXT NOT NULL,
  analysis JSONB NOT NULL,
  generated_content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
