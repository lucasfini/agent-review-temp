# Phase 1A: Multi-Tenant Schema Foundation

## Scope

This phase adds schema foundations for organizations while preserving current single-user `user_id` ownership behavior.

Out of scope in this phase:
- Full API access-model cutover
- Organization-aware route rewrites across the app
- Subscription billing
- Agency client workflows
- Slack/Granola integrations
- UI redesign

## Canonical Migration Source

Per Phase 0.5, forward migrations in `supabase/migrations/` are canonical.

Implemented migration:
- `supabase/migrations/20260526134500_phase_1a_multi_tenant_schema_foundation.sql`

## Tables Added

### `public.organizations`

Columns:
- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text` (unique index on non-null values)
- `type text not null default 'personal_legacy'`
- `owner_user_id uuid references auth.users(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints/patterns:
- Type check values: `personal_legacy`, `saas_customer`, `internal_agency`
- Partial unique index ensures one `personal_legacy` org per owner user when `owner_user_id` is present.

### `public.organization_members`

Columns:
- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role text not null default 'owner'`
- `status text not null default 'active'`
- `invited_by uuid references auth.users(id) on delete set null`
- `created_at timestamptz not null default now()`
- `joined_at timestamptz`

Constraints:
- Unique membership: `(organization_id, user_id)`
- Role check values: `owner`, `admin`, `member`, `agency_admin`, `agency_member`
- Status check values: `active`, `invited`, `removed`

## Indexes Added

Required access-check indexes:
- `organizations(owner_user_id)`
- `organization_members(user_id)`
- `organization_members(organization_id)`
- `organization_members(organization_id, user_id)`

Additional:
- Unique non-null slug index on `organizations(slug)`
- Partial unique index on `organizations(owner_user_id)` for `type='personal_legacy'`

## Existing Tables Updated (Nullable `organization_id`)

The migration adds `organization_id uuid` (nullable) to these tables when each table exists:
- `projects`
- `outputs`
- `usage_events`
- `billing_reservations`
- `project_generation_jobs`
- `integration_connections`
- `integration_imports`
- `narrative_goals`
- `narrative_coverage_snapshots`

No `user_id` columns are removed.

## Backfill Strategy

### 1) Default organization per existing user

Idempotent insert creates one `personal_legacy` organization per user in `auth.users` if missing.

### 2) Membership backfill

For each default organization owner mapping, insert an owner membership row if missing:
- `role='owner'`
- `status='active'`

### 3) Projects backfill

Backfill `projects.organization_id` from `projects.user_id -> owner default organization`.

### 4) Dependent table backfill

Order used:
1. Tables with `project_id`: derive from `projects.organization_id`
2. Remaining nulls with `user_id`: derive from default user organization

Applied to:
- `outputs`
- `usage_events`
- `billing_reservations`
- `project_generation_jobs`
- `integration_imports`
- `narrative_coverage_snapshots`

User-derived only tables:
- `integration_connections`
- `narrative_goals`

## Foreign Keys for `organization_id`

Added `organization_id` foreign keys (when table+column exists):
- `projects_organization_id_fkey`
- `outputs_organization_id_fkey`
- `usage_events_organization_id_fkey`
- `billing_reservations_organization_id_fkey`
- `project_generation_jobs_organization_id_fkey`
- `integration_connections_organization_id_fkey`
- `integration_imports_organization_id_fkey`
- `narrative_goals_organization_id_fkey`
- `narrative_coverage_snapshots_organization_id_fkey`

All are created `NOT VALID` first, then validation is attempted with guarded warnings so migration remains safe in mixed historical data.

## RLS Added

### `organizations`
- Users can `SELECT` organizations where they are active members.

### `organization_members`
- Users can `SELECT` their own active membership rows.

Service-role management policies were added for both tables.

## Nullable-by-Design in Phase 1A

`organization_id` remains nullable on all existing tables in this phase.

Reason:
- Supports safe transition and partial historical backfill.
- Avoids breaking current user-owned behavior.
- Full enforcement (`NOT NULL` and route cutover) is deferred to later phase after verification.

## Risks / Notes

- Existing historical rows without resolvable `project_id`/`user_id` mappings remain nullable by design.
- Constraint validation is attempted safely; warnings may indicate data that needs cleanup before stricter enforcement.
- Current app behavior still depends on `user_id` checks until Phase 1B route/access updates.

## Manual Verification Queries

Run after migration:

```sql
-- 1) Every user has a personal_legacy organization
select count(*) as users_total from auth.users;
select count(distinct owner_user_id) as users_with_default_org
from public.organizations
where type = 'personal_legacy' and owner_user_id is not null;

-- 2) Every default org has an owner membership
select count(*) as missing_owner_memberships
from public.organizations o
left join public.organization_members m
  on m.organization_id = o.id
 and m.user_id = o.owner_user_id
where o.type = 'personal_legacy'
  and o.owner_user_id is not null
  and m.id is null;

-- 3) Project linkage coverage
select
  count(*) as total_projects,
  count(*) filter (where organization_id is not null) as projects_with_org,
  count(*) filter (where organization_id is null) as projects_without_org
from public.projects;

-- 4) Dependent tables still null after backfill
select 'outputs' as table_name, count(*) as null_org_rows
from public.outputs where organization_id is null
union all
select 'usage_events', count(*) from public.usage_events where organization_id is null
union all
select 'billing_reservations', count(*) from public.billing_reservations where organization_id is null
union all
select 'project_generation_jobs', count(*) from public.project_generation_jobs where organization_id is null
union all
select 'integration_connections', count(*) from public.integration_connections where organization_id is null
union all
select 'integration_imports', count(*) from public.integration_imports where organization_id is null
union all
select 'narrative_goals', count(*) from public.narrative_goals where organization_id is null
union all
select 'narrative_coverage_snapshots', count(*) from public.narrative_coverage_snapshots where organization_id is null;

-- 5) Check FK validation status
select conname, convalidated
from pg_constraint
where conname like '%_organization_id_fkey'
order by conname;
```

## Next Steps (Phase 1B)

1. Introduce organization-aware access helper usage in key routes (`projects` and dependent endpoints first).
2. Add dual-read/dual-write patterns where routes still write only `user_id`.
3. Expand RLS on existing tables to include organization membership checks.
4. Resolve remaining null `organization_id` rows from edge-case historical records.
5. Only after verification, evaluate staged `NOT NULL` rollout where appropriate.
