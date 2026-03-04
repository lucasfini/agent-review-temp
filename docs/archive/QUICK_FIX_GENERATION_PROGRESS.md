# Quick Fix: Create generation_progress Table

## The Issue

You're seeing this error:
```
Could not find the table 'public.generation_progress' in the schema cache
```

This is because the `generation_progress` table hasn't been created yet in your Supabase database.

## The Fix (5 minutes)

### Step 1: Go to Supabase SQL Editor

1. Open your Supabase project dashboard
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Copy and Paste This SQL

Copy the entire SQL below and paste it into the SQL editor:

```sql
-- Create generation_progress table for real-time content generation tracking
CREATE TABLE IF NOT EXISTS public.generation_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('preparing', 'generating', 'completed', 'failed')),
  current_block jsonb,
  completed_blocks integer NOT NULL DEFAULT 0,
  total_blocks integer NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_generation_progress_project_id ON public.generation_progress(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_progress_status ON public.generation_progress(status);
CREATE INDEX IF NOT EXISTS idx_generation_progress_updated_at ON public.generation_progress(updated_at);

-- Enable Row Level Security
ALTER TABLE public.generation_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own project progress
CREATE POLICY "Users can view their own generation progress"
  ON public.generation_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = generation_progress.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Service role can do everything (for API operations)
CREATE POLICY "Service role can manage all generation progress"
  ON public.generation_progress
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE public.generation_progress IS 'Tracks real-time progress of content generation for projects';
```

### Step 3: Run the Query

1. Click the **Run** button (or press Cmd/Ctrl + Enter)
2. You should see "Success. No rows returned"

### Step 4: Verify

To verify the table was created:

1. Click **Table Editor** in the left sidebar
2. Look for `generation_progress` in the list of tables
3. You should see it with columns: `id`, `project_id`, `status`, `current_block`, etc.

## What This Table Does

This table tracks the real-time progress of content generation:

- When you start generating content, a row is created with status `preparing`
- As each block generates, the status updates to `generating`
- The `current_block` field shows which piece is being generated (e.g., "LinkedIn Post #1")
- When complete, status changes to `completed`

The frontend subscribes to changes in this table via Supabase Realtime to show the loading spinner in the "Generate Content" button.

## Done!

After creating the table, try generating content again. You should see:

1. ✅ The "Generate Content" button shows a loading spinner
2. ✅ Content generates successfully
3. ✅ Button returns to normal when complete
4. ✅ No more `generation_progress` errors in console

## Other Error Fixed

I also fixed the blog post platform error (`outputs_platform_check` violation). Blog posts now use `platform: 'general'` instead of `platform: 'blog'` which matches your database constraints.
