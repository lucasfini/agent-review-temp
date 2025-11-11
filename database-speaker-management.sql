-- Speaker Management Enhancement Migration
-- Adds support for preset speakers and keyword-based speaker detection

-- Add preset_speakers column for per-project speaker templates
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS preset_speakers JSONB DEFAULT '[]'::jsonb;

-- Add speaker_keywords column for keyword-based speaker detection rules
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS speaker_keywords JSONB DEFAULT '[]'::jsonb;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_preset_speakers
ON projects USING GIN (preset_speakers);

CREATE INDEX IF NOT EXISTS idx_projects_speaker_keywords
ON projects USING GIN (speaker_keywords);

-- Comment the new columns
COMMENT ON COLUMN projects.preset_speakers IS 'Per-project preset speaker templates (Host, Guest, Ads, etc.) with colors and metadata';
COMMENT ON COLUMN projects.speaker_keywords IS 'Keyword rules for automatic speaker detection: [{ speakerId: string, keywords: string[] }]';

-- Example preset_speakers structure:
-- [
--   { id: 'host', name: 'Host', color: 'blue', icon: 'microphone' },
--   { id: 'guest', name: 'Guest', color: 'green', icon: 'user' },
--   { id: 'ads', name: 'Ads', color: 'orange', icon: 'speaker' }
-- ]

-- Example speaker_keywords structure:
-- [
--   { speakerId: 'ads', keywords: ['sponsor', 'vpn', 'nordvpn', 'ad break'] },
--   { speakerId: 'host', keywords: ['welcome back', 'today we', 'in this episode'] }
-- ]
