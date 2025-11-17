-- Add columns for storing transcription segments and speaker data

-- Add transcription_segments column to store OpenAI Whisper segments data
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS transcription_segments JSONB;

-- Add speaker_data column to store detected speakers and their names
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS speaker_data JSONB;

-- Add indexes for better performance when querying speaker data
CREATE INDEX IF NOT EXISTS idx_projects_speaker_data 
ON projects USING GIN (speaker_data);

CREATE INDEX IF NOT EXISTS idx_projects_transcription_segments 
ON projects USING GIN (transcription_segments);

-- Comment the new columns
COMMENT ON COLUMN projects.transcription_segments IS 'Raw segments data from OpenAI Whisper API including timing and text';
COMMENT ON COLUMN projects.speaker_data IS 'Processed speaker detection data including speaker names and conversation segments';