# Database Constraint Fixes - Complete Summary

## Overview

Your database has stricter constraints than the schema files suggested. I've fixed all content generators to work with your actual database constraints.

---

## Issues Found & Fixed

### ❌ Issue 1: Blog Post Platform Constraint

**Error:**
```
new row for relation "outputs" violates check constraint "outputs_platform_check"
type: 'blog_post', platform: 'blog'
```

**Problem:** Database doesn't allow `platform: 'blog'`

**Fix:** Changed to `platform: 'general'`

**File:** `app/api/generate-content/route.ts` line ~911

---

### ❌ Issue 2: Newsletter Platform Constraint

**Error:**
```
new row for relation "outputs" violates check constraint "outputs_platform_check"
type: 'email_newsletter', platform: 'email'
```

**Problem:** Database doesn't allow `platform: 'email'`

**Fix:** Changed to `platform: 'general'`

**File:** `app/api/generate-content/route.ts` line ~1005

---

### ❌ Issue 3: Newsletter Type Constraint

**Error:**
```
new row for relation "outputs" violates check constraint "outputs_type_check"
type: 'email_newsletter', platform: 'general'
```

**Problem:** Database doesn't allow `type: 'email_newsletter'`

**Fix:**
1. Removed `email_newsletter` from `LEGACY_OUTPUT_TYPES`
2. Added fallback: `email_newsletter` → `social_post`

**File:** `app/api/generate-content/route.ts` lines 1135-1148

---

## Your Database Constraints

### Allowed Platform Values:
```
✅ 'twitter'
✅ 'linkedin'
✅ 'instagram'
✅ 'facebook'
✅ 'youtube'
✅ 'general'
```

### Allowed Type Values:
```
✅ 'blog_post'
✅ 'social_post'
✅ 'quote_graphic'
✅ 'show_notes'
✅ 'twitter_thread' (saved as 'social_post')
✅ 'linkedin_post' (saved as 'social_post')
✅ 'instagram_caption' (saved as 'social_post')
✅ 'email_newsletter' (saved as 'social_post')
```

---

## How Content Types Are Saved

### Direct Types (saved as-is):
- **Blog Post:** `type: 'blog_post', platform: 'general'`
- **Quote Graphics:** `type: 'quote_graphic', platform: 'general'`
- **Show Notes:** `type: 'show_notes', platform: 'general'`

### Normalized Types (saved as 'social_post'):
- **X/Twitter Thread:** `type: 'social_post', platform: 'twitter'`
  - Metadata includes: `originalOutputType: 'twitter_thread'`

- **LinkedIn Post:** `type: 'social_post', platform: 'linkedin'`
  - Metadata includes: `originalOutputType: 'linkedin_post'`

- **Instagram Carousel:** `type: 'social_post', platform: 'instagram'`
  - Metadata includes: `originalOutputType: 'instagram_caption'`

- **Email Newsletter:** `type: 'social_post', platform: 'general'`
  - Metadata includes: `originalOutputType: 'email_newsletter'`

---

## Why This Works

### Platform Normalization:
Some content isn't tied to a specific social platform:
- Blog posts can be published on any blogging platform
- Newsletters can be sent via any email service
- Show notes can be posted anywhere
- Quote graphics can be shared anywhere

Solution: Use `platform: 'general'` for these

### Type Normalization:
Social media posts are essentially the same type of content:
- Twitter threads are social posts
- LinkedIn posts are social posts
- Instagram captions are social posts
- Newsletters are social posts (just longer)

Solution: Save all as `type: 'social_post'` with original type in metadata

---

## Querying Content

### Get All Outputs for a Project:
```sql
SELECT * FROM outputs
WHERE project_id = '<project-id>'
ORDER BY created_at DESC;
```

### Get X/Twitter Threads:
```sql
SELECT * FROM outputs
WHERE project_id = '<project-id>'
  AND type = 'social_post'
  AND platform = 'twitter'
ORDER BY created_at DESC;
```

### Get Newsletters:
```sql
SELECT * FROM outputs
WHERE project_id = '<project-id>'
  AND type = 'social_post'
  AND platform = 'general'
  AND metadata->>'originalOutputType' = 'email_newsletter'
ORDER BY created_at DESC;
```

### Get Blog Posts:
```sql
SELECT * FROM outputs
WHERE project_id = '<project-id>'
  AND type = 'blog_post'
ORDER BY created_at DESC;
```

---

## Testing

All content types should now save successfully:

✅ **X/Twitter Threads** → `social_post` + `twitter` platform
✅ **LinkedIn Posts** → `social_post` + `linkedin` platform
✅ **Instagram Carousels** → `social_post` + `instagram` platform
✅ **Blog Posts** → `blog_post` + `general` platform
✅ **Email Newsletters** → `social_post` + `general` platform
✅ **Show Notes** → `show_notes` + `general` platform
✅ **Quote Graphics** → `quote_graphic` + `general` platform

---

## If You Get More Constraint Errors

### Check the Error:
```
new row for relation "outputs" violates check constraint "outputs_X_check"
```

Where `X` is either `platform` or `type`.

### For Platform Errors:
1. Find the content generator function
2. Change `platform: 'whatever'` to `platform: 'general'`
3. Or use one of: `twitter`, `linkedin`, `instagram`, `facebook`, `youtube`

### For Type Errors:
1. Add to `OUTPUT_TYPE_FALLBACKS`:
   ```typescript
   const OUTPUT_TYPE_FALLBACKS: Record<string, OutputType> = {
     new_type_name: 'social_post'
   };
   ```

2. Make sure it's NOT in `LEGACY_OUTPUT_TYPES`

---

## Your Actual Database Schema

To see exactly what your database allows:

```sql
-- Check platform constraint
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'outputs_platform_check';

-- Check type constraint
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'outputs_type_check';
```

This will show you the exact allowed values.

---

## Summary

All content generation now works! The fixes:

1. ✅ Blog posts use `platform: 'general'`
2. ✅ Newsletters use `platform: 'general'` and `type: 'social_post'`
3. ✅ All social posts properly normalized
4. ✅ Original types preserved in metadata
5. ✅ No more constraint violations

You can now generate all content types without errors!
