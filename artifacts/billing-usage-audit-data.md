# Billing, Stripe, Usage, and Finance Surface Summary

Generated from local repo inspection of `audiorepurpose`.

## Executive Summary

AudioRepurpose currently has a hybrid billing model:

- New subscription/product-credit model: organization-scoped subscriptions, monthly product-credit grants, rollover credits, top-up credit grants, plan limits, and usage counters.
- Legacy pay-as-you-go model: user-scoped `account_credits` balances and `credit_transactions` in USD-equivalent "site credits".
- Stripe integration supports both recurring subscription checkout and one-time top-up checkout.
- Subscription entitlement enforcement exists but defaults to dry-run unless `SUBSCRIPTION_ENFORCEMENT_MODE=enforce`.
- Server-side product-credit reservations are actively used for uploads/imports/content generation. This is stronger than UI-only gating.
- Billing read APIs are organization-aware but retain legacy fallback behavior because old credit transactions/account balances are still user-scoped.

This means an audit should treat billing as a transitional system. The subscription UI is live, top-ups are live for paid plans, and product-credit reservations are used, but legacy account credit paths still exist for compatibility and some pages/copy still describe the old model.

## Main User-Facing Pages

### `/dashboard/billing`

Path: `app/dashboard/billing/page.tsx`

This page is a client wrapper around `components/billing/billing-dashboard.tsx`.

The new billing dashboard shows:

- Page title and subtitle: manage subscription plans, credits, purchases, and transaction history.
- Credit balance card.
- Subscription plan cards.
- Stripe billing portal action.
- Credit top-up card.
- Usage-this-month summary.
- Transaction history with search, pagination, and CSV export.

Primary data sources:

- `/api/dashboard/settings?transactionLimit=10&transactionOffset=0&usageLimit=200`
- `/api/billing/balance`
- `/api/billing/transactions/grouped`
- `/api/plans`
- `/api/subscriptions/current`
- `/api/subscriptions/checkout`
- `/api/subscriptions/portal`
- `/api/stripe/create-checkout`

The page is product-credit aware. It prefers `/api/billing/balance` for plan-credit balances and merges it with legacy settings data. If plan-credit balance is present, it displays:

- Total available credits.
- Monthly grant used.
- Current monthly credits.
- Rollover credits.
- Top-up credits.
- Percent of monthly grant remaining.

If legacy balance data is used, it displays site credits derived from USD balance using `10,000 site credits = $1`.

### `/dashboard/usage`

Path: `app/dashboard/usage/page.tsx`

This page reuses `app/dashboard/settings/unified-settings.tsx` with `forcedSection="usage"`.

It displays:

- Total Cost.
- Projects Processed.
- Avg Cost / Project.
- Usage Trends chart for the last 30 grouped dates.
- Cost by Project.
- Toggle to show deleted projects.

Usage data is loaded from `/api/dashboard/settings` and comes from `getUsageHistory(...)` in `lib/billing/credit.ts`, filtered by organization context.

The usage page is cost-oriented, not product-credit-oriented. It sums `usage_events.billed_cost`, so the displayed "Total Cost" reflects provider/API billing ledger cost, not necessarily current plan-credit consumption.

### `/dashboard/settings?section=billing`

Path: `app/dashboard/settings/unified-settings.tsx`

The settings billing section still exists and uses older components:

- `components/billing/subscription-plans.tsx`
- `components/billing/credit-packages.tsx`
- Balance banner.
- Transaction history table with grouped children.

This is partly overlapping with the newer `/dashboard/billing` dashboard. It still says "Pay-as-you-go credits remain available during the subscription transition".

### `/billing/success`

Path: `app/billing/success/page.tsx`

This page handles successful one-time top-up checkout redirects.

Behavior:

- Reads `session_id` from query params.
- Calls `/api/stripe/verify-session` after a 1 second delay.
- Fetches `/api/billing/balance`.
- Displays credits added and current balance.

Audit concern:

- It formats `creditsAdded` and `balance` with legacy site-credit helpers (`formatSiteCreditDeltaFromUsd`, `formatSiteCreditsFromUsd`), even though top-ups now grant product credits.
- It says "Credits never expire", but product top-up credits expire after 12 months by current package config.
- It links back to `/dashboard/settings`, not the newer `/dashboard/billing`.

### `/billing/cancel`

Path: `app/billing/cancel/page.tsx`

This page handles canceled one-time top-up checkout redirects.

Audit concern:

- Copy is legacy pay-as-you-go oriented: "No monthly subscriptions", "Credits never expire", and links to `/dashboard/settings`.
- This conflicts with current subscription/product-credit positioning.

## Plans and Pricing

Plan source:

- `lib/billing/plans.ts`
- `supabase/migrations/20260618183000_phase_9_pricing_credit_entitlements.sql`
- `supabase/migrations/20260621225000_set_live_subscription_price_ids.sql`

Current active plan slugs:

- `free`
- `standard`
- `pro`
- `teams`

Legacy plan slugs were deactivated:

- `starter`
- `growth`
- `scale`
- `enterprise`

Current seeded pricing and credits:

| Plan | Monthly | Annual | Included seats | Monthly credits | Rollover | Top-ups | Max upload |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Free | $0 | $0 | 1 | 300 | 0 months | Disabled | 60 min |
| Standard | $49.99 | $509.90 | 1 | 3,000 | 1 month | Enabled | 60 min |
| Pro | $149.00 | $1,519.80 | 3 | 10,000 | 1 month | Enabled | 60 min |
| Teams | $399.00 | $4,069.80 | 5 | 35,000 | 1 month | Enabled | 60 min |

Teams also has `extra_seat_price_cents = 2900`.

Stripe recurring price IDs are stored in the `plans` table:

- `stripe_monthly_price_id`
- `stripe_annual_price_id`
- Older `stripe_price_id` remains for compatibility.

`getPlanStripePriceId(plan, interval)` chooses the annual price for `year`, otherwise monthly price.

Production checkout rejects unsafe price IDs in `app/api/subscriptions/checkout/route.ts`. It blocks non-`price_` values and placeholder-ish names such as `placeholder`, `replace`, `mock`, `starter`, `growth`, `scale`, `enterprise`, `standard`, and `teams`.

## Top-Up Packages

Source:

- `lib/billing/credit-packages.ts`
- `components/billing/billing-dashboard.tsx`
- `components/billing/credit-packages.tsx`

Current packages:

| Package ID | Credits | Price | Expiry |
| --- | ---: | ---: | ---: |
| `top_up_1000` | 1,000 | $19 | 12 months |
| `top_up_5000` | 5,000 | $79 | 12 months |
| `top_up_15000` | 15,000 | $229 | 12 months |

Top-ups are only allowed when the current subscription plan has `topUpEnabled = true`. Free plan users get a 403 from the server route and disabled UI.

## Product Credit Model

Source:

- `lib/billing/product-credits.ts`
- `lib/billing/plan-credits.ts`
- `supabase/migrations/20260618183000_phase_9_pricing_credit_entitlements.sql`

Product credits are processing capacity, not cash value.

Current rates:

| Workflow | Credit rate |
| --- | ---: |
| Transcript | 1 credit per audio minute |
| Content Kit | 3 credits per audio minute |
| Repurpose Pack | 5 credits per audio minute |
| Extra draft/regeneration | 25 credits each |

Examples from tests:

- 60 minute transcript = 60 credits.
- 60 minute content kit = 180 credits.
- 60 minute repurpose pack = 300 credits.

Credit grants are stored in `billing_credit_grants` with:

- `organization_id`
- `user_id`
- `subscription_id`
- `plan_id`
- `source_type`: `plan_grant`, `rollover`, `top_up`, `promo`, `adjustment`
- `credits_granted`
- `credits_remaining`
- `period_start`
- `period_end`
- `expires_at`
- `idempotency_key`
- `stripe_payment_id`
- `metadata_json`

Grant consumption order:

1. Rollover plan grants.
2. Current monthly plan grant.
3. Top-up grants.
4. Other grant types.

`ensureCurrentPlanCreditGrant(...)` creates a monthly grant idempotently using a key based on org, subscription, plan, and period.

`grantTopUpCredits(...)` creates a top-up grant idempotently using the payment/session-derived key.

## Legacy Credit Model

Source:

- `lib/billing/credit.ts`
- `lib/billing/display.ts`

Legacy credit balances are user-scoped and stored in `account_credits`.

Legacy credit transactions are stored in `credit_transactions`.

The legacy display system treats USD amounts as site credits:

- `SITE_CREDITS_PER_USD = 10,000`
- `$1.00` displays as `10,000 credits`.

Legacy account-credit operations:

- `getBalance(userId)`
- `getDisplayBalance(userId)`
- `addCredit(userId, amount, ...)`
- `debitCredit(userId, amount, ...)`
- `createReservation(...)`
- `settleReservation(...)`
- `settleReservationAmount(...)`
- `failReservation(...)`

The legacy model still matters because:

- Some historic transactions have no `organization_id`.
- Some admin tools still operate on legacy `account_credits`.
- Usage events and old reservations can still be USD-cost based.
- Billing APIs use organization-scoped fallback filters to include relevant legacy rows.

## Stripe Subscription Checkout

Path: `app/api/subscriptions/checkout/route.ts`

Method: `POST`

Purpose: create a Stripe Checkout Session in `mode: subscription`.

Required authorization:

- Authenticated user.
- Demo users blocked.
- Organization billing manager required.
- `owner` or `admin` can manage billing.
- `agency_admin` can manage billing for `internal_agency` orgs.

Request body accepts:

- `planSlug` / `plan_slug`
- `planId` / `plan_id`
- `billingInterval` / `billing_interval` / `interval`
- `organization_id` / `organizationId`
- optional success/cancel URL overrides, same-origin only.

Flow:

1. Authenticate user.
2. Block demo user.
3. Resolve requested org and require billing-manager role.
4. Load active plan by slug or ID.
5. Reject Free plan.
6. Resolve monthly or annual Stripe price ID.
7. Reject missing price ID.
8. Reject unsafe production price ID.
9. Create or reuse Stripe customer for the organization.
10. Store new customer ID in `organization_subscriptions` if created.
11. Create Stripe Checkout Session with `mode: subscription`.
12. Attach metadata to both Checkout Session and subscription:
    - `organization_id`
    - `user_id`
    - `plan_id`
    - `plan_slug`
    - `billing_interval`
13. Return session URL.

Default success URL:

- `/dashboard/billing?subscription=success&session_id={CHECKOUT_SESSION_ID}`

Default cancel URL:

- `/dashboard/billing?subscription=cancel`

Local billing test mode:

- If `BILLING_TEST_MODE` is enabled outside production, this route uses mock Stripe behavior and immediately syncs a fake active subscription plus current plan credit grant.

## Stripe Billing Portal

Path: `app/api/subscriptions/portal/route.ts`

Method: `POST`

Purpose: create a Stripe Billing Portal session for an organization customer.

Required authorization:

- Authenticated user.
- Organization billing manager.

Flow:

1. Authenticate user.
2. Resolve requested org and billing manager permission.
3. Load organization Stripe customer ID from `organization_subscriptions`.
4. Return 404 if no customer exists.
5. Create Stripe billing portal session.
6. Return portal URL.

Return URL is same-origin constrained and defaults to `/dashboard/billing`.

The portal route does not directly mutate local subscription rows. It relies on Stripe webhooks.

## One-Time Stripe Top-Up Checkout

Path: `app/api/stripe/create-checkout/route.ts`

Method: `POST`

Purpose: create a Stripe Checkout Session in `mode: payment` for product-credit top-ups.

Required authorization:

- Authenticated user.
- Demo users blocked.
- Organization billing manager required.
- Current plan must have top-ups enabled.

Request body:

- `packageId`
- optional `organization_id`

Flow:

1. Authenticate user.
2. Block demo user.
3. Validate package ID.
4. Require organization billing manager.
5. Load/create current credit subscription for organization.
6. Reject if top-ups disabled.
7. Create Stripe Checkout Session in `mode: payment`.
8. Use inline `price_data`, not saved Stripe price IDs.
9. Enable invoice creation.
10. Attach metadata:
    - `userId`
    - `organizationId`
    - `packageId`
    - `credits`
    - `expiresAfterMonths`
    - `creditUnit = plan_credit`
11. Redirect success to `/billing/success?session_id=...`.
12. Redirect cancel to `/billing/cancel`.

Audit concern:

- Top-up checkout uses `customer_email`, not a persisted organization Stripe customer. Subscription checkout uses organization customer IDs.

## Stripe Session Verification Fallback

Path: `app/api/stripe/verify-session/route.ts`

Method: `POST`

Purpose: fallback credit grant if webhook has not processed yet, especially local development.

Required authorization:

- Bearer token.
- Demo users blocked.

Flow:

1. Authenticate user through Supabase token.
2. Retrieve Checkout Session from Stripe.
3. Confirm `session.metadata.userId` matches user.
4. Require `payment_status = paid`.
5. Deduplicate by `payment_intent` in `credit_transactions`.
6. Validate package.
7. Validate amount matches package price.
8. Resolve invoice number if possible.
9. If `metadata.organizationId` exists, call `grantTopUpCredits(...)`.
10. Otherwise fall back to legacy `addCredit(...)`.

Audit concern:

- Deduplication checks `credit_transactions` by `user_id` and `payment_id`; top-up grants also have their own idempotency key. This is probably okay, but the audit should verify no race between webhook and success-page fallback can double grant.

## Stripe Webhook

Path: `app/api/stripe/webhook/route.ts`

Method: `POST`

Webhook verifies `stripe-signature` using `STRIPE_WEBHOOK_SECRET`.

Handled events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`

Subscription checkout handling:

- If `checkout.session.completed` has `session.mode === 'subscription'`, it retrieves the Stripe subscription and syncs local `organization_subscriptions`.
- It does not grant top-up credits for subscription checkout.

Subscription lifecycle handling:

- For subscription created/updated/deleted, it syncs local subscription state.
- For invoice paid/payment_failed, it retrieves the subscription from the invoice and syncs local state.
- If synced subscription is usable and has a monthly grant, it ensures the current plan credit grant exists.

One-time payment handling:

- If `checkout.session.completed` is not subscription mode, it treats it as top-up/legacy credit purchase.
- It validates metadata and amount.
- It deduplicates by `payment_intent` in `credit_transactions`.
- If `organizationId` exists, it calls `grantTopUpCredits`.
- If no `organizationId`, it falls back to legacy `addCredit`.

Refund handling:

- Handles `charge.refunded`.
- Finds original purchase by `payment_intent`.
- Deduplicates refunds using refund ID in transaction metadata.
- Computes proportional refunded credits.
- If original metadata has `creditUnit = plan_credit` and `grantId`, it reduces the remaining grant credits up to available remaining amount and records unrecovered credits if already spent.
- If not plan credit, it debits legacy credits through `debitCredit(..., transactionType: refund)`.

Audit concerns:

- There is no dedicated persisted Stripe webhook events table in the inspected code. Idempotency relies on domain records such as subscription IDs, payment IDs, grant idempotency keys, and refund metadata.
- A webhook processing failure returns 500, so Stripe should retry, but event-level auditability is limited.

## Subscription Sync

Source: `lib/billing/subscriptions.ts`

Main function:

- `upsertOrganizationSubscriptionFromStripe(...)`

Important behavior:

- Looks up existing row by `stripe_subscription_id`.
- If missing, looks up by `stripe_customer_id`.
- Existing persisted organization mapping wins over mutable Stripe metadata.
- If metadata org mismatches persisted org, it logs a warning and keeps the stable persisted org.
- If no existing row exists, metadata organization must exist before inserting.
- Plan resolution prefers current Stripe price ID, then metadata `plan_id`, then metadata `plan_slug`, then existing plan.
- Maps Stripe status:
  - `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`
  - unknown/paused -> `inactive`
- Usable statuses are only `active` and `trialing`.

Subscription rows store:

- `organization_id`
- `plan_id`
- `stripe_customer_id`
- `stripe_subscription_id`
- `status`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- trial fields
- metadata JSON

## Current Subscription API

Path: `app/api/subscriptions/current/route.ts`

Method: `GET`

Purpose: load current organization subscription and entitlements for UI.

Flow:

1. Authenticate user.
2. Resolve active organization.
3. Call `getOrCreateCreditSubscription(...)`.
4. Ensure current plan credit grant.
5. Return organization, membership, subscription, and entitlements.

Important behavior:

- If no usable subscription exists, `getOrCreateCreditSubscription` creates an active Free subscription row for the organization.
- This means simply loading current subscription can mutate data by creating a Free subscription and grant.

## Entitlements and Enforcement

Sources:

- `lib/billing/entitlements.ts`
- `lib/billing/entitlement-guards.ts`
- `lib/billing/subscription-usage-counters.ts`

Supported entitlement actions:

- `audio_upload`
- `transcription`
- `content_generation`
- `integration_import`
- `storage`
- `seat`

Default enforcement mode:

- `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`

`runEntitlementGuard(...)`:

- Computes a decision.
- Logs dry-run or enforce decision.
- If mode is `enforce` and decision is blocked, returns a NextResponse with:
  - 402 for missing/inactive/plan missing.
  - 429 for limit exceeded.
- If mode is dry-run, it logs but does not block.
- If entitlement calculation fails, it logs and lets existing billing checks govern the request.

Important nuance:

- Even when entitlement enforcement is dry-run, plan-credit reservations can still hard-block paid workflows because `createPlanCreditReservation(...)` throws `InsufficientPlanCreditsError`.
- Upload duration limits are enforced server-side by `assertPlanUploadDuration(...)`.

Entitlement usage sources:

- First tries `subscription_usage_counters`.
- Falls back to `usage_events` for transcription minutes.
- Falls back to `billing_reservations` for uploads, imports, and content generation.
- Uses `projects.audio_file_size` for storage.
- Uses active `organization_members` count for seats.

## Subscription Usage Counters

Source:

- `lib/billing/subscription-usage-counters.ts`
- `supabase/migrations/20260605120000_phase_2e_subscription_usage_counters.sql`
- `app/api/subscriptions/usage-counters/route.ts`

Table: `subscription_usage_counters`

Key fields:

- `organization_id`
- `subscription_id`
- `period_start`
- `period_end`
- `counter_key`
- `quantity`
- `unit`
- `metadata_json`

Unique constraint:

- `(organization_id, period_start, period_end, counter_key)`

Counter keys:

- `content_generation`
- `transcription_minutes`
- `audio_upload`
- `integration_import`
- `storage_mb`
- `seat`

Units:

- `count`
- `minutes`
- `mb`

`increment_subscription_usage_counter(...)` RPC exists for atomic increments and bounded idempotency metadata.

Code fallback exists if RPC is missing, but the fallback is less atomic.

`recordSubscriptionUsage(...)` returns null on failure and logs a warning instead of blocking user flow.

## Usage Events and Cost Accounting

Source:

- `lib/billing/credit.ts`
- `lib/billing/track-usage.ts`
- `lib/billing/cost-map.ts`

Usage events are stored in `usage_events`.

Important fields:

- `user_id`
- `organization_id`
- `project_id`
- `reservation_id`
- `project_title`
- `service_key`
- `service_name`
- `provider`
- `units`
- `unit_type`
- `raw_cost`
- `margin_percent`
- `billed_cost`
- `metadata`
- `status`
- `workflow_step`

The cost map defines provider rates and billed rates for:

- AssemblyAI transcription.
- OpenAI GPT models.
- Anthropic Claude models.
- Perplexity and other providers further down the file.

Examples:

- AssemblyAI transcription raw rate: `$0.21/hour`.
- AssemblyAI billed rate: `$0.39/hour`.
- OpenAI/Anthropic token usage generally uses 45 percent markup in cost calculation helpers.

Usage tracking behavior:

- OpenAI usage is logged as a combined usage event per API call.
- Cached OpenAI input tokens use separate cached-input service keys.
- Anthropic usage logs input and output as separate usage events.
- If there is a reservation ID, usage events are marked pending and immediate debit defaults off.
- If no reservation ID, legacy debit can be attempted immediately.
- `strictBilling` controls whether failures throw or only log.

## Billing Reservations

Legacy USD reservations and product-credit reservations coexist.

Plan-credit reservation source:

- `lib/billing/plan-credits.ts`

Legacy reservation source:

- `lib/billing/credit.ts`

Plan-credit reservation flow:

1. Estimate product credits.
2. Ensure current plan grant exists.
3. Load available, non-expired grants.
4. Sort grants by consumption order.
5. If insufficient, throw `InsufficientPlanCreditsError`.
6. Insert `billing_reservations` row with `credit_unit = plan_credit`.
7. Insert allocation rows in `billing_reservation_credit_allocations`.
8. Insert `credit_transactions` reserve row.
9. On failure, roll back grant reservations and mark reservation failed.

Settlement:

- `settlePlanCreditReservationAmount(...)` releases unused reserved credits, updates allocation rows, marks reservation settled/released, and inserts a settle transaction.

Release:

- `releasePlanCreditReservation(...)` restores unused grant credits and inserts a release transaction.

Upload duration:

- `assertPlanUploadDuration(...)` checks `plan.maxUploadMinutes`.
- Free, Standard, Pro, and Teams currently seed `max_upload_minutes = 60`.

## Transaction History

Source:

- `lib/billing/grouped-transactions.ts`
- `app/api/billing/transactions/grouped/route.ts`

The grouped transaction API:

- Authenticates user.
- Resolves billing organization context.
- Loads raw `credit_transactions`.
- Loads reservations and usage events related to transactions.
- Applies organization scope where possible.
- Groups project/workflow charges under project buckets.
- Handles both `legacy_usd` and `plan_credit`.

Grouping behavior:

- Standalone purchases, bonuses, refunds, and admin adjustments remain standalone.
- Negative usage or plan-credit final charges are grouped by project when a project or project title exists.
- Deleted project usage can still show via stored `project_title`.
- Invoice numbers show for standalone purchases/refunds, not grouped project rows.

Audit concern:

- Standalone credit transactions do not have an organization column yet, so organization-filtered reads still include standalone user ledger rows. This is intentional compatibility behavior but matters for multi-org accounting.

## Organization Scope and Billing Permissions

Sources:

- `lib/api/billing-org-context.ts`
- `lib/authz/billing-permissions.ts`
- `lib/authz/billing-permission-rules.ts`
- `lib/authz/organization-context.ts`

Billing management permissions:

- `owner`
- `admin`
- `agency_admin` only for `internal_agency` organizations

Read permission helper exists:

- `canReadOrganizationBilling(...)` returns true for `owner`, `admin`, `agency_admin`, `agency_member`.

Audit concern:

- Most billing read routes inspected use `getBillingOrganizationContext(...)`, which validates active membership but does not call `canReadOrganizationBilling(...)`.
- That means editor/reader roles may be able to read billing/usage if they are active org members, depending on membership roles in the org model.
- Checkout, portal, and top-up purchase routes do require billing manager permissions.

## Admin Billing and Finance Tools

### Admin billing transactions

Path: `app/api/admin/billing/route.ts`

Purpose:

- Load recent credit transactions.
- Compute totals for purchases, refunds, and debits.
- Attach user emails via Supabase admin lookup.

Authorization:

- Bearer token.
- `isAdminEmail(user.email)`.

Audit notes:

- Totals are computed only from the currently paged rows, not a separate aggregate over all matching rows.
- It queries legacy `credit_transactions`.

### Admin add credits

Path: `app/api/admin/billing/add-credits/route.ts`

Purpose:

- Add legacy account credits to a user.

Authorization:

- Bearer token.
- `isAdminEmail`.

Audit concern:

- This is legacy account-credit based, not organization product-credit grant based.

### Admin editable pricing

Path: `app/api/admin/billing/prices/route.ts`

Source:

- `lib/billing/pricing-overrides.ts`
- `supabase/migrations/20260427120000_add_billing_price_overrides.sql`

Purpose:

- Load and save editable cost/price config.
- Logs admin audit events on update success/error.

Authorization:

- `requireAdmin(...)`.

### Admin manual Stripe payment processing

Path: `app/api/admin/process-stripe-payment/route.ts`

Purpose:

- Manually process a Stripe Checkout Session if webhooks failed.

Authorization:

- Bearer token.
- `isAdminEmail`.

Flow:

- Retrieve Stripe session.
- Confirm paid.
- Validate metadata user ID.
- Deduplicate by session ID in metadata.
- Validate package and amount.
- Add legacy account credits with `addCredit(...)`.

Audit concern:

- This recovery route appears legacy-only. It does not call `grantTopUpCredits(...)` even when the session metadata contains an organization ID. For current org-scoped top-up checkout, this may recover into the wrong ledger.

## Database Tables Related to Billing

Subscription and plan tables:

- `plans`
- `organization_subscriptions`
- `subscription_usage_counters`

Product-credit tables:

- `billing_credit_grants`
- `billing_reservation_credit_allocations`

Legacy/user-credit tables:

- `account_credits`
- `credit_transactions`
- `usage_events`
- `billing_reservations`

Pricing override table:

- `billing_price_overrides`

Important schema constraints:

- `organization_subscriptions.stripe_subscription_id` is unique.
- `plans.stripe_monthly_price_id` and `plans.stripe_annual_price_id` have unique indexes when not null.
- `billing_credit_grants.idempotency_key` is unique.
- `billing_reservation_credit_allocations` is unique per `(reservation_id, grant_id)`.
- `subscription_usage_counters` is unique per `(organization_id, period_start, period_end, counter_key)`.

RLS policies:

- Active org members can view plans/subscriptions/counters/grants/allocations.
- Service role can manage protected billing tables.
- `billing_price_overrides` is service-role only.

## Environment Variables and Launch Validation

Relevant env variables:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUBSCRIPTION_SUCCESS_URL`
- `STRIPE_SUBSCRIPTION_CANCEL_URL`
- `STRIPE_BILLING_PORTAL_RETURN_URL`
- `SUBSCRIPTION_ENFORCEMENT_MODE`
- `BILLING_TEST_MODE`

Scripts:

- `npm run validate:subscription-launch`
- `npm run validate:production-env`

`BILLING_TEST_MODE`:

- Enables mock Stripe client outside production.
- Used for local checkout/portal flows without real Stripe key.

`SUBSCRIPTION_ENFORCEMENT_MODE`:

- Defaults to dry-run.
- Only exact `enforce` enables hard entitlement enforcement.
- Invalid values fall back to dry-run and warn.

## Tests Covering Billing

Targeted test locations:

- `tests/billing/cost-map.test.ts`
- `tests/billing/credit-operations.test.ts`
- `tests/billing/usage-tracking.test.ts`
- `tests/billing/product-credits.test.ts`
- `tests/billing/nav-credit-display.test.ts`
- `tests/lib/subscription-checkout-portal-route.test.ts`
- `tests/lib/stripe-webhook-subscription.test.ts`
- `tests/lib/subscription-stripe-sync.test.ts`
- `tests/lib/subscription-entitlements.test.ts`
- `tests/lib/subscription-usage-counters.test.ts`
- `tests/lib/subscription-ui.test.ts`
- `tests/lib/current-subscription-route.test.ts`
- `tests/lib/billing-org-context.test.ts`
- `tests/lib/billing-permissions.test.ts`
- `tests/lib/billing-presentation.test.ts`
- `tests/lib/reserve-amount.test.ts`
- `tests/lib/subscription-launch-readiness.test.js`
- `tests/scripts/phase-8d-stripe-launch-verification.test.js`
- `tests/scripts/validate-production-env.test.js`

Useful commands:

- `npm run test -- tests/billing`
- `npm run test -- tests/lib/stripe-webhook-subscription.test.ts tests/lib/subscription-checkout-portal-route.test.ts tests/lib/subscription-stripe-sync.test.ts`
- `npm run validate:subscription-launch`
- `npm run test:api`

## High-Value Audit Questions

1. Can an active non-owner/non-admin org member read billing balances, transactions, or usage because billing read routes only validate active membership?
2. Can the one-time top-up webhook and `/api/stripe/verify-session` fallback race and double grant credits, or do `credit_transactions.payment_id` plus grant `idempotency_key` fully prevent it?
3. Should top-up checkout attach purchases to the existing organization Stripe customer instead of only using `customer_email`?
4. Should `app/api/admin/process-stripe-payment/route.ts` be updated to grant organization top-up credits when `organizationId` exists?
5. Should a durable `stripe_webhook_events` table be added for event-level idempotency and audit logs?
6. Should standalone `credit_transactions` get `organization_id` to remove legacy fallback ambiguity?
7. Should `/billing/success` and `/billing/cancel` be updated to product-credit copy and `/dashboard/billing` links?
8. Should usage page KPIs distinguish provider/API dollar cost from product-credit consumption?
9. Should `GET /api/subscriptions/current` mutating Free subscription/grant rows be treated as acceptable for reads?
10. Should admin billing totals aggregate over the full filtered dataset instead of only the current paged rows?
11. Should subscription usage counter idempotency move to a dedicated event table instead of bounded metadata arrays?
12. Should hard entitlement enforcement be enabled only after counters are proven complete for all upload/import/generation paths?

## Known Inconsistencies and Risk Notes

Stale copy:

- `/billing/success` says credits never expire.
- `/billing/cancel` says no monthly subscriptions and credits never expire.
- Current top-up credits expire after 12 months.
- Current product is subscription-first.

Formatting mismatch:

- `/billing/success` formats product credits through legacy USD-to-site-credit helpers.

Legacy/manual admin mismatch:

- Admin add-credit and manual Stripe processing endpoints operate on legacy account credits.
- Current top-ups are supposed to grant organization plan credits.

Read-scope mismatch:

- Billing management is owner/admin gated.
- Billing reads appear active-member gated, not billing-read-role gated.

Accounting model mismatch:

- Usage page displays `billed_cost` dollars.
- Billing page displays product credits when available.
- Transaction history can contain both `plan_credit` and `legacy_usd`.

Webhook auditability:

- No inspected persisted webhook event ledger.
- Domain idempotency exists but event-level reconciliation may be harder.

Mutation on read:

- Loading current subscription can create an active Free subscription and a current plan grant.

## Core Files to Audit First

- `components/billing/billing-dashboard.tsx`
- `app/dashboard/usage/page.tsx`
- `app/dashboard/settings/unified-settings.tsx`
- `app/api/subscriptions/checkout/route.ts`
- `app/api/subscriptions/portal/route.ts`
- `app/api/subscriptions/current/route.ts`
- `app/api/stripe/create-checkout/route.ts`
- `app/api/stripe/verify-session/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/billing/balance/route.ts`
- `app/api/billing/transactions/grouped/route.ts`
- `app/api/billing/usage/route.ts`
- `lib/billing/plans.ts`
- `lib/billing/subscriptions.ts`
- `lib/billing/plan-credits.ts`
- `lib/billing/credit.ts`
- `lib/billing/grouped-transactions.ts`
- `lib/billing/entitlement-guards.ts`
- `lib/billing/subscription-usage-counters.ts`
- `lib/billing/cost-map.ts`
- `lib/authz/billing-permissions.ts`
- `lib/authz/billing-permission-rules.ts`
- `lib/api/billing-org-context.ts`
- `app/api/admin/billing/route.ts`
- `app/api/admin/billing/add-credits/route.ts`
- `app/api/admin/process-stripe-payment/route.ts`
- `app/api/admin/billing/prices/route.ts`

