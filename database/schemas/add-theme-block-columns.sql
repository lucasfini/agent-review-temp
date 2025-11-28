-- Add theme and block metadata columns to outputs table
-- Run this migration to support theme-based content generation

ALTER TABLE outputs
ADD COLUMN IF NOT EXISTS theme TEXT,
ADD COLUMN IF NOT EXISTS theme_id TEXT,
ADD COLUMN IF NOT EXISTS block_number INTEGER,
ADD COLUMN IF NOT EXISTS character_count_limit INTEGER,
ADD COLUMN IF NOT EXISTS was_truncated BOOLEAN DEFAULT FALSE;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_outputs_theme_id ON outputs(theme_id);
CREATE INDEX IF NOT EXISTS idx_outputs_block_number ON outputs(block_number);

-- Add comments for documentation
COMMENT ON COLUMN outputs.theme IS 'Human-readable theme name (e.g., "Professional", "Funny")';
COMMENT ON COLUMN outputs.theme_id IS 'Theme ID from content-themes.ts (e.g., "professional", "funny")';
COMMENT ON COLUMN outputs.block_number IS 'Block number within content type (1-4 for Twitter threads, 1-3 for LinkedIn, etc.)';
COMMENT ON COLUMN outputs.character_count_limit IS 'Character or word limit enforced during generation';
COMMENT ON COLUMN outputs.was_truncated IS 'Whether content was truncated to meet character limits';
