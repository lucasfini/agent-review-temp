# Phase 5E: Client Delivery Workflow

## Summary

Phase 5E adds internal agency delivery packages for manually delivering reviewed drafts to clients.

The workflow packages approved agency drafts, exports them in stable formats, and tracks delivery status/notes. It does not send, publish, email, or post content automatically.

## Schema Added

Migration:

```text
supabase/migrations/20260608130000_phase_5e_agency_delivery_packages.sql
```

Tables:

- `agency_delivery_packages`
- `agency_delivery_package_items`

Package fields include:

- organization
- client
- title
- status
- delivery notes
- metadata
- created by
- delivered timestamp
- created/updated timestamps

Statuses:

- `draft`
- `ready`
- `delivered`
- `archived`

The package item table links packages to agency `content_library_items`.

## RLS And Integrity

Delivery package data is internal-only:

- active internal agency members can read packages
- owner, admin, and `agency_admin` can manage packages
- service role can manage all rows for authorized server routes

Integrity triggers enforce:

- packages belong to `internal_agency` organizations
- package client belongs to the package organization
- package items belong to the same organization and client as the package

## Helpers Added

Added:

```text
lib/agency-delivery-packages.ts
```

The helper covers:

- input normalization
- item id dedupe
- content item scope validation
- package CRUD
- package item replacement
- export generation

## APIs Added

Added:

- `GET /api/agency/delivery/packages`
- `POST /api/agency/delivery/packages`
- `GET /api/agency/delivery/packages/:id`
- `PATCH /api/agency/delivery/packages/:id`
- `POST /api/agency/delivery/packages/:id/export`

API behavior:

- internal agency access only
- client-scoped access validated when a client id is supplied
- demo users blocked from writes
- package writes require current draft-management roles
- item ids must belong to the same internal agency org/client
- export returns content only to the authenticated agency route caller

## UI Added

Added:

```text
/dashboard/agency/delivery
```

Updated agency navigation with:

```text
Client Delivery
```

The page supports:

- creating packages
- selecting a client
- selecting approved drafts for that client
- saving package notes/status
- exporting Markdown
- exporting CSV
- exporting copy-ready text
- marking a package delivered

## Export Formats

Supported:

- Markdown
- CSV
- plain text bundle
- JSON helper support for internal API use

Exports are download/manual-copy oriented. They do not send content externally.

## Intentionally Not Built

- automatic email delivery
- Slack posting
- social publishing
- client portal
- client approval links
- billing changes
- public SaaS delivery surface

## Tests Added Or Updated

- `tests/lib/agency-delivery-packages.test.ts`
- `tests/lib/agency-delivery-packages-route.test.ts`
- `tests/lib/agency-schema.test.ts`

Coverage includes:

- package input normalization
- item/client scope validation
- export output shape
- SaaS org denial
- demo write blocking
- admin-only package writes
- delivered status timestamping
- no automatic external send behavior
- migration RLS/integrity checks

## Validation

Passed:

```bash
npm test -- tests/lib/agency-delivery-packages.test.ts tests/lib/agency-delivery-packages-route.test.ts tests/lib/agency-drafts.test.ts tests/lib/agency-drafts-route.test.ts tests/lib/agency-permissions.test.ts tests/lib/agency-schema.test.ts --runInBand
npx tsc --noEmit
npm run -s lint
git diff --check
```

Focused test result:

- 6 test suites passed
- 43 tests passed

Lint result:

- passed with existing repo warnings
- no new errors were reported from Phase 5E files

## Next Phase

Phase 5F should run a full security and workflow QA pass across Slack OAuth/import, Granola import expansion, source-to-draft generation, and delivery packages before Phase 6 planning.
