import {
  getStripeSubscriptionPeriod,
  mapStripeSubscriptionStatus,
  storeOrganizationStripeCustomerId,
  upsertOrganizationSubscriptionFromStripe,
} from '@/lib/billing/subscriptions';

function subscriptionRow(overrides: Record<string, any> = {}) {
  return {
    id: 'row-1',
    organization_id: 'org-1',
    plan_id: 'plan-starter',
    plan: null,
    stripe_customer_id: 'cus_123',
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
    ...overrides,
  };
}

function buildSupabaseQueue(results: Array<{ data: any; error?: any }>) {
  const queries: any[] = [];
  const from = jest.fn(() => {
    const result = results.shift() || { data: null, error: null };
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      maybeSingle: jest.fn(async () => ({ data: result.data, error: result.error || null })),
      update: jest.fn(() => query),
      insert: jest.fn(() => query),
    };
    queries.push(query);
    return query;
  });

  return { supabase: { from }, queries };
}

function buildSupabaseFromHandlers(handlers: Record<string, (query: any) => { data: any; error?: any }>) {
  const queries: any[] = [];
  const from = jest.fn((table: string) => {
    const query: any = {
      table,
      filters: [] as Array<[string, string, any]>,
      select: jest.fn(() => query),
      eq: jest.fn((column: string, value: any) => {
        query.filters.push(['eq', column, value]);
        return query;
      }),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      maybeSingle: jest.fn(async () => {
        const result = handlers[table]?.(query) || { data: null, error: null };
        return { data: result.data, error: result.error || null };
      }),
      update: jest.fn(() => query),
      insert: jest.fn(() => query),
    };
    queries.push(query);
    return query;
  });

  return { supabase: { from }, queries };
}

describe('Stripe subscription sync helpers', () => {
  it('maps Stripe subscription statuses into internal statuses', () => {
    expect(mapStripeSubscriptionStatus('active')).toBe('active');
    expect(mapStripeSubscriptionStatus('trialing')).toBe('trialing');
    expect(mapStripeSubscriptionStatus('past_due')).toBe('past_due');
    expect(mapStripeSubscriptionStatus('canceled')).toBe('canceled');
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('unpaid');
    expect(mapStripeSubscriptionStatus('incomplete')).toBe('incomplete');
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('incomplete_expired');
    expect(mapStripeSubscriptionStatus('paused')).toBe('inactive');
    expect(mapStripeSubscriptionStatus('unknown')).toBe('inactive');
    expect(mapStripeSubscriptionStatus(null)).toBe('inactive');
  });

  it('derives billing period dates from the first subscription item', () => {
    const period = getStripeSubscriptionPeriod({
      id: 'sub_123',
      customer: 'cus_123',
      items: {
        data: [
          {
            current_period_start: 1798761600,
            current_period_end: 1801440000,
            price: { id: 'price_starter' },
          },
        ],
      },
    });

    expect(period).toEqual({
      currentPeriodStart: '2027-01-01T00:00:00.000Z',
      currentPeriodEnd: '2027-02-01T00:00:00.000Z',
    });
  });

  it('stores checkout customer ids without activating the pending paid plan before payment', async () => {
    const existingFree = subscriptionRow({
      id: 'free-subscription',
      plan_id: 'plan-free',
      status: 'active',
      stripe_customer_id: null,
    });
    let updatePayload: Record<string, any> | null = null;
    const updatedFree = {
      ...existingFree,
      stripe_customer_id: 'cus_new',
      metadata_json: {
        stripeCustomerId: 'cus_new',
        pendingCheckoutPlanId: 'plan-standard',
      },
    };
    const queries: any[] = [];
    const supabase = {
      from: jest.fn(() => {
        const query: any = {
          data: [existingFree],
          error: null,
          select: jest.fn(() => query),
          eq: jest.fn(() => query),
          order: jest.fn(() => query),
          limit: jest.fn(() => query),
          update: jest.fn((payload) => {
            updatePayload = payload;
            return query;
          }),
          maybeSingle: jest.fn(async () => ({ data: updatedFree, error: null })),
        };
        queries.push(query);
        return query;
      }),
    };

    const result = await storeOrganizationStripeCustomerId(
      supabase as any,
      'org-1',
      'cus_new',
      {
        planId: 'plan-standard',
        metadata: {
          source: 'subscription_checkout',
        },
      }
    );

    expect(result?.planId).toBe('plan-free');
    expect(updatePayload).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      plan_id: 'plan-free',
      stripe_customer_id: 'cus_new',
      status: 'active',
    }));
    expect(updatePayload?.metadata_json).toEqual(expect.objectContaining({
      pendingCheckoutPlanId: 'plan-standard',
      source: 'subscription_checkout',
      stripeCustomerId: 'cus_new',
    }));
    expect(updatePayload?.stripe_subscription_id).toBeUndefined();
  });

  it('updates an existing organization/customer placeholder instead of inserting a duplicate', async () => {
    const existing = subscriptionRow();
    const updated = subscriptionRow({
      stripe_subscription_id: 'sub_123',
      status: 'active',
      current_period_start: '2027-01-01T00:00:00.000Z',
      current_period_end: '2027-02-01T00:00:00.000Z',
      metadata_json: {
        stripeSubscriptionId: 'sub_123',
      },
    });
    const { supabase, queries } = buildSupabaseQueue([
      { data: null },
      { data: existing },
      {
        data: {
          id: 'plan-starter',
          name: 'Starter',
          slug: 'starter',
          description: null,
          stripe_price_id: 'price_starter',
          monthly_price_cents: 29900,
          currency: 'usd',
          seat_limit: 3,
          monthly_generation_limit: 4,
          monthly_transcription_minute_limit: 600,
          monthly_import_limit: 4,
          monthly_storage_mb_limit: 5000,
          integration_limit: 2,
          features_json: {},
          is_active: true,
          display_order: 10,
          created_at: '2026-06-04T00:00:00.000Z',
          updated_at: '2026-06-04T00:00:00.000Z',
        },
      },
      { data: updated },
    ]);

    const result = await upsertOrganizationSubscriptionFromStripe(supabase as any, {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: true,
      trial_start: null,
      trial_end: null,
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-starter',
        plan_slug: 'starter',
      },
      items: {
        data: [
          {
            current_period_start: 1798761600,
            current_period_end: 1801440000,
            price: { id: 'price_starter' },
          },
        ],
      },
    }, {
      eventType: 'customer.subscription.updated',
    });

    expect(result?.stripeSubscriptionId).toBe('sub_123');
    const updateQuery = queries.find((query) => query.update.mock.calls.length > 0);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 'org-1',
      plan_id: 'plan-starter',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      current_period_start: '2027-01-01T00:00:00.000Z',
      current_period_end: '2027-02-01T00:00:00.000Z',
      cancel_at_period_end: true,
    }));
    expect(updateQuery.insert).not.toHaveBeenCalled();
  });

  it('keeps the persisted organization when Stripe metadata disagrees with an existing subscription row', async () => {
    const existing = subscriptionRow({
      stripe_subscription_id: 'sub_123',
      organization_id: 'org-1',
      plan_id: 'plan-starter',
    });
    const updated = subscriptionRow({
      stripe_subscription_id: 'sub_123',
      organization_id: 'org-1',
      status: 'active',
    });
    const { supabase, queries } = buildSupabaseQueue([
      { data: existing },
      { data: updated },
    ]);

    const result = await upsertOrganizationSubscriptionFromStripe(supabase as any, {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        organization_id: 'org-other',
      },
      items: { data: [] },
    });

    expect(result?.organizationId).toBe('org-1');
    const updateQuery = queries.find((query) => query.update.mock.calls.length > 0);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 'org-1',
      stripe_subscription_id: 'sub_123',
      status: 'active',
    }));
  });

  it('skips new subscription sync when metadata references an unknown organization', async () => {
    const { supabase, queries } = buildSupabaseQueue([
      { data: null },
      { data: null },
      { data: null },
      { data: null },
    ]);

    const result = await upsertOrganizationSubscriptionFromStripe(supabase as any, {
      id: 'sub_unknown_org',
      customer: 'cus_unknown',
      status: 'active',
      metadata: {
        organization_id: 'org-missing',
      },
      items: { data: [] },
    });

    expect(result).toBeNull();
    expect(queries.some((query) => query.insert.mock.calls.length > 0)).toBe(false);
  });

  it('falls back to Stripe price lookup when metadata plan id is unknown', async () => {
    const existing = subscriptionRow({ plan_id: null });
    const updated = subscriptionRow({
      plan_id: 'plan-growth',
      stripe_subscription_id: 'sub_123',
      status: 'active',
    });
    const { supabase, queries } = buildSupabaseFromHandlers({
      organization_subscriptions: (query) => {
        if (query.update.mock.calls.length > 0) return { data: updated };
        const subscriptionFilter = query.filters.find((filter: any[]) => filter[1] === 'stripe_subscription_id');
        if (subscriptionFilter) return { data: null };
        return { data: existing };
      },
      plans: (query) => {
        const idFilter = query.filters.find((filter: any[]) => filter[1] === 'id');
        const slugFilter = query.filters.find((filter: any[]) => filter[1] === 'slug');
        const priceFilter = query.filters.find((filter: any[]) => filter[1] === 'stripe_price_id');

        if (idFilter || slugFilter) return { data: null };
        if (priceFilter?.[2] === 'price_growth') {
          return {
            data: {
              id: 'plan-growth',
              name: 'Growth',
              slug: 'growth',
              description: null,
              stripe_price_id: 'price_growth',
              monthly_price_cents: 79900,
              currency: 'usd',
              seat_limit: 10,
              monthly_generation_limit: 12,
              monthly_transcription_minute_limit: 2400,
              monthly_import_limit: 12,
              monthly_storage_mb_limit: 25000,
              integration_limit: 5,
              features_json: {},
              is_active: true,
              display_order: 20,
              created_at: '2026-06-04T00:00:00.000Z',
              updated_at: '2026-06-04T00:00:00.000Z',
            },
          };
        }
        return { data: null };
      },
    });

    const result = await upsertOrganizationSubscriptionFromStripe(supabase as any, {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        organization_id: 'org-1',
        plan_id: 'missing-plan',
      },
      items: {
        data: [
          {
            current_period_start: 1798761600,
            current_period_end: 1801440000,
            price: { id: 'price_growth' },
          },
        ],
      },
    });

    expect(result?.planId).toBe('plan-growth');
    const updateQuery = queries.find((query) => query.update.mock.calls.length > 0);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      plan_id: 'plan-growth',
      stripe_subscription_id: 'sub_123',
    }));
  });

  it('prefers the current Stripe price over stale subscription metadata plan id', async () => {
    const existing = subscriptionRow({ plan_id: 'plan-starter' });
    const updated = subscriptionRow({
      plan_id: 'plan-growth',
      stripe_subscription_id: 'sub_123',
      status: 'active',
    });
    const { supabase, queries } = buildSupabaseFromHandlers({
      organization_subscriptions: (query) => {
        if (query.update.mock.calls.length > 0) return { data: updated };
        const subscriptionFilter = query.filters.find((filter: any[]) => filter[1] === 'stripe_subscription_id');
        if (subscriptionFilter) return { data: null };
        return { data: existing };
      },
      plans: (query) => {
        const priceFilter = query.filters.find((filter: any[]) => filter[1] === 'stripe_price_id');
        if (priceFilter?.[2] === 'price_growth') {
          return {
            data: {
              id: 'plan-growth',
              name: 'Growth',
              slug: 'growth',
              description: null,
              stripe_price_id: 'price_growth',
              monthly_price_cents: 79900,
              currency: 'usd',
              seat_limit: 10,
              monthly_generation_limit: 12,
              monthly_transcription_minute_limit: 2400,
              monthly_import_limit: 12,
              monthly_storage_mb_limit: 25000,
              integration_limit: 5,
              features_json: {},
              is_active: true,
              display_order: 20,
              created_at: '2026-06-04T00:00:00.000Z',
              updated_at: '2026-06-04T00:00:00.000Z',
            },
          };
        }
        return { data: null };
      },
    });

    await upsertOrganizationSubscriptionFromStripe(supabase as any, {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-starter',
      },
      items: {
        data: [
          {
            current_period_start: 1798761600,
            current_period_end: 1801440000,
            price: { id: 'price_growth' },
          },
        ],
      },
    });

    const updateQuery = queries.find((query) => query.update.mock.calls.length > 0);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      plan_id: 'plan-growth',
      stripe_subscription_id: 'sub_123',
    }));
  });
});
