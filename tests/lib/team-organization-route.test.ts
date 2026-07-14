const mockRequireAuthenticatedUser = jest.fn();
const mockIsDemoUser = jest.fn();
const mockListSaasWorkspacesForUser = jest.fn();
const mockCreateOwnedSaasWorkspace = jest.fn();
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

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/onboarding-server', () => ({
  listSaasWorkspacesForUser: (...args: any[]) => mockListSaasWorkspacesForUser(...args),
  createOwnedSaasWorkspace: (...args: any[]) => mockCreateOwnedSaasWorkspace(...args),
}));

jest.mock('@/lib/authz/organization-context', () => ({
  setActiveOrganizationForUser: (...args: any[]) => mockSetActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {},
}));

const user = { id: 'user-1', email: 'owner@example.com' };
const workspace = {
  id: 'team-org-1',
  name: 'Acme Team',
  type: 'saas_customer',
  role: 'owner',
  status: 'active',
};

describe('team organization route', () => {
  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockIsDemoUser.mockReset();
    mockListSaasWorkspacesForUser.mockReset();
    mockCreateOwnedSaasWorkspace.mockReset();
    mockSetActiveOrganizationForUser.mockReset();

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockIsDemoUser.mockReturnValue(false);
    mockListSaasWorkspacesForUser.mockResolvedValue([]);
    mockCreateOwnedSaasWorkspace.mockResolvedValue(workspace);
    mockSetActiveOrganizationForUser.mockResolvedValue({ organization: workspace });
  });

  it('creates a team workspace when none exists', async () => {
    const { POST } = await import('@/app/api/organizations/team/route');

    const response = await POST(new Request('http://localhost/api/organizations/team', {
      method: 'POST',
      body: JSON.stringify({ name: 'Acme Team' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.organization).toEqual(workspace);
    expect(mockCreateOwnedSaasWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      user,
      name: 'Acme Team',
    }));
  });

  it('reuses an existing team workspace and switches active workspace', async () => {
    const { POST } = await import('@/app/api/organizations/team/route');
    mockListSaasWorkspacesForUser.mockResolvedValue([workspace]);

    const response = await POST(new Request('http://localhost/api/organizations/team', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ignored Name' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.organization).toEqual(workspace);
    expect(mockCreateOwnedSaasWorkspace).not.toHaveBeenCalled();
    expect(mockSetActiveOrganizationForUser).toHaveBeenCalledWith(expect.anything(), 'user-1', 'team-org-1');
  });
});
