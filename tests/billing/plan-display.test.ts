import {
  computeAnnualSavingsPercent,
  formatPlanDisplayPrice,
  getPlanCardBullets,
  getPlanCreditLabel,
} from '@/lib/billing/plan-display';
import type { KnownPlanSlug, Plan } from '@/lib/billing/plans';
import { PLAN_MAX_UPLOAD_MINUTES } from '@/lib/billing/plan-upload-limits';

function plan(slug: KnownPlanSlug, overrides: Partial<Plan> = {}): Plan {
  const presets: Record<KnownPlanSlug, {
    name: string;
    monthlyPriceCents: number;
    annualPriceCents: number;
    monthlyCreditGrant: number;
    seatLimit: number;
    topUpEnabled: boolean;
  }> = {
    free: {
      name: 'Free',
      monthlyPriceCents: 0,
      annualPriceCents: 0,
      monthlyCreditGrant: 300,
      seatLimit: 1,
      topUpEnabled: false,
    },
    standard: {
      name: 'Standard',
      monthlyPriceCents: 4999,
      annualPriceCents: 50388,
      monthlyCreditGrant: 3000,
      seatLimit: 1,
      topUpEnabled: true,
    },
    pro: {
      name: 'Pro',
      monthlyPriceCents: 14900,
      annualPriceCents: 151200,
      monthlyCreditGrant: 10000,
      seatLimit: 3,
      topUpEnabled: true,
    },
    teams: {
      name: 'Teams',
      monthlyPriceCents: 39900,
      annualPriceCents: 406800,
      monthlyCreditGrant: 35000,
      seatLimit: 5,
      topUpEnabled: true,
    },
  };
  const preset = presets[slug];

  return {
    id: `plan-${slug}`,
    name: preset.name,
    slug,
    description: null,
    stripePriceId: null,
    stripeMonthlyPriceId: null,
    stripeAnnualPriceId: null,
    stripeExtraSeatMonthlyPriceId: null,
    stripeExtraSeatAnnualPriceId: null,
    monthlyPriceCents: preset.monthlyPriceCents,
    annualPriceCents: preset.annualPriceCents,
    currency: 'usd',
    limits: {
      seatLimit: preset.seatLimit,
      monthlyGenerationLimit: null,
      monthlyTranscriptionMinuteLimit: null,
      monthlyImportLimit: null,
      monthlyStorageMbLimit: null,
      integrationLimit: null,
    },
    monthlyCreditGrant: preset.monthlyCreditGrant,
    creditRolloverMonths: slug === 'free' ? 0 : 1,
    topUpEnabled: preset.topUpEnabled,
    topUpCreditExpiryMonths: 12,
    maxUploadMinutes: PLAN_MAX_UPLOAD_MINUTES[slug],
    extraSeatPriceCents: null,
    isPopular: slug === 'pro',
    features: {},
    isActive: true,
    displayOrder: 10,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('authenticated billing plan display helpers', () => {
  it('uses exact product credit wording by plan', () => {
    expect(getPlanCreditLabel(plan('free'))).toBe('300 monthly credits');
    expect(getPlanCreditLabel(plan('standard'))).toBe('3,000 monthly credits');
    expect(getPlanCreditLabel(plan('pro'))).toBe('10,000 shared workspace credits');
    expect(getPlanCreditLabel(plan('teams'))).toBe('35,000 pooled team credits');
  });

  it('keeps max upload and top-up labels consistent on plan cards', () => {
    expect(getPlanCardBullets(plan('free'))).toEqual([
      '300 monthly credits',
      '1 seat',
      '30-minute max upload',
      'Top-ups unavailable',
    ]);
    expect(getPlanCardBullets(plan('teams'))).toEqual([
      '35,000 pooled team credits',
      '5 seats',
      '240-minute max upload',
      'Top-ups available',
    ]);
  });

  it('computes annual savings from configured monthly and annual prices', () => {
    expect(computeAnnualSavingsPercent(plan('standard'))).toBe(16);
    expect(computeAnnualSavingsPercent(plan('pro'))).toBe(15);
    expect(computeAnnualSavingsPercent(plan('teams'))).toBe(15);
    expect(computeAnnualSavingsPercent(plan('free'))).toBeNull();
  });

  it('shows annual plans as effective monthly pricing with yearly billing copy', () => {
    expect(formatPlanDisplayPrice(plan('standard'), 'year')).toEqual({
      main: '$41.99',
      suffix: '/mo',
      helper: 'billed $503.88 yearly',
    });
    expect(formatPlanDisplayPrice(plan('standard'), 'month')).toEqual({
      main: '$49.99',
      suffix: '/mo',
      helper: 'billed monthly',
    });
  });
});
