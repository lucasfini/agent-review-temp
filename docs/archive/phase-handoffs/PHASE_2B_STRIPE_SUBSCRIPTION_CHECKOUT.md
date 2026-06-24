# Phase 2B: Stripe Subscription Checkout + Customer Portal

Date: 2026-06-04

## Scope

This phase adds Stripe subscription checkout, Stripe customer portal support, and webhook synchronization for organization subscriptions.

In scope:
- Organization-based subscription checkout route
- Organization-based Stripe customer portal route
- Stripe webhook subscription lifecycle synchronization
- Subscription/customer helper functions
- Environment documentation
- Focused tests

Out of scope:
- Subscription limit enforcement
- Blocking upload, generation, transcription, or import flows
- Removing credit/pay-as-you-go behavior
- Billing UI redesign
- Agency clients
- Slack or Granola integrations
- Public pricing or marketing page changes
- Broad RLS rewrites or `organization_id` NOT NULL enforcement

## Current Stripe Behavior Before Phase 2B

Existing one-time credit behavior:
- `app/api/stripe/create-checkout/route.ts` creates Stripe Checkout sessions with `mode: payment`.
- Checkout uses inline `price_data` from the selected credit package.
- Session metadata includes `userId`, `packageId`, and optional `customAmount`.
- `app/api/stripe/webhook/route.ts` handles `checkout.session.completed` by adding credits to the user account.
- `app/api/stripe/webhook/route.ts` handles `charge.refunded` by deducting proportional credits.
- `app/api/stripe/verify-session/route.ts` remains a local-development fallback for one-time credit sessions.

Phase 2B preserves all of that behavior.

## APIs Added

### `POST /api/subscriptions/checkout`

Creates a Stripe Checkout session in `mode: subscription`.

Behavior:
- Requires an authenticated user.
- Rejects demo users.
- Resolves active organization context with existing organization helpers.
- Accepts `planSlug`, `plan_slug`, `planId`, or `plan_id`.
- Accepts optional `organization_id` / `organizationId` only after active membership validation.
- Requires the selected plan to be active.
- Requires `plans.stripe_price_id` for checkout.
- In production, rejects obvious placeholder or mock price IDs such as `price_starter`.
- Creates or reuses a Stripe customer for the organization.
- Stores the organization Stripe customer ID in `organization_subscriptions` when needed.
- Adds metadata to both the Checkout session and created Stripe subscription:
  - `organization_id`
  - `user_id`
  - `plan_id`
  - `plan_slug`
- Returns `{ success, sessionId, url, organization, plan }`.

Redirect URLs:
- Defaults:
  - success: `/dashboard/billing?subscription=success&session_id={CHECKOUT_SESSION_ID}`
  - cancel: `/dashboard/billing?subscription=cancel`
- Optional request/env overrides are accepted only when they resolve to the current app origin.

### `POST /api/subscriptions/portal`

Creates a Stripe Billing Portal session.

Behavior:
- Requires an authenticated user.
- Resolves active organization context.
- Looks up `stripe_customer_id` for the validated organization.
- Returns `404` when no Stripe customer exists.
- Does not create or mutate subscription records.
- Returns `{ success, url }`.

Return URL:
- Defaults to `/dashboard/billing`.
- Optional request/env overrides are accepted only when they resolve to the current app origin.

## Webhook Changes

Updated:
- `app/api/stripe/webhook/route.ts`

Preserved:
- Stripe signature verification.
- One-time credit checkout handling for `checkout.session.completed` where `session.mode !== 'subscription'`.
- Refund handling for `charge.refunded`.

Added subscription handling:
- `checkout.session.completed` when `mode === 'subscription'`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Webhook synchronization writes to `organization_subscriptions`:
- `stripe_customer_id`
- `stripe_subscription_id`
- `plan_id`
- `status`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `trial_start`
- `trial_end`
- `metadata_json`

Idempotency:
- Existing rows are looked up first by `stripe_subscription_id`.
- If no subscription row exists yet, existing Stripe customer rows are reused.
- This avoids duplicate rows when checkout first stores an organization customer and the subscription webhook later arrives.

Organization metadata safety:
- Existing persisted subscription/customer organization mappings take precedence over mutable Stripe metadata.
- If Stripe metadata disagrees with an existing persisted mapping, the existing organization is retained and the mismatch is logged.
- New unmapped subscription rows validate that the metadata organization exists before writing.
- If the organization cannot be resolved, the event is logged and skipped without crashing the webhook handler.

Plan and metadata fallback:
- Webhook sync prefers the current Stripe subscription item price when it maps to `plans.stripe_price_id`.
- If price mapping is unavailable, it falls back to subscription metadata (`plan_id` / `plan_slug`).
- Existing rows are used as a final fallback where possible.

## Helpers Added

Updated:
- `lib/billing/plans.ts`
- `lib/billing/subscriptions.ts`

Key additions:
- `getPlanBySlugOrId(...)`
- `getPlanByStripePriceId(...)`
- `mapStripeSubscriptionStatus(...)`
- `getStripeSubscriptionPeriod(...)`
- `getStripeSubscriptionPriceId(...)`
- `getOrganizationStripeCustomerId(...)`
- `storeOrganizationStripeCustomerId(...)`
- `upsertOrganizationSubscriptionFromStripe(...)`

Stripe status mapping:
- `active` -> `active`
- `trialing` -> `trialing`
- `past_due` -> `past_due`
- `canceled` -> `canceled`
- `unpaid` -> `unpaid`
- `incomplete` -> `incomplete`
- `incomplete_expired` -> `incomplete_expired`
- `paused` or unknown -> `inactive`

The Phase 2A schema does not include `paused`, so it is mapped defensively to `inactive` until a later schema decision.

## Required Environment

Required:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Existing public Stripe key:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Optional redirect overrides:
- `STRIPE_SUBSCRIPTION_SUCCESS_URL`
- `STRIPE_SUBSCRIPTION_CANCEL_URL`
- `STRIPE_BILLING_PORTAL_RETURN_URL`

Required database setup:
- Populate `plans.stripe_price_id` for self-serve plans:
  - `starter`
  - `growth`
  - `scale`
  - `enterprise` if self-serve

Stripe Dashboard setup:
- Create recurring Stripe Prices for each self-serve plan.
- Configure the Stripe Billing Portal.
- Ensure webhook endpoint sends relevant subscription events.

Do not commit real secrets.

## Credit Behavior Preservation

Credit/pay-as-you-go behavior remains active:
- Existing credit checkout route is unchanged.
- Existing verify-session route is unchanged.
- Existing credit transaction logic is unchanged.
- Existing billing tests still pass.
- Subscription status does not block usage.

## No Enforcement Yet

Subscription entitlements remain report-only:
- No upload flow checks subscription status.
- No generation flow checks subscription status.
- No transcription flow checks subscription status.
- No plan limits are enforced.

Enforcement decisions are deferred to a later phase.

## Validation

Phase 2B validation should include:
- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/route-auth.test.ts tests/lib/current-organization.test.ts tests/lib/billing-org-context.test.ts`
- `npx jest --runInBand tests/billing/credit-operations.test.ts tests/billing/usage-tracking.test.ts`
- New Phase 2B subscription/Stripe tests

## Next Steps

1. Review Phase 2B before committing.
2. Populate production `plans.stripe_price_id` values.
3. Configure Stripe Billing Portal.
4. Test subscription checkout in Stripe test mode.
5. Defer entitlement enforcement to a later phase.
