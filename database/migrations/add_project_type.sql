-- Add project_type column for Context-Aware Speaker Correction
-- This classifies audio into types: DEBATE, INTERVIEW, PODCAST, MONOLOGUE, OTHER
-- enabling type-specific speaker correction strategies

-- Add the project_type column
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_type TEXT CHECK (project_type IN ('DEBATE', 'INTERVIEW', 'PODCAST', 'MONOLOGUE', 'OTHER'));

-- Create index for filtering/querying by type
CREATE INDEX IF NOT EXISTS idx_projects_project_type ON projects (project_type);

-- Add comment for documentation
COMMENT ON COLUMN projects.project_type IS 'Audio classification type: DEBATE (moderator + panelists), INTERVIEW (1-on-1), PODCAST (hosts + guests), MONOLOGUE (single speaker), OTHER (unclassified). Used for context-aware speaker correction strategies.';
