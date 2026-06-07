# Phase 4E: Draft Review and Delivery

## Summary

Phase 4E adds a private internal agency draft review and basic delivery workflow.

The implementation uses `content_library_items` for agency drafts and keeps draft data scoped to an `internal_agency` organization. It does not change the public SaaS content library routes.

## Implemented Behavior

- Added agency draft helpers in `lib/agency-drafts.ts`.
- Added `GET /api/agency/drafts`.
- Added `POST /api/agency/drafts`.
- Added `GET /api/agency/drafts/:id`.
- Added `PATCH /api/agency/drafts/:id`.
- Added `/dashboard/agency/drafts` for internal draft review.
- Added a private Agency nav item for Draft Review.
- Supports draft filtering by client and review status.
- Supports creating and updating title, client, content type, channel, status, body, review summary, tags, and delivery notes.
- Supports marking a draft delivered by setting content status to `published` and storing manual delivery metadata.
- Supports manual copy, Markdown export, and CSV export from the browser.
- Validates `client_id` against the active internal agency organization when present.
- Validates campaign and brand voice references against the same internal agency organization when present.
- Keeps demo users read-only.

## Private/Internal Boundary

Agency drafts remain internal because:

- agency draft APIs use `requireAgencyAccess`
- client-scoped operations use `requireAgencyClientAccess`
- draft rows are written with the resolved internal agency `organization_id`
- SaaS customer organizations are denied by the existing agency authorization helpers
- the Draft Review nav item is only shown when an internal agency organization can be resolved

Draft writes are restricted to `owner`, `admin`, and `agency_admin`, matching the existing content library RLS boundary. Regular `agency_member` users can view the private agency console and drafts but cannot mutate content library draft records through these APIs.

## Delivery Model

This phase implements manual delivery only:

- copy Markdown to clipboard
- download Markdown
- download CSV
- mark a content item delivered internally

The delivered state maps to existing content library status `published`. The UI labels `approved` as ready to deliver and `published` as delivered.

## Intentionally Not Built

This phase does not include:

- Slack delivery
- Granola import
- Google Docs export
- email sending
- client-facing approval portals
- automated QA scoring
- billing changes
- generation changes
- public SaaS dashboard changes

## Validation Notes

The implementation should be validated with:

- TypeScript
- lint
- agency draft helper tests
- agency draft route tests
- agency permission tests
- agency client route tests
- browser or HTTP smoke for `/dashboard/agency/drafts`

The happy-path UI needs a live internal agency organization and at least one agency client to exercise client-linked draft review end to end.

## Next Steps For Phase 4F

Phase 4F can add the Granola manual import workflow on top of:

- `source_imports`
- `client_integrations`
- `agency_clients`
- `/dashboard/agency/sources`
- `/dashboard/agency/drafts`

Granola work should remain manual import only unless the phase explicitly adds OAuth or external API syncing.
