const mockRequireAuthenticatedUser = jest.fn();
const mockGetActiveOrganizationForUser = jest.fn();
const mockIsDemoUser = jest.fn();
const mockFrom = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();

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
}));

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: (...args: any[]) => mockFrom(...args) },
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = {
  id: 'org-1',
  name: 'Acme Workspace',
  type: 'saas_customer',
  onboarding_completed_at: null,
  onboarding_skipped_at: null,
  onboarding_metadata_json: {
    profile: {
      audience: 'RevOps leaders',
      contentGoal: 'Launch thought leadership',
    },
    source: 'test',
  },
};
const ownerMembership = { role: 'owner', status: 'active' };
const memberMembership = { role: 'member', status: 'active' };

describe('current organization route', () => {
  let latestUpdatePayload: Record<string, unknown>;

  beforeEach(() => {
    mockRequireAuthenticatedUser.mockReset();
    mockGetActiveOrganizationForUser.mockReset();
    mockIsDemoUser.mockReset();
    mockFrom.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();
    mockSelect.mockReset();
    mockSingle.mockReset();
    latestUpdatePayload = {};

    mockRequireAuthenticatedUser.mockResolvedValue(user);
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization,
      membership: ownerMembership,
    });
    mockIsDemoUser.mockReturnValue(false);
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockUpdate.mockImplementation((payload: Record<string, unknown>) => {
      latestUpdatePayload = payload;
      return { eq: mockEq };
    });
    mockEq.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockSingle.mockImplementation(async () => ({
      data: { ...organization, ...latestUpdatePayload },
      error: null,
    }));
  });

  it('returns onboarding state for the requested organization', async () => {
    const { GET } = await import('@/app/api/organizations/current/route');

    const response = await GET(
      new Request('http://localhost/api/organizations/current?organization_id=org-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      organization: {
        id: 'org-1',
        name: 'Acme Workspace',
        type: 'saas_customer',
        onboarding: {
          completedAt: null,
          skippedAt: null,
          metadata: organization.onboarding_metadata_json,
        },
      },
      membership: ownerMembership,
    });
    expect(mockGetActiveOrganizationForUser).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'org-1'
    );
  });

  it('updates org-scoped onboarding profile and completion state for owners', async () => {
    const { PATCH } = await import('@/app/api/organizations/current/route');

    const response = await PATCH(new Request('http://localhost/api/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'org-1',
        name: 'Acme Corp',
        profile: {
          website: ' https://acme.example ',
          description: ' B2B content workspace ',
        },
        onboardingCompleted: true,
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('organizations');
    expect(mockEq).toHaveBeenCalledWith('id', 'org-1');
    expect(latestUpdatePayload).toEqual(expect.objectContaining({
      name: 'Acme Corp',
      onboarding_completed_at: expect.any(String),
      onboarding_skipped_at: null,
    }));
    expect(latestUpdatePayload.onboarding_metadata_json).toEqual(expect.objectContaining({
      source: 'test',
      updatedAt: expect.any(String),
      profile: {
        audience: 'RevOps leaders',
        contentGoal: 'Launch thought leadership',
        website: 'https://acme.example',
        description: 'B2B content workspace',
      },
    }));
    expect(payload.organization).toEqual(expect.objectContaining({
      id: 'org-1',
      name: 'Acme Corp',
      onboarding: expect.objectContaining({
        completedAt: expect.any(String),
      }),
    }));
  });

  it('blocks non-admin members from updating onboarding', async () => {
    const { PATCH } = await import('@/app/api/organizations/current/route');
    mockGetActiveOrganizationForUser.mockResolvedValue({
      organization,
      membership: memberMembership,
    });

    const response = await PATCH(new Request('http://localhost/api/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', name: 'Member edit' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Organization setup requires owner or admin access');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('blocks demo users from updating onboarding', async () => {
    const { PATCH } = await import('@/app/api/organizations/current/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await PATCH(new Request('http://localhost/api/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', onboardingSkipped: true }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects invalid onboarding profile payloads', async () => {
    const { PATCH } = await import('@/app/api/organizations/current/route');

    const response = await PATCH(new Request('http://localhost/api/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify({ organization_id: 'org-1', profile: 'invalid' }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('profile must be an object');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
