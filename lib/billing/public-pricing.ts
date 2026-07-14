import { ANALYSIS_OPTION_CONFIG } from '@/lib/analysis-options';
import {
  PUBLIC_BILLING_PLAN_PROMISE_LIST,
} from '@/lib/billing/plan-promises';
import {
  PLAN_SLUGS,
  type KnownPlanSlug,
  type Plan,
  type PlanBillingInterval,
} from '@/lib/billing/plans';
import { formatProductCredits } from '@/lib/billing/product-credits';
import { CONTENT_TYPES } from '@/lib/content-types';
import { isIntegrationEnabled } from '@/lib/integrations/availability';

export type PublicPricingPlan = {
  id: string;
  slug: KnownPlanSlug;
  name: string;
  description: string;
  positioning: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  supportedIntervals: PlanBillingInterval[];
  monthlyCreditGrant: number | null;
  includedSeats: number | null;
  maxUploadMinutes: number | null;
  topUpEnabled: boolean;
  teamsExtraSeatsEnabled: boolean;
  isPopular: boolean;
  stripeMonthlyPriceConfigured: boolean;
  stripeAnnualPriceConfigured: boolean;
};

export type PublicPricingCell =
  | { type: 'text'; value: string }
  | { type: 'check'; label?: string }
  | { type: 'dash' };

export type PublicPricingComparisonRow = {
  label: string;
  description?: string;
  values: Record<KnownPlanSlug, PublicPricingCell>;
};

export type PublicPricingComparisonGroup = {
  title: string;
  rows: PublicPricingComparisonRow[];
};

export type PublicPlanPriceDisplay = {
  main: string;
  suffix: string;
  helper: string;
  savings: string | null;
};

const planCopy: Record<KnownPlanSlug, { description: string; positioning: string }> = {
  free: {
    description: 'Try the workflow without a card.',
    positioning: 'Try the workflow without a card',
  },
  standard: {
    description: 'Solo recurring content workflow.',
    positioning: 'Solo recurring content workflow',
  },
  pro: {
    description: 'Recurring content production for small teams and higher-volume operators.',
    positioning: 'Recurring content production for small teams or higher-volume operators',
  },
  teams: {
    description: 'Shared team content operations.',
    positioning: 'Shared team content operations',
  },
};

const supportedContentTypeIds = [
  'twitter_threads',
  'linkedin_posts',
  'instagram_content',
  'facebook_post',
  'blog_post',
  'newsletter',
  'show_notes',
  'youtube_description',
  'podcast_episode_description',
  'short_form_video_script',
  'quote_graphics',
] as const;

const integrationImportProviders = [
  'zoom',
  'microsoft',
  'youtube',
  'notion',
  'onedrive',
  'google_drive',
  'granola',
  'slack',
] as const;

function isKnownPlanSlug(value: string): value is KnownPlanSlug {
  return (PLAN_SLUGS as readonly string[]).includes(value);
}

function comparePlans(first: PublicPricingPlan, second: PublicPricingPlan): number {
  return PLAN_SLUGS.indexOf(first.slug) - PLAN_SLUGS.indexOf(second.slug);
}

function formatCurrencyCents(amountCents: number, currency = 'usd'): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCreditsForPlan(plan: Pick<PublicPricingPlan, 'slug' | 'monthlyCreditGrant'>): string {
  if (typeof plan.monthlyCreditGrant !== 'number') return 'Configured in billing';
  const credits = formatProductCredits(plan.monthlyCreditGrant);

  if (plan.slug === 'pro') return `${credits} shared workspace credits`;
  if (plan.slug === 'teams') return `${credits} pooled team credits`;
  return credits;
}

function textCell(value: string): PublicPricingCell {
  return { type: 'text', value };
}

function checkCell(label?: string): PublicPricingCell {
  return label ? { type: 'check', label } : { type: 'check' };
}

function dashCell(): PublicPricingCell {
  return { type: 'dash' };
}

function allPlanValues(
  plans: PublicPricingPlan[],
  getValue: (plan: PublicPricingPlan) => PublicPricingCell
): Record<KnownPlanSlug, PublicPricingCell> {
  return plans.reduce((values, plan) => {
    values[plan.slug] = getValue(plan);
    return values;
  }, {} as Record<KnownPlanSlug, PublicPricingCell>);
}

function allIncludedValues(plans: PublicPricingPlan[]): Record<KnownPlanSlug, PublicPricingCell> {
  return allPlanValues(plans, () => checkCell());
}

function mapPlanToPublicPricingPlan(plan: Plan): PublicPricingPlan | null {
  if (!isKnownPlanSlug(String(plan.slug))) return null;

  const slug = plan.slug as KnownPlanSlug;
  const supportedIntervals: PlanBillingInterval[] = [];
  if (slug === 'free' || (typeof plan.monthlyPriceCents === 'number' && Boolean(plan.stripeMonthlyPriceId || plan.stripePriceId))) {
    supportedIntervals.push('month');
  }
  if (slug === 'free' || (typeof plan.annualPriceCents === 'number' && Boolean(plan.stripeAnnualPriceId))) {
    supportedIntervals.push('year');
  }

  return {
    id: plan.id,
    slug,
    name: plan.name,
    description: planCopy[slug].description,
    positioning: planCopy[slug].positioning,
    monthlyPriceCents: plan.monthlyPriceCents,
    annualPriceCents: plan.annualPriceCents,
    currency: plan.currency || 'usd',
    supportedIntervals,
    monthlyCreditGrant: plan.monthlyCreditGrant,
    includedSeats: typeof plan.limits.seatLimit === 'number' ? plan.limits.seatLimit : null,
    maxUploadMinutes: plan.maxUploadMinutes,
    topUpEnabled: plan.topUpEnabled,
    teamsExtraSeatsEnabled: slug === 'teams'
      && typeof plan.extraSeatPriceCents === 'number'
      && Boolean(plan.stripeExtraSeatMonthlyPriceId || plan.stripeExtraSeatAnnualPriceId),
    isPopular: plan.isPopular || slug === 'pro',
    stripeMonthlyPriceConfigured: Boolean(plan.stripeMonthlyPriceId || plan.stripePriceId),
    stripeAnnualPriceConfigured: Boolean(plan.stripeAnnualPriceId),
  };
}

export function buildPublicPricingPlans(plans: Plan[]): PublicPricingPlan[] {
  return plans
    .map(mapPlanToPublicPricingPlan)
    .filter((plan): plan is PublicPricingPlan => Boolean(plan))
    .sort(comparePlans);
}

export function buildFallbackPublicPricingPlans(): PublicPricingPlan[] {
  return PUBLIC_BILLING_PLAN_PROMISE_LIST.map((plan) => ({
    id: `fallback-${plan.slug}`,
    slug: plan.slug,
    name: plan.name,
    description: planCopy[plan.slug].description,
    positioning: planCopy[plan.slug].positioning,
    monthlyPriceCents: plan.monthlyPriceCents,
    annualPriceCents: plan.annualPriceCents,
    currency: 'usd',
    supportedIntervals: ['month', 'year'] satisfies PlanBillingInterval[],
    monthlyCreditGrant: plan.monthlyCreditGrant,
    includedSeats: plan.seatLimit,
    maxUploadMinutes: plan.maxUploadMinutes,
    topUpEnabled: plan.topUpEnabled,
    teamsExtraSeatsEnabled: false,
    isPopular: plan.slug === 'pro',
    stripeMonthlyPriceConfigured: plan.slug !== 'free',
    stripeAnnualPriceConfigured: plan.slug !== 'free' && typeof plan.annualPriceCents === 'number',
  })).sort(comparePlans);
}

export function hasCompleteAnnualPricing(plans: PublicPricingPlan[]): boolean {
  const paidPlans = plans.filter((plan) => plan.slug !== 'free');
  return paidPlans.length > 0 && paidPlans.every((plan) =>
    typeof plan.annualPriceCents === 'number'
    && plan.annualPriceCents > 0
    && plan.supportedIntervals.includes('year')
    && plan.stripeAnnualPriceConfigured
  );
}

export function normalizePublicBillingInterval(
  requestedInterval: PlanBillingInterval,
  plans: PublicPricingPlan[]
): PlanBillingInterval {
  return requestedInterval === 'year' && hasCompleteAnnualPricing(plans) ? 'year' : 'month';
}

export function formatAnnualSavings(plan: PublicPricingPlan): string | null {
  if (
    plan.slug === 'free'
    || typeof plan.monthlyPriceCents !== 'number'
    || typeof plan.annualPriceCents !== 'number'
    || plan.monthlyPriceCents <= 0
    || plan.annualPriceCents <= 0
  ) {
    return null;
  }

  const annualMonthlyTotal = plan.monthlyPriceCents * 12;
  const savingsCents = annualMonthlyTotal - plan.annualPriceCents;
  if (savingsCents <= 0) return null;

  return `Save ${formatCurrencyCents(savingsCents, plan.currency)}/year`;
}

export function formatAnnualSavingsPercentSummary(plans: PublicPricingPlan[]): string | null {
  const percents = plans
    .filter((plan) => plan.slug !== 'free')
    .map((plan) => {
      if (
        typeof plan.monthlyPriceCents !== 'number'
        || typeof plan.annualPriceCents !== 'number'
        || plan.monthlyPriceCents <= 0
        || plan.annualPriceCents <= 0
      ) {
        return null;
      }

      const annualMonthlyTotal = plan.monthlyPriceCents * 12;
      const savingsCents = annualMonthlyTotal - plan.annualPriceCents;
      if (savingsCents <= 0) return null;
      return (savingsCents / annualMonthlyTotal) * 100;
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (percents.length === 0) return null;

  const averagePercent = percents.reduce((sum, value) => sum + value, 0) / percents.length;
  return `Save about ${Math.round(averagePercent)}% annually`;
}

export function formatPublicPlanPrice(
  plan: PublicPricingPlan,
  interval: PlanBillingInterval
): PublicPlanPriceDisplay {
  if (plan.slug === 'free' || plan.monthlyPriceCents === 0) {
    return {
      main: '$0',
      suffix: '',
      helper: 'No card required',
      savings: null,
    };
  }

  if (interval === 'year' && typeof plan.annualPriceCents === 'number' && plan.annualPriceCents > 0) {
    return {
      main: formatCurrencyCents(Math.round(plan.annualPriceCents / 12), plan.currency),
      suffix: '/mo',
      helper: `billed ${formatCurrencyCents(plan.annualPriceCents, plan.currency)} yearly`,
      savings: formatAnnualSavings(plan),
    };
  }

  if (typeof plan.monthlyPriceCents !== 'number') {
    return {
      main: 'Custom',
      suffix: '',
      helper: 'Contact sales',
      savings: null,
    };
  }

  return {
    main: formatCurrencyCents(plan.monthlyPriceCents, plan.currency),
    suffix: '/mo',
    helper: 'billed monthly',
    savings: null,
  };
}

export function getPublicPlanCardFeatures(plan: PublicPricingPlan): string[] {
  const creditLabel = plan.monthlyCreditGrant === null
    ? 'Configured monthly credits'
    : plan.slug === 'pro'
      ? `${plan.monthlyCreditGrant.toLocaleString('en-US')} shared workspace credits`
      : plan.slug === 'teams'
        ? `${plan.monthlyCreditGrant.toLocaleString('en-US')} pooled team credits`
        : `${plan.monthlyCreditGrant.toLocaleString('en-US')} monthly credits`;
  const seatLabel = typeof plan.includedSeats === 'number'
    ? `${plan.includedSeats} ${plan.includedSeats === 1 ? 'seat' : 'seats'}`
    : 'Configured seats';

  return [
    creditLabel,
    seatLabel,
    typeof plan.maxUploadMinutes === 'number' ? `${plan.maxUploadMinutes}-minute max upload` : 'Configured upload length',
    plan.topUpEnabled ? 'Top-ups available' : 'Top-ups unavailable',
  ];
}

export function buildSignupHref(plan: PublicPricingPlan, interval: PlanBillingInterval): string {
  if (plan.slug === 'free') return '/auth/signup';
  const params = new URLSearchParams({
    plan: plan.slug,
    interval,
  });
  return `/auth/signup?${params.toString()}`;
}

function buildUsageRows(plans: PublicPricingPlan[]): PublicPricingComparisonRow[] {
  return [
    {
      label: 'Monthly credits',
      values: allPlanValues(plans, (plan) => textCell(formatCreditsForPlan(plan))),
    },
    {
      label: 'Included seats',
      values: allPlanValues(plans, (plan) => textCell(
        typeof plan.includedSeats === 'number' ? formatNumber(plan.includedSeats) : 'Configured in billing'
      )),
    },
    {
      label: 'Max upload length',
      values: allPlanValues(plans, (plan) => textCell(
        typeof plan.maxUploadMinutes === 'number' ? `${plan.maxUploadMinutes} min` : 'Configured in billing'
      )),
    },
    {
      label: 'Top-up purchases',
      values: allPlanValues(plans, (plan) => plan.topUpEnabled ? checkCell() : dashCell()),
    },
    {
      label: 'Extra paid seats',
      values: allPlanValues(plans, (plan) => plan.teamsExtraSeatsEnabled ? checkCell() : dashCell()),
    },
  ];
}

function buildRecordingOutputRows(plans: PublicPricingPlan[]): PublicPricingComparisonRow[] {
  const rows: PublicPricingComparisonRow[] = [
    {
      label: 'Transcript',
      values: allIncludedValues(plans),
    },
  ];

  for (const option of ANALYSIS_OPTION_CONFIG) {
    rows.push({
      label: option.key === 'namedSpeakers' ? 'Named Speakers' : option.label,
      description: option.description,
      values: allIncludedValues(plans),
    });
  }

  return rows;
}

export function getImplementedGeneratedContentTypeNames(): string[] {
  const byId = new Map(CONTENT_TYPES.map((contentType) => [contentType.id, contentType]));
  return supportedContentTypeIds
    .map((id) => byId.get(id))
    .filter((contentType): contentType is NonNullable<typeof contentType> => Boolean(contentType?.enabled))
    .map((contentType) => contentType.name);
}

function buildGeneratedContentRows(plans: PublicPricingPlan[]): PublicPricingComparisonRow[] {
  return getImplementedGeneratedContentTypeNames().map((name) => ({
    label: name,
    values: allIncludedValues(plans),
  }));
}

function buildStudioRows(plans: PublicPricingPlan[]): PublicPricingComparisonRow[] {
  return [
    'Studio profiles',
    'Brand voices',
    'Campaign plans',
    'Library drafts',
    'Draft statuses and versions',
    'Analytics surface',
  ].map((label) => ({
    label,
    values: allIncludedValues(plans),
  }));
}

function hasIntegrationImportCode(): boolean {
  return integrationImportProviders.some((provider) => isIntegrationEnabled(provider));
}

function buildIntegrationTeamRows(plans: PublicPricingPlan[]): PublicPricingComparisonRow[] {
  const rows: PublicPricingComparisonRow[] = [];

  if (hasIntegrationImportCode()) {
    rows.push({
      label: 'Integration imports',
      description: 'Connect supported sources and import recordings, notes, files, or uploads.',
      // Rollout-state language is intentionally not exposed on the public pricing page.
      values: allIncludedValues(plans),
    });
  }

  rows.push(
    {
      label: 'Team workspace',
      values: allPlanValues(plans, (plan) => (plan.includedSeats || 0) > 1 ? checkCell() : dashCell()),
    },
    {
      label: 'Team invites',
      values: allPlanValues(plans, (plan) => (plan.includedSeats || 0) > 1 ? checkCell() : dashCell()),
    },
    {
      label: 'Roles',
      values: allPlanValues(plans, (plan) => (plan.includedSeats || 0) > 1 ? checkCell() : dashCell()),
    },
    {
      label: 'Centralized billing',
      values: allPlanValues(plans, (plan) => plan.slug === 'free' ? dashCell() : checkCell()),
    },
  );

  return rows;
}

export function buildPublicPricingComparisonGroups(
  plans: PublicPricingPlan[]
): PublicPricingComparisonGroup[] {
  return [
    {
      title: 'Usage',
      rows: buildUsageRows(plans),
    },
    {
      title: 'Recording Outputs',
      rows: buildRecordingOutputRows(plans),
    },
    {
      title: 'Generated Content',
      rows: buildGeneratedContentRows(plans),
    },
    {
      title: 'Studio & Workflow',
      rows: buildStudioRows(plans),
    },
    {
      title: 'Integrations & Team',
      rows: buildIntegrationTeamRows(plans),
    },
  ].filter((group) => group.rows.length > 0);
}
