# Phase 1C-3: Transcribe/Internal Auth Separation

Date: 2026-05-26

## Summary

This phase separates transcribe authorization into explicit user-triggered and internal/background branches, then applies organization-aware project authorization to user-triggered requests through the central helper.

Primary file updated:
- `app/api/transcribe/route.ts`

Supporting file added:
- `lib/api/transcribe-auth.ts`

## Auth Modes Found (Before)

`/api/transcribe` previously had one mixed flow:
- If maintenance/internal auth passed, request proceeded without end-user auth.
- Otherwise it required bearer user auth and then compared `existingProject.user_id` to that user id.

This meant user-triggered transcribe remained legacy owner-only and did not use org membership.

## What Changed

## 1) Explicit auth-context resolver

Added `resolveTranscribeRequestAuthContext(request, projectId)` in `lib/api/transcribe-auth.ts`.

It defines two branches:

### A. User-triggered branch (`isInternal = false`)
- Uses `requireProjectOwner` with transcribe-required project fields.
- Authorization is now central-helper based:
  - legacy owner allowed
  - active org member allowed when `project.organization_id` is set
  - non-members denied
- Returns authenticated caller user id as `callerUserId` for rate-limiting and logging behavior.

### B. Internal/background branch (`isInternal = true`)
- Uses existing internal maintenance auth check.
- Loads project directly by `projectId` via service role.
- Does not require end-user bearer/cookie session.
- Keeps internal/worker behavior available and protected.

## 2) Transcribe route now consumes auth context

In `app/api/transcribe/route.ts`:
- Request payload parsing stays in place.
- After `projectId` is parsed, route calls `resolveTranscribeRequestAuthContext(...)`.
- User rate limiting now keys off `callerUserId` only when present (user-triggered path).
- Existing provider, queue, lock, processing, and billing flows are unchanged.

## Caller Identity Handling

- For normal user-triggered requests, authorization no longer trusts any caller identity from request body.
- Effective caller identity comes from authenticated request + `requireProjectOwner`.
- For internal requests, internal auth must pass first; only then internal processing proceeds.

## Intentionally Not Changed

- No provider behavior changes (AssemblyAI/Deepgram flow unchanged).
- No transcription pipeline rewrite.
- No lock/heartbeat architecture changes.
- No billing logic redesign.
- No dashboard/billing-wide/integration-wide route conversion.
- No schema/RLS/subscription/agency/slack/granola/UI work.

## Backward Compatibility

- Legacy projects with null `organization_id` remain owner-only through helper behavior.
- Existing internal worker path remains operational under internal auth.

## Tests Added

- `tests/lib/transcribe-auth-context.test.ts`
  - user-triggered legacy-owner path
  - user-triggered org-member path
  - non-member denial propagation
  - internal authorized path

Also re-validated:
- `tests/lib/route-auth.test.ts`

## Validation Commands

- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/route-auth.test.ts tests/lib/transcribe-auth-context.test.ts`

## Remaining Risks

- Route-level integration tests for full `/api/transcribe` execution are still limited because provider/pipeline dependencies are heavy.
- Internal auth branch correctness relies on existing maintenance auth mechanism integrity.

## Next Steps (Phase 1C-4)

1. Add a narrow integration-style test around `/api/transcribe` auth-only entry behavior with deep mocks.
2. Review remaining internal-worker endpoints for explicit user/internal auth-context separation patterns.
3. Continue scoped conversion of remaining ad-hoc project auth checks outside dashboard/billing/integration-wide areas.
