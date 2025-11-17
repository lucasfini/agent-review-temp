/**
 * Outputs Table Schema
 * Purpose: Store AI-generated content pieces from podcasts
 * Features: Multiple content types, platform targeting, cost tracking
 */

-- Create enum for content types
CREATE TYPE output_type AS ENUM (
  'blog_post',
  'social_post',
  'email_newsletter',
  'audiogram_clip',
  'quote_graphic',
  'show_notes',
  'twitter_thread',
  'linkedin_post',
  'instagram_caption'
);

-- Create enum for platforms
CREATE TYPE platform_type AS ENUM (
  'twitter',
  'linkedin',
  'instagram',
  'facebook',
  'youtube',
  'email',
  'blog',
  'general'
);

-- Create enum for output status
CREATE TYPE output_status AS ENUM (
  'draft',
  'generated',
  'ready',
  'published',
  'archived'
);

-- Create outputs table
CREATE TABLE IF NOT EXISTS outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Content identification
  type output_type NOT NULL,
  platform platform_type NOT NULL DEFAULT 'general',
  title TEXT,

  -- Generated content
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  -- AI generation details
  ai_model TEXT,
  ai_cost_usd NUMERIC(10, 6) DEFAULT 0,
  generation_time_seconds INTEGER,
  prompt_used TEXT,

  -- Status and workflow
  status output_status DEFAULT 'generated',

  -- Analytics
  word_count INTEGER,
  character_count INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT outputs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_outputs_project_id ON outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_outputs_user_id ON outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_outputs_type ON outputs(type);
CREATE INDEX IF NOT EXISTS idx_outputs_platform ON outputs(platform);
CREATE INDEX IF NOT EXISTS idx_outputs_status ON outputs(status);
CREATE INDEX IF NOT EXISTS idx_outputs_created_at ON outputs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own outputs"
  ON outputs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own outputs"
  ON outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own outputs"
  ON outputs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own outputs"
  ON outputs FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_outputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER outputs_updated_at
  BEFORE UPDATE ON outputs
  FOR EACH ROW
  EXECUTE FUNCTION update_outputs_updated_at();

-- Add comments for documentation
COMMENT ON TABLE outputs IS 'AI-generated content pieces from podcast transcriptions';
COMMENT ON COLUMN outputs.type IS 'Type of content generated (blog_post, social_post, etc.)';
COMMENT ON COLUMN outputs.platform IS 'Target platform for the content';
COMMENT ON COLUMN outputs.metadata IS 'Additional metadata like hashtags, image URLs, etc.';
COMMENT ON COLUMN outputs.ai_cost_usd IS 'Cost in USD for generating this output';
COMMENT ON COLUMN outputs.word_count IS 'Number of words in the generated content';
