# Phase 1C-1: Project Route Authorization Helper Cutover

Date: 2026-05-26

## What Changed

Primary change:
- Updated `lib/api/route-auth.ts` `requireProjectOwner` to support dual authorization paths.

Behavior now:
1. Authenticate request user exactly as before (Bearer token or cookie session).
2. Load project with required fields ensured in query:
   - `id`
   - `user_id`
   - `organization_id`
   - plus caller-requested fields
3. Authorize access if either:
   - Legacy owner path: `project.user_id === auth.user.id`
   - Organization member path: `project.organization_id` is set and user has an active row in `organization_members`
4. Deny with `403` if neither path passes.

Return contract:
- Existing fields preserved:
  - `user`
  - `project`
- Added optional metadata field:
  - `accessMode: 'legacy_owner' | 'organization_member'`

## Helper-Level Compatibility Details

- Existing callers that depend on `user`/`project` continue to work.
- `organization_id` is now always included in selected project data unless `select='*'`.
- Legacy projects with `organization_id = null` remain supported through owner-only authorization.

## Routes Indirectly Affected (already using `requireProjectOwner`)

The following routes become organization-aware automatically through helper usage:

- `app/api/insights/[projectId]/route.ts`
- `app/api/projects/[id]/segments/touchup/route.ts`
- `app/api/projects/[id]/segments/reassign/route.ts`
- `app/api/projects/[id]/roster/route.ts`
- `app/api/projects/[id]/outputs/route.ts`
- `app/api/projects/[id]/cleanup-cache/route.ts`
- `app/api/projects/[id]/generation-jobs/acknowledge-failures/route.ts`
- `app/api/projects/[id]/route.ts`
- `app/api/projects/[id]/speakers/route.ts`
- `app/api/projects/[id]/speakers/[speakerId]/route.ts`

## Routes Intentionally Not Converted Yet

Per scope, this phase does **not** convert ad-hoc project ownership checks outside `requireProjectOwner`, including:

- Dashboard list/read routes
- Billing routes
- Integration routes (except compile-safety incidental impacts)
- Other endpoints with direct `project.user_id` checks that do not call helper yet

## Tests Added

Added focused unit tests for helper behavior:
- `tests/lib/route-auth.test.ts`

Covered cases:
- Legacy owner access allowed
- Active org member access allowed
- Non-member access denied
- Null `organization_id` project allows owner only

## Validation

Commands run:
- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/route-auth.test.ts`

## Next Steps (Phase 1C-2)

1. Migrate additional project routes still using ad-hoc `project.user_id` checks to central helper usage.
2. Add organization-aware helper variants for list/read scopes where needed.
3. Expand route-level tests for critical project mutation endpoints under org-member access.
4. Defer dashboard/billing/integration-wide cutover until dedicated phases.
