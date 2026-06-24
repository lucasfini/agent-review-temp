# Phase 4C: Client Source Imports

## Summary

Phase 4C adds the first private internal agency source capture workflow.

The implementation uses the Phase 4A `source_imports` table and keeps imported source material scoped to an `internal_agency` organization.

## Implemented Behavior

- Added source import helpers in `lib/agency-source-imports.ts`.
- Added `GET /api/agency/source-imports`.
- Added `POST /api/agency/source-imports`.
- Added `GET /api/agency/source-imports/:id`.
- Added `PATCH /api/agency/source-imports/:id`.
- Added `/dashboard/agency/sources` for manual source capture.
- Added a private Agency nav item for Source Imports.
- Supports manual notes, URLs, documents, and transcript excerpts from the UI.
- Supports client filtering and client-scoped import creation.
- Validates `client_id` against the active internal agency organization when present.
- Keeps demo users read-only.

## Private/Internal Boundary

Source imports remain internal because:

- source import APIs use `requireAgencyAccess`
- client-scoped operations use `requireAgencyClientAccess`
- source import rows are written with the resolved internal agency `organization_id`
- SaaS customer organizations are denied by the existing agency authorization helpers
- the Source Imports nav item is only shown when an internal agency organization can be resolved

The API mirrors the Phase 4A source import RLS operator role boundary: `owner`, `admin`, `agency_admin`, and `agency_member` can create/update imports. Regular `member` can access the agency console but cannot write source imports.

## Intentionally Not Built

This phase does not include:

- Slack API integration
- Granola API integration
- audio upload imports
- automated source fetching or scraping
- production queue workflows
- draft review or delivery
- billing changes
- generation changes
- SaaS dashboard redesign

Slack and Granola remain passive provider labels in the schema only.

## Validation Notes

The implementation should be validated with:

- TypeScript
- lint
- source import route tests
- agency permission tests
- agency client route tests
- browser or HTTP smoke for `/dashboard/agency/sources`

The happy-path UI needs a live internal agency organization and at least one agency client to exercise client-linked imports end to end.

## Next Steps For Phase 4D

Phase 4D can build the agency production queue on top of:

- `production_tasks`
- `agency_clients`
- `source_imports`
- `/dashboard/agency`
- `/dashboard/agency/sources`

Production queue work should still avoid Slack, Granola, and draft delivery unless that phase explicitly calls for them.
