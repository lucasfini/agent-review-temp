const mockRequireActiveOrganizationForUser = jest.fn();
const mockGetWorkspaceTeamSnapshot = jest.fn();

jest.mock('@/lib/authz/permissions', () => ({
  requireActiveOrganizationForUser: (...args: any[]) => mockRequireActiveOrganizationForUser(...args),
}));

jest.mock('@/lib/organizations/team', () => {
  const actual = jest.requireActual('@/lib/organizations/team');
  return {
    ...actual,
    getWorkspaceTeamSnapshot: (...args: any[]) => mockGetWorkspaceTeamSnapshot(...args),
  };
});

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {},
}));

const ownerMembership = {
  role: 'owner',
  status: 'active',
};

const snapshot = {
  members: [
    {
      id: 'member-1',
      organizationId: 'org-1',
      userId: 'user-1',
      email: 'owner@example.com',
      name: 'Owner User',
      role: 'owner',
      status: 'active',
      joinedAt: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  invitations: [],
  seats: {
    active: 1,
    pending: 0,
    limit: 3,
    available: 2,
    isFull: false,
  },
};

describe('GET /api/organizations/members', () => {
  beforeEach(() => {
    mockRequireActiveOrganizationForUser.mockReset();
    mockGetWorkspaceTeamSnapshot.mockReset();

    mockRequireActiveOrganizationForUser.mockResolvedValue({
      organization: {
        id: 'org-1',
        name: 'Acme Workspace',
        type: 'saas_customer',
        onboarding_metadata_json: {
          profile: {
            website: 'https://acme.example',
            description: 'B2B content workspace',
          },
          guidedSetup: {
            roleTitle: ' Marketing lead ',
            teamSize: ' 6-10 ',
          },
        },
      },
      membership: ownerMembership,
    });
    mockGetWorkspaceTeamSnapshot.mockResolvedValue(snapshot);
  });

  it('returns workspace identity and guided setup details', async () => {
    const { GET } = await import('@/app/api/organizations/members/route');

    const response = await GET(new Request('http://localhost/api/organizations/members?organization_id=org-1') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.organization).toEqual({
      id: 'org-1',
      name: 'Acme Workspace',
      type: 'saas_customer',
      profile: {
        website: 'https://acme.example',
        description: 'B2B content workspace',
      },
      guidedSetup: {
        roleTitle: 'Marketing lead',
        teamSize: '6-10',
      },
    });
    expect(payload.members).toEqual(snapshot.members);
    expect(payload.membership).toEqual({
      role: 'owner',
      status: 'active',
      canManageWorkspace: true,
    });
    expect(mockRequireActiveOrganizationForUser).toHaveBeenCalledWith(expect.anything(), {
      requestedOrganizationId: 'org-1',
    });
    expect(mockGetWorkspaceTeamSnapshot).toHaveBeenCalledWith(expect.anything(), 'org-1');
  });

  it('returns null guided setup values when metadata is missing or malformed', async () => {
    const { GET } = await import('@/app/api/organizations/members/route');
    mockRequireActiveOrganizationForUser.mockResolvedValue({
      organization: {
        id: 'org-1',
        name: 'Acme Workspace',
        type: 'saas_customer',
        onboarding_metadata_json: {
          guidedSetup: {
            roleTitle: 42,
            teamSize: '',
          },
        },
      },
      membership: ownerMembership,
    });

    const response = await GET(new Request('http://localhost/api/organizations/members') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.organization.guidedSetup).toEqual({
      roleTitle: null,
      teamSize: null,
    });
  });
});
