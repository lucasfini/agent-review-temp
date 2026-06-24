# Phase 6D: Agency Lead Intake Schema and API

Status: Implemented and reviewed. Not committed.

## Objective

Add the backend foundation for public agency lead intake without automatically creating agency clients.

## Schema

Migration:

```text
supabase/migrations/20260608140000_phase_6d_agency_leads.sql
```

Table added:

```text
agency_leads
```

Fields include:

- contact fields: name, email, company, website, role
- qualification fields: package_interest, budget_range, timeline, message
- source tracking: source, metadata_json
- workflow state: status
- timestamps: created_at, updated_at

Allowed statuses:

- new
- reviewed
- qualified
- converted
- archived
- spam

Indexes:

- lower(email)
- status
- created_at desc

## RLS and Security

`agency_leads` has RLS enabled.

No direct anonymous or authenticated table access is granted:

```sql
REVOKE ALL ON public.agency_leads FROM anon;
REVOKE ALL ON public.agency_leads FROM authenticated;
```

Only service role can manage rows. Public insert and internal review are both handled through server routes.

## Public API

Route:

```text
POST /api/agency-leads
```

Behavior:

- validates email
- validates length limits
- rejects honeypot submissions
- rate limits by IP and email using a bounded in-memory fallback
- stores sanitized inquiry
- returns only safe lead id/status
- does not create an `agency_clients` row

## Internal API

Routes:

```text
GET /api/agency/leads
GET /api/agency/leads/:id
PATCH /api/agency/leads/:id
```

Behavior:

- requires active internal agency organization access
- requires owner, admin, or agency_admin client-management permission
- blocks demo-user writes
- allows status updates and metadata/admin-note updates

## Helper Added

```text
lib/agency-leads.ts
```

Includes:

- validation
- row mapping
- rate limiting
- lead list/read/update helpers
- conversion mapping used by Phase 6F

## Why Leads Do Not Auto-Create Clients

Public inquiries are unqualified. Creating agency clients automatically would pollute internal client records, risk spam persistence, and blur the boundary between public inquiry and private agency operations.

## Remaining Risk

The public route uses an in-memory rate limiter so local/test environments are not fail-closed when Upstash is unavailable. Production should use durable edge or Redis-backed rate limiting before larger traffic.

## Validation

Focused tests passed:

```bash
npm test -- tests/lib/agency-leads.test.ts tests/lib/agency-leads-route.test.ts tests/lib/agency-schema.test.ts --runInBand
```
