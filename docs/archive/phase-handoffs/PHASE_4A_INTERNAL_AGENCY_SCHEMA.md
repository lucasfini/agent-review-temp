# Phase 4A: Internal Agency Schema Foundation

## Summary

Phase 4A adds the private data and backend foundation for the internal agency console.

This phase does not add agency UI, Slack integration, Granola integration, public agency pages, SaaS dashboard changes, billing changes, or generation behavior changes.

## Tables Added

The forward migration is:

```text
supabase/migrations/20260606120000_phase_4a_internal_agency_schema.sql
```

It adds:

- `agency_clients`
- `agency_client_profiles`
- `client_integrations`
- `source_imports`
- `production_tasks`

The migration also adds:

- status/provider check constraints for the new agency tables
- JSON shape constraints for array/object JSONB columns
- indexes for organization, client, status, campaign, content item, and queue lookups
- updated-at triggers for mutable agency tables
- a unique one-profile-per-client index
- a unique client/provider integration index
- opportunistic `client_id` foreign keys from existing `brand_voices`, `campaigns`, and `content_library_items` to `agency_clients`

## RLS Model

Agency tables are private to organizations with `organizations.type = 'internal_agency'`.

Read policies:

- require an active membership in the owning internal agency organization
- do not allow normal SaaS or personal legacy organizations to read agency rows

Mutation policies:

- client, profile, and integration management require internal agency `owner`, `admin`, or `agency_admin`
- source imports and production task inserts/updates allow internal agency operators, including `agency_member`
- production task delete remains limited to internal agency `owner`, `admin`, or `agency_admin`
- service role can manage all agency rows for trusted server routes

The API layer also enforces internal agency organization access before reading or writing client records.

## Authorization Helpers

Added:

```text
lib/authz/agency-permissions.ts
```

Functions:

- `isInternalAgencyOrganization(...)`
- `canAccessAgencyConsole(role, organizationType)`
- `canManageAgencyClient(role, organizationType)`
- `requireAgencyAccess(...)`
- `requireAgencyClientAccess(...)`

Rules:

- agency console access requires active membership in an `internal_agency` organization
- SaaS customer org members are denied
- client access is scoped by both `organization_id` and `client_id`
- client management writes require internal agency admin-level access

The existing email-based platform admin model is not used as an agency bypass in this phase. Platform admins should be added explicitly later if the internal console needs a separate super-admin path.

## APIs Added

Minimal internal-only APIs:

- `GET /api/agency/clients`
- `POST /api/agency/clients`
- `GET /api/agency/clients/:id`
- `PATCH /api/agency/clients/:id`

The APIs:

- require internal agency organization access
- return simple JSON payloads
- use `supabaseAdmin` only after route-level authorization
- reject demo account writes
- do not create any public UI surface

## Private/Internal Boundary

The agency system remains private because:

- new agency routes live under `/api/agency/*`
- route helpers reject non-`internal_agency` organizations
- RLS policies require `organizations.type = 'internal_agency'`
- no dashboard navigation or public pages were added
- no SaaS customer route was changed to expose agency data

Agency clients are data records, not SaaS user accounts. They are not granted dashboard access by this phase.

## Intentionally Not Built

This phase intentionally does not include:

- full agency client management UI
- source import UI
- production queue UI
- draft review or delivery UI
- Slack connection logic
- Granola import logic
- agency marketing pages
- client portal behavior
- SaaS billing changes
- SaaS generation changes

## Tests

Focused tests were added for:

- agency permission helper behavior
- SaaS organization denial
- internal agency member access
- agency client access scoped to the active internal agency organization
- agency client normalization and organization-scoped helper queries
- minimal agency client API authorization and write behavior

## Next Steps For Phase 4B

Phase 4B can build the private agency client management UI on top of:

- `agency_clients`
- `agency_client_profiles`
- `client_integrations`
- `GET/POST /api/agency/clients`
- `GET/PATCH /api/agency/clients/:id`
- `requireAgencyAccess(...)`
- `requireAgencyClientAccess(...)`

The UI should stay hidden from SaaS organizations and should not add Slack or Granola behavior yet.
