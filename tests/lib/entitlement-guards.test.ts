import {
  buildEntitlementErrorBody,
  buildEntitlementErrorResponse,
  buildDryRunEntitlementDecision,
  checkOrganizationEntitlement,
  getActionUsageCost,
  getCurrentPeriodUsage,
  getEntitlementUsagePeriod,
  getSubscriptionEnforcementMode,
  runEntitlementGuard,
  shouldEnforceSubscriptionEntitlements,
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
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      maybeSingle: jest.fn(() => ({
        data: (response.data || [])[0] || null,
        error: response.error || null,
      })),
    };
    queries.push({ table, query });
    return query;
  });

  return { from, queries };
}

describe('entitlement guard decisions', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses enforcement mode with dry_run as the safe default', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getSubscriptionEnforcementMode('enforce')).toBe('enforce');
    expect(getSubscriptionEnforcementMode('dry_run')).toBe('dry_run');
    expect(getSubscriptionEnforcementMode('unexpected')).toBe('dry_run');
    expect(getSubscriptionEnforcementMode(undefined)).toBe('dry_run');
    expect(shouldEnforceSubscriptionEntitlements('enforce')).toBe(true);
    expect(shouldEnforceSubscriptionEntitlements('dry_run')).toBe(false);
    expect(shouldEnforceSubscriptionEntitlements('unexpected-2f')).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[ENTITLEMENT_ENFORCEMENT] Invalid SUBSCRIPTION_ENFORCEMENT_MODE value; falling back to dry_run.',
      expect.objectContaining({ supportedValues: ['dry_run', 'enforce'] })
    );
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
    const reservationQuery = supabase.queries.find((entry) => entry.table === 'billing_reservations')?.query;
    expect(reservationQuery?.or).toHaveBeenCalledWith(
      'organization_id.eq.org-1,and(organization_id.is.null,user_id.eq.user-1)'
    );
  });

  it('prefers canonical subscription usage counters when present', async () => {
    const supabase = buildSupabaseMock({
      subscription_usage_counters: {
        data: [
          {
            id: 'counter-1',
            organization_id: 'org-1',
            subscription_id: 'subscription-1',
            period_start: '2026-06-01T00:00:00.000Z',
            period_end: '2026-07-01T00:00:00.000Z',
            counter_key: 'content_generation',
            quantity: 3,
            unit: 'count',
            metadata_json: {},
            created_at: '2026-06-01T00:00:00.000Z',
            updated_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      },
      billing_reservations: {
        data: [
          {
            workflow_type: 'content_generation',
            metadata: { blockCount: 1 },
          },
        ],
      },
    });

    const usage = await getCurrentPeriodUsage({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'content_generation',
      subscription: subscription(),
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(usage).toMatchObject({
      currentUsage: 3,
      source: 'subscription_usage_counters',
    });
    expect(supabase.queries.some((entry) => entry.table === 'billing_reservations')).toBe(false);
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

  it('dry_run guard never returns a blocking response', async () => {
    const supabase = buildSupabaseMock({
      billing_reservations: { data: [] },
    });

    const result = await runEntitlementGuard({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'audio_upload',
      subscription: subscription({ status: 'past_due' }),
      enforcementMode: 'dry_run',
    });

    expect(result.enforcementActive).toBe(false);
    expect(result.response).toBeNull();
    expect(result.decision).toMatchObject({
      allowed: false,
      dryRun: true,
      reasonCode: 'subscription_inactive',
    });
  });

  it('enforce mode blocks missing subscriptions', async () => {
    const supabase = buildSupabaseMock({
      billing_reservations: { data: [] },
    });

    const result = await runEntitlementGuard({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'audio_upload',
      subscription: null,
      enforcementMode: 'enforce',
    });

    expect(result.enforcementActive).toBe(true);
    expect(result.decision).toMatchObject({
      allowed: false,
      dryRun: false,
      reasonCode: 'subscription_missing',
    });
    expect(result.response?.status).toBe(402);
    await expect(result.response?.json()).resolves.toMatchObject({
      error: 'subscription_required',
      reasonCode: 'subscription_missing',
      action: 'audio_upload',
      upgradeRequired: true,
      enforcementMode: 'enforce',
      dryRun: false,
    });
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

  it('enforce mode blocks inactive subscriptions', async () => {
    const supabase = buildSupabaseMock({
      billing_reservations: { data: [] },
    });

    const result = await runEntitlementGuard({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'audio_upload',
      subscription: subscription({ status: 'past_due' }),
      enforcementMode: 'enforce',
    });

    expect(result.response?.status).toBe(402);
    expect(result.decision).toMatchObject({
      allowed: false,
      dryRun: false,
      reasonCode: 'subscription_inactive',
    });
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

  it('enforce mode blocks limit exceeded decisions with a stable response shape', async () => {
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

    const result = await runEntitlementGuard({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'content_generation',
      requestedAmount: 1,
      subscription: subscription(),
      enforcementMode: 'enforce',
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(result.response?.status).toBe(429);
    const body = await result.response?.json();
    expect(body).toEqual({
      error: 'subscription_limit_exceeded',
      message: 'Your current plan limit has been reached.',
      reasonCode: 'limit_exceeded',
      action: 'content_generation',
      limit: 4,
      currentUsage: 4,
      requestedAmount: 1,
      projectedUsage: 5,
      upgradeRequired: true,
      enforcementMode: 'enforce',
      dryRun: false,
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      checkedAt: '2026-06-15T00:00:00.000Z',
    });
  });

  it('enforce mode allows usage within limits', async () => {
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

    const result = await runEntitlementGuard({
      supabase: supabase as any,
      organizationId: 'org-1',
      legacyUserId: 'user-1',
      action: 'content_generation',
      requestedAmount: 1,
      subscription: subscription(),
      enforcementMode: 'enforce',
    });

    expect(result.enforcementActive).toBe(true);
    expect(result.response).toBeNull();
    expect(result.decision).toMatchObject({
      allowed: true,
      dryRun: false,
      reasonCode: 'within_limit',
    });
  });

  it('blocked handlers return before recording counters', async () => {
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
    const recordCounter = jest.fn();

    async function fakeHandler() {
      const guard = await runEntitlementGuard({
        supabase: supabase as any,
        organizationId: 'org-1',
        legacyUserId: 'user-1',
        action: 'content_generation',
        requestedAmount: 1,
        subscription: subscription(),
        enforcementMode: 'enforce',
      });
      if (guard.response) return guard.response;
      recordCounter();
      return null;
    }

    const response = await fakeHandler();
    expect(response?.status).toBe(429);
    expect(recordCounter).not.toHaveBeenCalled();
  });

  it('builds entitlement error responses from decisions', async () => {
    const decision = buildDryRunEntitlementDecision({
      action: 'content_generation',
      organizationId: 'org-1',
      subscription: subscription(),
      currentUsage: 4,
      requestedAmount: 1,
      limit: 4,
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      dryRun: false,
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    expect(buildEntitlementErrorBody(decision)).toMatchObject({
      error: 'subscription_limit_exceeded',
      reasonCode: 'limit_exceeded',
      currentUsage: 4,
      requestedAmount: 1,
      projectedUsage: 5,
    });

    const response = buildEntitlementErrorResponse(decision);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'subscription_limit_exceeded',
      reasonCode: 'limit_exceeded',
    });
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
