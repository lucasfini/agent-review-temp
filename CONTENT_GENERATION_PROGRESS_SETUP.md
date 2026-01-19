# Content Generation Progress - Setup Guide

## Overview

A real-time progress tracking system has been implemented for content generation. Users will now see a visual progress modal that shows:

- Which content blocks are being generated (e.g., "LinkedIn Post #1", "X Thread #2")
- Current generation status (preparing, generating, completed)
- Real-time updates as each block is processed
- Visual checkmarks for completed blocks
- Progress percentage

## Features

### Backend
- **Progress Tracking API** (`lib/generation-progress.ts`): Functions to initialize, update, and complete generation progress
- **Real-time Updates**: Uses Supabase Realtime to push progress updates to frontend
- **Database Table**: `generation_progress` table stores current generation state

### Frontend
- **Progress Modal Component** (`components/ContentGenerationProgress.tsx`): Beautiful modal showing real-time progress
- **Supabase Realtime Subscription**: Listens for database changes and updates UI instantly
- **Auto-complete**: Modal auto-closes 2 seconds after generation completes

## Database Setup

You need to run the migration to create the `generation_progress` table:

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/add_generation_progress_table.sql`
4. Click **Run**

### Option 2: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
```

### Option 3: Manual SQL Execution

Connect to your Supabase database and run:

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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_generation_progress_project_id ON public.generation_progress(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_progress_status ON public.generation_progress(status);
CREATE INDEX IF NOT EXISTS idx_generation_progress_updated_at ON public.generation_progress(updated_at);

-- Enable RLS
ALTER TABLE public.generation_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

CREATE POLICY "Service role can manage all generation progress"
  ON public.generation_progress
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

## How It Works

### User Flow

1. User clicks "Generate Content" on a project
2. User selects content blocks in the ContentSelectionModal
3. User clicks "Generate Content" button
4. **Progress Modal Opens** showing:
   - "Preparing to generate content..."
   - List of all selected blocks with pending status
5. **As each block generates**:
   - Current block shows spinner animation
   - Status updates to "Currently generating: [Block Name]"
   - Progress bar fills
6. **When block completes**:
   - Completed block shows green checkmark
   - Moves to next block
7. **When all complete**:
   - Shows "All content generated successfully!"
   - Auto-closes after 2 seconds
   - Refreshes project list to show new content

### Technical Flow

```
User Action
    ↓
ContentSelectionModal (user selects blocks)
    ↓
POST /api/generate-selected-content (starts generation)
    ↓
Calls /api/generate-content (async)
    ↓
initializeGenerationProgress() → Creates DB entry
    ↓
For each block:
  - updateGenerationProgress() → Updates DB with current block
  - generateBlockContent() → Generates content
  - completeBlock() → Updates completed count in DB
    ↓
completeGenerationProgress() → Marks as complete in DB
    ↓
ContentGenerationProgress component (listening via Supabase Realtime)
  - Receives updates
  - Updates UI in real-time
  - Auto-closes when complete
    ↓
Refreshes project list with new content
```

## Files Modified/Created

### New Files
- `components/ContentGenerationProgress.tsx` - Progress modal component
- `lib/generation-progress.ts` - Progress tracking functions
- `supabase/migrations/add_generation_progress_table.sql` - Database migration

### Modified Files
- `app/api/generate-content/route.ts` - Added progress tracking calls
- `app/dashboard/projects/page.tsx` - Integrated progress modal
- `components/ContentSelectionModal.tsx` - Updated to trigger progress modal

## Testing

1. Upload and transcribe a podcast
2. Click "Generate Content" button
3. Select multiple content blocks (e.g., 1 LinkedIn Post, 2 X Threads, 1 Newsletter)
4. Click "Generate Content"
5. **Observe**: Progress modal should appear showing:
   - Total blocks to generate
   - Current block being processed
   - Real-time updates as each completes
   - Green checkmarks for completed blocks
6. **After completion**: Modal should auto-close and new content should appear in project

## Troubleshooting

### Progress not updating
- Check browser console for Supabase Realtime connection errors
- Verify `generation_progress` table exists in database
- Check RLS policies are set correctly

### Modal not showing
- Verify `showGenerationProgress` state is being set to `true`
- Check component is imported correctly in `projects/page.tsx`

### Database errors
- Ensure migration ran successfully
- Check Supabase service role key is configured in `.env.local`
- Verify foreign key constraint (project must exist)

## Future Enhancements

- Add estimated time remaining
- Show token usage per block
- Add cancel generation button
- Detailed error messages for failed blocks
- Retry failed blocks individually
