# Phase 2C: Subscription Billing UI Surface

Date: 2026-06-04

## Scope

This phase exposes subscription plans and current organization subscription state in the authenticated billing UI.

In scope:
- Authenticated billing page subscription plan display
- Current organization subscription status display
- Stripe subscription checkout button wiring
- Stripe customer portal button wiring
- Lightweight client hooks for subscription UI data/actions
- Existing credit/pay-as-you-go UI preservation
- Focused helper tests

Out of scope:
- Subscription entitlement enforcement
- Blocking upload, transcription, generation, or imports
- Removing credit/pay-as-you-go behavior
- Removing one-time credit checkout
- Stripe webhook/backend checkout changes
- Public pricing or marketing page changes
- Agency clients
- Slack or Granola integrations
- Broad dashboard redesign

## UI Surfaces Changed

### `app/dashboard/billing/page.tsx`

Updated the page subtitle to include subscription plans while preserving the existing page layout and `UnifiedSettings` billing section.

### `app/dashboard/settings/unified-settings.tsx`

Added the subscription plan surface above credit top-ups in the existing billing section.

Existing billing data remains:
- credit balance
- credit top-up packages
- grouped transaction history
- transaction search/export/pagination

### `components/billing/subscription-plans.tsx`

New component that displays:
- current organization
- current subscription status
- current plan name when available
- available active plans
- monthly price or custom price marker
- high-level limits
- current plan state
- subscription checkout actions
- customer portal action when a Stripe customer exists

The component is intentionally small and sits inside the existing billing card flow rather than redesigning the dashboard.

### `components/billing/credit-packages.tsx`

Updated only the transitional copy:
- pay-as-you-go top-ups remain available
- credits still never expire

The existing one-time Stripe credit checkout route is unchanged.

## Hooks and Helpers Added

### `lib/hooks/usePlans.ts`

Fetches active plans from:
- `GET /api/plans`

Returns:
- `plans`
- `loading`
- `error`
- `refresh`

### `lib/hooks/useCurrentSubscription.ts`

Fetches current organization subscription state from:
- `GET /api/subscriptions/current`

Behavior:
- includes `organization_id` when the Phase 1E current organization context is available
- relies on backend default organization fallback when it is not available
- returns organization, membership, subscription, and entitlements

### `lib/hooks/useSubscriptionCheckout.ts`

Adds client actions for:
- `POST /api/subscriptions/checkout`
- `POST /api/subscriptions/portal`

Behavior:
- includes `organization_id` when available
- redirects only to URLs returned by the backend
- leaves all security-sensitive validation on the server

### `lib/billing/subscription-ui.ts`

Pure display helpers for:
- plan pricing
- plan limits
- subscription status labels
- plan action labels and disabled states

## APIs Consumed

- `GET /api/plans`
- `GET /api/subscriptions/current`
- `POST /api/subscriptions/checkout`
- `POST /api/subscriptions/portal`

No Stripe webhook behavior was changed in this phase.

## Credit UI Preservation

Credit/pay-as-you-go behavior remains active:
- credit balance is still shown
- credit package purchases are still shown
- existing one-time credit checkout remains available
- grouped transactions remain visible
- subscription status does not block usage

Reason:
- Phase 2C is a visibility and customer-action surface only.
- Enforcement and any migration away from credits must happen in a later explicit phase.

## Limitations

- Plans without `stripe_price_id` render with a disabled `Not configured` action.
- Customer portal only appears when the current organization subscription row has a Stripe customer ID.
- Billing role permissions are still active-member based through existing backend organization checks; owner/admin-only subscription management is deferred.
- Subscription entitlements remain informational and are not enforced.

## Tests Added

New test:
- `tests/lib/subscription-ui.test.ts`

Coverage:
- plan price formatting
- plan limit formatting
- subscription status labels
- current/unconfigured plan action states
- checkout-enabled plan action state

## Next Steps for Phase 2D

Recommended next phase:
1. Add owner/admin billing management permissions for checkout and portal actions.
2. Add clearer current-plan UI once real Stripe price IDs are populated.
3. Decide entitlement enforcement strategy and grace periods.
4. Add enforcement only after subscription state has been visible and testable.
5. Keep credit/pay-as-you-go migration separate from subscription UI.
