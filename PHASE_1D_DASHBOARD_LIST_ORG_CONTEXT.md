# Phase 1D: Dashboard/List Organization Context

Date: 2026-05-26

## Scope

Converted only these dashboard API routes:
- `app/api/dashboard/projects/route.ts`
- `app/api/dashboard/analytics/route.ts`
- `app/api/dashboard/upload-history/route.ts`

Out of scope (unchanged):
- Billing routes (`app/api/billing/*`, `lib/billing/*`)
- Integration routes (`app/api/integrations/*`, `lib/integrations/*`)
- Dashboard settings/billing frontend areas
- UI redesign

## Before vs After

## Before

All three routes were user-only:
- project list/read filters used strict `eq('user_id', user.id)`
- analytics coverage/goals also used strict `user_id`
- no organization context parameter handling

## After

All three routes now:
1. Authenticate user as before via `requireAuthenticatedUser`.
2. Resolve active organization context via helper:
   - optional `organization_id` query param accepted
   - membership validated when provided
   - default personal organization used when omitted
3. Apply org-scoped filter with legacy fallback:
   - `organization_id = resolved_org_id`
   - OR `organization_id IS NULL AND user_id = authenticated_user_id`

This preserves legacy user-owned rows while enabling org-scoped dashboard reads.

## Helper Added

New helper file:
- `lib/api/dashboard-org-context.ts`

Functions:
- `getDashboardOrganizationContext(request, userId)`
  - reads `organization_id` from query string
  - validates active membership / default org via existing Phase 1B helper
  - maps org auth errors to `RouteAccessError`
- `buildOrgScopedLegacyFallbackFilter(organizationId, userId)`
  - builds reusable Supabase `.or(...)` filter string

## Route Changes

## `app/api/dashboard/projects/route.ts`

- Query changed from strict `user_id` filter to org-scoped + legacy fallback filter.
- Existing `limit`, ordering, status exclusion, output loading behavior, and response shape preserved.

## `app/api/dashboard/analytics/route.ts`

- Projects query now org-scoped + legacy fallback.
- `narrative_coverage_snapshots` and `narrative_goals` now org-scoped + legacy fallback.
- Outputs/insights still derive from selected `projectIds`, preserving response shape.

## `app/api/dashboard/upload-history/route.ts`

- Upload history projects query now org-scoped + legacy fallback.
- Existing pagination/count/status filtering and response shape preserved.

## Access and Safety

- Passing another `organization_id` only works for active members.
- Non-member org access is denied via mapped auth error.
- Legacy rows (`organization_id IS NULL`) remain visible only to original owner (`user_id` fallback).

## Response Compatibility

- Response shapes remain unchanged for all three routes:
  - `/dashboard/projects`: `{ projects, outputs }`
  - `/dashboard/analytics`: `{ projects, outputs, coverageSnapshots, coverageGoals, insights }`
  - `/dashboard/upload-history`: `{ items, total, totalPages, page, limit }`

## Routes Intentionally Skipped

- `app/api/dashboard/settings/route.ts`
- `app/api/billing/*`
- `app/api/integrations/*`
- dashboard frontend pages/components (no UI changes)

## Remaining Dashboard/Frontend Assumptions

- No explicit org switcher UI yet; org context currently selected by optional `organization_id` query param or default org.
- Frontend pages are still largely user-centric in behavior assumptions, but API now supports org-scoped reads with legacy fallback.

## Tests Added

- `tests/lib/dashboard-org-context.test.ts`
  - filter string generation
  - requested `organization_id` resolution path
  - auth error mapping behavior

## Validation

Commands run:
- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/route-auth.test.ts tests/lib/transcribe-auth-context.test.ts tests/lib/dashboard-org-context.test.ts`

## Next Recommended Phase

Phase 1D follow-up / 1E:
1. Introduce explicit dashboard org context selection propagation from frontend (without full redesign).
2. Audit other non-dashboard read endpoints for the same org + legacy fallback pattern.
3. Plan billing/integration read-side org context in separately scoped phases.
