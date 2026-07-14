const mockRequireAuthenticatedUser = jest.fn();
const mockGetActiveOrganizationForUser = jest.fn();
const mockListActiveOrganizationsForUser = jest.fn();
const mockSetActiveOrganizationForUser = jest.fn();

jest.mock('@/lib/api/route-auth', () => {
  class RouteAccessError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'RouteAccessError';
    }
  }

  return {
    RouteAccessError,
    requireAuthenticatedUser: (...args: any[]) => mockRequireAuthenticatedUser(...args),
  };
});

jest.mock('@/lib/authz/organization-context', () => ({
  getActiveOrganizationForUser: (...args: any[]) => mockGetActiveOrganizationForUser(...args),
  listActiveOrganizationsForUser: (...args: any[]) => mockListActiveOrganizationsForUser(...args),
  setActiveOrganizationForUser: (...args: any[]) => mockSetActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {},
}));

const user = { id: 'user-1', email: 'user@example.com' };
const currentContext = {
  organization: {
    id: 'org-1',
    name: 'Acme Workspace',
    type: 'saas_customer',
  },
  membership: {
    role: 'owner',
    status: 'active',
  },
};
const personalContext = {
  organization: {
    id: 'personal-1',
    name: 'Personal Workspace',
    type: 'personal_legacy',
  },
  membership: {
    role: 'owner',
    status: 'active',
  },
};

describe('active organization route', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetActiveOrganizationForUser.mockReset();
    mockListActiveOrganizationsForUser.mockReset();
    mockSetActiveOrganizationForUser.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockGetActiveOrganizationForUser.mockResolvedValue(currentContext);
    mockListActiveOrganizationsForUser.mockResolvedValue([currentContext, personalContext]);
    mockSetActiveOrganizationForUser.mockResolvedValue(personalContext);
  });

  it('lists active workspaces and marks the current workspace', async () => {
    const { GET } = await import('@/app/api/organizations/active/route');

    const response = await GET(new Request('http://localhost/api/organizations/active') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentOrganizationId).toBe('org-1');
    expect(payload.organizations).toEqual([
      {
        id: 'org-1',
        name: 'Acme Workspace',
        type: 'saas_customer',
        role: 'owner',
        status: 'active',
        isCurrent: true,
      },
      {
        id: 'personal-1',
        name: 'Personal Workspace',
        type: 'personal_legacy',
        role: 'owner',
        status: 'active',
        isCurrent: false,
      },
    ]);
    expect(mockGetActiveOrganizationForUser).toHaveBeenCalledWith(expect.anything(), 'user-1', null);
    expect(mockListActiveOrganizationsForUser).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('switches the active workspace for an authenticated member', async () => {
    const { PATCH } = await import('@/app/api/organizations/active/route');

    const response = await PATCH(new Request('http://localhost/api/organizations/active', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'personal-1' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentOrganizationId).toBe('personal-1');
    expect(payload.organization).toEqual({
      id: 'personal-1',
      name: 'Personal Workspace',
      type: 'personal_legacy',
      role: 'owner',
      status: 'active',
      isCurrent: true,
    });
    expect(mockSetActiveOrganizationForUser).toHaveBeenCalledWith(expect.anything(), 'user-1', 'personal-1');
  });

  it('requires an organization id when switching', async () => {
    const { PATCH } = await import('@/app/api/organizations/active/route');

    const response = await PATCH(new Request('http://localhost/api/organizations/active', {
      method: 'PATCH',
      body: JSON.stringify({}),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('organization_id is required');
    expect(mockSetActiveOrganizationForUser).not.toHaveBeenCalled();
  });

  it('surfaces forbidden workspace switches', async () => {
    const { OrganizationAccessError } = await import('@/lib/authz/types');
    const { PATCH } = await import('@/app/api/organizations/active/route');
    mockSetActiveOrganizationForUser.mockRejectedValue(new OrganizationAccessError(403, 'Forbidden'));

    const response = await PATCH(new Request('http://localhost/api/organizations/active', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'other-org' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
  });
});
