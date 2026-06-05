import { OrganizationAccessError } from '@/lib/authz/types';

const mockRequireAuthenticatedUser = jest.fn();
const mockGetActiveOrganizationForUser = jest.fn();
const mockGetOrganizationSubscription = jest.fn();

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

jest.mock('@/lib/billing/subscriptions', () => {
  const actual = jest.requireActual('@/lib/billing/subscriptions');
  return {
    ...actual,
    getOrganizationSubscription: (...args: any[]) => mockGetOrganizationSubscription(...args),
  };
});

describe('GET /api/subscriptions/current', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetActiveOrganizationForUser.mockReset();
    mockGetOrganizationSubscription.mockReset();
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
    mockGetOrganizationSubscription.mockResolvedValue(null);

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
    expect(mockGetOrganizationSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'org-1'
    );
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
    mockGetOrganizationSubscription.mockResolvedValue(null);

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
        role: 'member',
        status: 'active',
      },
    });
    mockGetOrganizationSubscription.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/subscriptions/current') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.membership).toEqual({
      role: 'member',
      status: 'active',
    });
    expect(mockGetOrganizationSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'org-1'
    );
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
    expect(mockGetOrganizationSubscription).not.toHaveBeenCalled();
  });
});
