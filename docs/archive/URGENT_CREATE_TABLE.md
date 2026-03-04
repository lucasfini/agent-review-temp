# ⚠️ URGENT: Create Missing Table

## You're seeing this error:

```
Could not find the table 'public.generation_progress' in the schema cache
```

## This is breaking content generation!

Every time you try to generate content, it will fail until this table is created.

---

## ✅ QUICK FIX (2 minutes):

### 1. Open Supabase Dashboard
Go to: https://supabase.com/dashboard

### 2. Select Your Project
Click on your AudioRepurpose project

### 3. Go to SQL Editor
Click **"SQL Editor"** in the left sidebar

### 4. Create New Query
Click the **"New Query"** button

### 5. Copy & Paste This SQL

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

### 6. Click "Run" Button
Or press **Cmd/Ctrl + Enter**

### 7. You Should See
```
Success. No rows returned
```

---

## ✅ Verify It Worked

1. Click **"Table Editor"** in left sidebar
2. Look for **`generation_progress`** in the tables list
3. You should see it with these columns:
   - id
   - project_id
   - status
   - current_block
   - completed_blocks
   - total_blocks
   - message
   - created_at
   - updated_at

---

## 🎉 After Creating the Table

Content generation will work properly:
- ✅ No more "table not found" errors
- ✅ Loading spinner shows during generation
- ✅ Spinner persists if you refresh page
- ✅ Content auto-appears when done
- ✅ Newsletter and blog posts save correctly

---

## 📝 What I Also Fixed

**Newsletter Platform Error** - Changed newsletter platform from `'email'` to `'general'` to match your database constraints.

**Blog Platform Error** - Already fixed in previous update, using `'general'` instead of `'blog'`.

All content types now use correct platform values that match your database.

---

## Still Getting Errors?

If you still see errors after creating the table:

1. **Refresh your app** - Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
2. **Check Supabase logs** - In dashboard, go to "Logs" to see if table was created
3. **Verify RLS policies** - Make sure the policies were created successfully

---

## Need More Help?

See detailed docs in:
- `QUICK_FIX_GENERATION_PROGRESS.md` - Full setup guide
- `PERSISTENT_GENERATION_STATE.md` - How the system works
- `INLINE_GENERATION_PROGRESS.md` - UI implementation details
