# Phase 7G: Public Agency Funnel QA and Conversion Review

## Summary

Phase 7G reviewed and hardened the completed Phase 7 public agency funnel.

The review covered:

- public agency pages and CTAs
- public intake submission
- spam and rate limiting
- internal notification email
- public confirmation email
- first-party funnel analytics
- lead qualification and routing
- lead export
- internal lead review and conversion boundaries
- SaaS, billing, Slack, and Granola isolation

## Bug Found and Fixed

### Public agency leads were private but not organization-scoped

The `agency_leads` table was service-role-only and not publicly readable, but lead rows did not have an `organization_id`.

That meant internal lead review and export were protected by internal agency authorization, but the records themselves were global inside the private lead table. In a future setup with more than one internal agency organization, an authorized admin from one internal agency organization could potentially review/export leads that should belong to another internal agency organization.

Fixes made:

- Added `agency_leads.organization_id`.
- Added an index on `agency_leads.organization_id`.
- Added a database trigger to ensure any non-null lead organization references an `internal_agency` organization.
- Backfilled existing leads when there is exactly one internal agency organization.
- Added `AGENCY_LEAD_ORGANIZATION_ID` as an optional env var for multi-internal-agency deployments.
- Updated public lead creation to resolve the internal agency organization server-side.
- Updated internal lead list/detail/update/export helpers to scope reads and writes to the active internal agency organization.
- Kept public form submissions from trusting any public-supplied organization id.

Migration:

```text
supabase/migrations/20260608180000_phase_7g_agency_lead_org_scope.sql
```

## QA Results

### Public Funnel

- Public agency routes remain public content routes.
- Public nav and CTAs point to `/agency` routes, not `/dashboard/agency`.
- The intake form still posts only to `/api/agency-leads`.
- The thank-you page contains public next steps and no internal links.
- Invalid email, long fields, honeypot submissions, and deterministic spam signals fail safely.
- Public lead submission still does not auto-create agency clients.

### Emails

- Valid stored leads trigger internal notification email attempts.
- Valid stored leads trigger public confirmation email attempts.
- Missing Resend configuration or delivery failure does not delete or block stored leads.
- Confirmation email does not include lead IDs, dashboard links, internal notes, or portal/account language.
- Internal notification includes a bounded lead summary and a dashboard review link only for internal recipients.

### Analytics

- Only allowed first-party agency funnel events are accepted.
- Invalid event names are rejected.
- Public users cannot read analytics records.
- Analytics metadata strips unsupported and PII-like fields.
- Lead submission creates an `agency_intake_submitted` event linked server-side to the stored lead id.
- No third-party analytics tracker was added.

### Lead Management

- Internal lead list requires active internal agency admin access.
- Lead detail, update, and export now scope to the active internal agency organization.
- Demo users remain blocked from lead writes and conversion.
- Qualification score and tier remain deterministic.
- Follow-up fields and review notes are internal-only.
- Conversion still requires explicit internal agency admin action.
- Exports are internal-only and use CSV injection protection.

### Isolation

- No SaaS dashboard behavior was intentionally changed.
- No SaaS billing or subscription behavior was changed.
- No Stripe checkout or webhook behavior was changed.
- No Slack or Granola workflow behavior was changed.
- No external CRM sync, webhook, payment flow, or client portal was added.

## Tests Added or Updated

Updated:

- `tests/lib/agency-leads.test.ts`
- `tests/lib/agency-leads-route.test.ts`
- `tests/lib/agency-schema.test.ts`
- lead fixture tests that use `AgencyLead`

Coverage added for:

- public lead organization resolver
- configured non-agency org rejection
- multiple internal agency orgs requiring explicit `AGENCY_LEAD_ORGANIZATION_ID`
- public lead creation failing safely when no safe owning org can be resolved
- lead detail scoped to active agency organization
- list/export/update scoping to active agency organization
- migration shape for lead organization scope and internal-agency trigger

## Validation

Ran:

```bash
npm test -- tests/lib/agency-lead-rate-limit.test.ts tests/lib/agency-lead-notifications.test.ts tests/lib/agency-funnel-events.test.ts tests/lib/agency-funnel-events-route.test.ts tests/lib/agency-lead-qualification.test.ts tests/lib/agency-leads.test.ts tests/lib/agency-leads-route.test.ts tests/lib/agency-lead-export.test.ts tests/lib/public-agency-content.test.ts tests/lib/agency-thank-you-page.test.tsx tests/lib/agency-permissions.test.ts tests/lib/agency-schema.test.ts --runInBand
npx tsc --noEmit
npm run -s lint
git diff --check
npm run dev
curl -I http://127.0.0.1:3000/agency
curl -I http://127.0.0.1:3000/agency/contact
curl -I http://127.0.0.1:3000/agency/thank-you
curl -I http://127.0.0.1:3000/api/agency-funnel-events
```

Results:

- 12 focused Phase 7 test suites passed.
- 82 focused Phase 7 tests passed.
- TypeScript passed.
- Lint passed with the existing warning-only baseline.
- Diff whitespace check passed.
- Local route smoke passed:
  - `/agency` returned `200`.
  - `/agency/contact` returned `200`.
  - `/agency/thank-you` returned `200`.
  - `/api/agency-funnel-events` returned `405` for read access.

## Remaining Risks

- Production should configure `AGENCY_LEAD_ORGANIZATION_ID` if more than one internal agency organization exists.
- Production should configure durable Upstash/Redis rate limiting before broader traffic.
- Email delivery depends on valid Resend configuration and verified sender settings.
- Local validation inspected SQL shape and route/helper behavior; it did not execute live Supabase RLS policies against a deployed database.
- First-party analytics are capture-only in Phase 7; no internal analytics dashboard was added.

## Recommended Phase 8 Options

Recommended next focus:

1. Production launch hardening for public agency traffic.
2. Public agency conversion analytics/reporting.
3. Client portal, only after deciding what a client should actually see.
4. Advanced agency automation, after the manual funnel proves useful.

The safest immediate Phase 8 is production launch hardening: env validation, deployed migration verification, email deliverability, durable rate limiting, monitoring/logging, and browser QA against the real deployment target.
