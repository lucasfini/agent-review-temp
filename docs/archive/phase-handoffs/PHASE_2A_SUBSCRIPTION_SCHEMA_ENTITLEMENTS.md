# Phase 2A: Subscription Schema + Entitlement Foundation

Date: 2026-06-03

## Scope

This phase adds the database and code foundation for organization-based subscription plans and entitlements while preserving the current credit/pay-as-you-go model.

In scope:
- Subscription plan schema
- Organization subscription schema
- Seed plan rows
- Read-only subscription and plan helpers
- Report-only entitlement summaries
- Minimal read APIs

Out of scope:
- Stripe subscription checkout
- Stripe webhook subscription handling
- Credit/pay-as-you-go migration
- Billing UI redesign
- Agency clients
- Slack or Granola integrations
- Public pricing or marketing page changes
- Broad RLS rewrites

## Canonical Migration Source

Forward migrations in `supabase/migrations/` remain the canonical database source.

Implemented migration:
- `supabase/migrations/20260603120000_phase_2a_subscription_schema_entitlements.sql`

## Tables Added

### `public.plans`

Columns:
- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text not null unique`
- `description text`
- `stripe_price_id text unique`
- `monthly_price_cents integer`
- `currency text not null default 'usd'`
- `seat_limit integer`
- `monthly_generation_limit integer`
- `monthly_transcription_minute_limit integer`
- `monthly_import_limit integer`
- `monthly_storage_mb_limit integer`
- `integration_limit integer`
- `features_json jsonb not null default '{}'::jsonb`
- `is_active boolean not null default true`
- `display_order integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `public.organization_subscriptions`

Columns:
- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `plan_id uuid references plans(id) on delete set null`
- `stripe_customer_id text`
- `stripe_subscription_id text unique`
- `status text not null default 'inactive'`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `cancel_at_period_end boolean not null default false`
- `trial_start timestamptz`
- `trial_end timestamptz`
- `metadata_json jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Status values are constrained to:
- `inactive`
- `trialing`
- `active`
- `past_due`
- `canceled`
- `unpaid`
- `incomplete`
- `incomplete_expired`

## Seed Plans

The migration seeds four active plans:
- `starter`
- `growth`
- `scale`
- `enterprise`

`stripe_price_id` is intentionally left nullable for all seed rows. Existing checkout uses inline one-time Stripe `price_data`, so this repo does not yet have a safe production convention for subscription price IDs.

## Indexes Added

Plans:
- `idx_plans_slug`
- `idx_plans_is_active`

Organization subscriptions:
- `idx_organization_subscriptions_organization_id`
- `idx_organization_subscriptions_plan_id`
- `idx_organization_subscriptions_stripe_customer_id`
- `idx_organization_subscriptions_stripe_subscription_id`
- `idx_organization_subscriptions_status`

## RLS Behavior

RLS is enabled on both new tables.

`plans`:
- Authenticated users can read active plans.
- Service role can manage all plans.

`organization_subscriptions`:
- Active organization members can read subscription rows for their organization.
- Service role can manage all subscriptions.

No normal-user insert, update, or delete policies were added.

## Helpers Added

New files:
- `lib/billing/plans.ts`
- `lib/billing/subscriptions.ts`
- `lib/billing/entitlements.ts`

Key exports:
- `PlanSlug`
- `SubscriptionStatus`
- `getActivePlans(...)`
- `getOrganizationSubscription(...)`
- `getOrganizationEntitlements(...)`
- `getEntitlementsForSubscription(...)`
- `isSubscriptionUsable(...)`
- `getPlanLimits(...)`
- `getFallbackFreeOrLegacyEntitlements(...)`

Entitlements are intentionally report-only. A usable subscription is currently `active` or `trialing`. Plan limits are returned as structured data, but no generation, transcription, upload, import, or billing flow enforces them in this phase.

## APIs Added

### `GET /api/plans`

Returns active plans ordered by `display_order` and `name`.

This route does not expose inactive plans and does not mutate billing state.

### `GET /api/subscriptions/current`

Requires an authenticated user.

Behavior:
- Resolves the active organization context with existing organization helpers.
- Accepts optional `organization_id` query param and validates active membership.
- Returns the current organization subscription if present.
- Returns `subscription: null` plus legacy fallback entitlements when no subscription exists.
- Includes organization, membership, subscription, and entitlement summary.
- Does not create Stripe checkout.
- Does not mutate subscriptions.

## Stripe Routes Intentionally Not Changed

These routes were not modified:
- `app/api/stripe/create-checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/stripe/verify-session/route.ts`

Reason:
- Current Stripe behavior is one-time credit purchase checkout.
- Phase 2A only creates subscription foundations.
- Subscription checkout, customer mapping, subscription lifecycle reconciliation, and webhook handling belong in Phase 2B.

## Credit Behavior Preservation

Current pay-as-you-go behavior is preserved:
- `account_credits` remains user-scoped.
- `credit_transactions` remains user-scoped.
- Credit purchase checkout is unchanged.
- Credit webhook processing is unchanged.
- Existing generation, transcription, upload, import, and billing read flows are not blocked by subscription state.
- Entitlement fallback keeps `legacyCreditsEnabled: true` and `enforcementMode: 'none'`.

## Required Stripe Setup for Phase 2B

Before Phase 2B checkout/webhook work:
1. Create Stripe recurring prices for `starter`, `growth`, `scale`, and any public/custom plans.
2. Populate `plans.stripe_price_id` with production price IDs.
3. Decide how Stripe customers map to organizations.
4. Add organization metadata to subscription checkout sessions.
5. Implement webhook handling for subscription lifecycle events.
6. Define downgrade/cancel/past-due handling and any grace-period rules.

## Next Steps for Phase 2B

1. Add organization-aware subscription checkout creation.
2. Store `stripe_customer_id` and `stripe_subscription_id` on `organization_subscriptions`.
3. Reconcile subscription lifecycle webhooks.
4. Add owner/admin billing authorization for subscription management.
5. Add billing UI changes to show current plan and manage subscriptions.
6. Decide when and how entitlement limits become enforceable.
7. Keep credit/pay-as-you-go compatibility until a deliberate migration phase.
