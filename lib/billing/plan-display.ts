import type { Plan, PlanBillingInterval } from '@/lib/billing/plans';
import { formatProductCredits } from '@/lib/billing/product-credits';

const CREDIT_LABELS: Record<string, string> = {
  free: '300 monthly credits',
  standard: '3,000 monthly credits',
  pro: '10,000 shared workspace credits',
  teams: '35,000 pooled team credits',
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: 'Try the workflow without a card',
  standard: 'Solo recurring content workflow',
  pro: 'Recurring content production for small teams or higher-volume operators',
  teams: 'Shared team content operations',
};

export function getPlanCreditLabel(plan: Pick<Plan, 'slug' | 'monthlyCreditGrant' | 'features'>): string {
  const knownLabel = CREDIT_LABELS[String(plan.slug)];
  if (knownLabel) return knownLabel;

  if (typeof plan.features.credit_label === 'string' && plan.features.credit_label.trim()) {
    return plan.features.credit_label.trim();
  }

  if (typeof plan.monthlyCreditGrant === 'number') {
    return `${formatProductCredits(plan.monthlyCreditGrant)} monthly credits`;
  }

  return 'Credits configured by plan';
}

export function getPlanShortDescription(plan: Pick<Plan, 'slug' | 'description'>): string {
  return PLAN_DESCRIPTIONS[String(plan.slug)] || plan.description || 'Subscription plan for recurring content workspaces.';
}

export function getPlanSeatLabel(plan: Pick<Plan, 'slug' | 'limits'>): string {
  const seatLimit = plan.limits.seatLimit;
  if (typeof seatLimit !== 'number') return 'Custom seats';
  return `${seatLimit} ${seatLimit === 1 ? 'seat' : 'seats'}`;
}

export function getPlanUploadLabel(plan: Pick<Plan, 'maxUploadMinutes'>): string {
  return typeof plan.maxUploadMinutes === 'number'
    ? `${plan.maxUploadMinutes}-minute max upload`
    : 'Configured upload length';
}

export function getPlanTopUpLabel(plan: Pick<Plan, 'topUpEnabled'>): string {
  return plan.topUpEnabled ? 'Top-ups available' : 'Top-ups unavailable';
}

export function getPlanCardBullets(plan: Pick<Plan, 'slug' | 'features' | 'monthlyCreditGrant' | 'limits' | 'maxUploadMinutes' | 'topUpEnabled'>): string[] {
  return [
    getPlanCreditLabel(plan),
    getPlanSeatLabel(plan),
    getPlanUploadLabel(plan),
    getPlanTopUpLabel(plan),
  ];
}

export function computeAnnualSavingsPercent(plan: Pick<Plan, 'monthlyPriceCents' | 'annualPriceCents'>): number | null {
  if (typeof plan.monthlyPriceCents !== 'number' || typeof plan.annualPriceCents !== 'number') return null;
  if (plan.monthlyPriceCents <= 0 || plan.annualPriceCents <= 0) return null;

  const annualizedMonthlyPrice = plan.monthlyPriceCents * 12;
  if (plan.annualPriceCents >= annualizedMonthlyPrice) return null;

  return Math.round(((annualizedMonthlyPrice - plan.annualPriceCents) / annualizedMonthlyPrice) * 100);
}

export function formatPlanDisplayPrice(
  plan: Pick<Plan, 'slug' | 'monthlyPriceCents' | 'annualPriceCents' | 'currency'>,
  interval: PlanBillingInterval
): { main: string; suffix: string; helper: string | null } {
  if (plan.slug === 'free' || plan.monthlyPriceCents === 0) {
    return { main: '$0', suffix: '', helper: 'No card required' };
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency || 'usd',
    maximumFractionDigits: 2,
  });

  if (interval === 'year' && typeof plan.annualPriceCents === 'number') {
    return {
      main: formatter.format(plan.annualPriceCents / 12 / 100),
      suffix: '/mo',
      helper: `billed ${formatter.format(plan.annualPriceCents / 100)} yearly`,
    };
  }

  if (typeof plan.monthlyPriceCents === 'number') {
    return {
      main: formatter.format(plan.monthlyPriceCents / 100),
      suffix: '/mo',
      helper: 'billed monthly',
    };
  }

  return { main: 'Custom', suffix: '', helper: 'Contact sales' };
}
