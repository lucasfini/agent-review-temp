const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Phase 8D Stripe subscription launch verification artifacts', () => {
  it('documents the required Stripe dashboard, checkout, portal, webhook, enforcement, and rollback checks', () => {
    const report = read('docs/archive/phase-handoffs/PHASE_8D_STRIPE_SUBSCRIPTION_LAUNCH_VERIFICATION.md');

    [
      'Stripe Dashboard Setup',
      'Checkout Verification',
      'Portal Verification',
      'Webhook Verification',
      'Failed Payment Test',
      'Cancellation Test',
      'Enforcement Rollout',
      'Rollback Procedure',
      'Launch Blockers',
    ].forEach((section) => {
      expect(report).toContain(section);
    });

    [
      'starter',
      'growth',
      'scale',
      'enterprise/custom',
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
      'SUBSCRIPTION_ENFORCEMENT_MODE=dry_run',
      'session_id=<checkout_session_id>',
      'Local `--skip-db` validation may warn',
    ].forEach((item) => {
      expect(report).toContain(item);
    });
  });

  it('keeps subscription checkout organization-scoped and protected against unsafe production price IDs', () => {
    const checkoutRoute = read('app/api/subscriptions/checkout/route.ts');

    expect(checkoutRoute).toContain('requireAuthenticatedUser');
    expect(checkoutRoute).toContain('requireOrganizationBillingManager');
    expect(checkoutRoute).toContain('isDemoUser');
    expect(checkoutRoute).toContain('isProductionUnsafeStripePriceId');
    expect(checkoutRoute).toContain("mode: 'subscription'");
    expect(checkoutRoute).toContain('client_reference_id: organization.id');
    expect(checkoutRoute).toContain('organization_id: organization.id');
    expect(checkoutRoute).toContain('subscription_data');
    expect(checkoutRoute).toContain('safeRedirectUrl');
  });

  it('keeps billing portal sessions organization-scoped with same-origin return URLs', () => {
    const portalRoute = read('app/api/subscriptions/portal/route.ts');

    expect(portalRoute).toContain('requireAuthenticatedUser');
    expect(portalRoute).toContain('requireOrganizationBillingManager');
    expect(portalRoute).toContain('getOrganizationStripeCustomerId');
    expect(portalRoute).toContain('safeReturnUrl');
    expect(portalRoute).toContain('stripe.billingPortal.sessions.create');
    expect(portalRoute).toContain('customer: stripeCustomerId');
  });

  it('keeps subscription webhook events separate from pay-as-you-go credit checkout handling', () => {
    const webhookRoute = read('app/api/stripe/webhook/route.ts');

    [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
    ].forEach((eventName) => {
      expect(webhookRoute).toContain(eventName);
    });

    expect(webhookRoute).toContain('stripe.webhooks.constructEvent');
    expect(webhookRoute).toContain("session.mode === 'subscription'");
    expect(webhookRoute).toContain('handleSubscriptionCheckoutComplete(session)');
    expect(webhookRoute).toContain('handleCheckoutComplete(session)');
    expect(webhookRoute).toContain('upsertOrganizationSubscriptionFromStripe');
  });

  it('keeps subscription enforcement defaulted to dry_run in env examples and validation helpers', () => {
    const envExample = read('.env.example');
    const prodEnvExample = read('.env.production.example');
    const entitlementGuards = read('lib/billing/entitlement-guards.ts');
    const launchValidator = read('scripts/verify-subscription-launch-readiness.js');

    expect(envExample).toContain('SUBSCRIPTION_ENFORCEMENT_MODE=dry_run');
    expect(prodEnvExample).toContain('SUBSCRIPTION_ENFORCEMENT_MODE=dry_run');
    expect(entitlementGuards).toContain("if (value === 'enforce') return 'enforce'");
    expect(entitlementGuards).toContain("return 'dry_run'");
    expect(launchValidator).toContain('normalizeEnforcementMode');
    expect(launchValidator).toContain('STRIPE_WEBHOOK_SECRET');
  });
});
