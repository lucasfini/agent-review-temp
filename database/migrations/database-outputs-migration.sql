/**
 * Outputs Table Migration
 * Purpose: Add missing user_id column and other fields to existing outputs table
 */

-- Add user_id column (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE outputs ADD COLUMN user_id UUID;
  END IF;
END $$;

-- Populate user_id from projects table for existing records
UPDATE outputs o
SET user_id = p.user_id
FROM projects p
WHERE o.project_id = p.id
  AND o.user_id IS NULL;

-- Make user_id NOT NULL after populating
ALTER TABLE outputs ALTER COLUMN user_id SET NOT NULL;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'outputs_user_id_fkey'
  ) THEN
    ALTER TABLE outputs
    ADD CONSTRAINT outputs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add other missing columns if they don't exist
DO $$
BEGIN
  -- ai_model
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'ai_model'
  ) THEN
    ALTER TABLE outputs ADD COLUMN ai_model TEXT;
  END IF;

  -- ai_cost_usd
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'ai_cost_usd'
  ) THEN
    ALTER TABLE outputs ADD COLUMN ai_cost_usd NUMERIC(10, 6) DEFAULT 0;
  END IF;

  -- generation_time_seconds
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'generation_time_seconds'
  ) THEN
    ALTER TABLE outputs ADD COLUMN generation_time_seconds INTEGER;
  END IF;

  -- word_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'word_count'
  ) THEN
    ALTER TABLE outputs ADD COLUMN word_count INTEGER;
  END IF;

  -- character_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'character_count'
  ) THEN
    ALTER TABLE outputs ADD COLUMN character_count INTEGER;
  END IF;

  -- published_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outputs' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE outputs ADD COLUMN published_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index on user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_outputs_user_id ON outputs(user_id);

-- Update RLS policies to include user_id filtering
DROP POLICY IF EXISTS "Users can view own outputs" ON outputs;
CREATE POLICY "Users can view own outputs"
  ON outputs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own outputs" ON outputs;
CREATE POLICY "Users can insert own outputs"
  ON outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own outputs" ON outputs;
CREATE POLICY "Users can update own outputs"
  ON outputs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own outputs" ON outputs;
CREATE POLICY "Users can delete own outputs"
  ON outputs FOR DELETE
  USING (auth.uid() = user_id);

-- Make sure RLS is enabled
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN outputs.user_id IS 'User who owns this output (required for RLS)';
