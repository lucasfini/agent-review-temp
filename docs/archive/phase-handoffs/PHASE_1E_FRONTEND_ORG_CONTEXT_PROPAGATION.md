# Phase 1E: Minimal Frontend Organization Context Propagation

Date: 2026-05-26

## Scope

Implemented minimal frontend organization context propagation for dashboard reads, without UI redesign or broad route conversion.

In scope:
- Dashboard read calls to:
  - `/api/dashboard/projects`
  - `/api/dashboard/analytics`
  - `/api/dashboard/upload-history`
- Minimal current organization API + frontend helper/hook

Out of scope (unchanged):
- Billing route conversion
- Integration route conversion
- Subscription billing
- Agency clients
- Slack/Granola
- Team invites/org settings management UI
- Dashboard redesign

## Current Organization API Added

New route:
- `app/api/organizations/current/route.ts`

Behavior:
- Authenticated user required.
- Resolves user’s active/default organization using existing Phase 1B helpers.
- Ensures default personal organization exists (through `getActiveOrganizationForUser` fallback behavior).
- Returns minimal payload:
  - `organization`: `id`, `name`, `type`
  - `membership`: `role`, `status`

## Frontend Organization Context Added

New files:
- `lib/organizations/current-organization.ts`
- `lib/hooks/useCurrentOrganization.ts`

What they provide:
- `fetchCurrentOrganization(accessToken?)`
- `withOrganizationId(path, organizationId)` for safe query-param propagation
- `useCurrentOrganization()` hook exposing:
  - `organization`
  - `organizationId`
  - `loading`
  - `refresh()`

Failure behavior:
- If current org fetch fails, hook returns `organizationId = null`.
- Dashboard APIs still work via backend Phase 1D default-org + legacy fallback behavior.

## Dashboard API Propagation Changes

Updated frontend calls to append `organization_id` when available:

- `app/dashboard/projects/page.tsx`
  - `/api/dashboard/projects?limit=100`
- `app/dashboard/hub/page.tsx`
  - `/api/dashboard/projects?includeOutputs=1&limit=100`
- `app/dashboard/analytics/page.tsx`
  - `/api/dashboard/analytics`
- `app/dashboard/upload/page.tsx`
  - `/api/dashboard/upload-history?page=...&limit=...`
- `components/dashboard/nav.tsx`
  - recent projects fetch `/api/dashboard/projects?limit=5`

All existing query params are preserved.

## Realtime Handling Decision

Reviewed user-id-based realtime subscriptions in:
- `app/dashboard/projects/page.tsx`
- `lib/hooks/useActiveProcessingProjects.ts`
- `components/dashboard/nav.tsx`

Decision in Phase 1E:
- Kept realtime filters user-based for now.

Reason:
- Current realtime subscriptions rely on simple `user_id` filters.
- Org-aware + legacy fallback semantics require an OR-style scope:
  - `organization_id = active_org`
  - OR `(organization_id IS NULL AND user_id = current_user)`
- Supabase realtime channel filters in current usage do not support this safely without broader channel/query redesign and duplicate-event handling.

Impact:
- Read APIs are now org-context aware.
- Realtime remains legacy-user scoped in this phase and should be handled in a dedicated follow-up.

## Files Changed

- `app/api/organizations/current/route.ts` (new)
- `lib/organizations/current-organization.ts` (new)
- `lib/hooks/useCurrentOrganization.ts` (new)
- `app/dashboard/projects/page.tsx`
- `app/dashboard/hub/page.tsx`
- `app/dashboard/analytics/page.tsx`
- `app/dashboard/upload/page.tsx`
- `components/dashboard/nav.tsx`
- `tests/lib/current-organization.test.ts` (new)

## Validation

Commands run:
- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/route-auth.test.ts tests/lib/transcribe-auth-context.test.ts tests/lib/dashboard-org-context.test.ts tests/lib/current-organization.test.ts`

## Next Steps

1. Add explicit org selection persistence (query state or client store) without UI redesign.
2. Implement org-aware realtime strategy (dual channels or server-pushed feed) with legacy fallback support.
3. Expand org context propagation to additional read routes in separate scoped phases (billing/integrations remain separate).
