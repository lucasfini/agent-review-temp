import { RouteAccessError } from '@/lib/api/route-auth';

const mockRequireAgencyClientAccess = jest.fn();
const mockCanManageAgencyClient = jest.fn();
const mockCanManageAgencySourceImport = jest.fn();
const mockGetAgencySlackTokenContext = jest.fn();
const mockListSlackChannels = jest.fn();
const mockFetchSlackMessages = jest.fn();
const mockGetAgencyClientIntegration = jest.fn();
const mockSetAgencyClientIntegration = jest.fn();
const mockCreateAgencySourceImport = jest.fn();
const mockIsDemoUser = jest.fn();
const mockUploadRateLimit = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    canManageAgencyClient: (...args: any[]) => mockCanManageAgencyClient(...args),
    canManageAgencySourceImport: (...args: any[]) => mockCanManageAgencySourceImport(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-slack', () => {
  const actual = jest.requireActual('@/lib/agency-slack');
  return {
    ...actual,
    getAgencySlackTokenContext: (...args: any[]) => mockGetAgencySlackTokenContext(...args),
    listSlackChannels: (...args: any[]) => mockListSlackChannels(...args),
    fetchSlackMessages: (...args: any[]) => mockFetchSlackMessages(...args),
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

jest.mock('@/lib/agency-source-imports', () => {
  const actual = jest.requireActual('@/lib/agency-source-imports');
  return {
    ...actual,
    createAgencySourceImport: (...args: any[]) => mockCreateAgencySourceImport(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  uploadRatelimit: {
    limit: (...args: any[]) => mockUploadRateLimit(...args),
  },
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
const slackIntegration = {
  id: 'integration-1',
  clientId: 'client-1',
  provider: 'slack',
  status: 'connected',
  metadata: {
    mode: 'oauth_connected',
    externalConnection: true,
    selectedChannels: [{ id: 'C123', name: 'support', isPrivate: false, isArchived: false, memberCount: 4 }],
    selectedChannelIds: ['C123'],
  },
  tokenStored: true,
  tokenScopes: ['channels:read', 'channels:history'],
  tokenType: 'bot',
  tokenExpiresAt: null,
  connectedAt: '2026-06-08T00:00:00.000Z',
  lastSyncAt: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};
const sourceImport = {
  id: 'source-1',
  organizationId: 'agency-org',
  clientId: 'client-1',
  provider: 'slack',
  sourceTitle: 'Slack import: support',
  rawText: '[1710000000.0001] U123: Customer asked about onboarding.',
  metadata: {},
};

describe('agency Slack channel and import routes', () => {
  beforeEach(() => {
    mockRequireAgencyClientAccess.mockReset();
    mockCanManageAgencyClient.mockReset();
    mockCanManageAgencySourceImport.mockReset();
    mockGetAgencySlackTokenContext.mockReset();
    mockListSlackChannels.mockReset();
    mockFetchSlackMessages.mockReset();
    mockGetAgencyClientIntegration.mockReset();
    mockSetAgencyClientIntegration.mockReset();
    mockCreateAgencySourceImport.mockReset();
    mockIsDemoUser.mockReset();
    mockUploadRateLimit.mockReset();

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
    mockCanManageAgencySourceImport.mockReturnValue(true);
    mockGetAgencySlackTokenContext.mockResolvedValue({
      integration: slackIntegration,
      token: 'decrypted-token',
    });
    mockGetAgencyClientIntegration.mockResolvedValue(slackIntegration);
    mockSetAgencyClientIntegration.mockResolvedValue(slackIntegration);
    mockIsDemoUser.mockReturnValue(false);
    mockUploadRateLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 60000 });
  });

  it('lists Slack channels for an authorized agency client without exposing tokens', async () => {
    const { GET } = await import('@/app/api/agency/slack/channels/route');
    mockListSlackChannels.mockResolvedValue([
      { id: 'C123', name: 'support', isPrivate: false, isArchived: false, memberCount: 4 },
    ]);

    const response = await GET(
      new Request('http://localhost/api/agency/slack/channels?organization_id=agency-org&client_id=client-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.channels).toEqual([
      { id: 'C123', name: 'support', isPrivate: false, isArchived: false, memberCount: 4 },
    ]);
    expect(JSON.stringify(payload)).not.toContain('decrypted-token');
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
  });

  it('denies SaaS org members before listing Slack channels', async () => {
    const { GET } = await import('@/app/api/agency/slack/channels/route');
    mockRequireAgencyClientAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request('http://localhost/api/agency/slack/channels?organization_id=saas-org&client_id=client-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
    expect(mockListSlackChannels).not.toHaveBeenCalled();
  });

  it('returns conflict when Slack is disconnected for channel listing', async () => {
    const { GET } = await import('@/app/api/agency/slack/channels/route');
    const { AgencySlackError } = jest.requireActual('@/lib/agency-slack');
    mockGetAgencySlackTokenContext.mockRejectedValue(
      new AgencySlackError('Slack workspace is not connected for this client', 409)
    );

    const response = await GET(
      new Request('http://localhost/api/agency/slack/channels?organization_id=agency-org&client_id=client-1') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Slack workspace is not connected for this client');
  });

  it('blocks non-admin channel selection writes', async () => {
    const { POST } = await import('@/app/api/agency/slack/channels/selection/route');
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

    const response = await POST(new Request('http://localhost/api/agency/slack/channels/selection', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        channels: [{ id: 'C123', name: 'support' }],
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Slack channel selection requires internal agency admin access');
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('blocks demo users from channel selection writes', async () => {
    const { POST } = await import('@/app/api/agency/slack/channels/selection/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/slack/channels/selection', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        channels: [{ id: 'C123', name: 'support' }],
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('requires a connected Slack workspace before saving channel selections', async () => {
    const { POST } = await import('@/app/api/agency/slack/channels/selection/route');
    mockGetAgencyClientIntegration.mockResolvedValue({
      ...slackIntegration,
      status: 'not_connected',
    });

    const response = await POST(new Request('http://localhost/api/agency/slack/channels/selection', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        channels: [{ id: 'C123', name: 'support' }],
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Slack workspace is not connected for this client');
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('caps Slack imports and stores source imports with provider/client/org metadata', async () => {
    const { POST } = await import('@/app/api/agency/slack/import/route');
    mockFetchSlackMessages.mockResolvedValue([
      { type: 'message', user: 'U123', text: 'Customer asked about onboarding.', ts: '1710000000.0001' },
    ]);
    mockCreateAgencySourceImport.mockResolvedValue(sourceImport);

    const response = await POST(new Request('http://localhost/api/agency/slack/import', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        channel_id: 'C123',
        limit: 500,
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.sourceImport).toEqual(sourceImport);
    expect(payload.limit).toBe(200);
    expect(mockFetchSlackMessages).toHaveBeenCalledWith(
      'decrypted-token',
      expect.objectContaining({
        channelId: 'C123',
        limit: 200,
      })
    );
    expect(mockCreateAgencySourceImport).toHaveBeenCalledWith(
      expect.anything(),
      'agency-org',
      'user-1',
      expect.objectContaining({
        client_id: 'client-1',
        provider: 'slack',
        sourceTitle: 'Slack import: support',
        rawText: '[1710000000.0001] U123: Customer asked about onboarding.',
        metadata: expect.objectContaining({
          channelId: 'C123',
          channelName: 'support',
          messageCount: 1,
          appliedLimit: 200,
        }),
      })
    );
  });

  it('blocks demo users from Slack imports', async () => {
    const { POST } = await import('@/app/api/agency/slack/import/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/slack/import', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        channel_id: 'C123',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
    expect(mockCreateAgencySourceImport).not.toHaveBeenCalled();
  });

  it('blocks non-admin imports for channels that were not selected', async () => {
    const { POST } = await import('@/app/api/agency/slack/import/route');
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
    mockCanManageAgencySourceImport.mockReturnValue(true);

    const response = await POST(new Request('http://localhost/api/agency/slack/import', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: 'agency-org',
        client_id: 'client-1',
        channel_id: 'C999',
      }),
    }) as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Slack channel must be selected before import');
    expect(mockFetchSlackMessages).not.toHaveBeenCalled();
  });
});
