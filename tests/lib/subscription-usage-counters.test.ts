import {
  getCurrentSubscriptionUsagePeriod,
  getFallbackCalendarUsagePeriod,
  getUsageCounterKeyForAction,
  incrementSubscriptionUsageCounter,
  recordSubscriptionUsage,
} from '@/lib/billing/subscription-usage-counters';

function counterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'counter-1',
    organization_id: 'org-1',
    subscription_id: 'subscription-1',
    period_start: '2026-06-01T00:00:00.000Z',
    period_end: '2026-07-01T00:00:00.000Z',
    counter_key: 'content_generation',
    quantity: 2,
    unit: 'count',
    metadata_json: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('subscription usage counter helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses active subscription periods when available', () => {
    expect(getCurrentSubscriptionUsagePeriod({
      id: 'subscription-1',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    })).toEqual({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      source: 'subscription_period',
      subscriptionId: 'subscription-1',
    });
  });

  it('falls back to the current calendar month without a valid subscription period', () => {
    expect(getFallbackCalendarUsagePeriod(new Date('2026-06-15T12:00:00.000Z'))).toEqual({
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      source: 'calendar_month',
      subscriptionId: null,
    });
    expect(getCurrentSubscriptionUsagePeriod(null, new Date('2026-06-15T12:00:00.000Z')).source)
      .toBe('calendar_month');
  });

  it('maps entitlement actions to canonical counter keys', () => {
    expect(getUsageCounterKeyForAction('content_generation')).toBe('content_generation');
    expect(getUsageCounterKeyForAction('transcription')).toBe('transcription_minutes');
    expect(getUsageCounterKeyForAction('audio_upload')).toBe('audio_upload');
    expect(getUsageCounterKeyForAction('integration_import')).toBe('integration_import');
    expect(getUsageCounterKeyForAction('storage')).toBe('storage_mb');
    expect(getUsageCounterKeyForAction('seat')).toBe('seat');
  });

  it('inserts a new counter row when no period counter exists', async () => {
    let insertPayload: Record<string, unknown> | null = null;
    const inserted = counterRow({ quantity: 1, metadata_json: { source: 'test' } });
    const insertQuery: any = {
      select: jest.fn(() => insertQuery),
      single: jest.fn(() => ({ data: inserted, error: null })),
    };
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn(() => ({ data: null, error: null })),
      insert: jest.fn((payload) => {
        insertPayload = payload;
        return insertQuery;
      }),
    };
    const supabase = { from: jest.fn(() => query) };

    const result = await incrementSubscriptionUsageCounter(supabase as any, {
      organizationId: 'org-1',
      subscriptionId: 'subscription-1',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      counterKey: 'content_generation',
      quantity: 1,
      idempotencyKey: 'idem-1',
      metadata: { source: 'test' },
    });

    expect(result.duplicate).toBe(false);
    expect(result.counter.quantity).toBe(1);
    expect(insertPayload).toMatchObject({
      organization_id: 'org-1',
      subscription_id: 'subscription-1',
      counter_key: 'content_generation',
      quantity: 1,
      unit: 'count',
    });
    expect((insertPayload?.metadata_json as any).idempotencyKeys).toContain('idem-1');
  });

  it('uses the atomic increment RPC when it is available', async () => {
    const supabase = {
      rpc: jest.fn(() => ({
        data: counterRow({ quantity: 3 }),
        error: null,
      })),
      from: jest.fn(),
    };

    const result = await incrementSubscriptionUsageCounter(supabase as any, {
      organizationId: 'org-1',
      subscriptionId: 'subscription-1',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      counterKey: 'content_generation',
      quantity: 3,
      idempotencyKey: 'idem-rpc',
      metadata: { source: 'test' },
    });

    expect(result.counter.quantity).toBe(3);
    expect(supabase.rpc).toHaveBeenCalledWith('increment_subscription_usage_counter', {
      p_organization_id: 'org-1',
      p_subscription_id: 'subscription-1',
      p_period_start: '2026-06-01T00:00:00.000Z',
      p_period_end: '2026-07-01T00:00:00.000Z',
      p_counter_key: 'content_generation',
      p_quantity: 3,
      p_unit: 'count',
      p_metadata_json: { source: 'test' },
      p_idempotency_key: 'idem-rpc',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not increment a counter twice for the same idempotency key', async () => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn(() => ({
        data: counterRow({ metadata_json: { idempotencyKeys: ['idem-1'] } }),
        error: null,
      })),
      update: jest.fn(() => query),
    };
    const supabase = { from: jest.fn(() => query) };

    const result = await incrementSubscriptionUsageCounter(supabase as any, {
      organizationId: 'org-1',
      subscriptionId: 'subscription-1',
      periodStart: '2026-06-01T00:00:00.000Z',
      periodEnd: '2026-07-01T00:00:00.000Z',
      counterKey: 'content_generation',
      quantity: 1,
      idempotencyKey: 'idem-1',
    });

    expect(result.duplicate).toBe(true);
    expect(result.counter.quantity).toBe(2);
    expect(query.update).not.toHaveBeenCalled();
  });

  it('keeps counter recording failures non-blocking', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn(() => ({ data: null, error: { message: 'table unavailable' } })),
    };
    const supabase = { from: jest.fn(() => query) };

    const result = await recordSubscriptionUsage({
      supabase: supabase as any,
      organizationId: 'org-1',
      subscription: null,
      counterKey: 'audio_upload',
      quantity: 1,
      idempotencyKey: 'idem-1',
      logContext: {
        route: 'test',
        userId: 'user-1',
      },
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[SUBSCRIPTION_USAGE_COUNTERS] Failed to record usage counter:',
      expect.objectContaining({
        counterKey: 'audio_upload',
        organizationId: 'org-1',
      })
    );
  });
});
