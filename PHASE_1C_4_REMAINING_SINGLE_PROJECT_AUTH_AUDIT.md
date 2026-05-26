# Phase 1C-4: Remaining Single-Project Authorization Audit

Date: 2026-05-26

## Scope

This phase audited remaining single-project authorization paths and converted safe ad-hoc ownership checks to central helper-based org-aware auth.

Out of scope kept unchanged:
- Dashboard/list routes
- Billing-wide routes
- Integration-wide routes
- Subscription/agency/Slack/Granola/UI work
- Broad RLS/schema changes

## Search Patterns Used

Audit commands/patterns used against `app/api` included:
- `project.user_id === user.id`
- `project.user_id !== user.id`
- `projectOwner.user_id !== callerUserId`
- `callerUserId` in single-project routes
- `.eq('user_id', user.id)` in route-level handlers
- `requireProjectOwner(` usage inventory across project routes

## Routes Converted In This Phase

### 1) `app/api/generate-content/route.ts`

Change:
- Replaced ad-hoc non-maintenance ownership check (`callerUserId` vs project `user_id`) with `requireProjectOwner` on user-triggered path.
- Kept internal/maintenance branch behavior and direct project lookup for worker context.

Result:
- User-triggered access is now org-aware via central helper.
- Internal behavior remains protected and unchanged.

### 2) `app/api/projects/[id]/generate/process/route.ts`

Change:
- Replaced ad-hoc non-maintenance ownership check (`projectOwner.user_id !== callerUserId`) with `requireProjectOwner`.
- Kept maintenance/internal branch behavior unchanged.

Result:
- User-triggered access is org-aware.
- Internal/background processing path remains available under internal auth.

## Routes Inspected But Skipped

### Skipped by scope (not single-project cutover targets)
- `app/api/dashboard/projects/route.ts`
- `app/api/dashboard/analytics/route.ts`
- `app/api/dashboard/upload-history/route.ts`
- `app/dashboard/*`
- `components/dashboard/*`
- `app/api/billing/*` (broad billing)
- `lib/billing/*` (broad billing)
- `app/api/integrations/*` (broad integration)
- `lib/integrations/*` (broad integration)

### Intentionally skipped route categories
- Admin-only routes (e.g., `app/api/admin/projects/[id]/route.ts`)
- Admin debug route (e.g., `app/api/debug/speaker-data/[id]/route.ts`)

Reason:
- These routes are either outside product user-project auth scope or require separate admin/internal policy decisions.

## Remaining Ad-Hoc `user_id` Checks (By Category)

After this phase, remaining `user_id` checks are primarily:
- User-owned list/dashboard/billing/integration queries (explicitly deferred)
- Internal/admin operational paths (intentional)

No additional safe single-project user-project ownership checks were found outside deferred categories.

## Compatibility and Access Behavior

For converted routes:
- Legacy owner access remains supported.
- Active org members now work when `project.organization_id` is set.
- Non-members are denied.
- Legacy null-organization projects remain owner-only via helper behavior.

## Tests Added

- `tests/lib/project-generate-process-auth.test.ts`
  - Verifies converted route returns helper-driven denial (`403`) when non-member is denied.

Also kept passing:
- `tests/lib/route-auth.test.ts`
- `tests/lib/transcribe-auth-context.test.ts`

## Risk Assessment

Low-moderate risk:
- Auth surface changed only at route entry ownership checks.
- No provider/billing pipeline logic changed intentionally.
- Internal/maintenance branches preserved.

Residual risks:
- Full integration coverage for heavy background routes remains limited by mock-heavy test strategy.
- Deferred dashboard/billing/integration-wide cutover still contains user-centric assumptions by design.

## Next Steps

1. Phase 1D / 1C-5: Dashboard/list org context introduction (read-side context and scoped org selection).
2. Follow-on audit for non-route library entry points that still assume strict `user_id` ownership in mixed internal/user flows.
3. Add deeper integration-style auth tests for background processing routes where practical.
