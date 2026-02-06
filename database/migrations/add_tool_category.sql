-- Migration: Add 'tool' to insight_category enum
-- Purpose: Support tools, software, products, and organizations as a separate category
-- Run this in Supabase SQL Editor

-- Add the new enum value
ALTER TYPE insight_category ADD VALUE 'tool';

-- Verify the change
SELECT enum_range(NULL::insight_category);
-- Should return: {person,concept,tool}
