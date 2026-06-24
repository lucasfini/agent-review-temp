# Phase 4D: Agency Production Queue

## Summary

Phase 4D adds a private internal agency production queue.

The implementation uses the Phase 4A `production_tasks` table and keeps task data scoped to an `internal_agency` organization. It gives agency operators a lightweight place to create, filter, and update production work without changing the public SaaS product.

## Implemented Behavior

- Added production task helpers in `lib/agency-production-tasks.ts`.
- Added `GET /api/agency/production-tasks`.
- Added `POST /api/agency/production-tasks`.
- Added `GET /api/agency/production-tasks/:id`.
- Added `PATCH /api/agency/production-tasks/:id`.
- Added `/dashboard/agency/production` for the private production queue.
- Added a private Agency nav item for Production Queue.
- Supports task filtering by client and status.
- Supports creating and updating title, description, status, priority, due date, assigned user ID, and client.
- Validates `client_id` against the active internal agency organization when present.
- Keeps demo users read-only.

## Private/Internal Boundary

Production tasks remain internal because:

- production task APIs use `requireAgencyAccess`
- client-scoped operations use `requireAgencyClientAccess`
- task rows are written with the resolved internal agency `organization_id`
- SaaS customer organizations are denied by the existing agency authorization helpers
- the Production Queue nav item is only shown when an internal agency organization can be resolved

The API mirrors the Phase 4A production task RLS operator role boundary: `owner`, `admin`, `agency_admin`, and `agency_member` can create/update production tasks. Regular `member` can access the agency console but cannot write production tasks.

## Intentionally Not Built

This phase does not include:

- draft review or approval workflows
- delivery workflows
- Slack API integration
- Granola API integration
- automated task generation from source imports
- billing changes
- generation changes
- SaaS dashboard changes

The queue is intentionally a manual internal task surface.

## Validation Notes

The implementation should be validated with:

- TypeScript
- lint
- production task helper tests
- production task route tests
- agency permission tests
- agency client route tests
- browser or HTTP smoke for `/dashboard/agency/production`

The happy-path UI needs a live internal agency organization and at least one agency client to exercise client-linked tasks end to end.

## Next Steps For Phase 4E

Phase 4E can build draft review and delivery workflows on top of:

- `content_library_items`
- `production_tasks`
- `agency_clients`
- `/dashboard/agency/production`

Draft review should stay private to the internal agency console and should not add Slack, Granola, or public SaaS dashboard behavior unless the phase explicitly requires it.
