# Backend Pipeline Reliability Implementation Plan

## 1. Scope & Objective
Ensure users always receive every paid AI output (summary, chapters, takeaways, quotes, insights, etc.), even if background processing via `/api/transcribe` is interrupted.
**Constraints:** No new paid infrastructure (no queues), client-triggered reconciliation, idempotent billing, and no new storage costs for large audio files.

## 2. Reconcile API Endpoint (`/api/projects/[id]/reconcile`)
**File to create:** `app/api/projects/[id]/reconcile/route.ts`
This endpoint acts as the healing mechanism. 

**Logic Flow:**
1. Fetch the project and its `speaker_data` (which houses `aiProcessing` flags) and its tier `performance_level`.
2. Determine what features are owed based on `getTierFeatures(performance_level)`.
3. Check `speaker_data.detectionMetadata.aiProcessing` flags:
   - Identify which owed features are marked `false` or are missing entirely.
4. If there are missing features:
   - Run *only* the missing generators (e.g., if `summary` is missing, call `generatePodcastSummary`).
   - For generation, dynamically pull the persisted `selected_content_blocks` (see Section 3) so repairs are precise to the user's intent.
   - Update `speaker_data` flags to `true` upon success.
5. Return the newly generated content or a 200 OK status if fully reconciled.

## 3. Persisting Selected Content Blocks
To ensure the reconcile endpoint knows *what* to generate (especially if the user customized their content types prior to upload), we must persist this state before background processing begins.

**Database / Schema Change (No Migration Required - JSONB):**
We'll utilize the existing `projects` table by injecting a new key into an existing JSONB field, or creating a dedicated JSONB column if the user agrees (but sticking to constraints, we use existing JSONB).
Store it inside the `detectionMetadata` or a new top-level `metadata` JSONB block on the `projects` table when the `/api/transcribe` route is hit.
*Example:*
```json
// Inside projects.metadata
{
  "selected_content_blocks": ["summary", "keyTakeaways", "socialQuotes"]
}
```

**Code to Update in `/api/transcribe/route.ts`:**
When the request comes in, extract `selectedTypes` and persist it to the DB immediately.

## 4. Idempotent Billing Approach
We must ensure that if a process fails halfway and is reconciled, the user is not double-charged for the LLM calls needed to finish the job.

**Implementation Details:**
- In `lib/billing/track-usage.ts` (specifically `trackOpenAIUsage` and `trackAnthropicUsage`), inject a `taskKey` or `idempotencyKey` into the metadata of the `usage_events` table and the `credit_transactions` table.
- **The Key Format:** `${projectId}_${featureName}_${attemptNumber}` (e.g., `proj_123_summary_1`).
- **The Check:** Before making the LLM call in the reconcile API, query `credit_transactions` (or `usage_events`) for this specific `taskKey` with a `status: 'completed'`.
- If found -> Skip billing (or even skip generation if the output exists but flag wasn't updated).
- If not found -> Proceed with generation and bill using `shouldDebit: true`.

## 5. UI Trigger for Reconciliation
**File to update:** `app/dashboard/projects/page.tsx` (or the specific project view component)
**Logic:**
```tsx
useEffect(() => {
  if (project?.id && project?.status !== 'completed') {
    // Fire and forget the reconcile endpoint
    fetch(`/api/projects/${project.id}/reconcile`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.reconciled) refreshProjectState();
      });
  }
}, [project?.id, project?.status]);
```
*User Experience:* Add a minimal toast or subtle "Healing missing components..." indicator if the reconcile API takes more than 1-2 seconds.

## 6. Acceptance Checklist
- [ ] `/api/projects/[id]/reconcile` created and accurately detects missing features based on tier.
- [ ] `selected_content_blocks` is persisted in the DB at the start of `/api/transcribe`.
- [ ] Usage tracking functions updated to accept and verify an idempotency `taskKey`.
- [ ] Dashboard UI automatically triggers reconcile on project open if status/flags indicate incompletion.
- [ ] Missing components (e.g., summary, chapters) successfully generate without double-billing.
