-- Tier-based AI-generated content fields
-- Adds columns for Pro and Premium tier features

-- Add AI-generated content columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS performance_level TEXT CHECK (performance_level IN ('basic', 'pro', 'premium')) DEFAULT 'basic',
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS key_takeaways JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS social_quotes JSONB DEFAULT '[]'::jsonb;

-- Create indexes for content queries
CREATE INDEX IF NOT EXISTS idx_projects_performance_level ON projects (performance_level);
CREATE INDEX IF NOT EXISTS idx_projects_has_summary ON projects ((ai_summary IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_projects_has_chapters ON projects ((jsonb_array_length(chapters) > 0));

-- Add comments for documentation
COMMENT ON COLUMN projects.performance_level IS 'Tier level: basic (transcription only), pro (+ names + summary), premium (+ roles + chapters + takeaways + quotes)';
COMMENT ON COLUMN projects.ai_summary IS 'AI-generated podcast summary (500-1000 words) - PRO tier and above';
COMMENT ON COLUMN projects.chapters IS 'AI-detected chapter markers with titles and descriptions - PREMIUM tier only';
COMMENT ON COLUMN projects.key_takeaways IS 'AI-extracted key takeaways and insights - PREMIUM tier only';
COMMENT ON COLUMN projects.social_quotes IS 'AI-curated quotes for social media sharing - PREMIUM tier only';

-- Create a view for content analytics
CREATE OR REPLACE VIEW project_content_analytics AS
SELECT
    p.id,
    p.title,
    p.performance_level,
    p.created_at,
    p.audio_duration_seconds,
    p.actual_processing_cost,
    -- Content availability flags
    (p.transcription_text IS NOT NULL AND length(p.transcription_text) > 0) as has_transcription,
    (p.ai_summary IS NOT NULL AND length(p.ai_summary) > 0) as has_summary,
    (p.chapters IS NOT NULL AND jsonb_array_length(p.chapters) > 0) as has_chapters,
    (p.key_takeaways IS NOT NULL AND jsonb_array_length(p.key_takeaways) > 0) as has_takeaways,
    (p.social_quotes IS NOT NULL AND jsonb_array_length(p.social_quotes) > 0) as has_quotes,
    -- Content counts
    CASE
        WHEN p.ai_summary IS NOT NULL THEN
            array_length(regexp_split_to_array(p.ai_summary, '\s+'), 1)
        ELSE 0
    END as summary_word_count,
    CASE
        WHEN p.chapters IS NOT NULL THEN jsonb_array_length(p.chapters)
        ELSE 0
    END as chapter_count,
    CASE
        WHEN p.key_takeaways IS NOT NULL THEN jsonb_array_length(p.key_takeaways)
        ELSE 0
    END as takeaway_count,
    CASE
        WHEN p.social_quotes IS NOT NULL THEN jsonb_array_length(p.social_quotes)
        ELSE 0
    END as quote_count,
    -- Speaker data
    CASE
        WHEN p.speaker_data IS NOT NULL AND p.speaker_data->'detectionMetadata' IS NOT NULL THEN
            (p.speaker_data->'detectionMetadata'->>'totalSpeakers')::int
        ELSE 0
    END as speaker_count
FROM projects p;

-- Grant access to the view
ALTER VIEW project_content_analytics OWNER TO postgres;
GRANT SELECT ON project_content_analytics TO authenticated;

-- Update RLS policy if needed
DROP POLICY IF EXISTS "Users can view own project content" ON projects;
CREATE POLICY "Users can view own project content" ON projects
    FOR SELECT USING (auth.uid() = user_id);
