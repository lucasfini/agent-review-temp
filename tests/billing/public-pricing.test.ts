import {
  buildPublicPricingComparisonGroups,
  buildPublicPricingPlans,
  buildSignupHref,
  formatAnnualSavings,
  formatAnnualSavingsPercentSummary,
  formatPublicPlanPrice,
  getImplementedGeneratedContentTypeNames,
  getPublicPlanCardFeatures,
  hasCompleteAnnualPricing,
  normalizePublicBillingInterval,
  type PublicPricingCell,
} from '@/lib/billing/public-pricing';
import type { KnownPlanSlug, Plan } from '@/lib/billing/plans';
import { PLAN_MAX_UPLOAD_MINUTES } from '@/lib/billing/plan-upload-limits';

function plan(slug: KnownPlanSlug, overrides: Partial<Plan> = {}): Plan {
  const base: Record<KnownPlanSlug, {
    name: string;
    monthlyPriceCents: number;
    annualPriceCents: number;
    monthlyCreditGrant: number;
    seatLimit: number;
    topUpEnabled: boolean;
    isPopular: boolean;
  }> = {
    free: {
      name: 'Free',
      monthlyPriceCents: 0,
      annualPriceCents: 0,
      monthlyCreditGrant: 300,
      seatLimit: 1,
      topUpEnabled: false,
      isPopular: false,
    },
    standard: {
      name: 'Standard',
      monthlyPriceCents: 4999,
      annualPriceCents: 50388,
      monthlyCreditGrant: 3000,
      seatLimit: 1,
      topUpEnabled: true,
      isPopular: false,
    },
    pro: {
      name: 'Pro',
      monthlyPriceCents: 14900,
      annualPriceCents: 151200,
      monthlyCreditGrant: 10000,
      seatLimit: 3,
      topUpEnabled: true,
      isPopular: true,
    },
    teams: {
      name: 'Teams',
      monthlyPriceCents: 39900,
      annualPriceCents: 406800,
      monthlyCreditGrant: 35000,
      seatLimit: 5,
      topUpEnabled: true,
      isPopular: false,
    },
  };
  const preset = base[slug];

  return {
    id: `plan-${slug}`,
    name: preset.name,
    slug,
    description: null,
    stripePriceId: null,
    stripeMonthlyPriceId: slug === 'free' ? null : `price_${slug}_monthly`,
    stripeAnnualPriceId: slug === 'free' ? null : `price_${slug}_annual`,
    stripeExtraSeatMonthlyPriceId: slug === 'teams' ? 'price_teams_extra_seat_monthly' : null,
    stripeExtraSeatAnnualPriceId: slug === 'teams' ? 'price_teams_extra_seat_annual' : null,
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
    extraSeatPriceCents: slug === 'teams' ? 2900 : null,
    isPopular: preset.isPopular,
    features: {},
    isActive: true,
    displayOrder: 10,
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...overrides,
  };
}

function plans(overrides: Partial<Record<KnownPlanSlug, Partial<Plan>>> = {}) {
  return buildPublicPricingPlans([
    plan('free', overrides.free),
    plan('standard', overrides.standard),
    plan('pro', overrides.pro),
    plan('teams', overrides.teams),
  ]);
}

function findRow(groupTitle: string, label: string, publicPlans = plans()) {
  const group = buildPublicPricingComparisonGroups(publicPlans).find((item) => item.title === groupTitle);
  const row = group?.rows.find((item) => item.label === label);
  if (!row) throw new Error(`Missing row ${groupTitle} / ${label}`);
  return row;
}

function valueText(cell: PublicPricingCell): string {
  if (cell.type === 'text') return cell.value;
  if (cell.type === 'check') return cell.label || 'check';
  return 'dash';
}

describe('public pricing presentation', () => {
  it('formats monthly prices, annual effective monthly prices, and live annual savings', () => {
    const publicPlans = plans();
    const standard = publicPlans.find((item) => item.slug === 'standard')!;

    expect(formatPublicPlanPrice(standard, 'month')).toEqual({
      main: '$49.99',
      suffix: '/mo',
      helper: 'billed monthly',
      savings: null,
    });
    expect(formatPublicPlanPrice(standard, 'year')).toEqual({
      main: '$41.99',
      suffix: '/mo',
      helper: 'billed $503.88 yearly',
      savings: 'Save $96/year',
    });
    expect(formatAnnualSavings(standard)).toBe('Save $96/year');
    expect(formatAnnualSavingsPercentSummary(publicPlans)).toBe('Save about 15% annually');
  });

  it('falls back to monthly when annual pricing is missing or not configured', () => {
    const publicPlans = plans({
      pro: {
        annualPriceCents: null,
        stripeAnnualPriceId: null,
      },
    });

    expect(hasCompleteAnnualPricing(publicPlans)).toBe(false);
    expect(normalizePublicBillingInterval('year', publicPlans)).toBe('month');
  });

  it('preserves selected paid plan and interval in signup handoff while Free stays outside Stripe checkout', () => {
    const publicPlans = plans();
    const free = publicPlans.find((item) => item.slug === 'free')!;
    const pro = publicPlans.find((item) => item.slug === 'pro')!;

    expect(buildSignupHref(free, 'year')).toBe('/auth/signup');
    expect(buildSignupHref(pro, 'year')).toBe('/auth/signup?plan=pro&interval=year');
  });

  it('renders Free top-ups as unavailable and paid top-ups as available', () => {
    const row = findRow('Usage', 'Top-up purchases');

    expect(valueText(row.values.free)).toBe('dash');
    expect(valueText(row.values.standard)).toBe('check');
    expect(valueText(row.values.pro)).toBe('check');
    expect(valueText(row.values.teams)).toBe('check');
  });

  it('shows Teams extra seats only when extra-seat billing is configured', () => {
    const configured = findRow('Usage', 'Extra paid seats');
    expect(valueText(configured.values.teams)).toBe('check');

    const unconfiguredPlans = plans({
      teams: {
        extraSeatPriceCents: null,
        stripeExtraSeatMonthlyPriceId: null,
        stripeExtraSeatAnnualPriceId: null,
      },
    });
    const unconfigured = findRow('Usage', 'Extra paid seats', unconfiguredPlans);
    expect(valueText(unconfigured.values.teams)).toBe('dash');
  });

  it('positions Pro credits as shared workspace credits and Teams credits as pooled team credits', () => {
    const row = findRow('Usage', 'Monthly credits');

    expect(valueText(row.values.pro)).toBe('10,000 shared workspace credits');
    expect(valueText(row.values.teams)).toBe('35,000 pooled team credits');
  });

  it('exposes the same pricing-card feature bullets used by public and billing plan cards', () => {
    const publicPlans = plans();
    const free = publicPlans.find((item) => item.slug === 'free')!;
    const teams = publicPlans.find((item) => item.slug === 'teams')!;

    expect(getPublicPlanCardFeatures(free)).toEqual([
      '300 monthly credits',
      '1 seat',
      '30-minute max upload',
      'Top-ups unavailable',
    ]);
    expect(getPublicPlanCardFeatures(teams)).toEqual([
      '35,000 pooled team credits',
      '5 seats',
      '240-minute max upload',
      'Top-ups available',
    ]);
  });

  it('shows the plan-specific max upload length row', () => {
    const row = findRow('Usage', 'Max upload length');

    expect(valueText(row.values.free)).toBe('30 min');
    expect(valueText(row.values.standard)).toBe('90 min');
    expect(valueText(row.values.pro)).toBe('180 min');
    expect(valueText(row.values.teams)).toBe('240 min');
  });

  it('includes integration imports without public rollout-state wording', () => {
    const row = findRow('Integrations & Team', 'Integration imports');
    const serialized = JSON.stringify(row);

    expect(valueText(row.values.free)).toBe('check');
    expect(serialized.toLowerCase()).not.toContain('partial');
    expect(serialized.toLowerCase()).not.toContain('coming soon');
    expect(serialized.toLowerCase()).not.toContain('limited beta');
  });

  it('builds generated content rows from implemented enabled content types', () => {
    const names = getImplementedGeneratedContentTypeNames();
    expect(names).toEqual([
      'X Threads',
      'LinkedIn Posts',
      'Instagram Carousel',
      'Facebook Post',
      'Blog Post',
      'Email Newsletter',
      'Show Notes',
      'YouTube Description',
      'Podcast Description',
      'Short-Form Video Script',
      'Quote Graphics',
    ]);

    for (const name of names) {
      const row = findRow('Generated Content', name);
      expect(valueText(row.values.free)).toBe('check');
      expect(valueText(row.values.teams)).toBe('check');
    }
  });

  it('builds recording output rows from implemented analysis options and does not make them plan-exclusive', () => {
    for (const name of ['Transcript', 'Named Speakers', 'Summary', 'Insights', 'Chapters', 'Takeaways', 'Quotes']) {
      const row = findRow('Recording Outputs', name);
      expect(valueText(row.values.free)).toBe('check');
      expect(valueText(row.values.standard)).toBe('check');
      expect(valueText(row.values.pro)).toBe('check');
      expect(valueText(row.values.teams)).toBe('check');
    }
  });

  it('does not emit unsupported public pricing labels', () => {
    const serialized = JSON.stringify(buildPublicPricingComparisonGroups(plans()));

    const unsupportedLabels = [
      ['part', 'ial'],
      ['Top-ups ', 'included'],
      ['Content ', 'Kit'],
      ['Repurpose ', 'Pack'],
      ['Content ', 'intelligence'],
      ['Shared team ', 'context'],
      ['Pooled content ', 'operations'],
      ['Source-backed ', 'transcripts'],
      ['Review-ready content ', 'drafts'],
    ].map((parts) => parts.join(''));

    for (const unsupported of unsupportedLabels) {
      expect(serialized).not.toContain(unsupported);
    }
  });
});
