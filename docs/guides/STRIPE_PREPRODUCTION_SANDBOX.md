# Stripe Pre-Production Sandbox

Use this setup when you want real Stripe test-mode Checkout, test cards, subscription webhooks, and billing sync without touching live Stripe money.

## Environment

`.env.local` should use Stripe test keys and mock billing should be off:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
BILLING_TEST_MODE=false
```

`BILLING_TEST_MODE=true` uses the in-memory mock Stripe client. That mode is useful for fast local UI checks, but it will not show Stripe's hosted credit-card page.

## Local Run

Start the app:

```bash
npm run dev
```

In a second terminal, forward Stripe test webhooks:

```bash
npm run stripe:listen
```

Copy the `whsec_...` signing secret printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET`, then restart `npm run dev`.

Before testing Checkout, run `npm run validate:subscription-launch -- --skip-db`; it fails if mock billing is enabled, Stripe keys are mixed between test/live mode, or the webhook secret is not a `whsec_...` signing secret.

## Test Checklist

Use Stripe test card `4242 4242 4242 4242` with any future expiry, any CVC, and any ZIP.

1. Buy a credit top-up from Billing.
2. Confirm the browser goes to `checkout.stripe.com`.
3. Pay with the test card.
4. Confirm `/billing/success` shows payment success and the Billing balance increases.
5. Change Standard to Pro from Billing.
6. Confirm the browser goes to `checkout.stripe.com`.
7. Pay with the test card.
8. Confirm the success page shows `Subscription Updated`.
9. Return to Billing and confirm the current plan, balance, and receipts refresh.
10. Change Pro to Teams, then add a Teams seat.

## If Checkout Does Not Open Stripe

Check these first:

- `BILLING_TEST_MODE` must be `false` or unset.
- `STRIPE_SECRET_KEY` must start with `sk_test_`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` must start with `pk_test_`.
- The dev server must be restarted after changing `.env.local`.
- The selected plan's Stripe price IDs in Supabase must be test-mode price IDs from the same Stripe account.

## Validation

Run:

```bash
npm run validate:subscription-launch -- --skip-db
```

Run without `--skip-db` when the local environment can reach the intended Supabase database and you want to verify live plan configuration.
