const {
  collectStaticChecks,
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
  });

  it('summarizes active plans and missing Stripe prices', () => {
    expect(summarizePlanRows([
      { id: 'plan-1', slug: 'starter', is_active: true, stripe_price_id: 'price_123' },
      { id: 'plan-2', slug: 'growth', is_active: true, stripe_price_id: null },
      { id: 'plan-3', slug: 'old', is_active: false, stripe_price_id: null },
    ])).toEqual({
      activePlanCount: 2,
      activePlansMissingStripePrice: ['growth'],
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
