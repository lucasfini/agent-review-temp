-- ============================================================
-- Tier simplification: basic → standard, premium → pro
-- + Add 4 new first-class output types
-- ============================================================

-- 1. Migrate performance_level values on the projects table
UPDATE projects
SET performance_level = 'standard'
WHERE performance_level = 'basic';

UPDATE projects
SET performance_level = 'pro'
WHERE performance_level = 'premium';

-- 2. Extend the outputs.type column to support the 4 new content types.
--    The outputs table uses a text/varchar column (not an enum in most setups).
--    If performance_level or type is an enum, update accordingly below.
--
--    Check if outputs.type is an enum:
DO $$
BEGIN
  -- Only attempt enum extension if the column is an enum type.
  -- This is safe to run even if the column is plain text.
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE c.relname = 'outputs'
      AND a.attname = 'type'
    LIMIT 1
  ) THEN
    -- Add new enum values if they don't already exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'youtube_description'
                   AND enumtypid = (SELECT atttypid FROM pg_attribute
                                    JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
                                    WHERE relname = 'outputs' AND attname = 'type')) THEN
      ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'youtube_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'podcast_episode_description'
                   AND enumtypid = (SELECT atttypid FROM pg_attribute
                                    JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
                                    WHERE relname = 'outputs' AND attname = 'type')) THEN
      ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'podcast_episode_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'short_form_video_script'
                   AND enumtypid = (SELECT atttypid FROM pg_attribute
                                    JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
                                    WHERE relname = 'outputs' AND attname = 'type')) THEN
      ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'short_form_video_script';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'facebook_post'
                   AND enumtypid = (SELECT atttypid FROM pg_attribute
                                    JOIN pg_class ON pg_class.oid = pg_attribute.attrelid
                                    WHERE relname = 'outputs' AND attname = 'type')) THEN
      ALTER TYPE output_type ADD VALUE IF NOT EXISTS 'facebook_post';
    END IF;
  END IF;
END $$;
