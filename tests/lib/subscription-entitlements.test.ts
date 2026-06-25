import { getPlanLimits, getActivePlans, type Plan } from '@/lib/billing/plans';
import {
  getOrganizationSubscription,
  isSubscriptionUsable,
  type OrganizationSubscription,
} from '@/lib/billing/subscriptions';
import {
  getEntitlementsForSubscription,
  getFallbackFreeOrLegacyEntitlements,
} from '@/lib/billing/entitlements';

const starterPlan: Plan = {
  id: 'plan-starter',
  name: 'Starter',
  slug: 'starter',
  description: 'Starter plan',
  stripePriceId: null,
  stripeMonthlyPriceId: null,
  stripeAnnualPriceId: null,
  monthlyPriceCents: 29900,
  annualPriceCents: null,
  currency: 'usd',
  limits: {
    seatLimit: 3,
    monthlyGenerationLimit: 4,
    monthlyTranscriptionMinuteLimit: 600,
    monthlyImportLimit: 4,
    monthlyStorageMbLimit: 5000,
    integrationLimit: 2,
  },
  monthlyCreditGrant: 300,
  creditRolloverMonths: 0,
  topUpEnabled: false,
  topUpCreditExpiryMonths: 12,
  maxUploadMinutes: 60,
  extraSeatPriceCents: null,
  isPopular: false,
  features: {
    credit_payg_enabled: true,
  },
  isActive: true,
  displayOrder: 10,
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z',
};

function buildSubscription(
  overrides: Partial<OrganizationSubscription> = {}
): OrganizationSubscription {
  return {
    id: 'subscription-1',
    organizationId: 'org-1',
    planId: starterPlan.id,
    plan: starterPlan,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: 'active',
    currentPeriodStart: '2026-06-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    trialStart: null,
    trialEnd: null,
    metadata: {},
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...overrides,
  };
}

function buildSupabaseMock(tableRows: Record<string, any[]>) {
  const from = jest.fn((table: string) => {
    const query: any = {
      data: tableRows[table] || [],
      error: null,
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
    };
    return query;
  });

  return { from };
}

describe('subscription entitlement helpers', () => {
  it('marks only active and trialing subscriptions as usable', () => {
    expect(isSubscriptionUsable('active')).toBe(true);
    expect(isSubscriptionUsable('trialing')).toBe(true);
    expect(isSubscriptionUsable('inactive')).toBe(false);
    expect(isSubscriptionUsable('past_due')).toBe(false);
    expect(isSubscriptionUsable('canceled')).toBe(false);
    expect(isSubscriptionUsable('unpaid')).toBe(false);
    expect(isSubscriptionUsable('incomplete')).toBe(false);
    expect(isSubscriptionUsable('incomplete_expired')).toBe(false);
    expect(isSubscriptionUsable(null)).toBe(false);
  });

  it('returns report-only plan entitlements for usable subscriptions', () => {
    const entitlements = getEntitlementsForSubscription(buildSubscription());

    expect(entitlements.source).toBe('subscription');
    expect(entitlements.enforcementMode).toBe('report_only');
    expect(entitlements.legacyCreditsEnabled).toBe(true);
    expect(entitlements.plan?.slug).toBe('starter');
    expect(entitlements.limits.monthlyGenerationLimit).toBe(4);
    expect(entitlements.features.subscriptionEnforcementEnabled).toBe(false);
  });

  it('returns legacy fallback entitlements when there is no subscription', () => {
    const entitlements = getFallbackFreeOrLegacyEntitlements();

    expect(entitlements.source).toBe('legacy_fallback');
    expect(entitlements.enforcementMode).toBe('none');
    expect(entitlements.legacyCreditsEnabled).toBe(true);
    expect(entitlements.subscription).toBeNull();
    expect(entitlements.limits).toEqual({
      seatLimit: null,
      monthlyGenerationLimit: null,
      monthlyTranscriptionMinuteLimit: null,
      monthlyImportLimit: null,
      monthlyStorageMbLimit: null,
      integrationLimit: null,
    });
  });

  it('keeps inactive subscriptions in the summary but falls back to legacy behavior', () => {
    const entitlements = getEntitlementsForSubscription(
      buildSubscription({ status: 'past_due' })
    );

    expect(entitlements.source).toBe('legacy_fallback');
    expect(entitlements.enforcementMode).toBe('none');
    expect(entitlements.subscription?.status).toBe('past_due');
    expect(entitlements.plan).toBeNull();
  });

  it('copies plan limits without mutating the source plan', () => {
    const limits = getPlanLimits(starterPlan);

    expect(limits).toEqual(starterPlan.limits);
    expect(limits).not.toBe(starterPlan.limits);
  });
});

describe('subscription data helpers', () => {
  it('loads active plans ordered by display_order then name', async () => {
    const supabase = buildSupabaseMock({
      plans: [
        {
          id: 'plan-starter',
          name: 'Starter',
          slug: 'starter',
          description: null,
          stripe_price_id: null,
          monthly_price_cents: 29900,
          currency: 'usd',
          seat_limit: 3,
          monthly_generation_limit: 4,
          monthly_transcription_minute_limit: 600,
          monthly_import_limit: 4,
          monthly_storage_mb_limit: 5000,
          integration_limit: 2,
          features_json: { credit_payg_enabled: true },
          is_active: true,
          display_order: 10,
          created_at: '2026-06-03T00:00:00.000Z',
          updated_at: '2026-06-03T00:00:00.000Z',
        },
      ],
    });

    const plans = await getActivePlans(supabase as any);

    expect(plans).toHaveLength(1);
    expect(plans[0].slug).toBe('starter');
    const query = supabase.from.mock.results[0].value;
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.order).toHaveBeenNthCalledWith(1, 'display_order', { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(2, 'name', { ascending: true });
  });

  it('maps canonical credit, upload, rollover, and annual pricing fields from plans', async () => {
    const supabase = buildSupabaseMock({
      plans: [
        {
          id: 'plan-pro',
          name: 'Pro',
          slug: 'pro',
          description: null,
          stripe_price_id: null,
          stripe_monthly_price_id: 'price_pro_monthly',
          stripe_annual_price_id: 'price_pro_annual',
          monthly_price_cents: 14900,
          annual_price_cents: 151980,
          currency: 'usd',
          seat_limit: 3,
          monthly_generation_limit: 33,
          monthly_transcription_minute_limit: 2000,
          monthly_import_limit: 33,
          monthly_storage_mb_limit: 50000,
          integration_limit: 5,
          monthly_credit_grant: 10000,
          credit_rollover_months: 1,
          top_up_enabled: true,
          top_up_credit_expiry_months: 12,
          max_upload_minutes: 60,
          extra_seat_price_cents: null,
          is_popular: true,
          features_json: { credit_label: '10,000 credits/month, about 33 Repurpose Pack hours' },
          is_active: true,
          display_order: 30,
          created_at: '2026-06-18T00:00:00.000Z',
          updated_at: '2026-06-18T00:00:00.000Z',
        },
      ],
    });

    const plans = await getActivePlans(supabase as any);
    expect(plans[0]).toEqual(expect.objectContaining({
      slug: 'pro',
      stripeMonthlyPriceId: 'price_pro_monthly',
      stripeAnnualPriceId: 'price_pro_annual',
      monthlyPriceCents: 14900,
      annualPriceCents: 151980,
      monthlyCreditGrant: 10000,
      creditRolloverMonths: 1,
      topUpEnabled: true,
      topUpCreditExpiryMonths: 12,
      maxUploadMinutes: 60,
      isPopular: true,
    }));
    expect(plans[0].limits.seatLimit).toBe(3);
  });

  it('prefers a usable organization subscription over a newer inactive row', async () => {
    const supabase = buildSupabaseMock({
      organization_subscriptions: [
        {
          id: 'subscription-inactive',
          organization_id: 'org-1',
          plan_id: starterPlan.id,
          plan: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          status: 'inactive',
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          trial_start: null,
          trial_end: null,
          metadata_json: {},
          created_at: '2026-06-04T00:00:00.000Z',
          updated_at: '2026-06-04T00:00:00.000Z',
        },
        {
          id: 'subscription-active',
          organization_id: 'org-1',
          plan_id: starterPlan.id,
          plan: {
            id: starterPlan.id,
            name: starterPlan.name,
            slug: starterPlan.slug,
            description: starterPlan.description,
            stripe_price_id: starterPlan.stripePriceId,
            stripe_monthly_price_id: starterPlan.stripeMonthlyPriceId,
            stripe_annual_price_id: starterPlan.stripeAnnualPriceId,
            monthly_price_cents: starterPlan.monthlyPriceCents,
            annual_price_cents: starterPlan.annualPriceCents,
            currency: starterPlan.currency,
            seat_limit: starterPlan.limits.seatLimit,
            monthly_generation_limit: starterPlan.limits.monthlyGenerationLimit,
            monthly_transcription_minute_limit: starterPlan.limits.monthlyTranscriptionMinuteLimit,
            monthly_import_limit: starterPlan.limits.monthlyImportLimit,
            monthly_storage_mb_limit: starterPlan.limits.monthlyStorageMbLimit,
            integration_limit: starterPlan.limits.integrationLimit,
            monthly_credit_grant: starterPlan.monthlyCreditGrant,
            credit_rollover_months: starterPlan.creditRolloverMonths,
            top_up_enabled: starterPlan.topUpEnabled,
            top_up_credit_expiry_months: starterPlan.topUpCreditExpiryMonths,
            max_upload_minutes: starterPlan.maxUploadMinutes,
            extra_seat_price_cents: starterPlan.extraSeatPriceCents,
            is_popular: starterPlan.isPopular,
            features_json: starterPlan.features,
            is_active: starterPlan.isActive,
            display_order: starterPlan.displayOrder,
            created_at: starterPlan.createdAt,
            updated_at: starterPlan.updatedAt,
          },
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
          status: 'active',
          current_period_start: '2026-06-01T00:00:00.000Z',
          current_period_end: '2026-07-01T00:00:00.000Z',
          cancel_at_period_end: false,
          trial_start: null,
          trial_end: null,
          metadata_json: {},
          created_at: '2026-06-03T00:00:00.000Z',
          updated_at: '2026-06-03T00:00:00.000Z',
        },
      ],
    });

    const subscription = await getOrganizationSubscription(supabase as any, 'org-1');

    expect(subscription?.id).toBe('subscription-active');
    expect(subscription?.plan?.slug).toBe('starter');
    const query = supabase.from.mock.results[0].value;
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(query.limit).toHaveBeenCalledWith(10);
  });
});
