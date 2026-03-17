-- Add project_title snapshot column to usage_events
-- Preserves project name even after the project is deleted (ON DELETE SET NULL cascade)
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS project_title TEXT;

-- Backfill: populate title for all existing events that still have a valid project_id
UPDATE usage_events ue
SET project_title = p.title
FROM projects p
WHERE ue.project_id = p.id
  AND ue.project_title IS NULL;
