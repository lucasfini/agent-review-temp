# Phase 1F: Billing and Usage Organization Context Preparation

Date: 2026-06-03

## Scope

Prepared existing credit/pay-as-you-go billing and usage reads for organization context.

In scope:
- `app/api/billing/balance/route.ts`
- `app/api/billing/usage/route.ts`
- `app/api/billing/transactions/route.ts`
- `app/api/billing/transactions/grouped/route.ts`
- `app/api/billing/costs/route.ts`
- `app/api/dashboard/settings/route.ts` billing helper calls only
- `lib/billing/credit.ts`
- `lib/billing/grouped-transactions.ts`
- minimal billing frontend request propagation

Out of scope:
- Subscription billing
- Plans/subscriptions tables
- Stripe checkout/webhook subscription changes
- Pricing/product positioning changes
- Agency, Slack, or Granola features
- Broad RLS changes

## Helpers Added

New files:
- `lib/billing/organization-scope.ts`
- `lib/api/billing-org-context.ts`

Behavior:
- Reads optional `organization_id` from the request query string.
- Validates the authenticated user is an active organization member.
- Falls back to the user's default `personal_legacy` organization when omitted.
- Builds the reusable Supabase OR filter:
  - `organization_id = resolved_org_id`
  - OR `organization_id IS NULL AND user_id = authenticated_user_id`

Active membership is sufficient for this preparation phase. Owner/admin billing roles are deferred to subscription billing.

## Route Behavior Changes

## `/api/billing/balance`

Before:
- Authenticated bearer user.
- Returned user credit balance from `account_credits`.

After:
- Resolves/validates billing organization context.
- Still returns user credit balance.

Reason:
- `account_credits` has no `organization_id` yet, so balance cannot safely become organization-owned without schema and payment-flow changes.
- Current credit/pay-as-you-go behavior is preserved.

## `/api/billing/usage`

Before:
- `usage_events.user_id = authenticated user`.

After:
- `usage_events.organization_id = resolved_org_id`
- OR legacy fallback: `usage_events.organization_id IS NULL AND usage_events.user_id = authenticated user`.

Existing query params and response shape are preserved.

## `/api/billing/costs`

Before:
- Aggregated `usage_events` by authenticated `user_id`.

After:
- Aggregates org-scoped `usage_events` with legacy fallback.
- Existing `timeframe`, `groupBy`, and response shape are preserved.

## `/api/billing/transactions`

Before:
- Read `credit_transactions.user_id = authenticated user`.

After:
- Validates organization context.
- Keeps standalone credit ledger entries user-scoped where no organization data exists.
- Filters linked usage/reservation transactions through org-scoped `usage_events` and `billing_reservations` where possible.

## `/api/billing/transactions/grouped`

Before:
- Grouped all user `credit_transactions` with user-scoped usage details.

After:
- Validates organization context.
- Uses org-scoped `billing_reservations` and `usage_events` when grouping linked workflow/project usage.
- Keeps standalone credit ledger entries user-scoped.

## Dashboard Settings Aggregate

`app/api/dashboard/settings/route.ts` now passes organization context into:
- `getGroupedTransactions`
- `getUsageHistory`

Balance remains user-scoped. Integration rows remain unchanged.

## Tables Using Organization Context

Org-scoped with legacy fallback:
- `usage_events`
- `billing_reservations`

Still user-scoped:
- `account_credits`
- `credit_transactions` standalone ledger rows

Reason:
- Phase 1A added `organization_id` to `usage_events` and `billing_reservations`.
- It did not add `organization_id` to `account_credits` or `credit_transactions`.
- Moving the credit account and ledger to organizations should happen with the subscription/payment schema phase, not as an API-only patch.

## Billing Writes Review

Reviewed:
- `lib/billing/credit.ts`
- `lib/billing/middleware.ts`

Status:
- `logUsageEvent` already resolves/writes `organization_id` from project/default org.
- `createReservation` already resolves/writes `organization_id`.
- `lib/billing/middleware.ts` performs user balance checks and does not create billing rows.
- `credit_transactions` inserts remain user-scoped because the table has no `organization_id`.

## Frontend Propagation

Updated minimal existing billing/settings fetches:
- `components/dashboard/nav.tsx`
  - `/api/billing/balance`
- `app/dashboard/settings/unified-settings.tsx`
  - `/api/dashboard/settings`
  - `/api/billing/transactions/grouped`

No billing UI redesign or subscription UI was added.

## Tests Added

New test:
- `tests/lib/billing-org-context.test.ts`

Coverage:
- billing OR filter construction
- requested `organization_id` validation path
- organization auth error mapping

## Validation

Commands run:
- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/route-auth.test.ts tests/lib/dashboard-org-context.test.ts tests/lib/current-organization.test.ts tests/lib/billing-org-context.test.ts`
- `npx jest --runInBand tests/billing/credit-operations.test.ts tests/billing/usage-tracking.test.ts`

## Remaining Work Before Subscription Billing

Recommended Phase 2 prep:
1. Add organization-owned billing account schema.
2. Decide whether `account_credits` remains user-ledger legacy data or migrates to organization billing accounts.
3. Add `organization_id` or organization billing account references to `credit_transactions`.
4. Update Stripe payment metadata and webhook reconciliation for organization-owned purchases.
5. Add role-specific billing permissions (`owner`/`admin`) before subscription management.
6. Add org-aware RLS policies for billing tables after schema is complete.
