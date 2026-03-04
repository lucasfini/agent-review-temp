# Platform Constraint Fixes Summary

## Issues Found

Your database has a `outputs_platform_check` constraint that only allows specific platform values. Some content generators were using platform values that aren't allowed by this constraint.

## Fixes Applied

### ✅ Blog Posts
**Before:** `platform: 'blog'` ❌
**After:** `platform: 'general'` ✅

**File:** `app/api/generate-content/route.ts` line ~911

### ✅ Newsletters
**Before:** `platform: 'email'` ❌
**After:** `platform: 'general'` ✅

**File:** `app/api/generate-content/route.ts` line ~1005

### ✅ Already Correct

These were already using allowed platform values:

- **X/Twitter Threads:** `platform: 'twitter'` ✅
- **LinkedIn Posts:** `platform: 'linkedin'` ✅
- **Instagram Carousels:** `platform: 'instagram'` ✅
- **Show Notes:** `platform: 'general'` ✅
- **Quote Graphics:** `platform: 'general'` ✅

## Your Database Platform Constraints

Based on the schema and errors, your database appears to allow these platform values:

```sql
CHECK (platform IN (
  'twitter',
  'linkedin',
  'instagram',
  'facebook',
  'youtube',
  'general'
))
```

**Note:** `'email'` and `'blog'` are NOT in the allowed list, which is why we changed them to `'general'`.

## Why Use 'general'?

The `'general'` platform value is a catch-all for content that:
- Isn't platform-specific
- Can be used across multiple platforms
- Doesn't fit neatly into social media categories

This makes sense for:
- Blog posts (can be published on various blog platforms)
- Newsletters (can be sent via various email providers)
- Show notes (can be posted anywhere)
- Quote graphics (can be shared anywhere)

## Testing

After these fixes, you should be able to generate:
- ✅ Blog posts without errors
- ✅ Newsletters without errors
- ✅ All other content types continue to work

## If You Still Get Platform Errors

If you see another platform constraint error:

1. **Check the error message** - it will show which platform value failed
2. **Find the content type** - look at the error details to see the type
3. **Update the code** - change that platform value to `'general'`
4. **Or update your database** - add the platform value to your constraint

### To Check Your Database Constraint:

```sql
-- See what platform values are actually allowed
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'outputs_platform_check';
```

This will show you exactly what your database allows.

## Summary

All content generation should now work without platform constraint errors. The only remaining issue is the missing `generation_progress` table - see `URGENT_CREATE_TABLE.md` for the fix.
