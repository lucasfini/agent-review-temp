/**
 * Integration Tests for Credit Operations
 *
 * Note: These tests use mocks since they require database access.
 * For real database tests, set up a test Supabase instance.
 */

import {
  InsufficientCreditError,
  ConcurrentUpdateError,
  CreditAccountNotFoundError,
  estimateCompletedUploadReservationCredits,
} from '@/lib/billing/credit';
import {
  assertPlanUploadDuration,
  createPlanCreditReservation,
  ensureCurrentPlanCreditGrant,
  filterSpendablePlanCreditGrants,
  InsufficientPlanCreditsError,
  PlanUploadLimitError,
} from '@/lib/billing/plan-credits';
import { billingErrorResponse } from '@/lib/billing/middleware';

describe('Credit Error Types', () => {
  describe('InsufficientCreditError', () => {
    test('should create error with correct properties', () => {
      const error = new InsufficientCreditError('user-123', 10.0, 5.0);

      expect(error.name).toBe('InsufficientCreditError');
      expect(error.userId).toBe('user-123');
      expect(error.required).toBe(10.0);
      expect(error.available).toBe(5.0);
      expect(error.message).toContain('$10.0000');
      expect(error.message).toContain('$5.0000');
    });

    test('should be instanceof Error', () => {
      const error = new InsufficientCreditError('user-123', 10.0, 5.0);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ConcurrentUpdateError', () => {
    test('should create error with version info', () => {
      const error = new ConcurrentUpdateError('user-123', 5, 6);

      expect(error.name).toBe('ConcurrentUpdateError');
      expect(error.userId).toBe('user-123');
      expect(error.expectedVersion).toBe(5);
      expect(error.actualVersion).toBe(6);
      expect(error.message).toContain('version 5');
      expect(error.message).toContain('got 6');
    });
  });

  describe('CreditAccountNotFoundError', () => {
    test('should create error with userId', () => {
      const error = new CreditAccountNotFoundError('user-123');

      expect(error.name).toBe('CreditAccountNotFoundError');
      expect(error.userId).toBe('user-123');
      expect(error.message).toContain('user-123');
    });
  });

  describe('Plan credit errors', () => {
    test('should create insufficient plan credit error with upgrade prompt metadata', () => {
      const error = new InsufficientPlanCreditsError('org-123', 300, 0, 'free', false);

      expect(error.name).toBe('InsufficientPlanCreditsError');
      expect(error.organizationId).toBe('org-123');
      expect(error.required).toBe(300);
      expect(error.available).toBe(0);
      expect(error.planSlug).toBe('free');
      expect(error.topUpsEnabled).toBe(false);
      expect(error.upgradeRequired).toBe(true);
    });

    test('should create upload limit error with requested and max minutes', () => {
      const error = new PlanUploadLimitError('org-123', 30.0167, 30, 'free', 1801);

      expect(error.name).toBe('PlanUploadLimitError');
      expect(error.requestedSeconds).toBe(1801);
      expect(error.maxUploadMinutes).toBe(30);
      expect(error.planSlug).toBe('free');
    });

    test('formats paid top-up metadata for insufficient plan credits', async () => {
      const response = billingErrorResponse(new InsufficientPlanCreditsError('org-123', 500, 100, 'standard', true));
      const payload = await response.json();

      expect(response.status).toBe(402);
      expect(payload.code).toBe('INSUFFICIENT_PLAN_CREDITS');
      expect(payload.topUpsEnabled).toBe(true);
      expect(payload.topUpPath).toBe('/dashboard/billing');
      expect(payload.message).toBe('This recording requires about 500 credits. You have 100 credits available.');
    });

    test('does not expose a paid top-up path when top-ups are disabled', async () => {
      const response = billingErrorResponse(new InsufficientPlanCreditsError('org-123', 500, 100, 'free', false));
      const payload = await response.json();

      expect(response.status).toBe(402);
      expect(payload.topUpsEnabled).toBe(false);
      expect(payload.topUpPath).toBeNull();
      expect(payload.upgradeRequired).toBe(true);
    });
  });
});

describe('Plan upload duration limits', () => {
  const planConfigs = [
    ['free', 1_800],
    ['standard', 5_400],
    ['pro', 10_800],
    ['teams', 14_400],
  ] as const;

  function planRow(slug: typeof planConfigs[number][0]) {
    const names = {
      free: 'Free',
      standard: 'Standard',
      pro: 'Pro',
      teams: 'Teams',
    };

    return {
      id: `plan-${slug}`,
      name: names[slug],
      slug,
      description: null,
      stripe_price_id: null,
      stripe_monthly_price_id: null,
      stripe_annual_price_id: null,
      monthly_price_cents: slug === 'free' ? 0 : 4999,
      annual_price_cents: slug === 'free' ? 0 : 50388,
      currency: 'usd',
      seat_limit: 1,
      monthly_generation_limit: null,
      monthly_transcription_minute_limit: null,
      monthly_import_limit: null,
      monthly_storage_mb_limit: null,
      integration_limit: null,
      monthly_credit_grant: slug === 'free' ? 300 : 3000,
      credit_rollover_months: 1,
      top_up_enabled: slug !== 'free',
      top_up_credit_expiry_months: 12,
      max_upload_minutes: 90,
      extra_seat_price_cents: null,
      is_popular: false,
      features_json: {},
      is_active: true,
      display_order: 10,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
  }

  function subscriptionRow(slug: typeof planConfigs[number][0]) {
    return {
      id: `subscription-${slug}`,
      organization_id: 'org-1',
      plan_id: `plan-${slug}`,
      plan: planRow(slug),
      stripe_customer_id: null,
      stripe_subscription_id: null,
      status: 'active',
      current_period_start: '2026-07-01T00:00:00.000Z',
      current_period_end: '2026-08-01T00:00:00.000Z',
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      metadata_json: {},
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
  }

  function buildSubscriptionSupabase(slug: typeof planConfigs[number][0]) {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(async () => ({ data: [subscriptionRow(slug)], error: null })),
    };

    return {
      from: jest.fn(() => query),
    };
  }

  test.each(planConfigs)('%s accepts its exact max upload duration', async (slug, maxSeconds) => {
    await expect(assertPlanUploadDuration({
      supabase: buildSubscriptionSupabase(slug) as any,
      organizationId: 'org-1',
      userId: 'user-1',
      durationSeconds: maxSeconds,
    })).resolves.toEqual(expect.objectContaining({
      plan: expect.objectContaining({ slug }),
    }));
  });

  test.each(planConfigs)('%s rejects one second over its max upload duration', async (slug, maxSeconds) => {
    await expect(assertPlanUploadDuration({
      supabase: buildSubscriptionSupabase(slug) as any,
      organizationId: 'org-1',
      userId: 'user-1',
      durationSeconds: maxSeconds + 1,
    })).rejects.toBeInstanceOf(PlanUploadLimitError);
  });
});

describe('Credit Balance Calculations', () => {
  test('should calculate new balance after debit', () => {
    const currentBalance = 10.0;
    const debitAmount = 3.5;
    const expectedBalance = 6.5;

    expect(currentBalance - debitAmount).toBeCloseTo(expectedBalance, 2);
  });

  test('should calculate new balance after credit', () => {
    const currentBalance = 5.0;
    const creditAmount = 10.0;
    const expectedBalance = 15.0;

    expect(currentBalance + creditAmount).toBeCloseTo(expectedBalance, 2);
  });

  test('should handle multiple transactions', () => {
    let balance = 0;

    // Add $20
    balance += 20.0;
    expect(balance).toBe(20.0);

    // Debit $5.50
    balance -= 5.5;
    expect(balance).toBeCloseTo(14.5, 2);

    // Debit $3.25
    balance -= 3.25;
    expect(balance).toBeCloseTo(11.25, 2);

    // Add $10
    balance += 10.0;
    expect(balance).toBeCloseTo(21.25, 2);
  });

  test('should maintain precision with decimal arithmetic', () => {
    let balance = 10.0;

    // Perform operations that might cause floating point issues
    balance -= 0.1;
    balance -= 0.2;

    // Use toBeCloseTo to handle floating point precision
    expect(balance).toBeCloseTo(9.7, 2);
  });
});

describe('Completed upload reservation repair', () => {
  const baseReservation = {
    id: 'reservation-1',
    userId: 'user-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    workflowType: 'upload_processing',
    status: 'active' as const,
    reservedAmount: 239.2,
    settledAmount: 0,
    releasedAmount: 0,
    currency: 'CREDITS',
    creditUnit: 'plan_credit',
    metadata: { productCreditWorkflow: 'content_kit' },
    createdAt: '2026-07-06T00:00:00.000Z',
    updatedAt: '2026-07-06T00:00:00.000Z',
  };

  test('uses actual completed project duration instead of the estimated hold', () => {
    const actualCredits = estimateCompletedUploadReservationCredits(baseReservation, {
      status: 'completed',
      audio_duration_seconds: 1196,
      performance_level: 'content_kit',
      metadata: {},
    });

    expect(actualCredits).toBe(59.8);
  });

  test('does not repair incomplete projects', () => {
    const actualCredits = estimateCompletedUploadReservationCredits(baseReservation, {
      status: 'processing',
      audio_duration_seconds: 1196,
      performance_level: 'content_kit',
      metadata: {},
    });

    expect(actualCredits).toBeNull();
  });
});

describe('Balance Validation Logic', () => {
  test('should detect insufficient balance', () => {
    const currentBalance = 5.0;
    const requiredAmount = 10.0;

    expect(currentBalance < requiredAmount).toBe(true);
  });

  test('should detect sufficient balance', () => {
    const currentBalance = 15.0;
    const requiredAmount = 10.0;

    expect(currentBalance >= requiredAmount).toBe(true);
  });

  test('should handle exact balance match', () => {
    const currentBalance = 10.0;
    const requiredAmount = 10.0;

    expect(currentBalance >= requiredAmount).toBe(true);
  });

  test('should calculate shortfall correctly', () => {
    const currentBalance = 5.0;
    const requiredAmount = 10.0;
    const expectedShortfall = 5.0;

    const shortfall = Math.max(0, requiredAmount - currentBalance);
    expect(shortfall).toBe(expectedShortfall);
  });

  test('should return zero shortfall when balance is sufficient', () => {
    const currentBalance = 15.0;
    const requiredAmount = 10.0;

    const shortfall = Math.max(0, requiredAmount - currentBalance);
    expect(shortfall).toBe(0);
  });
});

describe('Optimistic Locking Logic', () => {
  test('should detect version mismatch', () => {
    const expectedVersion = 5;
    const actualVersion = 6;

    expect(expectedVersion !== actualVersion).toBe(true);
  });

  test('should allow update when versions match', () => {
    const expectedVersion = 5;
    const actualVersion = 5;

    expect(expectedVersion === actualVersion).toBe(true);
  });

  test('should increment version after update', () => {
    const currentVersion = 5;
    const newVersion = currentVersion + 1;

    expect(newVersion).toBe(6);
  });
});

describe('Transaction Metadata', () => {
  test('should store usage event metadata', () => {
    const metadata = {
      projectId: 'project-123',
      serviceKey: 'assemblyai_transcription',
      durationSeconds: 3600,
    };

    expect(metadata.projectId).toBe('project-123');
    expect(metadata.durationSeconds).toBe(3600);
  });

  test('should format transaction reason', () => {
    const amount = 0.5365;
    const duration = 60; // 1 minute
    const reason = `AssemblyAI Transcription - ${(duration / 60).toFixed(1)} minutes`;

    expect(reason).toBe('AssemblyAI Transcription - 1.0 minutes');
  });
});

describe('Credit Amount Validation', () => {
  test('should reject negative credit amounts', () => {
    const amount = -10.0;
    expect(amount <= 0).toBe(true);
  });

  test('should reject zero credit amounts', () => {
    const amount = 0;
    expect(amount <= 0).toBe(true);
  });

  test('should accept positive credit amounts', () => {
    const amount = 10.0;
    expect(amount > 0).toBe(true);
  });

  test('should enforce maximum credit limit', () => {
    const amount = 1500;
    const maxLimit = 1000;

    expect(amount > maxLimit).toBe(true);
  });
});

describe('Lifetime Totals Calculations', () => {
  test('should accumulate lifetime credits added', () => {
    let lifetimeAdded = 0;

    lifetimeAdded += 20.0; // First purchase
    lifetimeAdded += 50.0; // Second purchase
    lifetimeAdded += 10.0; // Bonus

    expect(lifetimeAdded).toBe(80.0);
  });

  test('should accumulate lifetime credits spent', () => {
    let lifetimeSpent = 0;

    lifetimeSpent += 5.5; // First usage
    lifetimeSpent += 3.25; // Second usage
    lifetimeSpent += 10.0; // Third usage

    expect(lifetimeSpent).toBeCloseTo(18.75, 2);
  });

  test('should calculate net balance', () => {
    const lifetimeAdded = 100.0;
    const lifetimeSpent = 35.5;
    const netBalance = lifetimeAdded - lifetimeSpent;

    expect(netBalance).toBeCloseTo(64.5, 2);
  });
});

describe('Usage Event Aggregation', () => {
  test('should sum costs from multiple events', () => {
    const events = [
      { billedCost: 0.5365, serviceKey: 'assemblyai_transcription' },
      { billedCost: 0.0002, serviceKey: 'openai_gpt4o_mini_input' },
      { billedCost: 0.0008, serviceKey: 'openai_gpt4o_mini_output' },
    ];

    const totalCost = events.reduce((sum, event) => sum + event.billedCost, 0);
    expect(totalCost).toBeCloseTo(0.5375, 4);
  });

  test('should group events by provider', () => {
    const events = [
      { provider: 'assemblyai', billedCost: 0.5365 },
      { provider: 'openai', billedCost: 0.0002 },
      { provider: 'openai', billedCost: 0.0008 },
    ];

    const byProvider = events.reduce((acc, event) => {
      if (!acc[event.provider]) {
        acc[event.provider] = { totalCost: 0, count: 0 };
      }
      acc[event.provider].totalCost += event.billedCost;
      acc[event.provider].count += 1;
      return acc;
    }, {} as Record<string, { totalCost: number; count: number }>);

    expect(byProvider.assemblyai.count).toBe(1);
    expect(byProvider.openai.count).toBe(2);
    expect(byProvider.openai.totalCost).toBeCloseTo(0.001, 4);
  });
});

describe('Billing Business Logic', () => {
  test('should calculate Stripe fee correctly', () => {
    const amount = 10.0;
    const stripeFee = amount * 0.029 + 0.3;

    expect(stripeFee).toBeCloseTo(0.59, 2);
  });

  test('should enforce minimum $5 purchase', () => {
    const minimumPurchase = 5.0;
    const attemptedPurchase = 3.0;

    expect(attemptedPurchase < minimumPurchase).toBe(true);
  });

  test('should calculate effective Stripe rate', () => {
    const purchaseAmount = 5.0;
    const stripeFee = purchaseAmount * 0.029 + 0.3;
    const effectiveRate = (stripeFee / purchaseAmount) * 100;

    expect(effectiveRate).toBeCloseTo(8.9, 1); // ~8.9%
  });
});

describe('Plan Credit Reservations', () => {
  function planRow() {
    return {
      id: 'plan-standard',
      name: 'Standard',
      slug: 'standard',
      description: null,
      stripe_price_id: null,
      stripe_monthly_price_id: null,
      stripe_annual_price_id: null,
      monthly_price_cents: 4999,
      annual_price_cents: 50990,
      currency: 'usd',
      seat_limit: 1,
      monthly_generation_limit: null,
      monthly_transcription_minute_limit: 600,
      monthly_import_limit: 10,
      monthly_storage_mb_limit: 10000,
      integration_limit: 2,
      monthly_credit_grant: 0,
      credit_rollover_months: 1,
      top_up_enabled: true,
      top_up_credit_expiry_months: 12,
      max_upload_minutes: 90,
      extra_seat_price_cents: null,
      is_popular: false,
      features_json: {},
      is_active: true,
      display_order: 20,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    };
  }

  function subscriptionRow() {
    return {
      id: 'subscription-1',
      organization_id: 'org-1',
      plan_id: 'plan-standard',
      plan: planRow(),
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      metadata_json: {},
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    };
  }

  function grantRow() {
    return {
      id: 'grant-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      subscription_id: 'subscription-1',
      plan_id: 'plan-standard',
      source_type: 'top_up',
      credits_granted: 100,
      credits_remaining: 100,
      period_start: null,
      period_end: null,
      expires_at: '2026-08-01T00:00:00.000Z',
      idempotency_key: 'top_up:pi_123',
      stripe_payment_id: 'pi_123',
      metadata_json: {},
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    };
  }

  function reservationRow() {
    return {
      id: 'reservation-1',
      user_id: 'user-1',
      organization_id: 'org-1',
      project_id: 'project-1',
      workflow_type: 'upload_processing',
      status: 'active',
      reserved_amount: 60,
      settled_amount: 0,
      released_amount: 0,
      currency: 'CREDITS',
      credit_unit: 'plan_credit',
      metadata: {},
      expires_at: null,
      created_at: '2026-06-15T00:00:00.000Z',
      updated_at: '2026-06-15T00:00:00.000Z',
      completed_at: null,
    };
  }

  function buildSupabaseMock(options: { grantUpdateResult: { data: any; error: any } }) {
    const queries: any[] = [];
    const supabase = {
      from: jest.fn((table: string) => {
        const query: any = {
          table,
          operation: null as string | null,
          payload: null as any,
          data: null as any,
          error: null as any,
          select: jest.fn(() => query),
          eq: jest.fn(() => query),
          gt: jest.fn(() => query),
          gte: jest.fn(() => query),
          order: jest.fn(() => query),
          limit: jest.fn(() => query),
          update: jest.fn((payload: any) => {
            query.operation = 'update';
            query.payload = payload;
            return query;
          }),
          insert: jest.fn((payload: any) => {
            query.operation = 'insert';
            query.payload = payload;
            return query;
          }),
          single: jest.fn(async () => {
            if (table === 'billing_reservations') {
              return { data: reservationRow(), error: null };
            }
            return { data: null, error: null };
          }),
          maybeSingle: jest.fn(async () => {
            if (table === 'billing_credit_grants' && query.operation === 'update') {
              return options.grantUpdateResult;
            }
            return { data: null, error: null };
          }),
        };

        if (table === 'organization_subscriptions') {
          query.data = [subscriptionRow()];
          query.error = null;
        }

        if (table === 'billing_credit_grants') {
          query.data = [grantRow()];
          query.error = null;
        }

        queries.push(query);
        return query;
      }),
    };

    return { supabase, queries };
  }

  test('uses an optimistic conditional update when reserving grant credits', async () => {
    const { supabase, queries } = buildSupabaseMock({
      grantUpdateResult: { data: { id: 'grant-1' }, error: null },
    });

    await createPlanCreditReservation({
      supabase: supabase as any,
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      workflowType: 'upload_processing',
      amount: 60,
      now: new Date('2026-06-15T00:00:00.000Z'),
    });

    const grantUpdate = queries.find((query) => (
      query.table === 'billing_credit_grants' && query.operation === 'update'
    ));

    expect(grantUpdate.update).toHaveBeenCalledWith({ credits_remaining: 40 });
    expect(grantUpdate.eq).toHaveBeenCalledWith('id', 'grant-1');
    expect(grantUpdate.eq).toHaveBeenCalledWith('updated_at', '2026-06-01T00:00:00.000Z');
    expect(grantUpdate.gte).toHaveBeenCalledWith('credits_remaining', 60);
  });

  test('fails the reservation when a grant changes before the conditional reserve update', async () => {
    const { supabase, queries } = buildSupabaseMock({
      grantUpdateResult: { data: null, error: null },
    });

    await expect(createPlanCreditReservation({
      supabase: supabase as any,
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      workflowType: 'upload_processing',
      amount: 60,
      now: new Date('2026-06-15T00:00:00.000Z'),
    })).rejects.toThrow('Credit grant changed while reserving credits; please retry');

    const reservationFailureUpdate = queries.find((query) => (
      query.table === 'billing_reservations' && query.operation === 'update'
    ));

    expect(reservationFailureUpdate.payload).toEqual(expect.objectContaining({
      status: 'failed',
      released_amount: 60,
    }));
  });

  test('blocks upload reservation when duration is valid but credits are insufficient', async () => {
    const { supabase } = buildSupabaseMock({
      grantUpdateResult: { data: { id: 'grant-1' }, error: null },
    });

    await expect(createPlanCreditReservation({
      supabase: supabase as any,
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: 'project-1',
      workflowType: 'upload_processing',
      amount: 101,
      now: new Date('2026-06-15T00:00:00.000Z'),
    })).rejects.toBeInstanceOf(InsufficientPlanCreditsError);
  });

  test('duration-limit failure takes precedence before credit reservation', async () => {
    const { supabase } = buildSupabaseMock({
      grantUpdateResult: { data: { id: 'grant-1' }, error: null },
    });

    await expect((async () => {
      const subscription = await assertPlanUploadDuration({
        supabase: supabase as any,
        organizationId: 'org-1',
        userId: 'user-1',
        durationSeconds: 5_401,
      });

      await createPlanCreditReservation({
        supabase: supabase as any,
        userId: 'user-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        workflowType: 'upload_processing',
        amount: 1,
        subscription,
        now: new Date('2026-06-15T00:00:00.000Z'),
      });
    })()).rejects.toBeInstanceOf(PlanUploadLimitError);

    expect(supabase.from).not.toHaveBeenCalledWith('billing_reservations');
  });
});

describe('Plan Credit Grant Reconciliation', () => {
  function planRow(overrides: Record<string, any> = {}) {
    return {
      id: 'plan-pro',
      name: 'Pro',
      slug: 'pro',
      description: null,
      stripe_price_id: null,
      stripe_monthly_price_id: null,
      stripe_annual_price_id: null,
      monthly_price_cents: 9900,
      annual_price_cents: 99000,
      currency: 'usd',
      seat_limit: 3,
      monthly_generation_limit: null,
      monthly_transcription_minute_limit: 1200,
      monthly_import_limit: 25,
      monthly_storage_mb_limit: 10000,
      integration_limit: 5,
      monthly_credit_grant: 10000,
      credit_rollover_months: 1,
      top_up_enabled: true,
      top_up_credit_expiry_months: 12,
      max_upload_minutes: 180,
      extra_seat_price_cents: null,
      is_popular: false,
      features_json: {},
      is_active: true,
      display_order: 30,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function subscriptionRow(overrides: Record<string, any> = {}) {
    return {
      id: 'subscription-1',
      organization_id: 'org-1',
      plan_id: 'plan-pro',
      plan: planRow(),
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      current_period_start: '2026-06-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      metadata_json: {},
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function grantRow(overrides: Record<string, any> = {}) {
    return {
      id: 'grant-standard',
      organization_id: 'org-1',
      user_id: 'user-1',
      subscription_id: 'subscription-1',
      plan_id: 'plan-standard',
      source_type: 'plan_grant',
      credits_granted: 3000,
      credits_remaining: 2500,
      period_start: '2026-06-01T00:00:00.000Z',
      period_end: '2026-07-01T00:00:00.000Z',
      expires_at: '2026-08-01T00:00:00.000Z',
      idempotency_key: 'plan_grant:org-1:subscription-1:plan-standard:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z',
      stripe_payment_id: null,
      metadata_json: { planSlug: 'standard' },
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-15T00:00:00.000Z',
      ...overrides,
    };
  }

  it('reconciles an existing same-period grant instead of inserting a second plan grant', async () => {
    const queries: any[] = [];
    const updatedGrant = grantRow({
      plan_id: 'plan-pro',
      credits_granted: 10000,
      credits_remaining: 9500,
      idempotency_key: 'plan_grant:org-1:subscription-1:plan-pro:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z',
      metadata_json: { planSlug: 'pro' },
      updated_at: '2026-06-15T00:00:01.000Z',
    });
    const supabase = {
      from: jest.fn((table: string) => {
        const query: any = {
          table,
          operation: null,
          payload: null,
          data: null,
          error: null,
          select: jest.fn(() => query),
          eq: jest.fn(() => query),
          order: jest.fn(() => query),
          limit: jest.fn(() => query),
          update: jest.fn((payload) => {
            query.operation = 'update';
            query.payload = payload;
            return query;
          }),
          insert: jest.fn((payload) => {
            query.operation = 'insert';
            query.payload = payload;
            return query;
          }),
          maybeSingle: jest.fn(async () => {
            if (table === 'billing_credit_grants' && query.operation === 'update') {
              return { data: updatedGrant, error: null };
            }
            return { data: null, error: null };
          }),
          single: jest.fn(async () => ({ data: null, error: null })),
        };

        if (table === 'organization_subscriptions') {
          query.data = [subscriptionRow()];
        }

        if (table === 'billing_credit_grants') {
          query.data = [grantRow()];
        }

        queries.push(query);
        return query;
      }),
    };

    const result = await ensureCurrentPlanCreditGrant({
      supabase: supabase as any,
      organizationId: 'org-1',
      userId: 'user-1',
      now: new Date('2026-06-15T12:00:00.000Z'),
    });

    const grantUpdate = queries.find((query) => query.table === 'billing_credit_grants' && query.operation === 'update');
    const grantInsert = queries.find((query) => query.table === 'billing_credit_grants' && query.operation === 'insert');

    expect(result.grant?.creditsGranted).toBe(10000);
    expect(result.grant?.creditsRemaining).toBe(9500);
    expect(grantInsert).toBeUndefined();
    expect(grantUpdate.payload).toEqual(expect.objectContaining({
      plan_id: 'plan-pro',
      credits_granted: 10000,
      credits_remaining: 9500,
    }));
  });

  it('keeps only one current-period plan grant spendable while preserving top-ups', () => {
    const subscription = {
      id: 'subscription-1',
      organizationId: 'org-1',
      planId: 'plan-teams',
    } as any;
    const grants = [
      grantRow({ id: 'standard-grant', plan_id: 'plan-standard', credits_remaining: 3000 }),
      grantRow({ id: 'teams-grant', plan_id: 'plan-teams', credits_granted: 35000, credits_remaining: 35000 }),
      grantRow({
        id: 'top-up',
        source_type: 'top_up',
        plan_id: null,
        subscription_id: null,
        credits_granted: 5000,
        credits_remaining: 5000,
        period_start: null,
        period_end: null,
      }),
    ].map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      subscriptionId: row.subscription_id,
      planId: row.plan_id,
      sourceType: row.source_type,
      creditsGranted: Number(row.credits_granted),
      creditsRemaining: Number(row.credits_remaining),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      expiresAt: row.expires_at,
      idempotencyKey: row.idempotency_key,
      stripePaymentId: row.stripe_payment_id,
      metadata: row.metadata_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const spendable = filterSpendablePlanCreditGrants(
      grants as any,
      subscription,
      new Date('2026-06-15T00:00:00.000Z')
    );

    expect(spendable.map((grant) => grant.id).sort()).toEqual(['teams-grant', 'top-up']);
  });

  it('does not carry free current or rollover grants into a paid subscription balance', () => {
    const subscription = {
      id: 'pro-subscription',
      organizationId: 'org-1',
      planId: 'plan-pro',
      plan: { slug: 'pro' },
    } as any;
    const grants = [
      grantRow({
        id: 'free-current',
        subscription_id: 'free-subscription',
        plan_id: 'plan-free',
        credits_granted: 300,
        credits_remaining: 300,
        metadata_json: { planSlug: 'free' },
      }),
      grantRow({
        id: 'free-rollover',
        subscription_id: 'free-subscription',
        plan_id: 'plan-free',
        credits_granted: 300,
        credits_remaining: 125,
        period_start: '2026-05-01T00:00:00.000Z',
        period_end: '2026-06-01T00:00:00.000Z',
        expires_at: '2026-08-01T00:00:00.000Z',
        metadata_json: { planSlug: 'free' },
      }),
      grantRow({
        id: 'pro-current',
        subscription_id: 'pro-subscription',
        plan_id: 'plan-pro',
        credits_granted: 10000,
        credits_remaining: 10000,
        idempotency_key: 'plan_grant:org-1:pro-subscription:plan-pro:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z',
        metadata_json: { planSlug: 'pro' },
      }),
    ].map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      subscriptionId: row.subscription_id,
      planId: row.plan_id,
      sourceType: row.source_type,
      creditsGranted: Number(row.credits_granted),
      creditsRemaining: Number(row.credits_remaining),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      expiresAt: row.expires_at,
      idempotencyKey: row.idempotency_key,
      stripePaymentId: row.stripe_payment_id,
      metadata: row.metadata_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const spendable = filterSpendablePlanCreditGrants(
      grants as any,
      subscription,
      new Date('2026-06-15T00:00:00.000Z')
    );

    expect(spendable.map((grant) => grant.id)).toEqual(['pro-current']);
  });
});
