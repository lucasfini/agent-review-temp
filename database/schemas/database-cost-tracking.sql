-- Cost tracking for pay-as-you-go model
-- Tracks actual processing costs for transcription, diarization, and AI generation

-- Add cost tracking columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS actual_processing_cost DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_breakdown JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS audio_duration_seconds DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2);

-- Create indexes for cost analytics
CREATE INDEX IF NOT EXISTS idx_projects_actual_cost ON projects (actual_processing_cost);
CREATE INDEX IF NOT EXISTS idx_projects_duration ON projects (audio_duration_seconds);
CREATE INDEX IF NOT EXISTS idx_projects_estimated_cost ON projects (estimated_cost);

-- Add comments for documentation
COMMENT ON COLUMN projects.actual_processing_cost IS 'Actual processing cost in USD (transcription + diarization + AI generation)';
COMMENT ON COLUMN projects.cost_breakdown IS 'JSON breakdown of costs: {transcription: 0.36, diarization: 0, aiProcessing: 0.003, generation: 0.15}';
COMMENT ON COLUMN projects.audio_duration_seconds IS 'Duration of uploaded audio in seconds';
COMMENT ON COLUMN projects.estimated_cost IS 'Estimated cost shown to user before processing (optional)';

-- Create a view for cost analytics
CREATE OR REPLACE VIEW project_cost_analytics AS
SELECT
    p.id,
    p.title,
    p.created_at,
    p.performance_level,
    p.audio_duration_seconds,
    p.actual_processing_cost,
    p.estimated_cost,
    p.cost_breakdown,
    CASE
        WHEN p.estimated_cost IS NOT NULL AND p.estimated_cost > 0 THEN
            ROUND(((p.actual_processing_cost - p.estimated_cost) / p.estimated_cost * 100)::numeric, 2)
        ELSE NULL
    END as cost_variance_percent,
    -- Extract individual costs from breakdown
    (p.cost_breakdown->>'transcription')::decimal as transcription_cost,
    (p.cost_breakdown->>'diarization')::decimal as diarization_cost,
    (p.cost_breakdown->>'aiProcessing')::decimal as ai_processing_cost,
    (p.cost_breakdown->>'generation')::decimal as generation_cost
FROM projects p
WHERE p.actual_processing_cost IS NOT NULL;

-- Grant access to the view
ALTER VIEW project_cost_analytics OWNER TO postgres;
GRANT SELECT ON project_cost_analytics TO authenticated;

-- Update RLS policy if needed
DROP POLICY IF EXISTS "Users can view own project costs" ON projects;
CREATE POLICY "Users can view own project costs" ON projects
    FOR SELECT USING (auth.uid() = user_id);
