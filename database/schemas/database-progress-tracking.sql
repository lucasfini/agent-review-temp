-- Progress Tracking Enhancement Migration
-- Adds detailed status tracking and progress information for transcription pipeline

-- Add processing_stage column for detailed status tracking
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS processing_stage TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_message TEXT,
ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ;

-- Create index for querying by processing stage
CREATE INDEX IF NOT EXISTS idx_projects_processing_stage
ON projects (processing_stage);

-- Add comments for documentation
COMMENT ON COLUMN projects.processing_stage IS 'Current processing stage: pending, uploading, transcribing, diarization, role_assignment, finalizing, completed, failed';
COMMENT ON COLUMN projects.processing_progress IS 'Progress percentage (0-100) for current stage';
COMMENT ON COLUMN projects.processing_message IS 'Human-readable message about current processing status';
COMMENT ON COLUMN projects.stage_started_at IS 'Timestamp when current stage started';

-- Processing stages enum (for reference, not enforced):
-- 'pending'            - Project created, waiting to start
-- 'uploading'          - File upload in progress
-- 'transcribing'       - Audio transcription in progress
-- 'diarization'        - Speaker detection running
-- 'role_assignment'    - Extracting speaker names and assigning roles
-- 'finalizing'         - Saving speaker data and metadata
-- 'completed'          - All processing complete
-- 'failed'             - Processing failed

-- Example queries:
--
-- Get projects by stage:
-- SELECT * FROM projects WHERE processing_stage = 'transcribing';
--
-- Get projects with progress:
-- SELECT id, title, processing_stage, processing_progress, processing_message
-- FROM projects
-- WHERE status = 'processing'
-- ORDER BY stage_started_at DESC;
--
-- Track stage durations:
-- SELECT
--   processing_stage,
--   AVG(EXTRACT(EPOCH FROM (updated_at - stage_started_at))) as avg_duration_seconds
-- FROM projects
-- WHERE processing_stage = 'completed'
-- GROUP BY processing_stage;
