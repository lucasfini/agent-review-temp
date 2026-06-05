import {
  formatPlanPrice,
  formatSubscriptionStatus,
  getPlanActionLabel,
  getPlanLimitItems,
  isPlanActionDisabled,
} from '@/lib/billing/subscription-ui';
import type { Plan } from '@/lib/billing/plans';
import type { OrganizationSubscription } from '@/lib/billing/subscriptions';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-starter',
    name: 'Starter',
    slug: 'starter',
    description: null,
    stripePriceId: 'price_live_123456789',
    monthlyPriceCents: 29900,
    currency: 'usd',
    limits: {
      seatLimit: 3,
      monthlyGenerationLimit: 4,
      monthlyTranscriptionMinuteLimit: 600,
      monthlyImportLimit: 4,
      monthlyStorageMbLimit: 5120,
      integrationLimit: 2,
    },
    features: {},
    isActive: true,
    displayOrder: 10,
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}

function subscription(overrides: Partial<OrganizationSubscription> = {}): OrganizationSubscription {
  return {
    id: 'subscription-1',
    organizationId: 'org-1',
    planId: 'plan-starter',
    plan: null,
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    status: 'active',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialStart: null,
    trialEnd: null,
    metadata: {},
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('subscription UI helpers', () => {
  it('formats monthly plan pricing and custom pricing', () => {
    expect(formatPlanPrice(plan())).toBe('$299/mo');
    expect(formatPlanPrice(plan({ monthlyPriceCents: null }))).toBe('Custom');
  });

  it('formats plan limits for display', () => {
    expect(getPlanLimitItems(plan())).toEqual([
      '3 seats',
      '4 generations/mo',
      '600 transcription min/mo',
      '4 imports/mo',
      '5 GB storage',
      '2 integrations',
    ]);
  });

  it('formats subscription statuses for readers', () => {
    expect(formatSubscriptionStatus('active')).toBe('Active');
    expect(formatSubscriptionStatus('past_due')).toBe('Past due');
    expect(formatSubscriptionStatus(null)).toBe('No active subscription');
  });

  it('disables current usable plans and unconfigured plans', () => {
    const starter = plan();
    expect(getPlanActionLabel(starter, subscription())).toBe('Current plan');
    expect(isPlanActionDisabled(starter, subscription())).toBe(true);

    const growth = plan({ id: 'plan-growth', slug: 'growth', stripePriceId: null });
    expect(getPlanActionLabel(growth, subscription())).toBe('Not configured');
    expect(isPlanActionDisabled(growth, subscription())).toBe(true);
  });

  it('allows configured plans to start checkout when there is no current subscription', () => {
    const starter = plan();
    expect(getPlanActionLabel(starter, null)).toBe('Start subscription');
    expect(isPlanActionDisabled(starter, null)).toBe(false);
  });

  it('labels configured alternate plans as upgrades when a subscription exists', () => {
    const growth = plan({ id: 'plan-growth', slug: 'growth' });
    expect(getPlanActionLabel(growth, subscription())).toBe('Upgrade');
    expect(isPlanActionDisabled(growth, subscription())).toBe(false);
  });

  it('labels configured plans as start actions when the subscription is not usable', () => {
    const starter = plan();
    expect(getPlanActionLabel(starter, subscription({ status: 'canceled' }))).toBe('Start subscription');
    expect(isPlanActionDisabled(starter, subscription({ status: 'canceled' }))).toBe(false);
  });
});
