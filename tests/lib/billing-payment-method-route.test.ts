const mockRequireAuthenticatedUser = jest.fn();
const mockGetActiveOrganizationForUser = jest.fn();
const mockGetOrganizationStripeCustomerId = jest.fn();
const mockCustomerRetrieve = jest.fn();
const mockPaymentMethodsList = jest.fn();

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

jest.mock('@/lib/billing/subscriptions', () => ({
  getOrganizationStripeCustomerId: (...args: any[]) => mockGetOrganizationStripeCustomerId(...args),
}));

jest.mock('@/lib/billing/stripe-runtime', () => ({
  getStripeClient: () => ({
    customers: {
      retrieve: (...args: any[]) => mockCustomerRetrieve(...args),
    },
    paymentMethods: {
      list: (...args: any[]) => mockPaymentMethodsList(...args),
    },
  }),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {},
}));

describe('GET /api/billing/payment-method', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetActiveOrganizationForUser.mockReset();
    mockGetOrganizationStripeCustomerId.mockReset();
    mockCustomerRetrieve.mockReset();
    mockPaymentMethodsList.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization: { id: 'org-1', name: 'Acme Workspace' },
      membership: { role: 'owner', status: 'active' },
    });
    mockGetOrganizationStripeCustomerId.mockResolvedValue('cus_123');
  });

  it('returns all saved card payment methods and marks the default card', async () => {
    const { GET } = await import('@/app/api/billing/payment-method/route');
    mockCustomerRetrieve.mockResolvedValue({
      id: 'cus_123',
      email: 'billing@example.com',
      invoice_settings: {
        default_payment_method: {
          id: 'pm_default',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2030,
          },
          billing_details: {},
        },
      },
    });
    mockPaymentMethodsList.mockResolvedValue({
      data: [
        {
          id: 'pm_default',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2030,
          },
          billing_details: {},
        },
        {
          id: 'pm_backup',
          card: {
            brand: 'mastercard',
            last4: '4444',
            exp_month: 10,
            exp_year: 2031,
          },
          billing_details: {
            email: 'backup@example.com',
          },
        },
      ],
    });

    const response = await GET(new Request('http://localhost/api/billing/payment-method?organization_id=org-1') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetActiveOrganizationForUser).toHaveBeenCalledWith(expect.anything(), 'user-1', 'org-1');
    expect(mockPaymentMethodsList).toHaveBeenCalledWith({
      customer: 'cus_123',
      type: 'card',
      limit: 10,
    });
    expect(payload.paymentMethod).toMatchObject({
      id: 'pm_default',
      brand: 'visa',
      last4: '4242',
      isDefault: true,
    });
    expect(payload.paymentMethods).toEqual([
      expect.objectContaining({
        id: 'pm_default',
        isDefault: true,
        billingEmail: 'billing@example.com',
      }),
      expect.objectContaining({
        id: 'pm_backup',
        isDefault: false,
        billingEmail: 'backup@example.com',
      }),
    ]);
  });

  it('returns an empty list when the organization has no Stripe customer', async () => {
    const { GET } = await import('@/app/api/billing/payment-method/route');
    mockGetOrganizationStripeCustomerId.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/billing/payment-method') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      paymentMethod: null,
      paymentMethods: [],
      stripeCustomerId: null,
    });
    expect(mockCustomerRetrieve).not.toHaveBeenCalled();
    expect(mockPaymentMethodsList).not.toHaveBeenCalled();
  });
});
