import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireAuthenticatedUser = jest.fn();
const mockGetActiveOrganizationForUser = jest.fn();
const mockGetOrCreateCreditSubscription = jest.fn();
const mockEnsureCurrentPlanCreditGrant = jest.fn();
const mockGetEntitlementsForSubscription = jest.fn();

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

jest.mock('@/lib/billing/plan-credits', () => ({
  getOrCreateCreditSubscription: (...args: any[]) => mockGetOrCreateCreditSubscription(...args),
  ensureCurrentPlanCreditGrant: (...args: any[]) => mockEnsureCurrentPlanCreditGrant(...args),
}));

jest.mock('@/lib/billing/entitlements', () => ({
  getEntitlementsForSubscription: (...args: any[]) => mockGetEntitlementsForSubscription(...args),
}));

describe('GET /api/subscriptions/current', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetActiveOrganizationForUser.mockReset();
    mockGetOrCreateCreditSubscription.mockReset();
    mockEnsureCurrentPlanCreditGrant.mockReset();
    mockGetEntitlementsForSubscription.mockReset();
  });

  it('returns fallback entitlements when the organization has no subscription', async () => {
    const { GET } = await import('@/app/api/subscriptions/current/route');
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization: {
        id: 'org-1',
        name: 'Acme Workspace',
        type: 'personal_legacy',
      },
      membership: {
        role: 'owner',
        status: 'active',
      },
    });
    mockGetOrCreateCreditSubscription.mockResolvedValue(null);
    mockEnsureCurrentPlanCreditGrant.mockResolvedValue({ subscription: null });
    mockGetEntitlementsForSubscription.mockReturnValue({
      source: 'legacy_fallback',
      enforcementMode: 'none',
      legacyCreditsEnabled: true,
      isSubscriptionUsable: false,
    });

    const response = await GET(new Request('http://localhost/api/subscriptions/current') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.subscription).toBeNull();
    expect(payload.entitlements).toMatchObject({
      source: 'legacy_fallback',
      enforcementMode: 'none',
      legacyCreditsEnabled: true,
      isSubscriptionUsable: false,
    });
    expect(mockGetActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      null
    );
    expect(mockGetOrCreateCreditSubscription).toHaveBeenCalledWith({ organizationId: 'org-1' });
    expect(mockEnsureCurrentPlanCreditGrant).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      subscription: null,
    });
    expect(mockGetEntitlementsForSubscription).toHaveBeenCalledWith(null);
  });

  it('passes requested organization_id through active membership validation', async () => {
    const { GET } = await import('@/app/api/subscriptions/current/route');
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization: {
        id: 'org-requested',
        name: 'Requested Org',
        type: 'saas_customer',
      },
      membership: {
        role: 'admin',
        status: 'active',
      },
    });
    mockGetOrCreateCreditSubscription.mockResolvedValue(null);
    mockEnsureCurrentPlanCreditGrant.mockResolvedValue({ subscription: null });
    mockGetEntitlementsForSubscription.mockReturnValue({
      source: 'legacy_fallback',
      enforcementMode: 'none',
      legacyCreditsEnabled: true,
      isSubscriptionUsable: false,
    });

    const response = await GET(
      new Request('http://localhost/api/subscriptions/current?organization_id=org-requested') as any
    );

    expect(response.status).toBe(200);
    expect(mockGetActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'org-requested'
    );
  });

  it('keeps current subscription readable for active members', async () => {
    const { GET } = await import('@/app/api/subscriptions/current/route');
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization: {
        id: 'org-1',
        name: 'Member Org',
        type: 'saas_customer',
      },
      membership: {
        role: 'editor',
        status: 'active',
      },
    });
    mockGetOrCreateCreditSubscription.mockResolvedValue(null);
    mockEnsureCurrentPlanCreditGrant.mockResolvedValue({ subscription: null });
    mockGetEntitlementsForSubscription.mockReturnValue({
      source: 'legacy_fallback',
      enforcementMode: 'none',
      legacyCreditsEnabled: true,
      isSubscriptionUsable: false,
    });

    const response = await GET(new Request('http://localhost/api/subscriptions/current') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.membership).toEqual({
      role: 'editor',
      status: 'active',
    });
    expect(mockGetOrCreateCreditSubscription).toHaveBeenCalledWith({ organizationId: 'org-1' });
  });

  it('keeps current subscription readable when plan credit grant reconciliation fails', async () => {
    const { GET } = await import('@/app/api/subscriptions/current/route');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const subscription = {
      id: 'subscription-1',
      organizationId: 'org-1',
      status: 'active',
      plan: {
        id: 'plan-standard',
        slug: 'standard',
        name: 'Standard',
      },
    };
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization: {
        id: 'org-1',
        name: 'Member Org',
        type: 'saas_customer',
      },
      membership: {
        role: 'owner',
        status: 'active',
      },
    });
    mockGetOrCreateCreditSubscription.mockResolvedValue(subscription);
    mockEnsureCurrentPlanCreditGrant.mockRejectedValue(new Error('billing_credit_grants is missing'));
    mockGetEntitlementsForSubscription.mockReturnValue({
      source: 'subscription',
      isSubscriptionUsable: true,
    });

    try {
      const response = await GET(new Request('http://localhost/api/subscriptions/current') as any);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.subscription).toEqual(subscription);
      expect(payload.entitlements).toMatchObject({
        source: 'subscription',
        isSubscriptionUsable: true,
      });
      expect(mockEnsureCurrentPlanCreditGrant).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'user-1',
        subscription,
      });
      expect(consoleError).toHaveBeenCalledWith(
        '[SUBSCRIPTIONS_CURRENT] Failed to ensure current plan credit grant:',
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not query subscriptions when organization access is denied', async () => {
    const { GET } = await import('@/app/api/subscriptions/current/route');
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockGetActiveOrganizationForUser.mockRejectedValue(
      new OrganizationAccessError(403, 'Forbidden')
    );

    const response = await GET(
      new Request('http://localhost/api/subscriptions/current?organization_id=other-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Forbidden' });
    expect(mockGetOrCreateCreditSubscription).not.toHaveBeenCalled();
    expect(mockEnsureCurrentPlanCreditGrant).not.toHaveBeenCalled();
  });
});
