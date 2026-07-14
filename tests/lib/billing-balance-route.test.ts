const mockRequireAuthenticatedUser = jest.fn();
const mockGetBillingOrganizationContext = jest.fn();
const mockGetDisplayBalance = jest.fn();
const mockGetOrganizationPlanCreditBalance = jest.fn();

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

jest.mock('@/lib/api/billing-org-context', () => ({
  getBillingOrganizationContext: (...args: any[]) => mockGetBillingOrganizationContext(...args),
}));

jest.mock('@/lib/billing/credit', () => ({
  getDisplayBalance: (...args: any[]) => mockGetDisplayBalance(...args),
}));

jest.mock('@/lib/billing/display', () => ({
  formatSiteCreditsFromUsd: (amount: number) => `$${amount.toFixed(2)}`,
}));

jest.mock('@/lib/billing/plan-credits', () => ({
  getOrganizationPlanCreditBalance: (...args: any[]) => mockGetOrganizationPlanCreditBalance(...args),
}));

describe('GET /api/billing/balance', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetBillingOrganizationContext.mockReset();
    mockGetDisplayBalance.mockReset();
    mockGetOrganizationPlanCreditBalance.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetBillingOrganizationContext.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'user-1',
    });
    mockGetDisplayBalance.mockResolvedValue({
      visibleBalance: 12,
      availableBalance: 10,
      reservedPending: 2,
      lifetimeCreditsAdded: 25,
      lifetimeCreditsSpent: 13,
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('returns a usable balance payload when plan credit balance fails', async () => {
    const { GET } = await import('@/app/api/billing/balance/route');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetOrganizationPlanCreditBalance.mockRejectedValue(new Error('billing_credit_grants is missing'));

    try {
      const response = await GET(new Request('http://localhost/api/billing/balance') as any);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        success: true,
        balance: 0,
        availableBalance: 0,
        monthlyCreditGrant: 0,
        rolloverCredits: 0,
        currentPlanCredits: 0,
        topUpCredits: 0,
        legacyBalance: 12,
        legacyAvailableBalance: 10,
        legacyReservedPending: 2,
        planCreditError: 'billing_credit_grants is missing',
      });
      expect(mockGetOrganizationPlanCreditBalance).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'user-1',
        ensureGrant: true,
      });
      expect(consoleError).toHaveBeenCalledWith(
        '[BILLING API] Error fetching plan credit balance:',
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
