# Phase 2G: Billing Permissions and Owner/Admin Controls

## Summary

Phase 2G restricts subscription billing management to organization billing managers while preserving existing billing read access for active members.

Management actions now require one of:

- `owner`
- `admin`
- `agency_admin` only when the organization type is `internal_agency`

Active members can still read billing and subscription summaries where that was the existing behavior.

## Permission Helpers

Added:

- `lib/authz/billing-permission-rules.ts`
- `lib/authz/billing-permissions.ts`

Rule helpers:

- `canManageOrganizationBilling(role, organizationType)`
- `canReadOrganizationBilling(role)`

Server helper:

- `requireOrganizationBillingManager(...)`

The server helper first resolves active organization membership through the existing organization context helper, then rejects non-manager roles with `403`.

## Restricted Routes

The following routes now require billing manager access:

- `POST /api/subscriptions/checkout`
- `POST /api/subscriptions/portal`

These routes still validate organization membership before role checks, so cross-organization access remains blocked by the existing active-membership requirement.

Non-managers receive:

```json
{
  "error": "Billing management requires organization owner or admin access"
}
```

with status `403`.

## Routes Left Readable

The following routes remain readable by active organization members:

- `GET /api/subscriptions/current`
- `GET /api/subscriptions/entitlements`
- `GET /api/subscriptions/usage-counters`
- `GET /api/billing/balance`
- `GET /api/billing/usage`
- `GET /api/billing/transactions`
- `GET /api/billing/transactions/grouped`
- `GET /api/billing/costs`

This preserves the current dashboard behavior where teammates can review usage, limits, subscription status, and billing history. Future phases can narrow read access after deciding how seat/member roles should work in customer workspaces.

## UI Changes

Updated:

- `components/billing/subscription-plans.tsx`

The billing UI now uses the current subscription response's membership role to:

- hide the Stripe customer portal button for non-managers
- disable checkout/upgrade buttons for non-managers

The backend remains the source of truth. Client-side gating is only a UX guard.

## Stripe And Enforcement Boundaries

Unchanged:

- Stripe webhook behavior
- one-time credit checkout
- subscription entitlement enforcement
- subscription usage counters
- public pricing/marketing pages

## Future Team And Seat Implications

When team invitations and seats become first-class product surfaces, billing read access may need a separate role policy. For now:

- owners/admins manage billing
- active members can see billing/subscription read models
- agency-member behavior remains read-only unless the organization is internal agency and the role is `agency_admin`
