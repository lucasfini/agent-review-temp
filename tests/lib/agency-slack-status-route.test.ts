import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyAccess = jest.fn();
const mockRequireAgencyClientAccess = jest.fn();
const mockCanManageAgencyClient = jest.fn();
const mockGetAgencyClientIntegration = jest.fn();
const mockSetAgencyClientIntegration = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    canManageAgencyClient: (...args: any[]) => mockCanManageAgencyClient(...args),
    requireAgencyAccess: (...args: any[]) => mockRequireAgencyAccess(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-client-integrations', () => {
  const actual = jest.requireActual('@/lib/agency-client-integrations');
  return {
    ...actual,
    getAgencyClientIntegration: (...args: any[]) => mockGetAgencyClientIntegration(...args),
    setAgencyClientIntegration: (...args: any[]) => mockSetAgencyClientIntegration(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const user = { id: 'user-1', email: 'user@example.com' };
const organization = {
  id: 'agency-org',
  name: 'Internal Agency',
  type: 'internal_agency',
};
const agencyAdmin = {
  role: 'agency_admin',
  status: 'active',
};
const agencyMember = {
  role: 'agency_member',
  status: 'active',
};
const integration = {
  id: 'integration-1',
  clientId: 'client-1',
  provider: 'slack',
  status: 'needs_attention',
  metadata: {
    mode: 'foundation_only',
    workspaceName: 'Client Slack',
    externalConnection: false,
  },
  connectedAt: null,
  lastSyncAt: null,
  createdAt: '2026-06-07T00:00:00.000Z',
  updatedAt: '2026-06-07T00:00:00.000Z',
};

describe('agency Slack status routes', () => {
  beforeEach(() => {
    mockRequireAgencyAccess.mockReset();
    mockRequireAgencyClientAccess.mockReset();
    mockCanManageAgencyClient.mockReset();
    mockGetAgencyClientIntegration.mockReset();
    mockSetAgencyClientIntegration.mockReset();
    mockIsDemoUser.mockReset();

    mockRequireAgencyAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyAdmin,
    });
    mockRequireAgencyClientAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyAdmin,
      agencyClient: {
        id: 'client-1',
        organization_id: 'agency-org',
        name: 'Acme',
        status: 'active',
      },
    });
    mockCanManageAgencyClient.mockReturnValue(true);
    mockGetAgencyClientIntegration.mockResolvedValue(integration);
    mockSetAgencyClientIntegration.mockResolvedValue(integration);
    mockIsDemoUser.mockReturnValue(false);
  });

  it('loads Slack status for an internal agency organization', async () => {
    const { GET } = await import('@/app/api/agency/slack/status/route');

    const response = await GET(
      new Request('http://localhost/api/agency/slack/status?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.integration).toBeNull();
    expect(payload.membership.canManageAgencyClient).toBe(true);
    expect(mockRequireAgencyAccess).toHaveBeenCalledWith(
      expect.anything(),
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockGetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('validates client-scoped Slack status against agency client access', async () => {
    const { GET } = await import('@/app/api/agency/slack/status/route');

    const response = await GET(
      new Request('http://localhost/api/agency/slack/status?organization_id=agency-org&client_id=client-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.integration).toEqual(integration);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockGetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      'slack'
    );
  });

  it('denies SaaS organization members before loading Slack status', async () => {
    const { GET } = await import('@/app/api/agency/slack/status/route');
    mockRequireAgencyAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/slack/status?organization_id=saas-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockGetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('updates Slack status for internal agency admins', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'needs_attention',
        workspaceName: 'Client Slack',
        channelNames: '#support',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.integration).toEqual(integration);
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
    expect(mockSetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      expect.objectContaining({
        provider: 'slack',
        status: 'needs_attention',
        metadata: expect.objectContaining({
          mode: 'foundation_only',
          workspaceName: 'Client Slack',
          externalConnection: false,
        }),
      })
    );
  });

  it('preserves OAuth connected metadata when saving readiness notes', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');
    mockGetAgencyClientIntegration.mockResolvedValue({
      ...integration,
      status: 'connected',
      metadata: {
        mode: 'oauth_connected',
        externalConnection: true,
        workspaceId: 'T123',
        workspaceName: 'Client Workspace',
      },
    });

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'connected',
        workspaceName: 'Client Workspace',
        channelNames: '#support',
      }),
    }) as any);

    expect(response.status).toBe(200);
    expect(mockSetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      expect.objectContaining({
        provider: 'slack',
        status: 'connected',
        metadata: expect.objectContaining({
          mode: 'oauth_connected',
          workspaceName: 'Client Workspace',
          externalConnection: true,
        }),
      })
    );
  });

  it('keeps existing Slack metadata when a status patch omits optional fields', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');
    mockGetAgencyClientIntegration.mockResolvedValue({
      ...integration,
      status: 'connected',
      metadata: {
        mode: 'oauth_connected',
        externalConnection: true,
        workspaceName: 'Client Workspace',
        workspaceUrl: 'https://client.slack.com',
        channelNames: '#support',
        notes: 'Existing notes',
      },
    });

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'connected',
      }),
    }) as any);

    expect(response.status).toBe(200);
    expect(mockSetAgencyClientIntegration).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          mode: 'oauth_connected',
          externalConnection: true,
          workspaceName: 'Client Workspace',
          workspaceUrl: 'https://client.slack.com',
          channelNames: '#support',
          notes: 'Existing notes',
        }),
      })
    );
  });

  it('blocks agency members from Slack status writes', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');
    mockRequireAgencyClientAccess.mockResolvedValue({
      user,
      organization,
      membership: agencyMember,
      agencyClient: {
        id: 'client-1',
        organization_id: 'agency-org',
        name: 'Acme',
        status: 'active',
      },
    });
    mockCanManageAgencyClient.mockReturnValue(false);

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'needs_attention',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Slack status management requires internal agency admin access');
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('blocks demo users from Slack status writes', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'needs_attention',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('requires a client for Slack status writes', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        status: 'needs_attention',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('client_id is required for Slack status');
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('returns validation errors for invalid Slack status values', async () => {
    const { PATCH } = await import('@/app/api/agency/slack/status/route');
    mockSetAgencyClientIntegration.mockRejectedValue(
      new (jest.requireActual('@/lib/agency-client-integrations').AgencyClientIntegrationValidationError)(
        'status must be one of: not_connected, connected, needs_attention, disabled'
      )
    );

    const response = await PATCH(new Request('http://localhost/api/agency/slack/status', {
      method: 'PATCH',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        status: 'invalid',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('status must be one of: not_connected, connected, needs_attention, disabled');
  });
});
