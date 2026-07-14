import {
  PUBLIC_BILLING_PLAN_PROMISE_LIST,
  PUBLIC_BILLING_PLAN_PROMISES,
} from '@/lib/billing/plan-promises';
import type { Plan } from '@/lib/billing/plans';
import { getRepurposePackHoursFromCredits } from '@/lib/billing/product-credits';
import { formatPlanPrice, getPlanCreditItems } from '@/lib/billing/subscription-ui';

function planFromPromise(promise: typeof PUBLIC_BILLING_PLAN_PROMISE_LIST[number]): Plan {
  return {
    id: `plan-${promise.slug}`,
    name: promise.name,
    slug: promise.slug,
    description: null,
    stripePriceId: null,
    stripeMonthlyPriceId: promise.slug === 'free' ? null : `price_${promise.slug}_monthly`,
    stripeAnnualPriceId: promise.slug === 'free' ? null : `price_${promise.slug}_annual`,
    stripeExtraSeatMonthlyPriceId: promise.slug === 'teams' ? 'price_teams_extra_seat_monthly' : null,
    stripeExtraSeatAnnualPriceId: promise.slug === 'teams' ? 'price_teams_extra_seat_annual' : null,
    monthlyPriceCents: promise.monthlyPriceCents,
    annualPriceCents: promise.annualPriceCents,
    currency: 'usd',
    limits: {
      seatLimit: promise.seatLimit,
      monthlyGenerationLimit: null,
      monthlyTranscriptionMinuteLimit: null,
      monthlyImportLimit: null,
      monthlyStorageMbLimit: null,
      integrationLimit: null,
    },
    monthlyCreditGrant: promise.monthlyCreditGrant,
    creditRolloverMonths: promise.slug === 'free' ? 0 : 1,
    topUpEnabled: promise.topUpEnabled,
    topUpCreditExpiryMonths: 12,
    maxUploadMinutes: promise.maxUploadMinutes,
    extraSeatPriceCents: promise.slug === 'teams' ? 2900 : null,
    isPopular: promise.slug === 'pro',
    features: {
      credit_label: promise.features[0],
    },
    isActive: true,
    displayOrder: 10,
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:00.000Z',
  };
}

describe('public billing plan promises', () => {
  it('keeps advertised Repurpose Pack capacity tied to product credit rates', () => {
    for (const promise of PUBLIC_BILLING_PLAN_PROMISE_LIST) {
      expect(getRepurposePackHoursFromCredits(promise.monthlyCreditGrant)).toBe(promise.repurposePackHours);
    }
  });

  it('advertises annual totals instead of monthly-equivalent annual pricing', () => {
    for (const promise of [
      PUBLIC_BILLING_PLAN_PROMISES.standard,
      PUBLIC_BILLING_PLAN_PROMISES.pro,
      PUBLIC_BILLING_PLAN_PROMISES.teams,
    ]) {
      const annualFeature = promise.features.find((feature) => feature.includes('billed annually'));
      expect(annualFeature).toBe(`${formatPlanPrice(planFromPromise(promise), 'year')} billed annually`);
      expect(annualFeature).toMatch(/\/year billed annually$/);
      expect(annualFeature).not.toMatch(/\/mo when billed annually/);
    }
  });

  it('keeps dashboard billing card promises consistent with public credit, upload, seat, rollover, and top-up promises', () => {
    for (const promise of PUBLIC_BILLING_PLAN_PROMISE_LIST) {
      const items = getPlanCreditItems(planFromPromise(promise));
      expect(items).toContain(promise.features[0]);
      expect(items).toContain(`${promise.maxUploadMinutes}-minute max upload`);
      expect(items).toContain(`${promise.seatLimit} ${promise.seatLimit === 1 ? 'seat' : 'seats'}`);
      expect(items).toContain(promise.topUpEnabled ? 'Top-ups enabled; expire after 12 months' : 'Top-ups disabled');
    }
  });
});
