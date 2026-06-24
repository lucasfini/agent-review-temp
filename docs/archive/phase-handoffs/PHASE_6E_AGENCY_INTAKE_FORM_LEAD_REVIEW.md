# Phase 6E: Public Agency Intake Form and Lead Review

Status: Implemented and reviewed. Not committed.

## Objective

Connect the public agency intake page to the lead backend and add a minimal private lead review surface.

## Public Pages and Components

Updated:

- `/agency/contact`
- `components/site/AgencySite.tsx`

Added:

- `components/site/AgencyLeadForm.tsx`
- `/agency/thank-you`

## Public Form Fields

The form captures:

- name
- email
- company
- website
- role
- package interest
- timeline
- budget range
- message
- hidden source
- honeypot referralCode

## Public UX Behavior

- email is required
- loading state is shown during submit
- user-safe error state is shown if the API rejects the request
- success redirects to `/agency/thank-you`
- copy clarifies that a submission does not create a SaaS account, client portal login, or automatic agency client

## Internal Lead Review UI

Route added:

```text
/dashboard/agency/leads
```

Capabilities:

- list public agency leads
- filter by status
- view lead details
- update status
- see converted state
- convert eligible leads in Phase 6F workflow

Navigation:

- `components/dashboard/nav.tsx` adds `Agency Leads` under the private internal agency nav group.

## Permissions

The UI loads through protected agency APIs:

- unauthenticated users are denied by the API
- SaaS organizations are denied by `requireAgencyAccess`
- internal agency owner/admin/agency_admin can review leads
- demo users can view but cannot mutate

## Intentionally Not Built

- external CRM sync
- client portal
- payment
- automatic lead-to-client creation
- public read access to leads

## Validation

Focused route/helper tests passed:

```bash
npm test -- tests/lib/agency-leads.test.ts tests/lib/agency-leads-route.test.ts --runInBand
```

Full page validation is tracked in Phase 6G.
