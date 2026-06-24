# Phase 8B Supabase RLS Launch Verification

Phase 8B creates the staging/production verification plan for Supabase migrations, RLS, and cross-organization isolation.

No schema changes were made. No RLS policies were rewritten. No `organization_id` columns were made `NOT NULL`.

## Scope Reviewed

Reviewed launch-critical migrations and route boundaries for:

- `organizations`
- `organization_members`
- `projects`
- `outputs`
- `campaigns`
- `content_library_items`
- `organization_subscriptions`
- `subscription_usage_counters`
- `agency_clients`
- `agency_client_profiles`
- `client_integrations`
- `source_imports`
- `production_tasks`
- `agency_leads`
- `agency_funnel_events`

Also reviewed service-role access through public and internal API routes:

- `POST /api/agency-leads`
- `POST /api/agency-funnel-events`
- `GET /api/agency/leads`
- `POST /api/agency/leads/[id]/convert`
- Slack import routes
- Granola/manual import routes

## Files Added

- `scripts/sql/verify-rls-launch-readiness.sql`

The SQL script is read-only and reports launch readiness rows with `PASS`, `WARN`, `FAIL`, or `SKIP`.

## Migration Validation Steps

Run these in staging before production, then repeat against production immediately after migration deployment:

1. Confirm all migrations through `20260608180000_phase_7g_agency_lead_org_scope.sql` have been applied.
2. Confirm Phase 1A organization tables exist and RLS is enabled.
3. Confirm Phase 2A subscription tables and Phase 2E usage counters exist and are org-scoped.
4. Confirm Phase 4A/4H agency tables, RLS policies, and integrity triggers exist.
5. Confirm Phase 5B Slack token columns exist on `client_integrations`.
6. Confirm Phase 6D/6F/7E/7G lead tables and org scoping exist.
7. Confirm Phase 7D funnel event table exists with service-role-only access.
8. Run the read-only launch SQL script.
9. Run route-level staging tests using real authenticated accounts.
10. Document every `WARN` and resolve every `FAIL` before launch.

Suggested command with `psql`:

```bash
psql "$DATABASE_URL" -f scripts/sql/verify-rls-launch-readiness.sql
```

If using the Supabase SQL editor, paste and run the same file. Do not run it in a transaction that also contains mutations.

## RLS Verification Queries

Use:

```text
scripts/sql/verify-rls-launch-readiness.sql
```

The script checks:

- required table existence
- RLS enablement
- expected policy catalog coverage for org, billing, content library, agency, lead, and funnel tables
- no direct `anon` or `authenticated` grants on `agency_leads` or `agency_funnel_events`
- project/output organization scope and legacy null ownership review
- agency records belong to internal agency organizations
- source imports, production tasks, converted leads, campaigns, and content items remain client/org scoped
- billing and subscription usage rows are org scoped
- critical integrity triggers exist
- `increment_subscription_usage_counter` is not executable by public Supabase roles

Expected launch result:

- `FAIL`: zero rows.
- `WARN`: reviewed and documented before launch.
- `SKIP`: acceptable only when explained, for example a non-Supabase local database without `anon`/`authenticated` roles.

## Manual Staging Test Accounts Needed

Create or identify these accounts in a staging Supabase project:

- `saas_owner_a`: owner/admin/member of a `saas_customer` organization.
- `saas_owner_b`: owner/admin/member of a different `saas_customer` organization.
- `agency_admin_a`: owner/admin/agency_admin of internal agency organization A.
- `agency_member_a`: agency_member of internal agency organization A.
- `agency_admin_b`: owner/admin/agency_admin of internal agency organization B if multiple agency orgs are supported.
- `demo_user`: a demo/read-only account if demo mode is enabled in staging.
- `public_anonymous`: unauthenticated browser/client for public funnel checks.

Seed staging data:

- one SaaS project and output for each SaaS organization
- one campaign and content library item for a SaaS organization
- one internal agency client for agency org A
- one agency client profile for that client
- one Slack `client_integrations` row for that client
- one Granola/manual `source_imports` row for that client
- one `production_tasks` row for that client
- one public `agency_leads` row owned by agency org A
- one `agency_funnel_events` row linked to that lead
- one subscription row and one usage counter row per SaaS test org

## Expected Pass And Fail Cases

### SaaS Org Isolation

- `saas_owner_a` can load only org A projects, outputs, campaigns, content library items, subscription rows, and usage counters.
- `saas_owner_a` cannot read org B SaaS rows.
- `saas_owner_a` cannot read any `agency_clients`, `agency_client_profiles`, `client_integrations`, `source_imports`, `production_tasks`, `agency_leads`, or `agency_funnel_events` rows.
- `saas_owner_a` cannot start Slack, Granola, agency lead export, or agency conversion routes.

### Public Lead And Analytics Privacy

- `public_anonymous` can submit `POST /api/agency-leads` through the public API.
- `public_anonymous` gets `400` for invalid agency lead payloads.
- `public_anonymous` can submit valid `POST /api/agency-funnel-events` payloads.
- `public_anonymous` cannot read `agency_leads` or `agency_funnel_events` directly.
- `GET /api/agency-funnel-events` returns `405`.
- `GET /api/agency/leads` unauthenticated returns `401`.

### Internal Agency Access

- `agency_admin_a` can read and manage agency clients in agency org A.
- `agency_member_a` can read agency console data allowed to operators.
- `agency_member_a` cannot perform admin-only client management or lead conversion.
- `agency_admin_a` can convert a lead into a client only in agency org A.
- `agency_admin_a` cannot access agency org B data when agency org B exists.
- `agency_admin_b` cannot access agency org A data.

### Demo Account Safety

- `demo_user` cannot mutate protected agency records.
- `demo_user` cannot start Slack OAuth, run Slack imports, run Granola imports, convert leads, or update agency status records.

### Service Role Boundary

- Public lead and funnel writes use service role only inside server routes after validation/rate limiting.
- Internal lead review/export/convert routes use service role only after `requireAgencyAccess`.
- Slack and Granola routes use service role only after `requireAgencyClientAccess`.
- Billing/subscription server routes use service role only after org membership checks or Stripe webhook verification.

### Slack And Granola Scope

- Slack OAuth start requires internal agency admin access.
- Slack callback writes integration metadata only for the client/org encoded in signed OAuth state.
- Slack imports require agency client access and create `source_imports` with matching `organization_id` and `client_id`.
- Granola imports require agency client access and create `source_imports` with matching `organization_id` and `client_id`.

### Billing Scope

- SaaS org users see only their own `organization_subscriptions`.
- SaaS org users see only their own `subscription_usage_counters`.
- Agency organizations do not inherit another org's subscription or usage counters.
- `increment_subscription_usage_counter` remains service-role-only.

## Known Limitations

- The SQL script validates catalog and data invariants. It does not fully prove JWT-scoped RLS behavior by itself.
- Existing `tests/database/rls-policies.test.js` requires live Supabase env vars and test user setup. It was not converted into a mandatory local test because Phase 8B must not require local production credentials.
- `agency_leads.organization_id` remains nullable for legacy compatibility. Null lead ownership is reported as `WARN` and must be reviewed before launch.
- `projects` and `outputs` still preserve legacy `user_id` fallback behavior. The SQL script reports null `organization_id` rows as `WARN`; staging account tests must confirm this fallback does not expose cross-org records.
- Service-role policies exist by design. Their safety depends on route-level authorization checks and secret containment.
- SQL metadata checks cannot verify Cloudflare, Supabase dashboard, or Stripe dashboard configuration.

## Launch Blockers

- Any `FAIL` row from `scripts/sql/verify-rls-launch-readiness.sql`.
- Any unreviewed `WARN` row from the SQL script.
- Public users can directly read leads or funnel analytics.
- SaaS users can read or mutate internal agency records.
- Internal agency members can access another internal agency organization's records.
- Demo users can mutate protected rows.
- Lead conversion creates an agency client outside the configured internal agency organization.
- Slack or Granola imports create rows with mismatched `organization_id` or `client_id`.
- Billing or usage counter rows are visible across organizations.
- Supabase service role key is exposed to client code, committed, or used outside trusted server routes.

## Rollback Awareness

Phase 8B adds no migration and no app behavior. If the verification SQL or report needs to be reverted, remove:

- `scripts/sql/verify-rls-launch-readiness.sql`
- `PHASE_8B_SUPABASE_RLS_VERIFICATION.md`
- the focused static tests added for these artifacts

Do not roll back earlier schema migrations without a separate data migration plan. Lead ownership, agency client references, subscription counters, Slack token columns, and content library client links are already part of the application contract.

## Recommended Launch Sequence

1. Deploy all migrations to staging.
2. Run `scripts/sql/verify-rls-launch-readiness.sql` in staging.
3. Resolve every `FAIL` and document each `WARN`.
4. Run manual staging account pass/fail tests.
5. Run `npm run test:database` only when staging/local Supabase test credentials are configured.
6. Deploy migrations to production.
7. Run the read-only SQL script against production.
8. Run the public, SaaS, agency, Slack, Granola, and billing smoke cases from this report.
9. Do not launch traffic until there are no unresolved launch blockers.
