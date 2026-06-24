# Phase 4B: Agency Client Management UI

## Summary

Phase 4B adds the first private internal agency UI surface: agency client management.

The page uses the Phase 4A agency client APIs and keeps the agency workflow separate from the public SaaS customer experience.

## Implemented Behavior

- Added `/dashboard/agency` as a private internal agency client management page.
- Added an Agency nav section only when the active organization has `type = internal_agency`.
- Added type-scoped current organization lookup so agency members can reach the agency UI even when their default workspace is personal/SaaS.
- Added a non-agency access state for SaaS and personal legacy organizations.
- Added client list, selection, summary counts, and editable client detail form.
- Supports creating agency clients through `POST /api/agency/clients`.
- Supports updating agency clients through `PATCH /api/agency/clients/:id`.
- Uses API-provided `membership.canManageAgencyClient` to decide write access.
- Keeps internal agency non-admin members read-only.
- Keeps demo users read-only.

## Private/Internal Boundary

The agency client UI is private because:

- the nav item is hidden unless the user can resolve an active `internal_agency` organization
- `/dashboard/agency` shows an access-denied state outside internal agency orgs
- `/dashboard/agency` resolves an active `internal_agency` organization through `/api/organizations/current?organization_type=internal_agency`
- all reads and writes go through `/api/agency/clients`
- the API and RLS layer from Phase 4A still enforce internal agency organization access

The page does not create SaaS user accounts for agency clients and does not expose client records to SaaS customer workspaces.

## Intentionally Not Built

This phase does not include:

- Slack integration
- Granola integration
- source import workflow UI
- production queue workflow UI
- draft review or delivery UI
- public agency marketing pages
- billing changes
- generation changes
- SaaS dashboard redesign

## Validation Notes

The implementation should be validated with:

- TypeScript
- lint
- existing agency API/helper tests
- existing org/auth tests
- browser or HTTP smoke for `/dashboard/agency`

The page depends on a live internal agency organization to exercise the happy-path UI with real data. In non-agency workspaces it should show the restricted state.

## Next Steps For Phase 4C

Phase 4C can build client source imports on top of:

- `source_imports`
- `agency_clients`
- `/dashboard/agency`
- `/api/agency/clients`
- existing campaign/content-library foundations

Source import work should still avoid Slack and Granola API integrations unless that specific phase calls for them.
