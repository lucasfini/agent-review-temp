const mockCheckoutSessionCreate = jest.fn();
const mockCustomerCreate = jest.fn();
const mockPortalSessionCreate = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockGetActiveOrganizationForUser = jest.fn();
const mockGetPlanBySlugOrId = jest.fn();
const mockGetOrganizationStripeCustomerId = jest.fn();
const mockStoreOrganizationStripeCustomerId = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: (...args: any[]) => mockCheckoutSessionCreate(...args),
      },
    },
    customers: {
      create: (...args: any[]) => mockCustomerCreate(...args),
    },
    billingPortal: {
      sessions: {
        create: (...args: any[]) => mockPortalSessionCreate(...args),
      },
    },
  }));
});

jest.mock('@/lib/api/route-auth', () => {
  class RouteAccessError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'RouteAccessError';
      this.status = status;
    }
  }

  return {
    RouteAccessError,
    requireAuthenticatedUser: (...args: any[]) => mockRequireAuthenticatedUser(...args),
  };
});

jest.mock('@/lib/authz/organization-context', () => ({
  getActiveOrganizationForUser: (...args: any[]) => mockGetActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/billing/plans', () => ({
  getPlanBySlugOrId: (...args: any[]) => mockGetPlanBySlugOrId(...args),
}));

jest.mock('@/lib/billing/subscriptions', () => ({
  getOrganizationStripeCustomerId: (...args: any[]) => mockGetOrganizationStripeCustomerId(...args),
  storeOrganizationStripeCustomerId: (...args: any[]) => mockStoreOrganizationStripeCustomerId(...args),
}));

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = {
  id: 'org-1',
  name: 'Acme Workspace',
  type: 'saas_customer',
};
const plan = {
  id: 'plan-starter',
  slug: 'starter',
  name: 'Starter',
  stripePriceId: 'price_starter',
};

describe('subscription checkout and portal routes', () => {
  beforeEach(() => {
    mockCheckoutSessionCreate.mockReset();
    mockCustomerCreate.mockReset();
    mockPortalSessionCreate.mockReset();
    mockRequireAuthenticatedUser.mockReset();
    mockGetActiveOrganizationForUser.mockReset();
    mockGetPlanBySlugOrId.mockReset();
    mockGetOrganizationStripeCustomerId.mockReset();
    mockStoreOrganizationStripeCustomerId.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockGetActiveOrganizationForUser.mockResolvedValue({ organization, membership: { role: 'owner' } });
    mockIsDemoUser.mockReturnValue(false);
  });

  it('requires a configured Stripe price for subscription checkout', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue({ ...plan, stripePriceId: null });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ planSlug: 'starter' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Plan is not configured for Stripe subscription checkout');
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it('rejects obvious placeholder Stripe price ids in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });

    try {
      const { POST } = await import('@/app/api/subscriptions/checkout/route');
      mockGetPlanBySlugOrId.mockResolvedValue({ ...plan, stripePriceId: 'price_starter' });

      const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({ planSlug: 'starter' }),
      }) as any);
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe('Plan has an unsafe Stripe price configuration');
      expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true,
      });
    }
  });

  it('creates an organization subscription checkout session with Stripe metadata', async () => {
    const { POST } = await import('@/app/api/subscriptions/checkout/route');
    mockGetPlanBySlugOrId.mockResolvedValue(plan);
    mockGetOrganizationStripeCustomerId.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: 'cus_new' });
    mockCheckoutSessionCreate.mockResolvedValue({ id: 'cs_sub', url: 'https://checkout.stripe.test/cs_sub' });

    const response = await POST(new Request('http://localhost/api/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planSlug: 'starter',
        organization_id: 'org-1',
        successUrl: '/dashboard/billing?done=1',
        cancelUrl: 'https://evil.example/cancel',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe('https://checkout.stripe.test/cs_sub');
    expect(mockGetActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'org-1'
    );
    expect(mockCustomerCreate).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      name: 'Acme Workspace',
      metadata: {
        organization_id: 'org-1',
        created_by_user_id: 'user-1',
      },
    }));
    expect(mockStoreOrganizationStripeCustomerId).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'cus_new',
      expect.objectContaining({ planId: 'plan-starter' })
    );
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      customer: 'cus_new',
      line_items: [{ price: 'price_starter', quantity: 1 }],
      metadata: {
        organization_id: 'org-1',
        user_id: 'user-1',
        plan_id: 'plan-starter',
        plan_slug: 'starter',
      },
      subscription_data: {
        metadata: {
          organization_id: 'org-1',
          user_id: 'user-1',
          plan_id: 'plan-starter',
          plan_slug: 'starter',
        },
      },
    }));
    const checkoutPayload = mockCheckoutSessionCreate.mock.calls[0][0];
    expect(checkoutPayload.success_url).toBe('http://localhost:3000/dashboard/billing?done=1');
    expect(checkoutPayload.cancel_url).toBe('http://localhost:3000/dashboard/billing?subscription=cancel');
  });

  it('returns a safe error when opening the portal without an organization customer', async () => {
    const { POST } = await import('@/app/api/subscriptions/portal/route');
    mockGetOrganizationStripeCustomerId.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/subscriptions/portal', {
      method: 'POST',
      body: JSON.stringify({ organization_id: 'org-1' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('No Stripe customer found for this organization');
    expect(mockPortalSessionCreate).not.toHaveBeenCalled();
  });
});
