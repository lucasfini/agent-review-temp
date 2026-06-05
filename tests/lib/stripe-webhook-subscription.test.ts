const mockConstructEvent = jest.fn();
const mockRetrieveSubscription = jest.fn();
const mockAddCredit = jest.fn();
const mockDebitCredit = jest.fn();
const mockUpsertOrganizationSubscriptionFromStripe = jest.fn();

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
  upsertOrganizationSubscriptionFromStripe: (...args: any[]) => mockUpsertOrganizationSubscriptionFromStripe(...args),
}));

describe('Stripe webhook subscription handling', () => {
  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockRetrieveSubscription.mockReset();
    mockAddCredit.mockReset();
    mockDebitCredit.mockReset();
    mockUpsertOrganizationSubscriptionFromStripe.mockReset();
  });

  it('syncs subscription checkout sessions without crediting pay-as-you-go balance', async () => {
    const { POST } = await import('@/app/api/stripe/webhook/route');
    const subscription = {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      metadata: {
        organization_id: 'org-1',
        plan_id: 'plan-starter',
        plan_slug: 'starter',
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
            plan_id: 'plan-starter',
            plan_slug: 'starter',
          },
        },
      },
    });
    mockRetrieveSubscription.mockResolvedValue(subscription);
    mockUpsertOrganizationSubscriptionFromStripe.mockResolvedValue({});

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
        planId: 'plan-starter',
        planSlug: 'starter',
        checkoutSessionId: 'cs_sub',
        eventType: 'checkout.session.completed',
        source: 'stripe_checkout',
      })
    );
    expect(mockAddCredit).not.toHaveBeenCalled();
  });
});
