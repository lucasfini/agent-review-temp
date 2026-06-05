# Phase 2H: Subscription Launch QA and Staging Checklist

## Summary

Phase 2H is the launch checklist for subscription billing before enabling hard subscription enforcement outside staging.

This phase adds no product behavior. It provides:

- human QA checklist
- Stripe test-mode checklist
- webhook event checklist
- plan and price setup checklist
- enforcement rollout checklist
- rollback checklist
- read-only readiness script

## Read-Only Readiness Script

Added:

```bash
npm run validate:subscription-launch
```

Optional organization-scoped checks:

```bash
npm run validate:subscription-launch -- --organization-id org_123
```

Config-only local check when database/network access is unavailable:

```bash
npm run validate:subscription-launch -- --skip-db
```

The script is read-only. It checks environment configuration and, when Supabase credentials are available, reads:

- active plans
- active plan Stripe price IDs
- organization subscription rows, when `--organization-id` is provided
- subscription usage counter table readability
- organization usage counter count, when `--organization-id` is provided
- effective `SUBSCRIPTION_ENFORCEMENT_MODE`

It does not create, update, delete, or backfill production data.

## Required Environment Variables

Set these in staging before QA:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
SUBSCRIPTION_ENFORCEMENT_MODE
```

Set these if custom redirects are used:

```text
STRIPE_SUBSCRIPTION_SUCCESS_URL
STRIPE_SUBSCRIPTION_CANCEL_URL
STRIPE_BILLING_PORTAL_RETURN_URL
```

Recommended operational variables that should already exist for full app QA:

```text
APP_DOMAIN
ACME_EMAIL
CRON_SECRET
INTERNAL_JOB_SECRET
UPLOAD_TOKEN_SECRET
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY
OPENAI_API_KEY or OPENAI_API_KEY_OPTIN
```

Do not paste secrets into tickets, docs, logs, screenshots, or pull request comments.

## Stripe Test-Mode Setup

Use Stripe test mode for staging QA.

Create or verify Stripe products and recurring prices for every active plan in `plans`:

- each active `plans.slug` maps to the intended Stripe product
- each active plan has a test-mode recurring `price_...` ID in `plans.stripe_price_id`
- price currency matches `plans.currency`
- price amount matches `plans.monthly_price_cents`
- billing interval is monthly unless product strategy explicitly says otherwise
- placeholder price IDs such as `price_starter`, `price_growth`, or `replace-me` are not present in staging

Run:

```bash
npm run validate:subscription-launch
```

Expected:

- no missing required env vars
- at least one active plan
- no active plans missing Stripe price IDs
- `subscription_usage_counters` table is readable

## Billing Portal Configuration

In Stripe test mode, configure the Billing Portal before testing portal flows:

- allow customers to update payment methods
- allow customers to view invoices
- allow plan changes only if the launch policy supports them
- configure cancellation behavior intentionally
- set business profile and support contact
- verify return URL is the staging billing page

Expected portal return URL:

```text
/dashboard/billing
```

or the configured `STRIPE_BILLING_PORTAL_RETURN_URL`.

## Webhook Endpoint Setup

Configure a staging webhook endpoint pointing to:

```text
https://<staging-domain>/api/stripe/webhook
```

Required events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Recommended invoice/payment events for operational monitoring:

- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.finalized`

Verify:

- webhook signing secret is stored as `STRIPE_WEBHOOK_SECRET`
- endpoint uses test-mode events in staging
- endpoint does not point production events at staging
- webhook logs show `2xx` responses for supported subscription lifecycle events
- one-time credit checkout events still behave as before

## Staging QA Checklist

Start staging in dry-run mode:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

Run:

```bash
npm run validate:production-env
npm run validate:subscription-launch
```

Then verify:

- `/dashboard/billing` loads for an authenticated owner
- current subscription card renders without console errors
- active plans render with expected names, prices, and limits
- owner can see subscription checkout actions
- admin can see subscription checkout actions
- member can read the subscription status but cannot manage billing
- Stripe customer portal button appears only when a Stripe customer exists and the user is a billing manager
- credit top-ups remain available during the subscription transition

## Test Checkout Flow

Use an organization owner or admin.

1. Open `/dashboard/billing`.
2. Choose a configured plan.
3. Start checkout.
4. Confirm redirect goes to Stripe Checkout test mode.
5. Complete checkout with a Stripe test card.
6. Confirm redirect returns to `/dashboard/billing?subscription=success`.
7. Confirm `organization_subscriptions` syncs after webhook delivery.
8. Run:

   ```bash
   npm run validate:subscription-launch -- --organization-id <organization_id>
   ```

Expected:

- checkout session includes organization metadata
- subscription row has the correct organization ID
- subscription status becomes `active` or `trialing`
- plan ID matches the selected plan
- no one-time credit balance is added by subscription checkout

## Test Customer Portal Flow

Use an organization owner or admin with a Stripe customer ID.

1. Open `/dashboard/billing`.
2. Click the customer portal action.
3. Confirm redirect goes to Stripe Billing Portal test mode.
4. Update payment method or view billing details.
5. Return to the app.

Expected:

- portal opens only for owner/admin billing managers
- member users receive `403` from `POST /api/subscriptions/portal`
- portal return URL lands on the staging billing page
- no local subscription row is directly mutated by opening the portal

## Test Subscription Status Changes

Use Stripe test mode and webhook event logs.

Verify these lifecycle changes:

- create subscription from checkout
- update subscription plan or metadata in Stripe
- mark subscription `past_due` through payment failure testing
- cancel at period end
- delete/cancel immediately if supported by launch policy

Expected:

- `organization_subscriptions.status` maps to the internal status
- `current_period_start` and `current_period_end` update when Stripe sends period data
- stale Stripe metadata does not override an existing persisted organization mapping
- current subscription API reflects the latest usable or inactive state

## Test Payment Failure

In Stripe test mode:

1. Use a test card or test clock scenario that causes payment failure.
2. Confirm webhook delivery.
3. Refresh `/dashboard/billing`.
4. Check `/api/subscriptions/current`.

Expected:

- subscription status shows `past_due`, `unpaid`, or the Stripe-mapped equivalent
- current subscription remains readable
- hard enforcement, when later enabled, blocks expensive actions for inactive subscriptions
- credit/pay-as-you-go checks are unchanged

## Test Cancellation

In Stripe test mode:

1. Cancel through Billing Portal or Stripe Dashboard.
2. Confirm webhook delivery.
3. Refresh `/dashboard/billing`.
4. Check `/api/subscriptions/current`.

Expected:

- `cancel_at_period_end` reflects scheduled cancellation when applicable
- immediate cancellation maps to inactive/canceled state
- plan and usage read APIs remain stable
- no usage counters are deleted

## Dry-Run Enforcement QA

With:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

Exercise:

- upload init
- URL import
- transcription
- content generation
- queued project generation
- Zoom import
- Microsoft import
- YouTube import

Expected:

- no request is blocked by subscription entitlements
- logs include entitlement dry-run decisions
- existing credit/pay-as-you-go checks still apply
- usage counters record only after successful completion points

## Staging Enforce QA

Only after dry-run checks are clean, set staging to:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=enforce
```

Test these cases:

- missing subscription returns `402 subscription_required`
- inactive subscription returns `402 subscription_inactive`
- usage limit exceeded returns `429 subscription_limit_exceeded`
- within-limit request continues to existing credit checks
- blocked request does not create a credit reservation
- blocked request does not record a subscription usage counter
- internal/background worker paths remain safe

Run:

```bash
npm run validate:subscription-launch -- --organization-id <organization_id>
```

Expected:

- script reports `Enforcement mode: enforce`
- active plans still have Stripe price IDs
- subscription and usage counter reads still work

## Production Rollout Checklist

Before production:

- staging checkout passed
- staging portal passed
- staging webhook events passed
- dry-run logs reviewed
- enforce-mode staging tests passed
- billing manager permissions verified
- support team knows error response shapes
- rollback owner is identified
- Stripe live-mode products and prices are configured
- production webhook endpoint is configured with live-mode events
- production env vars are present

Production order:

1. Deploy code with `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`.
2. Run `npm run validate:production-env`.
3. Run `npm run validate:subscription-launch`.
4. Complete a live-mode internal checkout using a real internal test account if policy allows.
5. Review webhooks and current subscription state.
6. Review dry-run entitlement logs.
7. Schedule enforcement switch separately.
8. Set `SUBSCRIPTION_ENFORCEMENT_MODE=enforce` only after approval.

## Rollback Procedure

Fast rollback for enforcement:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

or remove the variable.

Expected rollback effect:

- subscription entitlement decisions return to logging/reporting only
- expensive actions are not blocked by subscription state
- existing credit/pay-as-you-go checks remain active
- Stripe checkout and webhook behavior remain unchanged

If Stripe checkout itself must be paused:

- remove or deactivate Stripe price IDs from active plan rows only through a reviewed database change
- or disable subscription plan visibility in a separate reviewed product change

Do not delete subscription rows, customer IDs, usage counters, or webhook records as rollback.

## Final Signoff

Before switching production enforcement to `enforce`, capture:

- staging QA date
- tested app commit
- Stripe test-mode webhook event IDs
- tested plan slugs and Stripe price IDs
- tested organization ID
- validation command output
- approver for production enforcement
