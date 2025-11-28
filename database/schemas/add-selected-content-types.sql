-- Add selected_content_types column to projects table
-- This stores the array of content type IDs that were selected for generation

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS selected_content_types TEXT[];

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_selected_content_types ON projects USING GIN(selected_content_types);

-- Add comment for documentation
COMMENT ON COLUMN projects.selected_content_types IS 'Array of content type IDs selected for generation (e.g., ["twitter_threads", "linkedin_posts"])';
