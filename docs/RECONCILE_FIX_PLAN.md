# Reconcile Missing Data Fix Plan

## 1. Likely Root Causes
The root cause of this issue is a **JavaScript truthiness bug** interacting with a **database default value**.
- According to the Supabase schema, the columns `chapters`, `key_takeaways`, and `social_quotes` default to an empty JSON array (`'[]'::jsonb`).
- When the `reconcile` endpoint fetches a project where AI generation previously failed, these fields contain `[]`.
- Inside the `check` function of the reconcile endpoint, the code does a simple truthiness check: `if (dbContent)`. 
- In JavaScript, an empty array `[]` is **truthy**. Therefore, the logic incorrectly assumes *"Content is present but flag wasn't written"*, categorizes it as a `flag-only` fix, sets the flag to `true`, and skips the actual LLM generation.
- The UI checks the boolean flag (`aiProcessing.chapters === false`) to show a pending state. Once reconcile falsely flips the flag to `true`, the UI assumes the data is ready and removes the pending loader. However, because the array is still empty (`[]`), nothing renders.

## 2. Exact Code Locations to Inspect
- **Reconcile Logic:** `app/api/projects/[id]/reconcile/route.ts` 
  Specifically, the `check` function around lines 103-118 which evaluates `if (dbContent)`.
- **Database Schema:** `database/schemas/database-tier-content.sql` 
  Shows the `DEFAULT '[]'::jsonb` declarations.
- **UI Rendering:** `app/dashboard/projects/page.tsx`
  Specifically around line 1694 where the UI uses `pending: aiProcessing.chapters === false` to decide whether to show a loader.

## 3. Proposed Fix Steps
**File:** `app/api/projects/[id]/reconcile/route.ts`

**What to change:**
Modify the `check` function to explicitly check for empty arrays.

**Step-by-step diff:**
```typescript
    const check = (
      flag: keyof AIProcessingFlags,
      featureEnabled: boolean,
      dbContent: unknown
    ) => {
      if (!featureEnabled) return;
      if (aiProcessing[flag]) return; // already done

      // FIX: Ensure empty arrays are treated as missing content
      const hasContent = Array.isArray(dbContent) 
        ? dbContent.length > 0 
        : !!dbContent;

      if (hasContent) {
        // Content is present but flag wasn't written — fix flag only, no billing
        flagFixed.push(flag as string);
      } else {
        // Content genuinely missing — need to regenerate
        toGenerate.push(flag);
      }
    };
```

## 4. How to Validate the Fix
1. **Reset the Project State:** Manually flip the AI flags back to false (or omit them) for a project that has an empty array for `chapters`, `key_takeaways`, and `social_quotes`.
2. **Trigger Reconcile:** Open the project in the UI or hit the `/api/projects/[id]/reconcile` endpoint.
3. **API Response Check:** The server logs and API response should now report that `summary`, `chapters`, `takeaways`, and `quotes` are in the `generated` array, NOT the `flagFixed` array.
4. **UI State Update:** After the endpoint completes (it will take a bit longer due to the LLM calls), the UI should refresh and securely render the newly populated chapters, takeaways, and quotes strings.
