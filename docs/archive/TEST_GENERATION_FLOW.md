# Test Generation Flow - Step by Step

Follow these steps to verify everything is working correctly.

## ✅ Prerequisites

1. The `generation_progress` table has been created in Supabase
2. Your app is running (localhost or deployed)
3. You have a completed project with transcription

---

## Test 1: Basic Generation & Auto-Refresh

### Steps:
1. Open your app and navigate to Projects page
2. Select a completed project
3. Click the **"Generate Content"** button
4. Select 2-3 content blocks (e.g., 1 LinkedIn Post, 1 X Thread)
5. Click **"Generate Content"** to confirm

### Expected Results:
- ✅ Button immediately changes to "🔄 Generating..."
- ✅ Button is disabled (grayed out)
- ✅ Generation takes 30s-2min
- ✅ Button automatically returns to "⚡ Generate Content"
- ✅ New content appears in the Outputs tab **without** clicking refresh
- ✅ Output count in project list updates automatically

### What to Check in Console:
```
[REALTIME] Generation progress subscription status: SUBSCRIBED
[REALTIME] Generation progress event: INSERT {...}
[REALTIME] Adding to generating set: <project-id>
... (during generation) ...
[REALTIME] Generation progress event: DELETE {...}
[REALTIME] Removed from generating set: <project-id>
[REALTIME] Final refresh after delete...
```

---

## Test 2: Persistent Loading State (Page Refresh)

### Steps:
1. Click **"Generate Content"**
2. Select blocks and confirm
3. **Immediately refresh the page** (Cmd+R / Ctrl+R)
4. Wait for generation to complete

### Expected Results:
- ✅ After refresh, button still shows "🔄 Generating..."
- ✅ Button stays disabled
- ✅ When generation completes, button returns to normal
- ✅ Content appears automatically

### What to Check in Console:
```
Restored generation state for projects: ["<project-id>"]
... (later) ...
[REALTIME] Generation progress event: DELETE {...}
[REALTIME] Removed from generating set: <project-id>
```

---

## Test 3: Manual Refresh Button

### Steps:
1. Start generating content
2. While generating, click the **🔄 Refresh** button at top
3. Wait for refresh to complete
4. Generation is still running
5. Wait for generation to complete

### Expected Results:
- ✅ After manual refresh, spinner still shows
- ✅ Generation continues in background
- ✅ When generation completes, spinner disappears
- ✅ Content appears automatically

---

## Test 4: Multiple Projects Simultaneously

### Steps:
1. Open Project A
2. Click **"Generate Content"**, select blocks, confirm
3. **Switch to Project B** (don't wait for A to finish)
4. Click **"Generate Content"**, select blocks, confirm
5. Both are now generating

### Expected Results:
- ✅ Project A shows "🔄 Generating..."
- ✅ Project B shows "🔄 Generating..."
- ✅ When Project A completes, only A's button returns to normal
- ✅ When Project B completes, only B's button returns to normal
- ✅ Content appears for each project as they complete

---

## Test 5: Generation While Browsing Other Projects

### Steps:
1. Select Project A
2. Start generating content for Project A
3. **Click on Project B** in the sidebar
4. Browse Project B while A generates
5. **Click back to Project A** after generation completes

### Expected Results:
- ✅ Project A spinner shows while generating (even when viewing B)
- ✅ When you return to Project A, new content is already there
- ✅ No manual refresh needed

---

## Troubleshooting Guide

### Problem: Spinner Stuck After Generation

**Check:**
1. Open browser console
2. Look for `[REALTIME]` logs
3. Check if DELETE event fired

**If no DELETE event:**
```sql
-- Manually check database
SELECT * FROM generation_progress;

-- Delete stuck entry
DELETE FROM generation_progress WHERE project_id = '<stuck-project-id>';
```

Then refresh the page.

---

### Problem: Content Doesn't Auto-Appear

**Check:**
1. Console shows: `[REALTIME] Final refresh after delete...`
2. Console shows: `Fetched projects:` and `Fetched outputs:`

**If missing:**
- Realtime connection may have failed
- Click manual refresh button
- Check Network tab for WebSocket connection

---

### Problem: Spinner Doesn't Show at All

**Check:**
1. Console shows: `[REALTIME] Adding to generating set: <project-id>`
2. Database has entry: `SELECT * FROM generation_progress;`

**If missing:**
- Backend might have failed to create entry
- Check API logs for `[PROGRESS]` messages
- Check if table exists and has correct permissions

---

### Problem: Subscription Status Shows "CHANNEL_ERROR"

**Check:**
1. Verify Supabase credentials in `.env.local`
2. Check Supabase project status (not paused)
3. Check RLS policies on `generation_progress` table
4. Try reconnecting to internet (WebSocket connection issue)

---

## Success Criteria

All of these should work without any manual intervention:

✅ Click Generate → Spinner shows
✅ Wait for completion → Spinner disappears automatically
✅ Content appears automatically
✅ Refresh during generation → Spinner persists
✅ Multiple projects → Each tracked independently
✅ Switch projects during generation → States maintained
✅ Manual refresh → Doesn't break anything

---

## Advanced: Check Database State

At any time, you can check what's happening in the database:

```sql
-- See active generations
SELECT
  project_id,
  status,
  completed_blocks,
  total_blocks,
  message,
  created_at,
  updated_at
FROM generation_progress
ORDER BY updated_at DESC;
```

**Healthy state:**
- Active generations show `status = 'preparing'` or `'generating'`
- Completed generations are deleted (no rows for completed projects)
- No rows with `status = 'completed'` or `'failed'` (should be deleted)

**Unhealthy state:**
- Rows stuck with old timestamps (>10 minutes)
- Multiple rows for same project_id (shouldn't happen, unique constraint)
- Rows with `status = 'completed'` still present

---

## Performance Notes

- Generation for 1 block: ~10-20 seconds
- Generation for 3 blocks: ~30-60 seconds
- Generation for 5+ blocks: ~1-2 minutes

Realtime updates are near-instant (< 1 second latency).
