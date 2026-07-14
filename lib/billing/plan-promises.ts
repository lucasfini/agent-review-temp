import type { KnownPlanSlug } from '@/lib/billing/plans';
import { PLAN_MAX_UPLOAD_MINUTES } from '@/lib/billing/plan-upload-limits';

type PublicPlanPromise = {
  slug: KnownPlanSlug;
  name: string;
  description: string;
  price: string;
  suffix: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  monthlyCreditGrant: number;
  repurposePackHours: number;
  seatLimit: number;
  maxUploadMinutes: number;
  topUpEnabled: boolean;
  features: readonly string[];
};

function formatCurrencyCents(amountCents: number): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'usd',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function annualBillingLabel(amountCents: number): string {
  return `${formatCurrencyCents(amountCents)}/year billed annually`;
}

export const PUBLIC_BILLING_PLAN_PROMISES = {
  free: {
    slug: 'free',
    name: 'Free',
    description: 'Try the full workflow\nwithout a card.',
    price: '$0',
    suffix: 'forever',
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    monthlyCreditGrant: 300,
    repurposePackHours: 1,
    seatLimit: 1,
    maxUploadMinutes: PLAN_MAX_UPLOAD_MINUTES.free,
    topUpEnabled: false,
    features: [
      '300 monthly credits',
      '1 seat',
      'Transcript and speaker labels',
      '30-minute max upload',
    ],
  },
  standard: {
    slug: 'standard',
    name: 'Standard',
    description: 'For solo founders and\nsmall B2B workflows.',
    price: '$49.99',
    suffix: '/mo',
    monthlyPriceCents: 4999,
    annualPriceCents: 50388,
    monthlyCreditGrant: 3000,
    repurposePackHours: 10,
    seatLimit: 1,
    maxUploadMinutes: PLAN_MAX_UPLOAD_MINUTES.standard,
    topUpEnabled: true,
    features: [
      '3,000 monthly credits',
      '1 seat',
      annualBillingLabel(50388),
      'Top-ups available',
    ],
  },
  pro: {
    slug: 'pro',
    name: 'Pro',
    description: 'For teams producing\nrecurring content.',
    price: '$149',
    suffix: '/mo',
    monthlyPriceCents: 14900,
    annualPriceCents: 151200,
    monthlyCreditGrant: 10000,
    repurposePackHours: 33,
    seatLimit: 3,
    maxUploadMinutes: PLAN_MAX_UPLOAD_MINUTES.pro,
    topUpEnabled: true,
    features: [
      '10,000 shared workspace credits',
      '3 seats',
      annualBillingLabel(151200),
      'Top-ups available',
    ],
  },
  teams: {
    slug: 'teams',
    name: 'Teams',
    description: 'For shared B2B content\noperations.',
    price: '$399',
    suffix: '/mo',
    monthlyPriceCents: 39900,
    annualPriceCents: 406800,
    monthlyCreditGrant: 35000,
    repurposePackHours: 117,
    seatLimit: 5,
    maxUploadMinutes: PLAN_MAX_UPLOAD_MINUTES.teams,
    topUpEnabled: true,
    features: [
      '35,000 pooled team credits',
      '5 seats',
      annualBillingLabel(406800),
      'Top-ups available',
    ],
  },
} as const satisfies Record<KnownPlanSlug, PublicPlanPromise>;

export const PUBLIC_BILLING_PLAN_PROMISE_LIST = [
  PUBLIC_BILLING_PLAN_PROMISES.free,
  PUBLIC_BILLING_PLAN_PROMISES.standard,
  PUBLIC_BILLING_PLAN_PROMISES.pro,
  PUBLIC_BILLING_PLAN_PROMISES.teams,
] as const;
