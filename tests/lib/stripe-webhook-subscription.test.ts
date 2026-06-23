const mockConstructEvent = jest.fn();
const mockRetrieveSubscription = jest.fn();
const mockAddCredit = jest.fn();
const mockDebitCredit = jest.fn();
const mockUpsertOrganizationSubscriptionFromStripe = jest.fn();
const mockEnsureCurrentPlanCreditGrant = jest.fn();
const mockGrantTopUpCredits = jest.fn();
const mockSupabaseFrom = jest.fn();

let mockOriginalTransaction: any = null;
let mockExistingRefundTransaction: any = null;
let mockGrantRow: any = null;
let mockGrantUpdatePayload: any = null;
let mockRefundTransactionPayload: any = null;

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (...args: any[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: any[]) => mockRetrieveSubscription(...args),
    },
    invoices: {
      retrieve: jest.fn(),
    },
  }));
});

jest.mock('@/lib/billing/credit', () => ({
  addCredit: (...args: any[]) => mockAddCredit(...args),
  debitCredit: (...args: any[]) => mockDebitCredit(...args),
}));

jest.mock('@/lib/billing/credit-packages', () => ({
  getTotalCredits: jest.fn(),
  resolveCreditPackage: jest.fn(),
}));

jest.mock('@/lib/billing/subscriptions', () => ({
  isSubscriptionUsable: (status: string) => status === 'active' || status === 'trialing',
  upsertOrganizationSubscriptionFromStripe: (...args: any[]) => mockUpsertOrganizationSubscriptionFromStripe(...args),
}));

jest.mock('@/lib/billing/plan-credits', () => ({
  ensureCurrentPlanCreditGrant: (...args: any[]) => mockEnsureCurrentPlanCreditGrant(...args),
  grantTopUpCredits: (...args: any[]) => mockGrantTopUpCredits(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
  },
}));

describe('Stripe webhook subscription handling', () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockRetrieveSubscription.mockReset();
    mockAddCredit.mockReset();
    mockDebitCredit.mockReset();
    mockUpsertOrganizationSubscriptionFromStripe.mockReset();
    mockEnsureCurrentPlanCreditGrant.mockReset();
    mockGrantTopUpCredits.mockReset();
    mockSupabaseFrom.mockReset();
    mockOriginalTransaction = null;
    mockExistingRefundTransaction = null;
    mockGrantRow = null;
    mockGrantUpdatePayload = null;
    mockRefundTransactionPayload = null;

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'credit_transactions') {
        return {
          select: jest.fn(() => {
            const conditions: Record<string, unknown> = {};
            const chain: any = {
              eq: jest.fn((column: string, value: unknown) => {
                conditions[column] = value;
                return chain;
              }),
              contains: jest.fn(() => chain),
              maybeSingle: jest.fn(async () => {
                if (conditions.transaction_type === 'purchase') {
                  return { data: mockOriginalTransaction, error: null };
                }
                if (conditions.transaction_type === 'refund') {
                  return { data: mockExistingRefundTransaction, error: null };
                }
                return { data: null, error: null };
              }),
            };
            return chain;
          }),
          insert: jest.fn(async (payload: any) => {
            mockRefundTransactionPayload = payload;
            return { error: null };
          }),
        };
      }

      if (table === 'billing_credit_grants') {
        return {
          select: jest.fn(() => {
            const chain: any = {
              eq: jest.fn(() => chain),
              maybeSingle: jest.fn(async () => ({ data: mockGrantRow, error: null })),
            };
            return chain;
          }),
          update: jest.fn((payload: any) => {
            mockGrantUpdatePayload = payload;
            return {
              eq: jest.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('syncs subscription checkout sessions without crediting pay-as-you-go balance', async () => {
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const subscription = {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-standard',
        plan_slug: 'standard',
      },
      items: { data: [] },
    };
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_sub',
          mode: 'subscription',
          subscription: 'sub_123',
          metadata: {
            organization_id: 'org-1',
            plan_id: 'plan-standard',
            plan_slug: 'standard',
          },
        },
      },
    });
    mockRetrieveSubscription.mockResolvedValue(subscription);
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue({
      status: 'active',
      organizationId: 'org-1',
      plan: { monthlyCreditGrant: 3000 },
    });

    const response = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_123' },
      body: '{}',
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ received: true });
    expect(mockRetrieveSubscription).toHaveBeenCalledWith('sub_123', {
      expand: ['items.data.price'],
    });
    expect(mockUpsertOrganizationSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      subscription,
      expect.objectContaining({
        organizationId: 'org-1',
        planId: 'plan-standard',
        planSlug: 'standard',
        checkoutSessionId: 'cs_sub',
        eventType: 'checkout.session.completed',
        source: 'stripe_checkout',
      })
    );
    expect(mockEnsureCurrentPlanCreditGrant).toHaveBeenCalledWith({
      organizationId: 'org-1',
      subscription: expect.objectContaining({
        status: 'active',
      }),
    });
    expect(mockAddCredit).not.toHaveBeenCalled();
  });

  it('records only remaining top-up credits revoked when refunded credits were already used', async () => {
    const { POST } = await import('@/app/api/stripe/webhook/route');
    mockOriginalTransaction = {
      id: 'tx_purchase',
      user_id: 'user-1',
      amount: 5000,
      invoice_number: 'inv_123',
      payment_id: 'pi_123',
      metadata: {
        creditUnit: 'plan_credit',
        grantId: 'grant-1',
      },
    };
    mockGrantRow = {
      credits_remaining: 100,
    };
    mockConstructEvent.mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_123',
          payment_intent: 'pi_123',
          amount_refunded: 7900,
          amount: 7900,
          refunds: {
            data: [{ id: 're_123' }],
          },
        },
      },
    });

    const response = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig_123' },
      body: '{}',
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ received: true });
    expect(mockGrantUpdatePayload).toEqual(expect.objectContaining({
      credits_remaining: 0,
      metadata_json: expect.objectContaining({
        refundedCredits: 5000,
        revokedCredits: 100,
        unrecoveredRefundCredits: 4900,
        refundId: 're_123',
      }),
    }));
    expect(mockRefundTransactionPayload).toEqual(expect.objectContaining({
      user_id: 'user-1',
      amount: -100,
      balance_before: 100,
      balance_after: 0,
      transaction_type: 'refund',
      payment_id: 'pi_123',
      invoice_number: 'inv_123',
      reason: 'Stripe top-up refund',
      metadata: expect.objectContaining({
        refundId: 're_123',
        paymentIntent: 'pi_123',
        chargeId: 'ch_123',
        creditUnit: 'plan_credit',
        refundedCredits: 5000,
        revokedCredits: 100,
        unrecoveredRefundCredits: 4900,
      }),
    }));
    expect(mockDebitCredit).not.toHaveBeenCalled();
  });
});
