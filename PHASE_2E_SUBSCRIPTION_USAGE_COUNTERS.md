# Phase 2E: Canonical Subscription Usage Counters

## Summary

Phase 2E adds canonical organization-scoped subscription usage counters for future enforcement. The app still runs in dry-run mode: upload, transcription, generation, and import flows are not blocked by subscription decisions.

## Schema Added

New migration:

- `supabase/migrations/20260605120000_phase_2e_subscription_usage_counters.sql`

New table:

- `subscription_usage_counters`

Fields:

- `id`
- `organization_id`
- `subscription_id`
- `period_start`
- `period_end`
- `counter_key`
- `quantity`
- `unit`
- `metadata_json`
- `created_at`
- `updated_at`

Allowed counter keys:

- `content_generation`
- `transcription_minutes`
- `audio_upload`
- `integration_import`
- `storage_mb`
- `seat`

Allowed units:

- `count`
- `minutes`
- `mb`

Unique period key:

- `organization_id`
- `period_start`
- `period_end`
- `counter_key`

RLS:

- Active organization members can read counters for their organization.
- `service_role` can manage counters.
- Authenticated users cannot insert, update, or delete counters directly.

## Helpers Added

New helper:

- `lib/billing/subscription-usage-counters.ts`

Primary functions:

- `getCurrentSubscriptionUsagePeriod(...)`
- `getFallbackCalendarUsagePeriod(...)`
- `getUsageCounterKeyForAction(...)`
- `getSubscriptionUsageCounters(...)`
- `incrementSubscriptionUsageCounter(...)`
- `recordSubscriptionUsage(...)`
- `getUsageQuantityForCounter(...)`
- `reconcileUsageEventsToCounters(...)`

Database RPC:

- `public.increment_subscription_usage_counter(...)`
  - Atomic period counter insert/increment.
  - `SECURITY DEFINER`.
  - Execute permission is granted only to `service_role`.
  - Authenticated users cannot call it directly.

Period selection:

- Use the current organization subscription period when `current_period_start` and `current_period_end` are valid.
- Fall back to the current UTC calendar month when no valid subscription period exists.

## Dry-Run Entitlement Changes

Updated:

- `lib/billing/entitlement-guards.ts`

Behavior:

- Entitlement dry-run checks first look for a `subscription_usage_counters` row for the current organization/action/period.
- If a counter row exists, it is used as the canonical current usage.
- If no counter row exists, the previous approximate fallback remains:
  - `usage_events` for transcription
  - `billing_reservations` for content generation, uploads, and imports
  - `projects` for storage
  - `organization_members` for seats

This keeps existing dry-run behavior useful while new counters are being populated.

## Write Paths Instrumented

Counter writes are non-blocking. `recordSubscriptionUsage(...)` catches and logs failures so user flows continue.

Instrumented paths:

- `app/api/upload/finalize/route.ts`
  - Records `audio_upload = 1` after direct upload storage verification succeeds.

- `app/api/upload/url/route.ts`
  - Records `audio_upload = 1` after URL import succeeds.

- `app/api/generate-content/route.ts`
  - Records `content_generation = saved output count` after outputs are saved and credit settlement succeeds.

- `app/api/projects/[id]/generate/process/route.ts`
  - Records `content_generation = 1` only for analysis jobs that actually complete a reconcile target.
  - Content jobs are not counted here because `/api/generate-content` records generated outputs.

- `app/api/transcribe/route.ts`
  - Records `transcription_minutes = processed duration / 60` after provider transcription usage is tracked.
  - Cached transcription reuse is not counted as provider-processed transcription.

- `app/api/integrations/zoom/import/route.ts`
- `app/api/integrations/microsoft/import/route.ts`
- `app/api/integrations/youtube/import/route.ts`
  - Records `integration_import = 1` after a real import succeeds and duplicate imports are skipped.

Intentionally not counted:

- `app/api/upload/init/route.ts`
  - Signed URL creation can be abandoned, so counting here would overcount.

- `app/api/generate-selected-content/route.ts`
- `app/api/projects/[id]/generate/route.ts`
  - These schedule work but are not true completion points.

## Optional Read API

New route:

- `GET /api/subscriptions/usage-counters`

Behavior:

- Requires authenticated user.
- Validates requested `organization_id` against active organization membership.
- Returns current period and counters.
- Does not mutate data.

## Idempotency and Concurrency

Counter writes accept idempotency keys and store observed keys in `metadata_json.idempotencyKeys`.

The migration adds `public.increment_subscription_usage_counter(...)`, and the TypeScript helper uses that RPC when it is available. That makes normal deployed counter increments atomic for the unique organization/period/counter row.

The helper retains a select/update/insert fallback only for local tests or environments where the migration has not been applied yet. That fallback is not concurrency-safe and should not be relied on for hard enforcement.

Before hard enforcement, add one of:

- A separate `subscription_usage_counter_events` table with a unique idempotency key.
- A deployment check that fails startup or enforcement if the atomic RPC is missing.

## Relation to Existing Usage Data

Existing tables remain unchanged:

- `usage_events`
- `billing_reservations`
- `credit_transactions`
- `account_credits`

No historical data is backfilled automatically in this phase. `reconcileUsageEventsToCounters(...)` is intentionally a documented stub because a safe reconciliation requires reviewed mapping decisions.

## Manual Verification Queries

Verify table and constraints:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'subscription_usage_counters'
order by ordinal_position;
```

Verify RLS policies:

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'subscription_usage_counters';
```

Verify current period counters for an organization:

```sql
select organization_id, subscription_id, period_start, period_end, counter_key, quantity, unit
from public.subscription_usage_counters
where organization_id = '<organization_id>'
order by period_start desc, counter_key;
```

## Remaining Work Before Hard Enforcement

- Add a dedicated counter event table or deployment check for strict idempotency before hard enforcement.
- Reconcile historical usage into counters after validating mappings.
- Decide whether `storage_mb` and `seat` should remain calculated or be materialized into counters.
- Add operational dashboards/log review for dry-run would-block decisions.
- Only then move to hard enforcement.
