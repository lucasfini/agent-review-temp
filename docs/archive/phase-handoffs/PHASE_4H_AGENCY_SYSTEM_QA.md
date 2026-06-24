# Phase 4H: Internal Agency System QA + Security Review

## Summary

Phase 4H reviewed the completed internal agency system from Phase 4A through Phase 4G.

The review focused on private agency isolation, route-level authorization, RLS/data-integrity coverage, role boundaries, demo-mode writes, and workflow consistency across:

- agency clients and client profiles
- source imports
- production tasks
- draft review and manual delivery
- Granola manual imports
- Slack readiness tracking

No Phase 5 integration work was started. No Slack OAuth/API integration, Granola API integration, billing change, generation change, public marketing change, or dashboard redesign was added.

## Review Areas

Reviewed:

- `supabase/migrations/20260606120000_phase_4a_internal_agency_schema.sql`
- `lib/authz/agency-permissions.ts`
- `lib/agency-clients.ts`
- `lib/agency-source-imports.ts`
- `lib/agency-production-tasks.ts`
- `lib/agency-drafts.ts`
- `lib/agency-client-integrations.ts`
- `app/api/agency/*`
- `app/dashboard/agency/*`
- `components/dashboard/nav.tsx`
- focused agency Jest tests

Confirmed:

- agency routes require active membership in an `internal_agency` organization
- SaaS/personal org members are denied by agency helpers and routes
- agency client-scoped APIs validate the selected client against the active internal agency organization
- service-role reads/writes happen after route-level authorization
- platform admin email access is not an agency-console bypass
- demo users are blocked from writes
- `agency_member` can operate source imports and production tasks but cannot mutate restricted client/profile/integration/draft/Slack settings
- `owner`, `admin`, and `agency_admin` can perform intended management actions
- no real Slack or Granola external integration code exists in Phase 4

## Bugs Found And Fixed

### 1. Missing Client Profile Workflow

Finding:

Phase 4A created the `agency_client_profiles` schema and RLS, and Phase 4H requires client profile edit verification, but the agency UI/API only supported basic `agency_clients` fields.

Fix:

- Added `lib/agency-client-profiles.ts`.
- Added profile normalization, mapping, loading, and one-profile-per-client upsert helpers.
- Extended `GET /api/agency/clients/:id` to return `profile`.
- Extended `POST /api/agency/clients` to create a profile when a nested `profile` payload is provided.
- Extended `PATCH /api/agency/clients/:id` to update either basic client fields, profile fields, or both.
- Added client profile fields to `/dashboard/agency`.
- Kept profile writes behind existing internal agency client-management access.
- Kept demo users read-only through the existing client route write boundary.

Security result:

Profile writes now require the same `owner`/`admin`/`agency_admin` agency-client-management boundary as client writes. `agency_member` remains read-only for profiles.

### 2. RLS/Data-Integrity Gap For Direct Cross-Reference Writes

Finding:

The agency API routes validated client/campaign/content references before service-role writes, but table-level RLS policies primarily checked the owning `organization_id`. A direct authenticated Supabase write permitted by RLS could attempt to attach a `source_imports` or `production_tasks` row to mismatched client/reference IDs.

Fix:

Added forward migration:

```text
supabase/migrations/20260607120000_phase_4h_agency_integrity_triggers.sql
```

It adds trigger enforcement for:

- `agency_clients` must belong to an `internal_agency` organization
- `source_imports.client_id` must belong to the same internal agency organization
- `source_imports.campaign_id` must belong to the same internal agency organization
- `source_imports.campaign_id` must match the selected client when both sides are client-scoped
- `production_tasks.client_id` must belong to the same internal agency organization
- `production_tasks.campaign_id` must belong to the same internal agency organization
- `production_tasks.content_item_id` must belong to the same internal agency organization
- production task campaign/content references must match the selected client when both sides are client-scoped

Security result:

The database now enforces the critical same-org agency reference invariants below the API layer.

## Tests Added Or Updated

Added:

- `tests/lib/agency-client-profiles.test.ts`

Updated:

- `tests/lib/agency-clients-route.test.ts`
- `tests/lib/agency-schema.test.ts`

Coverage added:

- profile row mapping
- profile camel/snake-case normalization
- profile list-field validation
- profile lookup by `client_id`
- one-profile-per-client upsert behavior
- client detail API returns profile data
- client create can create a profile
- client PATCH can update profile-only payloads
- schema test coverage for the Phase 4H integrity triggers

## Validation

Passed:

```bash
npx tsc --noEmit
npm run -s lint
npm test -- tests/lib/agency-schema.test.ts tests/lib/agency-permissions.test.ts tests/lib/agency-client-profiles.test.ts tests/lib/agency-clients.test.ts tests/lib/agency-clients-route.test.ts tests/lib/agency-source-imports.test.ts tests/lib/agency-source-imports-route.test.ts tests/lib/agency-production-tasks.test.ts tests/lib/agency-production-tasks-route.test.ts tests/lib/agency-drafts.test.ts tests/lib/agency-drafts-route.test.ts tests/lib/agency-client-integrations.test.ts tests/lib/agency-granola-imports-route.test.ts tests/lib/agency-slack-status-route.test.ts tests/lib/current-organization.test.ts tests/lib/current-organization-route.test.ts --runInBand
git diff --check
```

Focused agency/auth tests passed:

- 16 test suites
- 107 tests

Lint result:

- passed with the existing repo warnings
- no new lint errors
- warning count remained at the existing 141 warnings

Route smoke checks:

- `/dashboard/agency` returned auth redirect
- `/dashboard/agency/sources` returned auth redirect
- `/dashboard/agency/production` returned auth redirect
- `/dashboard/agency/drafts` returned auth redirect
- `/dashboard/agency/granola` returned auth redirect
- `/dashboard/agency/slack` returned auth redirect
- unauthenticated `/api/agency/clients` returned `401 Unauthorized`
- unauthenticated `/api/agency/source-imports` returned `401 Unauthorized`
- unauthenticated `/api/agency/slack/status` returned `401 Unauthorized`

Database test note:

`npm run test:database -- --runInBand` could not run because the repository currently has no runnable tests under `tests/database` and Jest ignores that path. The new migration was reviewed statically and covered by focused schema tests.

## Remaining Risks

- Live Supabase RLS behavior was not exercised against a real local database in this phase because no runnable `tests/database` suite exists.
- Happy-path browser testing for authenticated internal agency users still requires a live internal agency organization and seeded agency clients.
- The new Phase 4H trigger migration must be applied in deployment before relying on database-level reference enforcement.
- Agency drafts still use `content_library_items`; review should continue to ensure future SaaS content-library routes do not accidentally introduce agency-specific assumptions.

## Phase 5 Readiness

Phase 5 is safe to start after the Phase 4H changes are reviewed, committed, and the new migration is applied.

The internal agency system now has:

- private agency schema/RLS foundation
- database-level same-org reference enforcement for critical agency tables
- internal agency authorization helpers
- agency client management with client profile editing
- source imports
- production queue
- draft review/manual delivery
- Granola manual import
- Slack readiness foundation
- focused route/helper/schema tests for the major role and isolation boundaries

No blocking Phase 4H findings remain in the reviewed code.
