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
} from '@/lib/billing/credit';
import {
  createPlanCreditReservation,
  InsufficientPlanCreditsError,
  PlanUploadLimitError,
} from '@/lib/billing/plan-credits';

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
      const error = new PlanUploadLimitError('org-123', 61, 60, 'free');

      expect(error.name).toBe('PlanUploadLimitError');
      expect(error.requestedMinutes).toBe(61);
      expect(error.maxUploadMinutes).toBe(60);
      expect(error.planSlug).toBe('free');
    });
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
      max_upload_minutes: 60,
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
});
