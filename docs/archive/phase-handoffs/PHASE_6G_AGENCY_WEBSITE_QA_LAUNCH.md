# Phase 6G: Public Agency Website QA and Launch Checklist

Status: Implemented and reviewed. Not committed.

## Objective

Run a QA and security pass across the Phase 6 public agency website, lead intake, internal lead review, and lead-to-client conversion workflow.

## QA Areas

Reviewed:

- public agency routes
- service/package copy
- public intake form
- public lead API
- private agency lead review API
- internal lead review page
- lead-to-client conversion route
- schema/RLS migrations
- dashboard nav exposure
- SaaS isolation

## Bugs Found and Fixed

During implementation, the temporary Phase 6B contact placeholder was replaced with the real Phase 6E intake form so `/agency/contact` no longer references future backend work.

The lead data model was kept service-role only instead of adding direct authenticated read/update RLS, which reduces accidental public or SaaS-org data exposure.

## Security Results

- Public users can submit leads but cannot read leads.
- Public API returns only id/status on success.
- Direct table access is revoked from anon and authenticated roles.
- Internal lead review requires internal agency organization access.
- Lead review/update/convert requires owner, admin, or agency_admin.
- Demo users are blocked from lead writes and conversion.
- Conversion creates an internal agency client only after explicit admin action.
- No client portal, SaaS user, billing, or subscription access is created from public leads.

## Public Page Checklist

- `/agency` renders service positioning.
- `/agency/services` renders service offers.
- `/agency/process` renders source-to-delivery process.
- `/agency/packages` renders package and FAQ content.
- `/agency/contact` renders the intake form.
- `/agency/thank-you` renders the post-submit success page.
- Public CTAs route to agency intake or related public agency pages.
- Public copy avoids internal dashboard, table, token, and provider implementation details.

## Lead Intake Checklist

- valid lead submissions are stored through `/api/agency-leads`
- invalid email is rejected
- long fields are rejected
- honeypot submissions are rejected
- repeated submissions are rate-limited
- no lead automatically creates an agency client

## Internal Review Checklist

- SaaS org users are denied by internal agency authorization
- internal agency admin can list/update leads
- demo users cannot mutate
- conversion is blocked for already converted, spam, or archived leads
- created clients are scoped to the active internal agency organization

## Isolation Checklist

- SaaS dashboard behavior was not intentionally changed
- billing behavior was not changed
- SaaS generation behavior was not changed
- Slack and Granola behavior was not changed
- public pages do not expose `/dashboard/agency` routes

## Remaining Risks

- Rate limiting is in-memory for this phase. A production launch should move lead intake to durable Redis/edge rate limiting.
- No email notification is sent for new agency leads yet.
- No CRM integration is included.
- No public analytics events were added for funnel measurement.
- No live Supabase RLS policy execution was run in this local validation pass; migration tests inspect SQL shape.

## Launch Checklist

- configure production database migrations
- confirm public agency domain or route mapping
- configure durable rate limiting
- decide whether lead notification email is needed
- QA mobile layout in browser before launch
- verify robots/sitemap strategy includes or excludes agency pages intentionally
- run production build before deployment

## Recommended Next Phase

Phase 7 should focus on production launch hardening or client portal planning. The public lead funnel now exists, but durable rate limiting, notifications, and launch analytics are the highest-priority hardening items before broader public traffic.

## Validation

Focused tests passed:

```bash
npm test -- tests/lib/public-agency-content.test.ts tests/lib/agency-leads.test.ts tests/lib/agency-leads-route.test.ts tests/lib/agency-schema.test.ts --runInBand
```

Full TypeScript, lint, route smoke, and whitespace validation should be recorded in the final Phase 6 report for this Codex run.
