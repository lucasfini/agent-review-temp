# Persistent Generation State & Auto-Refresh

## Overview

The content generation progress now persists across page refreshes and automatically updates when new content is generated - no manual refresh needed!

## What's New

### 1. **Persistent Loading State** ✅
- If you start generating content and refresh the page, the loading spinner stays
- The system checks the database on page load to see which projects are generating
- Loading state is restored automatically

### 2. **Automatic Content Refresh** ✅
- When generation completes, new content appears automatically
- No need to manually refresh the page
- Works via Supabase Realtime subscriptions

## How It Works

### On Page Load

```typescript
// 1. Fetch current generation progress from database
fetchGenerationProgress()
  ↓
// 2. Query generation_progress table for projects with status 'preparing' or 'generating'
SELECT * FROM generation_progress
WHERE status IN ('preparing', 'generating')
  ↓
// 3. Restore generating state
setGeneratingProjects(new Set([project_ids]))
  ↓
// 4. Generate Content button shows loading spinner for those projects
```

### During Generation

```typescript
// Real-time subscription listens to generation_progress table
Supabase Realtime: generation_progress table changes
  ↓
Status: 'preparing' → Add to generatingProjects (show spinner)
Status: 'generating' → Keep in generatingProjects (show spinner)
Status: 'completed' → Remove from generatingProjects + Auto-refresh
Status: 'failed' → Remove from generatingProjects + Auto-refresh
```

### Auto-Refresh on Completion

```typescript
When status changes to 'completed':
  ↓
1. fetchProjects()        // Updates project list (shows new output count)
  ↓
2. fetchProjectOutputs()  // If this project is selected, refresh outputs tab
  ↓
3. UI automatically updates with new content
  ↓
4. Loading spinner disappears
```

## User Experience

### Scenario 1: Normal Generation
1. Click "Generate Content"
2. Select blocks and confirm
3. **Button shows loading spinner**
4. Content generates (30s - 2min)
5. **New content automatically appears** (no refresh needed)
6. Button returns to normal

### Scenario 2: Page Refresh During Generation
1. Click "Generate Content"
2. Select blocks and confirm
3. **Button shows loading spinner**
4. User refreshes page (Cmd/Ctrl + R)
5. **Page loads with spinner still showing** ✨
6. Content continues generating in background
7. **New content automatically appears when done**
8. Button returns to normal

### Scenario 3: Multiple Projects
1. Start generating content for Project A
2. Navigate to Project B
3. Start generating content for Project B
4. **Both projects show loading spinners**
5. Project A completes → spinner disappears, content appears
6. Project B completes → spinner disappears, content appears

### Scenario 4: Close Tab During Generation
1. Start generating content
2. Close browser tab
3. Generation continues on server
4. Open tab later
5. **Content is already there** ✨

## Technical Implementation

### Files Modified

**`app/dashboard/projects/page.tsx`:**

1. **Added `fetchGenerationProgress()`**
   ```typescript
   // Fetches current generation progress on page load
   const fetchGenerationProgress = async () => {
     const { data } = await supabase
       .from('generation_progress')
       .select('project_id, status')
       .in('status', ['preparing', 'generating']);

     // Restore generating state
     setGeneratingProjects(new Set(projectIds));
   };
   ```

2. **Updated `useEffect()` to call it on mount**
   ```typescript
   useEffect(() => {
     if (user) {
       fetchProjects();
       fetchGenerationProgress(); // NEW: Restore loading state
       // ... subscriptions
     }
   }, [user, selectedProject?.id]);
   ```

3. **Enhanced generation_progress subscription**
   ```typescript
   // When generation completes:
   if (data.status === 'completed' || data.status === 'failed') {
     next.delete(data.project_id);
     fetchProjects(); // Refresh project list

     // NEW: Also refresh outputs if this is the selected project
     if (selectedProject && selectedProject.id === data.project_id) {
       fetchProjectOutputs(data.project_id);
     }
   }
   ```

### Database Queries

**On Page Load:**
```sql
-- Check which projects are currently generating
SELECT project_id, status
FROM generation_progress
WHERE status IN ('preparing', 'generating');
```

**Real-time Subscription:**
```sql
-- Listen to all changes in generation_progress table
LISTEN generation_progress;
```

**On Completion:**
```sql
-- Fetch updated projects list
SELECT * FROM projects WHERE user_id = $1;

-- Fetch new outputs for selected project
SELECT * FROM outputs WHERE project_id = $1;
```

## Testing

### Test 1: Persistent Loading State
1. Start generating content (e.g., 3 blog posts)
2. **Refresh page immediately** (Cmd/Ctrl + R)
3. ✅ Loading spinner should still be showing
4. Wait for completion
5. ✅ Content should appear automatically
6. ✅ Spinner should disappear

### Test 2: Auto-Refresh Without Selection
1. From project list, click Generate Content icon
2. Select blocks and confirm
3. **Don't select/open the project**
4. Wait for generation to complete
5. ✅ Output count should update automatically in project list
6. ✅ Spinner should disappear

### Test 3: Auto-Refresh With Selection
1. Select/open a project
2. Click "Generate Content" button
3. Select blocks and confirm
4. **Stay on the Outputs tab**
5. Wait for generation to complete
6. ✅ New outputs should appear automatically in the list
7. ✅ Spinner should disappear
8. ✅ Project count should update

### Test 4: Multiple Projects Generating
1. Start generating for Project A
2. Start generating for Project B
3. Start generating for Project C
4. **Refresh page**
5. ✅ All three should show loading spinners
6. Wait for completions
7. ✅ Each should update automatically as they finish

## Troubleshooting

### Loading spinner stuck after refresh
**Possible causes:**
- Generation actually failed but status wasn't updated
- Supabase Realtime connection failed

**Solution:**
```sql
-- Check generation_progress table
SELECT * FROM generation_progress
WHERE status IN ('preparing', 'generating');

-- If stuck, manually complete them:
UPDATE generation_progress
SET status = 'completed'
WHERE status IN ('preparing', 'generating');
```

### Content not appearing automatically
**Possible causes:**
- Supabase Realtime subscription not connected
- RLS policies blocking access

**Check:**
1. Browser console for Realtime connection errors
2. Network tab for Realtime WebSocket connection
3. Verify RLS policies on `generation_progress` and `outputs` tables

### Spinner doesn't show after refresh
**Possible causes:**
- `generation_progress` table not created
- Function not being called on mount

**Check:**
1. Verify table exists: `SELECT * FROM generation_progress;`
2. Check console for `fetchGenerationProgress()` errors
3. Verify `useEffect` dependencies are correct

## Benefits

✅ **Better UX**: Users don't lose progress state on refresh
✅ **No Manual Refresh**: Content appears automatically when ready
✅ **Multiple Projects**: Can generate for many projects simultaneously
✅ **Background Processing**: Can close tab, generation continues
✅ **Real-time Feedback**: Always know what's happening
✅ **Reliable**: State persisted in database, not just memory

## Next Steps

Consider these future enhancements:
- Show percentage progress (e.g., "2 of 5 blocks complete")
- Show which specific block is currently generating
- Add cancel button for in-progress generation
- Show estimated time remaining
- Toast notification when generation completes
