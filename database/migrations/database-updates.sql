-- Database schema updates for content selection and cost estimation features
-- These changes need to be applied to your Supabase database

-- Add new columns to the projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS selected_content_types JSONB,
ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS content_generation_started_at TIMESTAMPTZ;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_selected_content_types ON projects USING GIN (selected_content_types);
CREATE INDEX IF NOT EXISTS idx_projects_content_generation_started_at ON projects (content_generation_started_at);

-- Update the projects table to include transcription_text if not exists
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS transcription_text TEXT;

-- Create index on transcription for search if needed
CREATE INDEX IF NOT EXISTS idx_projects_transcription_text ON projects USING GIN (to_tsvector('english', transcription_text));

-- Add comments for documentation
COMMENT ON COLUMN projects.selected_content_types IS 'JSON array of selected content type IDs for generation';
COMMENT ON COLUMN projects.estimated_cost IS 'Estimated cost in USD for generating selected content types';
COMMENT ON COLUMN projects.content_generation_started_at IS 'Timestamp when content generation was initiated';
COMMENT ON COLUMN projects.transcription_text IS 'Full transcription text from the audio file';

-- Optional: Add a view for projects with content generation status
CREATE OR REPLACE VIEW project_generation_status AS
SELECT 
    p.*,
    CASE 
        WHEN p.selected_content_types IS NOT NULL AND p.content_generation_started_at IS NOT NULL THEN 'content_generation_started'
        WHEN p.transcription_text IS NOT NULL THEN 'ready_for_generation'
        WHEN p.status = 'completed' THEN 'transcription_completed'
        ELSE p.status
    END as generation_status,
    COALESCE(
        (SELECT COUNT(*) FROM outputs WHERE project_id = p.id),
        0
    ) as generated_content_count
FROM projects p;

-- Update RLS policies if needed (adjust based on your existing policies)
-- This assumes you have RLS enabled and basic user policies

-- Allow users to update their own projects with new fields
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Grant access to the new view (if using RLS)
ALTER VIEW project_generation_status OWNER TO postgres;
GRANT SELECT ON project_generation_status TO authenticated;

-- Create RLS policy for the view
CREATE POLICY "Users can view own project generation status" ON project_generation_status
    FOR SELECT USING (auth.uid() = user_id);