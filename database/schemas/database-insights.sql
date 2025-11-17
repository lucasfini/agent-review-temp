-- Insights Table for AI-Powered Educational Feature
-- Purpose: Store extracted concepts, people, and related information from podcast transcripts
-- Cost: ~$0.04 per podcast using Claude Haiku 4.5 + Perplexity Sonar Pro

-- Create enum types for category and status
CREATE TYPE insight_category AS ENUM ('person', 'concept');
CREATE TYPE insight_status AS ENUM ('auto_detected', 'user_highlight', 'refreshing');

-- Main insights table
CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Entity identification
  entity_id TEXT NOT NULL, -- Unique identifier for this entity (e.g., "kubernetes", "sam-altman")
  label TEXT NOT NULL, -- Display name (e.g., "Kubernetes", "Sam Altman")
  category insight_category NOT NULL, -- person or concept

  -- Matching and highlighting
  match_text TEXT NOT NULL, -- Primary text to highlight in transcript
  match_variants TEXT[] DEFAULT '{}', -- Alternative names, nicknames, abbreviations

  -- Context from transcript
  transcript_excerpts JSONB DEFAULT '[]', -- Array of {text: string, timestamp?: number}

  -- Tier-based content
  simple_definition TEXT, -- 1-2 sentences for Pro tier
  full_explanation TEXT, -- 3-4 sentences for Premium tier

  -- Premium-only enrichment
  related_concepts TEXT[] DEFAULT '{}', -- Names of related concepts mentioned
  why_it_matters TEXT, -- Relevance to this conversation
  relationships JSONB DEFAULT '[]', -- Array of {type: string, entityId: string, description: string}

  -- Research links (from Perplexity)
  external_sources JSONB DEFAULT '[]', -- Array of {title: string, url: string, type?: string, description?: string}

  -- Metadata
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  status insight_status DEFAULT 'auto_detected',
  cost_usd NUMERIC(10, 6) DEFAULT 0, -- AI processing cost for this insight

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique insights per project
  UNIQUE(project_id, entity_id)
);

-- Indexes for performance
CREATE INDEX idx_insights_project_id ON insights(project_id);
CREATE INDEX idx_insights_category ON insights(category);
CREATE INDEX idx_insights_status ON insights(status);
CREATE INDEX idx_insights_created_at ON insights(created_at DESC);

-- Add column to projects table to track insight processing
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS insights_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insights_cost_usd NUMERIC(10, 6) DEFAULT 0;

-- Create updated_at trigger for insights
CREATE OR REPLACE FUNCTION update_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER insights_updated_at
  BEFORE UPDATE ON insights
  FOR EACH ROW
  EXECUTE FUNCTION update_insights_updated_at();

-- Comments for documentation
COMMENT ON TABLE insights IS 'AI-extracted educational insights from podcast transcripts';
COMMENT ON COLUMN insights.entity_id IS 'Unique identifier for entity (lowercase, hyphenated)';
COMMENT ON COLUMN insights.simple_definition IS 'Brief definition for Pro tier (1-2 sentences)';
COMMENT ON COLUMN insights.full_explanation IS 'Detailed explanation for Premium tier (3-4 sentences)';
COMMENT ON COLUMN insights.external_sources IS 'Research links from Perplexity API';
COMMENT ON COLUMN insights.cost_usd IS 'AI cost for extracting/enriching this specific insight';

-- Sample query to fetch insights by tier
-- Basic tier:
-- SELECT id, label, category, match_text, match_variants, external_sources
-- FROM insights WHERE project_id = $1;

-- Pro tier:
-- SELECT id, label, category, match_text, match_variants, simple_definition, external_sources
-- FROM insights WHERE project_id = $1;

-- Premium tier (all fields):
-- SELECT * FROM insights WHERE project_id = $1;
