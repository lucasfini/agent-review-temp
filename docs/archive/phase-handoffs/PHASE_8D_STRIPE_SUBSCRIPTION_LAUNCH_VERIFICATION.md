# Phase 8D: Stripe and Subscription Launch Verification

Phase 8D verifies subscription billing readiness for launch without changing Stripe checkout, webhook behavior, pay-as-you-go credits, billing UI, or subscription enforcement defaults.

Status: Ready for staging Stripe validation after code review.

## Summary

The codebase already has the required subscription launch paths:
- `POST /api/subscriptions/checkout` creates organization-scoped Stripe subscription checkout sessions.
- `POST /api/subscriptions/portal` creates organization-scoped billing portal sessions.
- `POST /api/stripe/webhook` verifies Stripe signatures and syncs subscription lifecycle events.
- `npm run validate:subscription-launch` performs static env checks and read-only Supabase checks for active plans and usage counter readability.
- `SUBSCRIPTION_ENFORCEMENT_MODE` defaults to `dry_run` in local and production env examples.

No real Stripe secrets were added.

## Stripe Dashboard Setup

Create or verify Stripe products and recurring prices for subscription plans:

```text
starter
growth
scale
enterprise/custom
```

Rules:
- `starter`, `growth`, and `scale` need recurring Stripe `price_...` IDs before self-serve launch.
- `enterprise` must be deliberately handled:
  - configure a recurring Stripe price if it is self-serve, or
  - keep it out of self-serve checkout if it remains custom/sales-led.
- Every active self-serve plan in `plans` must map to the intended Stripe product.
- `plans.stripe_price_id` is the source for subscription checkout price IDs.
- Price currency must match `plans.currency`.
- Stripe price amount must match `plans.monthly_price_cents`.
- Placeholder IDs such as `price_starter`, `price_growth`, `replace-me`, or `mock` must not be present in production.

Run after the target Supabase database is reachable:

```bash
npm run validate:subscription-launch
```

For a known test organization:

```bash
npm run validate:subscription-launch -- --organization-id <organization_id>
```

Expected result:
- no missing required Stripe env vars
- active plans are present
- active plans have Stripe price IDs
- `subscription_usage_counters` is readable
- enforcement mode reports `dry_run` unless a manual staging enforcement test is explicitly underway

## Required Environment

Required:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

Recommended redirect overrides:

```text
STRIPE_SUBSCRIPTION_SUCCESS_URL
STRIPE_SUBSCRIPTION_CANCEL_URL
STRIPE_BILLING_PORTAL_RETURN_URL
```

Notes:
- Leave redirect overrides blank to use app defaults.
- Any configured redirect override must resolve to the same app origin.
- Do not commit Stripe secret keys, webhook secrets, customer IDs, or environment-specific publishable keys.
- Local `--skip-db` validation may warn when optional redirect overrides are unset; that is not a launch blocker if the default app URLs are correct.

## Checkout Verification

Route:

```text
POST /api/subscriptions/checkout
```

Code checks verified:
- requires an authenticated user
- blocks demo users
- requires organization owner/admin billing permissions
- loads an active plan by slug or ID
- rejects plans without `stripePriceId`
- rejects obvious placeholder price IDs in production
- creates or reuses the organization Stripe customer
- stores `organization_id`, `user_id`, `plan_id`, and `plan_slug` in checkout and subscription metadata
- uses same-origin success and cancel URLs
- does not credit pay-as-you-go balance from subscription checkout

Manual test-mode checkout:
1. Confirm `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`.
2. Confirm test-mode Stripe products/prices are configured in `plans.stripe_price_id`.
3. Log in as an organization owner.
4. Start checkout for `starter`.
5. Complete payment with a Stripe test card.
6. Confirm redirect returns to `/dashboard/billing?subscription=success&session_id=<checkout_session_id>` or an approved same-origin success override.
7. Confirm Stripe dashboard shows the subscription under the organization customer.
8. Confirm webhook delivery syncs `organization_subscriptions`.
9. Confirm no one-time credit balance is added by subscription checkout.
10. Repeat for `growth` and `scale`.

Manual live-mode checkout:
1. Switch app env to live Stripe keys and live webhook secret.
2. Confirm live Stripe prices are in `plans.stripe_price_id`.
3. Run `npm run validate:subscription-launch`.
4. Complete one low-risk live checkout with a real organization owner.
5. Confirm webhook delivery and current subscription state.
6. Keep `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`.

## Portal Verification

Route:

```text
POST /api/subscriptions/portal
```

Code checks verified:
- requires an authenticated user
- requires organization owner/admin billing permissions
- looks up the organization Stripe customer
- returns 404 if no Stripe customer exists
- creates a Stripe billing portal session for that customer
- uses a same-origin return URL
- does not mutate local subscription rows directly

Stripe dashboard setup:
- Enable Stripe Billing Portal.
- Allow the launch-approved customer actions only:
  - payment method update
  - invoice viewing
  - plan changes only if approved for launch
  - cancellation only if approved for launch
- Configure dashboard branding and support links.

Manual portal test:
1. Use an organization with a synced `stripe_customer_id`.
2. Log in as organization owner/admin.
3. Open the billing portal action.
4. Confirm the portal opens for the correct Stripe customer.
5. Return to `/dashboard/billing`.
6. Confirm member users receive 403 from `POST /api/subscriptions/portal`.
7. Confirm opening the portal does not directly mutate `organization_subscriptions`.

## Webhook Verification

Route:

```text
POST /api/stripe/webhook
```

Supported launch events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Existing pay-as-you-go compatibility event:

```text
charge.refunded
```

Webhook setup:
1. Create a Stripe webhook endpoint:

```text
https://<production-domain>/api/stripe/webhook
```

2. Subscribe to the launch events listed above.
3. Store the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Confirm the Stripe dashboard shows 2xx deliveries.
5. Confirm webhook logs do not print secrets, raw card data, or customer portal URLs.

Code checks verified:
- verifies `stripe-signature`
- rejects missing or invalid signatures
- routes subscription checkout sessions away from pay-as-you-go credit grants
- retrieves expanded subscription price data before sync
- syncs subscription rows by Stripe subscription/customer and organization metadata
- preserves an existing organization if Stripe metadata disagrees
- skips new syncs for unknown organizations
- maps Stripe statuses to internal subscription statuses
- syncs invoice payment events through the current Stripe subscription

## Failed Payment Test

Use Stripe test mode.

Steps:
1. Complete subscription checkout with a payment method that can later fail, or use Stripe test tools to trigger `invoice.payment_failed`.
2. Confirm webhook delivery.
3. Confirm `organization_subscriptions.status` reflects the Stripe status after sync.
4. Confirm `/api/subscriptions/current` remains readable.
5. Confirm no pay-as-you-go credits are added or removed.
6. Keep enforcement in `dry_run` unless manually testing enforcement in staging.

Expected result:
- failed payment does not crash billing pages
- current subscription state remains org-scoped
- hard blocking does not occur while enforcement is `dry_run`

## Cancellation Test

Use Stripe test mode.

Steps:
1. Cancel from the Stripe dashboard or billing portal if portal cancellation is enabled.
2. Confirm `customer.subscription.updated` or `customer.subscription.deleted` webhook delivery.
3. Confirm `cancel_at_period_end` and/or `status` are synced.
4. Confirm `/api/subscriptions/current` shows the updated state.
5. Confirm credits/pay-as-you-go purchase flows still work.

Expected result:
- subscription row updates, not deletes
- org membership and historical usage counters remain intact
- no default enforcement is enabled

## Enforcement Rollout

Default and launch mode:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

Rules:
- Do not enable `enforce` by default.
- Do not enable `enforce` in production without Lucas explicitly approving it.
- Use `enforce` only in staging after Stripe checkout, webhook, portal, failed-payment, and cancellation tests pass.
- Invalid enforcement values fall back to `dry_run`.

Dry-run expectations:
- entitlement decisions are logged/reported
- expensive actions remain compatible with current credit/pay-as-you-go behavior
- no subscription state blocks production users

Enforce staging expectations:
- missing subscription returns `402 subscription_required`
- inactive subscription returns `402 subscription_inactive`
- limit exceeded returns `429 subscription_limit_exceeded`
- blocked requests do not record subscription usage counters

## Rollback Procedure

Fast rollback:
1. Set:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

2. Redeploy/restart the app.
3. Confirm expensive actions are no longer blocked by subscription state.
4. Keep Stripe webhooks enabled unless webhook processing itself is the incident.

Stripe/config rollback:
- Revert app env to previous Stripe keys only if a key-mode mismatch caused the issue.
- Disable or correct newly added Stripe webhook endpoints from the Stripe dashboard if they point to the wrong domain.
- Do not delete subscription rows, customer IDs, usage counters, credit transactions, or webhook-created records as rollback.
- Do not remove pay-as-you-go credit purchase compatibility.

Plan rollback:
- If a Stripe price is wrong, create a corrected Stripe price and update `plans.stripe_price_id` through a reviewed database change.
- Do not edit historical Stripe prices in place.
- Do not use placeholder price IDs as a temporary production fix.

## Launch Blockers

Block launch if any are true:
- Required Stripe env vars are missing.
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` are not from the same Stripe mode.
- Active self-serve plans are missing `plans.stripe_price_id`.
- Production `plans.stripe_price_id` contains placeholder values.
- Stripe prices do not match app plan amounts/currency.
- Billing Portal is not enabled before portal links are exposed.
- Production webhook endpoint is not configured for the launch events.
- Staging webhook deliveries do not return 2xx.
- Subscription checkout credits pay-as-you-go balance.
- `SUBSCRIPTION_ENFORCEMENT_MODE` is anything other than `dry_run` without explicit approval.

## Validation Commands

Run locally:

```bash
npx tsc --noEmit
npm run -s lint
npm run validate:subscription-launch -- --skip-db
npx jest tests/lib/subscription-launch-readiness.test.js tests/lib/subscription-checkout-portal-route.test.ts tests/lib/stripe-webhook-subscription.test.ts tests/lib/subscription-stripe-sync.test.ts tests/lib/entitlement-guards.test.ts tests/scripts/phase-8d-stripe-launch-verification.test.js --runInBand
git diff --check
```

Run against staging after env and database are configured:

```bash
npm run validate:subscription-launch -- --organization-id <organization_id>
```

## Review Checklist

- Stripe checklist is complete: yes.
- No real secrets included: yes.
- No default enforcement enabled: yes.
- Existing credit behavior remains: yes.
- Customer portal setup is explicitly manual/dashboard-gated: yes.
- Webhook events are listed and mapped to app behavior: yes.
- Rollback procedure keeps billing records intact: yes.
