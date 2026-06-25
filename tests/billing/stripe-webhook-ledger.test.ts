const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

function stripeEvent(overrides: Partial<any> = {}) {
  return {
    id: 'evt_123',
    type: 'checkout.session.completed',
    livemode: false,
    api_version: '2025-10-29.clover',
    created: 1710000000,
    data: {
      object: {
        id: 'cs_123',
      },
    },
    ...overrides,
  };
}

function duplicateInsertBuilder() {
  return {
    insert: jest.fn().mockResolvedValue({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      },
    }),
  };
}

function lookupBuilder(existing: any) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
  };
}

function updateBuilder(result: any = { event_id: 'evt_123' }) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: result, error: null }),
  };
}

describe('beginWebhookLedger', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
  });

  it('skips overlapping duplicate deliveries while an event is actively processing', async () => {
    const startedAt = new Date().toISOString();
    mockFrom
      .mockReturnValueOnce(duplicateInsertBuilder())
      .mockReturnValueOnce(lookupBuilder({
        status: 'processing',
        attempts: 1,
        processing_started_at: startedAt,
      }));

    const { beginWebhookLedger } = await import('@/app/api/stripe/webhook/route');
    const result = await beginWebhookLedger(stripeEvent() as any);

    expect(result).toEqual({
      skip: true,
      disabled: false,
      reason: 'already_processing',
    });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('claims failed events for retry before processing again', async () => {
    const retryUpdate = updateBuilder();
    mockFrom
      .mockReturnValueOnce(duplicateInsertBuilder())
      .mockReturnValueOnce(lookupBuilder({
        status: 'failed',
        attempts: 1,
        processing_started_at: new Date(Date.now() - 60_000).toISOString(),
      }))
      .mockReturnValueOnce(retryUpdate);

    const { beginWebhookLedger } = await import('@/app/api/stripe/webhook/route');
    const result = await beginWebhookLedger(stripeEvent() as any);

    expect(result).toEqual({ skip: false, disabled: false });
    expect(retryUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'processing',
      attempts: 2,
      last_error: null,
    }));
    expect(retryUpdate.eq).toHaveBeenCalledWith('event_id', 'evt_123');
    expect(retryUpdate.eq).toHaveBeenCalledWith('status', 'failed');
  });
});
