import {
  buildDryRunEntitlementDecision,
  checkOrganizationEntitlement,
  getActionUsageCost,
  getCurrentPeriodUsage,
  getEntitlementUsagePeriod,
  getSubscriptionEnforcementMode,
  type EntitlementAction,
} from '@/lib/billing/entitlement-guards';
import type { Plan } from '@/lib/billing/plans';
import type { OrganizationSubscription } from '@/lib/billing/subscriptions';

const starterPlan: Plan = {
  id: 'plan-starter',
  name: 'Starter',
  slug: 'starter',
  description: null,
  stripePriceId: 'price_starter',
  monthlyPriceCents: 2900,
  currency: 'usd',
  limits: {
    seatLimit: 2,
    monthlyGenerationLimit: 4,
    monthlyTranscriptionMinuteLimit: 120,
    monthlyImportLimit: 3,
    monthlyStorageMbLimit: 1024,
    integrationLimit: 2,
  },
  features: {},
  isActive: true,
  displayOrder: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

function subscription(overrides: Partial<OrganizationSubscription> = {}): OrganizationSubscription {
  return {
    id: 'subscription-1',
    organizationId: 'org-1',
    planId: starterPlan.id,
    plan: starterPlan,
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    status: 'active',
    currentPeriodStart: '2026-06-01T00:00:00.000Z',
    currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    trialStart: null,
    trialEnd: null,
    metadata: {},
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildSupabaseMock(rows: Record<string, { data?: any[]; count?: number | null; error?: any }>) {
  const queries: Array<{ table: string; query: any }> = [];
  const from = jest.fn((table: string) => {
    const response = rows[table] || {};
    const query: any = {
      data: response.data || [],
      count: response.count ?? null,
      error: response.error || null,
      select: jest.fn(() => query),
      gte: jest.fn(() => query),
      lt: jest.fn(() => query),
      neq: jest.fn(() => query),
      eq: jest.fn(() => query),
      is: jest.fn(() => query),
      or: jest.fn(() => query),
    };
    queries.push({ table, query });
    return query;
  });

  return { from, queries };
}

describe('entitlement guard decisions', () => {
  it('parses enforcement mode with dry_run as the safe default', () => {
    expect(getSubscriptionEnforcementMode('enforce')).toBe('enforce');
    expect(getSubscriptionEnforcementMode('dry_run')).toBe('dry_run');
    expect(getSubscriptionEnforcementMode('unexpected')).toBe('dry_run');
    expect(getSubscriptionEnforcementMode(undefined)).toBe('dry_run');
  });

  it('keeps decisions dry-run by default even if enforce is configured', () => {
    const previousMode = process.env.SUBSCRIPTION_ENFORCEMENT_MODE;
    process.env.SUBSCRIPTION_ENFORCEMENT_MODE = 'enforce';

    try {
      const decision = buildDryRunEntitlementDecision({
        action: 'content_generation',
        organizationId: 'org-1',
        subscription: subscription(),
        currentUsage: 0,
        requestedAmount: 1,
        limit: 4,
        periodStart: '2026-06-01T00:00:00.000Z',
        periodEnd: '2026-07-01T00:00:00.000Z',
      });

      expect(decision.dryRun).toBe(true);
      expect(decision.allowed).toBe(true);
    } finally {
      if (previousMode === undefined) {
        delete process.env.SUBSCRIPTION_ENFORCEMENT_MODE;
      } else {
        process.env.SUBSCRIPTION_ENFORCEMENT_MODE = previousMode;
      }
    }
  });

  it('calculates requested action units without mutating billing costs', () => {
    expect(getActionUsageCost('transcription', { durationSeconds: 90 })).toBe(1.5);
    expect(getActionUsageCost('content_generation', { blockCount: 3 })).toBe(3);
    expect(getActionUsageCost('audio_upload')).toBe(1);
    expect(getActionUsageCost('storage', { storageMb: 512.12345 })).toBe(512.1235);
  });

  it('falls back to the current calendar month when no subscription period exists', () => {
    expect(getEntitlementUsagePeriod(null, new Date('2026-06-15T12:00:00.000Z'))).toEqual({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      source: 'calendar_month',
    });
  });

  it('marks usage within plan limits as allowed in dry-run', async () => {
    const supabase = buildSupabaseMock({
      billing_reservations: {
        data: [
          {
            workflow_type: 'content_generation',
            metadata: { blockCount: 1 },
          },
        ],
      },
    });

    const decision = await checkOrganizationEntitlement({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'content_generation',
      requestedAmount: 1,
      subscription: subscription(),
      dryRun: true,
    });

    expect(decision).toMatchObject({
      allowed: true,
      dryRun: true,
      reasonCode: 'within_limit',
      currentUsage: 1,
      requestedAmount: 1,
      projectedUsage: 2,
      limit: 4,
    });
    expect(supabase.queries[0].query.or).toHaveBeenCalledWith(
      'organization_id.eq.org-1,and(organization_id.is.null,user_id.eq.user-1)'
    );
  });

  it('returns a non-blocking legacy credit mode decision when subscription is missing', async () => {
    const supabase = buildSupabaseMock({ billing_reservations: { data: [] } });

    const decision = await checkOrganizationEntitlement({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'audio_upload',
      subscription: null,
      dryRun: true,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe('legacy_credit_mode');
    expect(decision.subscriptionStatus).toBe('missing');
  });

  it('reports inactive subscriptions as would-block decisions without enforcing', () => {
    const decision = buildDryRunEntitlementDecision({
      action: 'audio_upload',
      organizationId: 'org-1',
      subscription: subscription({ status: 'past_due' }),
      currentUsage: 0,
      requestedAmount: 1,
      limit: 3,
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      dryRun: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.dryRun).toBe(true);
    expect(decision.reasonCode).toBe('subscription_inactive');
  });

  it('reports limit exceeded decisions without enforcing', async () => {
    const supabase = buildSupabaseMock({
      billing_reservations: {
        data: [
          {
            workflow_type: 'content_generation',
            metadata: { blockCount: 4 },
          },
        ],
      },
    });

    const decision = await checkOrganizationEntitlement({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'content_generation',
      requestedAmount: 1,
      subscription: subscription(),
      dryRun: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('limit_exceeded');
    expect(decision.currentUsage).toBe(4);
    expect(decision.projectedUsage).toBe(5);
  });

  it('sums transcription usage from usage_events in minutes', async () => {
    const supabase = buildSupabaseMock({
      usage_events: {
        data: [
          {
            service_key: 'assemblyai_transcription',
            units: 120,
            unit_type: 'seconds',
          },
          {
            service_key: 'openai_gpt5_mini_input',
            units: 1000,
            unit_type: 'tokens',
          },
        ],
      },
    });

    const usage = await getCurrentPeriodUsage({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'transcription' as EntitlementAction,
      subscription: null,
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(usage).toEqual({
      action: 'transcription',
      organizationId: 'org-1',
      currentUsage: 2,
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      source: 'usage_events',
    });
  });
});
