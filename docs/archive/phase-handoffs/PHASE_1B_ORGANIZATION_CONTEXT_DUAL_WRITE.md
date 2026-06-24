# Phase 1B: Organization Context + Dual-Write

Date: 2026-05-26

## Scope

This phase adds a minimal organization context layer and dual-write behavior for new records, while preserving existing user-based ownership behavior.

Out of scope for this phase:
- Full route access-model cutover to org-aware authz
- Removing `user_id` ownership checks
- Making `organization_id` non-null everywhere
- Subscription billing implementation
- Agency client features
- Slack/Granola integrations
- UI redesign or product positioning changes

## Helpers Added

### `lib/authz/types.ts`
- Shared organization/authz types:
  - `OrganizationType`, `OrganizationMemberRole`, `OrganizationMemberStatus`
  - `OrganizationRecord`, `OrganizationMemberRecord`, `ActiveOrganizationContext`
- `OrganizationAccessError` with HTTP status support.

### `lib/authz/organization-context.ts`
- `getDefaultOrganizationForUser(supabase, userId)`
- `ensureDefaultOrganizationForUser(supabase, userId)`
  - Idempotently creates one `personal_legacy` org plus owner membership when missing.
- `getActiveOrganizationForUser(supabase, userId, requestedOrganizationId?)`
  - Validates active membership when requested org is provided.
- `resolveOrganizationIdForWrite(userId, requestedOrganizationId?, supabase?)`
- `resolveOrganizationIdFromProjectForWrite(supabase, projectId, fallbackUserId?)`
  - Prefer project org, fallback to user default org.

### `lib/authz/permissions.ts`
- `requireActiveOrganizationForUser(request, options?)`
  - Authenticates user and resolves an active organization context.

## Creation Paths Updated (Dual-Write)

## Projects

- `app/api/upload/init/route.ts`
  - Project insert now writes both `user_id` and `organization_id`.
  - Accepts optional request `organization_id` only after membership validation.
  - Reservation creation includes `organizationId`.

- `app/api/upload/url/route.ts`
  - Resolves org context and passes `organizationId` to reservation + importer.

- `lib/integrations/importer.ts`
  - Project insert writes `organization_id` in both primary and legacy fallback inserts.
  - Returns resolved `organizationId` to callers.

- `lib/starter-project.ts`
  - Starter project copy writes `organization_id`.
  - Child copy utility writes `organization_id` for rows that support it.

## Outputs

- `app/api/generate-content/route.ts`
  - Output inserts now include `organization_id`.
  - Organization derived from `projects.organization_id` with fallback to user default org.

- `app/api/strict-json-content/route.ts`
  - Output inserts now include `organization_id`.
  - Uses authenticated user + authorized project context; no body `user_id` trust.

## Project Generation Jobs

- `app/api/projects/[id]/generate/route.ts`
  - New job inserts include `organization_id`.
  - Derived from project org, fallback to default user org.

## Usage and Billing Writes

- `lib/billing/credit.ts`
  - `logUsageEvent` inserts `organization_id`.
    - Prefers project org when `projectId` is present.
    - Falls back to user default org.
  - `createReservation` inserts `organization_id`.
    - Uses explicit `organizationId` when authorized, otherwise project org, then user default org.
  - `UsageEvent` and `BillingReservation` interfaces now include `organizationId`.

## Integrations

- `app/api/integrations/_utils.ts`
  - `upsertConnection` now dual-writes `organization_id` in `integration_connections`.

- `app/api/integrations/zoom/import/route.ts`
- `app/api/integrations/microsoft/import/route.ts`
- `app/api/integrations/youtube/import/route.ts`
  - Reservations and import-created project paths resolve org context.
  - `integration_imports` inserts now include `organization_id`.

## Tables Now Dual-Written (for new rows where these paths are used)

- `projects`
- `outputs`
- `project_generation_jobs`
- `usage_events`
- `billing_reservations`
- `integration_connections`
- `integration_imports`
- `narrative_coverage_snapshots` (starter-project copy path)

## Intentionally Not Converted Yet

- Broad read/access checks across all routes are still user-ownership based.
- Existing `user_id` policies and route checks remain active.
- No org-switching UI or team-management flows were added.
- No broad RLS rewrite was attempted in this phase.

## Remaining `user_id` Assumptions

- Most route authorization is still `project.user_id === auth.user.id`.
- Most list/filter routes still query by `user_id`.
- Background flows still depend on user-owned project checks.

These are expected and deferred to Phase 1C cutover planning.

## Remaining Nullable `organization_id` Risks

- Legacy rows from pre-Phase 1A/1B may still have null `organization_id` depending on backfill coverage and historical write paths.
- Any write path not touched in this phase may still insert null `organization_id`.
- Some fallback/compat branches remain defensive for older schema conditions.

## Verification Commands and Results

- `npx tsc --noEmit` -> passed
- `npm run -s lint` -> passed with existing warnings only (no new lint errors)
- `npm run -s test -- --runInBand tests/billing/credit-operations.test.ts tests/billing/usage-tracking.test.ts tests/api/project-generate.test.js tests/api/generate-content.test.js` -> passed executed suites (billing suites ran and passed)

## Next Steps for Phase 1C

1. Expand org-aware authorization checks route-by-route (without breaking current user behavior during transition).
2. Add explicit organization context selection semantics for API clients and UI.
3. Migrate key reads/lists to org membership-aware queries.
4. Add org-aware RLS policies for transitional dual-read support.
5. Audit remaining write paths and make `organization_id` coverage comprehensive before any NOT NULL enforcement.
