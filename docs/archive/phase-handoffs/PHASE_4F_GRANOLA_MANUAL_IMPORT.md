# Phase 4F: Granola Manual Import Workflow

## Summary

Phase 4F adds a private internal agency workflow for manually importing Granola notes.

The implementation saves pasted notes into `source_imports` with provider `granola` and adds passive `client_integrations` tracking for the selected agency client. It does not connect to Granola APIs.

## Implemented Behavior

- Added client integration helpers in `lib/agency-client-integrations.ts`.
- Added `GET /api/agency/granola/imports`.
- Added `POST /api/agency/granola/imports`.
- Added `/dashboard/agency/granola` for manual Granola note import.
- Added a private Agency nav item for Granola Imports.
- Requires a selected agency client before importing Granola notes.
- Validates the selected client belongs to the active internal agency organization.
- Saves imports as `source_imports` with provider `granola`.
- Stores manual import metadata such as meeting date, participants, and import mode.
- Shows recent Granola imports and passive client integration status.
- Updates passive Granola integration tracking for `owner`, `admin`, and `agency_admin` only.
- Allows `agency_member` users to import notes without mutating `client_integrations`.
- Keeps demo users read-only.

## Private/Internal Boundary

Granola imports remain internal because:

- Granola import APIs use `requireAgencyAccess` and `requireAgencyClientAccess`
- rows are written with the resolved internal agency `organization_id`
- SaaS customer organizations are denied by the existing agency authorization helpers
- the Granola Imports nav item is only shown when an internal agency organization can be resolved

The source import write boundary follows Phase 4C: `owner`, `admin`, `agency_admin`, and `agency_member` can create imports. Passive client integration tracking stays aligned with the stricter Phase 4A client integration RLS boundary and is only mutated by `owner`, `admin`, and `agency_admin`.

## Manual-Only Granola Model

This phase does not establish a real Granola connection. The workflow is:

- select an agency client
- paste Granola notes
- optionally add meeting date, participants, and summary
- save as internal agency source material

`client_integrations.status = connected` means the manual import workflow is active for that client, not that OAuth or API sync exists.

## Intentionally Not Built

This phase does not include:

- Granola OAuth
- Granola API calls
- automated sync
- file upload parsing
- Slack integration
- generated-content changes
- billing changes
- public SaaS dashboard changes

## Validation Notes

The implementation should be validated with:

- TypeScript
- lint
- client integration helper tests
- Granola import route tests
- source import route tests
- agency permission tests
- browser or HTTP smoke for `/dashboard/agency/granola`

The happy-path UI needs a live internal agency organization and at least one agency client.

## Next Steps For Phase 4G

Phase 4G can add Slack integration foundation on top of:

- `client_integrations`
- `source_imports`
- `agency_clients`
- `/dashboard/agency/granola`
- `/dashboard/agency/sources`

Slack work should remain foundation-only unless the next phase explicitly adds OAuth or external Slack API calls.
