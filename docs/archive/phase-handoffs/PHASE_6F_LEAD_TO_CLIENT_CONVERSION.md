# Phase 6F: Lead-to-Client Conversion Workflow

Status: Implemented and reviewed. Not committed.

## Objective

Allow an internal agency admin to deliberately convert a qualified public agency lead into an `agency_clients` record.

## Schema Update

Migration:

```text
supabase/migrations/20260608150000_phase_6f_agency_lead_conversion.sql
```

Fields added to `agency_leads`:

- converted_client_id
- converted_at
- converted_by

Indexes:

- converted_client_id
- converted_at desc

## API

Route:

```text
POST /api/agency/leads/:id/convert
```

Behavior:

- requires active internal agency organization
- requires owner, admin, or agency_admin client-management permission
- blocks demo users
- rejects already converted leads
- rejects spam or archived leads
- creates an agency client in the active internal agency organization
- updates the lead to status `converted`
- stores the converted client link and conversion metadata

## Field Mapping

Lead to agency client mapping:

- company, name, or email -> client name
- website -> website
- name -> primary_contact_name
- email -> primary_contact_email
- package_interest -> package_type
- message, role, timeline, budget, source, email -> notes
- status -> lead

## UI

`/dashboard/agency/leads` includes:

- convert action
- confirmation prompt
- success/error state
- converted status display

## Manual Conversion Rationale

Conversion is intentionally not automatic. Public leads may be spam, unqualified, incomplete, or outside the service scope. A manual admin action keeps the internal agency client model clean.

## Intentionally Not Built

- client login creation
- onboarding emails
- payment
- external CRM updates
- public conversion status tracking

## Validation

Focused tests passed:

```bash
npm test -- tests/lib/agency-leads.test.ts tests/lib/agency-leads-route.test.ts tests/lib/agency-schema.test.ts --runInBand
```
