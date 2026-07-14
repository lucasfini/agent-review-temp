const {
  collectStaticChecks,
  collectStripeEnvironmentErrors,
  normalizeEnforcementMode,
  parseArgs,
  summarizePlanRows,
  summarizeSubscriptionRows,
} = require('../../scripts/verify-subscription-launch-readiness.js');

describe('subscription launch readiness helpers', () => {
  it('defaults enforcement mode to dry_run unless enforce is exact', () => {
    expect(normalizeEnforcementMode(undefined)).toBe('dry_run');
    expect(normalizeEnforcementMode('dry_run')).toBe('dry_run');
    expect(normalizeEnforcementMode('invalid')).toBe('dry_run');
    expect(normalizeEnforcementMode('enforce')).toBe('enforce');
  });

  it('reports required env gaps and invalid enforcement values', () => {
    const report = collectStaticChecks({
      NEXT_PUBLIC_APP_URL: 'https://staging.example.com',
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      STRIPE_SECRET_KEY: 'sk_test_123',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
      STRIPE_WEBHOOK_SECRET: '',
      SUBSCRIPTION_ENFORCEMENT_MODE: 'ENFORCE',
    });

    expect(report.missingRequiredEnv).toEqual(['STRIPE_WEBHOOK_SECRET']);
    expect(report.enforcementMode).toBe('dry_run');
    expect(report.invalidEnforcementMode).toBe(true);
    expect(report.stripeEnvironmentErrors).toEqual([]);
  });

  it('reports Stripe env values that would bypass or break hosted Checkout', () => {
    expect(collectStripeEnvironmentErrors({
      STRIPE_SECRET_KEY: 'sk_test_123',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_123',
      STRIPE_WEBHOOK_SECRET: 'sk_test_not_a_webhook_secret',
      BILLING_TEST_MODE: 'TRUE',
    })).toEqual([
      'STRIPE_WEBHOOK_SECRET must be a webhook signing secret that starts with whsec_.',
      'STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must both use the same Stripe mode.',
      'BILLING_TEST_MODE is enabled; hosted Stripe Checkout will be bypassed.',
    ]);
  });

  it('accepts a Stripe test-mode pre-production env', () => {
    expect(collectStripeEnvironmentErrors({
      STRIPE_SECRET_KEY: 'sk_test_123',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      BILLING_TEST_MODE: 'false',
    })).toEqual([]);
  });

  it('summarizes active plans and missing Stripe prices', () => {
    expect(summarizePlanRows([
      { id: 'plan-1', slug: 'free', is_active: true, stripe_price_id: null },
      { id: 'plan-2', slug: 'standard', is_active: true, stripe_monthly_price_id: 'price_month', stripe_annual_price_id: 'price_year' },
      { id: 'plan-3', slug: 'pro', is_active: true, stripe_monthly_price_id: 'price_month_pro', stripe_annual_price_id: null },
      { id: 'plan-3', slug: 'old', is_active: false, stripe_price_id: null },
    ])).toEqual({
      activePlanCount: 3,
      activePlansMissingStripePrice: ['pro'],
    });
  });

  it('summarizes subscription status rows', () => {
    expect(summarizeSubscriptionRows([
      { status: 'active' },
      { status: 'past_due' },
      { status: 'trialing' },
    ])).toEqual({
      subscriptionCount: 3,
      usableSubscriptionCount: 2,
      statuses: ['active', 'past_due', 'trialing'],
    });
  });

  it('parses optional organization id arguments', () => {
    expect(parseArgs(['--organization-id', 'org-1'])).toEqual({ organizationId: 'org-1', skipDb: false });
    expect(parseArgs(['--organization-id=org-2'])).toEqual({ organizationId: 'org-2', skipDb: false });
    expect(parseArgs(['--skip-db'])).toEqual({ organizationId: null, skipDb: true });
    expect(parseArgs([])).toEqual({ organizationId: null, skipDb: false });
  });
});
