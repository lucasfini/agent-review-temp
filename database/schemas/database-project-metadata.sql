ALTER TABLE projects
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN projects.metadata IS 'Per-project structured settings and processing state, including analysis_options.';
