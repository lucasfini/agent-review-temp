# Phase 7F: Lead Export and Lightweight CRM Handoff

## Summary

Phase 7F adds an internal agency lead export workflow for manual CRM and follow-up operations.

The implementation keeps exports inside the private agency review boundary. It does not send lead data to an external CRM, create webhooks, create clients automatically, or change public lead submission behavior.

## What Changed

- Added `GET /api/agency/leads/export`.
- Added CSV export formatting in `lib/agency-lead-export.ts`.
- Added optional JSON export for internal tooling through `format=json`.
- Extended lead listing filters for export:
  - `status`
  - `qualification_tier`
  - `package_interest`
  - `date_from`
  - `date_to`
- Added an export button to `/dashboard/agency/leads`.
- Added focused export helper and route tests.

## Export Behavior

The default export format is CSV.

CSV fields:

- submitted date
- status
- qualification tier
- qualification score
- follow-up dates
- assigned user id
- contact fields
- package interest
- budget range
- timeline
- source
- message
- review notes

The export route also supports `format=json` for internal-safe manual workflows. JSON export uses the same internal agency authorization boundary.

## Permissions

Exports require internal agency lead review access:

- authenticated user
- active membership in an `internal_agency` organization
- owner, admin, or `agency_admin` role

SaaS customer organizations and unauthenticated public users cannot export agency leads.

The `agency_leads` table remains service-role-only at the database layer. Public lead submissions are created through the public intake API, and internal reads/exports are performed only after route-level authorization.

## CSV Safety

CSV cells are always quoted.

Cells that could be interpreted as spreadsheet formulas are prefixed with an apostrophe when they start with:

- `=`
- `+`
- `-`
- `@`
- tab

This reduces CSV injection risk when exports are opened in spreadsheet software.

## UI

The internal lead review page now includes an `Export CSV` action.

The export preserves the current status and fit-tier filters from the lead review page.

The UI does not add a CRM interface, webhook settings, automation controls, or external sync configuration.

## Intentionally Not Built

- No HubSpot integration.
- No Salesforce integration.
- No Zapier integration.
- No webhook delivery.
- No automatic lead-to-client conversion.
- No changes to the public lead form.
- No changes to SaaS billing, subscriptions, or generation.

## Validation

Ran:

- `npm test -- tests/lib/agency-lead-export.test.ts tests/lib/agency-leads-route.test.ts tests/lib/agency-leads.test.ts --runInBand`

Result:

- 3 test suites passed.
- 22 tests passed.

Full TypeScript, lint, and diff validation were run after the final Phase 7F review.
