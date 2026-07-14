const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockCheckoutSessionRetrieve = jest.fn();
const mockSubscriptionRetrieve = jest.fn();
const mockInvoiceRetrieve = jest.fn();
const mockAddStripePurchaseCredit = jest.fn();
const mockGrantTopUpCredits = jest.fn();
const mockEnsureCurrentPlanCreditGrant = jest.fn();
const mockUpsertOrganizationSubscriptionFromStripe = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    auth: {
      getUser: (...args: any[]) => mockGetUser(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/billing/stripe-runtime', () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        retrieve: (...args: any[]) => mockCheckoutSessionRetrieve(...args),
      },
    },
    subscriptions: {
      retrieve: (...args: any[]) => mockSubscriptionRetrieve(...args),
    },
    invoices: {
      retrieve: (...args: any[]) => mockInvoiceRetrieve(...args),
    },
  }),
}));

jest.mock('@/lib/billing/credit', () => ({
  addStripePurchaseCredit: (...args: any[]) => mockAddStripePurchaseCredit(...args),
}));

jest.mock('@/lib/billing/plan-credits', () => ({
  ensureCurrentPlanCreditGrant: (...args: any[]) => mockEnsureCurrentPlanCreditGrant(...args),
  grantTopUpCredits: (...args: any[]) => mockGrantTopUpCredits(...args),
}));

jest.mock('@/lib/billing/subscriptions', () => ({
  upsertOrganizationSubscriptionFromStripe: (...args: any[]) => mockUpsertOrganizationSubscriptionFromStripe(...args),
}));

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

function maybeSingleBuilder(result: { data: any; error: any }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

function request(sessionId = 'cs_topup') {
  return new Request('http://localhost/api/stripe/verify-session', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  }) as any;
}

function paidTopUpSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_topup',
    payment_status: 'paid',
    amount_total: 1900,
    payment_intent: 'pi_topup',
    invoice: null,
    customer_email: 'buyer@example.com',
    metadata: {
      userId: 'user-1',
      organizationId: 'org-1',
      packageId: 'top_up_1000',
      creditUnit: 'plan_credit',
    },
    ...overrides,
  };
}

describe('POST /api/stripe/verify-session', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetUser.mockReset();
    mockFrom.mockReset();
    mockCheckoutSessionRetrieve.mockReset();
    mockSubscriptionRetrieve.mockReset();
    mockInvoiceRetrieve.mockReset();
    mockAddStripePurchaseCredit.mockReset();
    mockGrantTopUpCredits.mockReset();
    mockEnsureCurrentPlanCreditGrant.mockReset();
    mockUpsertOrganizationSubscriptionFromStripe.mockReset();
    mockIsDemoUser.mockReset();

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'buyer@example.com' } },
      error: null,
    });
    mockIsDemoUser.mockReturnValue(false);
    mockCheckoutSessionRetrieve.mockResolvedValue(paidTopUpSession());
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue({
      id: 'org-subscription-1',
      organizationId: 'org-1',
      plan: { slug: 'pro' },
    });
  });

  it('returns the organization id and skips duplicate top-up grants by idempotency key', async () => {
    const existingTransactionLookup = maybeSingleBuilder({ data: null, error: null });
    const existingGrantLookup = maybeSingleBuilder({ data: { id: 'grant-existing' }, error: null });
    mockFrom
      .mockReturnValueOnce(existingTransactionLookup)
      .mockReturnValueOnce(existingGrantLookup);

    const { POST } = await import('@/app/api/stripe/verify-session/route');
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      alreadyProcessed: true,
      message: 'Credits already added',
      grantId: 'grant-existing',
      creditUnit: 'plan_credit',
      organizationId: 'org-1',
    });
    expect(existingGrantLookup.eq).toHaveBeenCalledWith('idempotency_key', 'top_up:pi_topup');
    expect(mockGrantTopUpCredits).not.toHaveBeenCalled();
  });

  it('grants top-up credits with a stable idempotency key and returns the credited organization', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleBuilder({ data: null, error: null }))
      .mockReturnValueOnce(maybeSingleBuilder({ data: null, error: null }));
    mockGrantTopUpCredits.mockResolvedValue({ id: 'grant-new' });

    const { POST } = await import('@/app/api/stripe/verify-session/route');
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockGrantTopUpCredits).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      userId: 'user-1',
      credits: 1000,
      paymentId: 'pi_topup',
      idempotencyKey: 'top_up:pi_topup',
    }));
    expect(payload).toEqual({
      success: true,
      alreadyProcessed: false,
      creditsAdded: 1000,
      grantId: 'grant-new',
      creditUnit: 'plan_credit',
      organizationId: 'org-1',
    });
  });

  it('accepts snake_case metadata and returns an already processed grant when payment intent is missing', async () => {
    const existingGrantLookup = maybeSingleBuilder({ data: { id: 'grant-existing' }, error: null });
    mockFrom
      .mockReturnValueOnce(existingGrantLookup);
    mockCheckoutSessionRetrieve.mockResolvedValue(paidTopUpSession({
      payment_intent: null,
      metadata: {
        user_id: 'user-1',
        organization_id: 'org-1',
        package_id: 'top_up_1000',
        credit_unit: 'plan_credit',
      },
    }));

    const { POST } = await import('@/app/api/stripe/verify-session/route');
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      alreadyProcessed: true,
      message: 'Credits already added',
      grantId: 'grant-existing',
      creditUnit: 'plan_credit',
      organizationId: 'org-1',
    });
    expect(existingGrantLookup.eq).toHaveBeenCalledWith('idempotency_key', 'top_up:cs_topup');
  });

  it('confirms subscription checkout sessions without requiring a top-up package', async () => {
    const stripeSubscription = {
      id: 'sub_pro',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        organization_id: 'org-1',
        user_id: 'user-1',
        plan_id: 'plan-pro',
        plan_slug: 'pro',
        billing_interval: 'month',
      },
      items: {
        data: [
          {
            id: 'si_pro',
            price: { id: 'price_pro_monthly' },
          },
        ],
      },
    };
    mockCheckoutSessionRetrieve.mockResolvedValue(paidTopUpSession({
      id: 'cs_subscription',
      mode: 'subscription',
      payment_intent: null,
      subscription: 'sub_pro',
      metadata: {
        organization_id: 'org-1',
        user_id: 'user-1',
        plan_id: 'plan-pro',
        plan_slug: 'pro',
        billing_interval: 'month',
      },
    }));
    mockSubscriptionRetrieve.mockResolvedValue(stripeSubscription);

    const { POST } = await import('@/app/api/stripe/verify-session/route');
    const response = await POST(request('cs_subscription'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockSubscriptionRetrieve).toHaveBeenCalledWith('sub_pro', {
      expand: ['items.data.price'],
    });
    expect(mockUpsertOrganizationSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      stripeSubscription,
      expect.objectContaining({
        organizationId: 'org-1',
        planId: 'plan-pro',
        planSlug: 'pro',
        checkoutSessionId: 'cs_subscription',
        eventType: 'checkout.session.verified',
        source: 'success_page_verify',
      })
    );
    expect(mockEnsureCurrentPlanCreditGrant).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      subscription: expect.objectContaining({
        id: 'org-subscription-1',
      }),
    });
    expect(mockGrantTopUpCredits).not.toHaveBeenCalled();
    expect(payload).toEqual({
      success: true,
      alreadyProcessed: true,
      checkoutType: 'subscription',
      message: 'Subscription checkout confirmed',
      organizationId: 'org-1',
      subscriptionId: 'sub_pro',
      planSlug: 'pro',
      creditUnit: 'plan_credit',
    });
  });
});
