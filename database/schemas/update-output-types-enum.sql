-- Update output_type ENUM to include all content types used in theme-based generation
-- This migration safely adds missing values to the existing ENUM

-- Add missing content type values to output_type ENUM
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in PostgreSQL
-- Run these statements one at a time if you encounter errors

-- Core content types (likely already exist, but safe to run)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'output_type') THEN
        -- If enum doesn't exist, create it
        CREATE TYPE output_type AS ENUM (
          'blog_post',
          'social_post',
          'email_newsletter',
          'audiogram_clip',
          'quote_graphic',
          'show_notes',
          'twitter_thread',
          'linkedin_post',
          'instagram_caption'
        );
    END IF;
END $$;

-- Add values one by one (PostgreSQL will skip if they already exist in newer versions)
DO $$
BEGIN
    -- Check and add twitter_thread
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'twitter_thread'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'twitter_thread';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add linkedin_post
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'linkedin_post'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'linkedin_post';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add instagram_caption
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'instagram_caption'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'instagram_caption';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add quote_graphic
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'quote_graphic'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'quote_graphic';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add blog_post
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'blog_post'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'blog_post';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add email_newsletter
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'email_newsletter'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'email_newsletter';
    END IF;
END $$;

DO $$
BEGIN
    -- Check and add show_notes
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'show_notes'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
    ) THEN
        ALTER TYPE output_type ADD VALUE 'show_notes';
    END IF;
END $$;

-- Verify the enum values
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'output_type')
ORDER BY enumsortorder;
