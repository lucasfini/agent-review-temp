import { RouteAccessError } from '@/lib/api/route-auth';
import {
  createSlackOAuthState,
  DEFAULT_SLACK_OAUTH_SCOPES,
  parseSlackOAuthState,
} from '@/lib/agency-slack-oauth';

const mockRequireAgencyClientAccess = jest.fn();
const mockCanManageAgencyClient = jest.fn();
const mockSetAgencyClientIntegration = jest.fn();
const mockIsDemoUser = jest.fn();

jest.mock('@/lib/authz/agency-permissions', () => {
  const actual = jest.requireActual('@/lib/authz/agency-permissions');
  return {
    ...actual,
    canManageAgencyClient: (...args: any[]) => mockCanManageAgencyClient(...args),
    requireAgencyClientAccess: (...args: any[]) => mockRequireAgencyClientAccess(...args),
  };
});

jest.mock('@/lib/agency-client-integrations', () => {
  const actual = jest.requireActual('@/lib/agency-client-integrations');
  return {
    ...actual,
    setAgencyClientIntegration: (...args: any[]) => mockSetAgencyClientIntegration(...args),
  };
});

jest.mock('@/lib/demo-mode', () => ({
  isDemoUser: (...args: any[]) => mockIsDemoUser(...args),
}));

jest.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const originalEnv = process.env;
const originalFetch = global.fetch;

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
const slackStateSecret = 'slack-state-secret';
const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function setSlackEnv() {
  process.env = {
    ...originalEnv,
    SLACK_CLIENT_ID: 'slack-client-id',
    SLACK_CLIENT_SECRET: 'slack-secret',
    SLACK_REDIRECT_URI: 'http://localhost/api/agency/slack/oauth/callback',
    SLACK_OAUTH_STATE_SECRET: slackStateSecret,
    INTEGRATIONS_ENCRYPTION_KEY: encryptionKey,
  };
}

function signedState(overrides: Partial<{
  clientId: string;
  organizationId: string;
  userId: string;
}> = {}) {
  return createSlackOAuthState({
    clientId: overrides.clientId || 'client-1',
    organizationId: overrides.organizationId || 'agency-org',
    userId: overrides.userId || 'user-1',
  }, {
    now: Date.now(),
    nonce: 'nonce-1',
    secret: slackStateSecret,
  });
}

describe('agency Slack OAuth routes', () => {
  beforeEach(() => {
    setSlackEnv();
    mockRequireAgencyClientAccess.mockReset();
    mockCanManageAgencyClient.mockReset();
    mockSetAgencyClientIntegration.mockReset();
    mockIsDemoUser.mockReset();

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
    mockSetAgencyClientIntegration.mockResolvedValue({
      id: 'integration-1',
      clientId: 'client-1',
      provider: 'slack',
      status: 'connected',
      metadata: {},
    });
    mockIsDemoUser.mockReturnValue(false);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('starts Slack OAuth for internal agency admins with signed state', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/start/route');

    const response = await GET(
      new Request(
        'http://localhost/api/agency/slack/oauth/start?organization_id=agency-org&client_id=client-1&mode=json'
      ) as any
    );
    const payload = await response.json();
    const slackUrl = new URL(payload.url);
    const parsedState = parseSlackOAuthState(slackUrl.searchParams.get('state'), {
      secret: slackStateSecret,
    });

    expect(response.status).toBe(200);
    expect(slackUrl.origin + slackUrl.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(slackUrl.searchParams.get('client_id')).toBe('slack-client-id');
    expect(slackUrl.searchParams.get('scope')).toBe(DEFAULT_SLACK_OAUTH_SCOPES.join(','));
    expect(parsedState).toMatchObject({
      clientId: 'client-1',
      organizationId: 'agency-org',
      userId: 'user-1',
    });
    expect(mockRequireAgencyClientAccess).toHaveBeenCalledWith(
      expect.anything(),
      'client-1',
      { requestedOrganizationId: 'agency-org' }
    );
  });

  it('requires a client id for Slack OAuth start', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/start/route');

    const response = await GET(
      new Request('http://localhost/api/agency/slack/oauth/start?organization_id=agency-org') as any
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('client_id is required for Slack OAuth');
    expect(mockRequireAgencyClientAccess).not.toHaveBeenCalled();
  });

  it('denies SaaS organizations before starting Slack OAuth', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/start/route');
    mockRequireAgencyClientAccess.mockRejectedValue(
      new RouteAccessError(403, 'Agency console access requires an internal agency organization')
    );

    const response = await GET(
      new Request(
        'http://localhost/api/agency/slack/oauth/start?organization_id=saas-org&client_id=client-1&mode=json'
      ) as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Agency console access requires an internal agency organization');
  });

  it('denies clients outside the active agency organization', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/start/route');
    mockRequireAgencyClientAccess.mockRejectedValue(new RouteAccessError(404, 'Agency client not found'));

    const response = await GET(
      new Request(
        'http://localhost/api/agency/slack/oauth/start?organization_id=agency-org&client_id=client-2&mode=json'
      ) as any
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe('Agency client not found');
  });

  it('blocks agency members from starting Slack OAuth', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/start/route');
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

    const response = await GET(
      new Request(
        'http://localhost/api/agency/slack/oauth/start?organization_id=agency-org&client_id=client-1&mode=json'
      ) as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Slack OAuth requires internal agency admin access');
  });

  it('blocks demo users from starting Slack OAuth', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/start/route');
    mockIsDemoUser.mockReturnValue(true);

    const response = await GET(
      new Request(
        'http://localhost/api/agency/slack/oauth/start?organization_id=agency-org&client_id=client-1&mode=json'
      ) as any
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Demo account is read-only');
  });

  it('rejects invalid OAuth state on callback', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/callback/route');

    const response = await GET(
      new Request('http://localhost/api/agency/slack/oauth/callback?code=abc&state=bad-state') as any
    );
    const redirectUrl = new URL(response.headers.get('location') || '');

    expect(response.status).toBe(307);
    expect(redirectUrl.pathname).toBe('/dashboard/agency/slack');
    expect(redirectUrl.searchParams.get('slack_oauth')).toBe('error');
    expect(redirectUrl.searchParams.get('reason')).toBe('invalid_state');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('handles Slack OAuth provider errors without writing integration metadata', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/callback/route');

    const response = await GET(
      new Request(
        `http://localhost/api/agency/slack/oauth/callback?error=access_denied&state=${encodeURIComponent(signedState())}`
      ) as any
    );
    const redirectUrl = new URL(response.headers.get('location') || '');

    expect(response.status).toBe(307);
    expect(redirectUrl.searchParams.get('slack_oauth')).toBe('error');
    expect(redirectUrl.searchParams.get('reason')).toBe('access_denied');
    expect(redirectUrl.searchParams.get('organization_id')).toBe('agency-org');
    expect(redirectUrl.searchParams.get('client_id')).toBe('client-1');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockSetAgencyClientIntegration).not.toHaveBeenCalled();
  });

  it('stores connected Slack workspace metadata without raw tokens on callback', async () => {
    const { GET } = await import('@/app/api/agency/slack/oauth/callback/route');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        access_token: 'xoxb-secret-token',
        refresh_token: 'xoxb-refresh-token',
        token_type: 'bot',
        scope: 'team:read',
        bot_user_id: 'UBOT',
        app_id: 'AAPP',
        team: {
          id: 'T123',
          name: 'Client Workspace',
        },
        authed_user: {
          id: 'U123',
          scope: 'team:read',
          access_token: 'xoxp-user-token',
        },
      }),
    });

    const response = await GET(
      new Request(
        `http://localhost/api/agency/slack/oauth/callback?code=slack-code&state=${encodeURIComponent(signedState())}`
      ) as any
    );
    const redirectUrl = new URL(response.headers.get('location') || '');
    const savedPayload = mockSetAgencyClientIntegration.mock.calls[0][2];
    const savedMetadata = savedPayload.metadata;

    expect(response.status).toBe(307);
    expect(redirectUrl.searchParams.get('slack_oauth')).toBe('success');
    expect(redirectUrl.searchParams.get('reason')).toBe('connected');
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
        status: 'connected',
        connectedAt: expect.any(String),
      })
    );
    expect(savedMetadata).toMatchObject({
      mode: 'oauth_connected',
      externalConnection: true,
      workspaceId: 'T123',
      workspaceName: 'Client Workspace',
      connectedBy: 'user-1',
      tokenStorage: 'client_integrations_encrypted_columns',
      tokenStored: true,
    });
    expect(savedPayload.accessTokenEncrypted).toEqual(expect.any(String));
    expect(savedPayload.refreshTokenEncrypted).toEqual(expect.any(String));
    expect(savedPayload.tokenScopes).toEqual(['team:read']);
    expect(JSON.stringify(savedMetadata)).not.toContain('xoxb-secret-token');
    expect(JSON.stringify(savedMetadata)).not.toContain('xoxp-user-token');
    expect(savedPayload.accessTokenEncrypted).not.toContain('xoxb-secret-token');
  });
});
