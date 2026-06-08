import {
  buildSlackAuthorizeUrl,
  createSlackOAuthState,
  DEFAULT_SLACK_OAUTH_SCOPES,
  getSlackOAuthConfig,
  parseSlackOAuthState,
  slackConnectedMetadataFromOAuthResponse,
  SlackOAuthStateError,
} from '@/lib/agency-slack-oauth';

describe('agency Slack OAuth helpers', () => {
  it('creates and validates signed OAuth state', () => {
    const state = createSlackOAuthState({
      clientId: 'client-1',
      organizationId: 'agency-org',
      userId: 'user-1',
    }, {
      now: 1_000,
      nonce: 'nonce-1',
      secret: 'test-secret',
      ttlMs: 60_000,
    });

    expect(parseSlackOAuthState(state, {
      now: 2_000,
      secret: 'test-secret',
    })).toEqual({
      clientId: 'client-1',
      organizationId: 'agency-org',
      userId: 'user-1',
      nonce: 'nonce-1',
      issuedAt: 1_000,
      expiresAt: 61_000,
    });
  });

  it('rejects tampered and expired OAuth state', () => {
    const state = createSlackOAuthState({
      clientId: 'client-1',
      organizationId: 'agency-org',
      userId: 'user-1',
    }, {
      now: 1_000,
      nonce: 'nonce-1',
      secret: 'test-secret',
      ttlMs: 60_000,
    });

    expect(() => parseSlackOAuthState(`${state}x`, {
      now: 2_000,
      secret: 'test-secret',
    })).toThrow(SlackOAuthStateError);
    expect(() => parseSlackOAuthState(state, {
      now: 70_000,
      secret: 'test-secret',
    })).toThrow('OAuth state expired');
  });

  it('builds Slack OAuth configuration and authorize URLs with documented import scopes', () => {
    const config = getSlackOAuthConfig({
      SLACK_CLIENT_ID: 'client-id',
      SLACK_CLIENT_SECRET: 'client-secret',
      SLACK_REDIRECT_URI: 'https://example.com/api/agency/slack/oauth/callback',
      SLACK_OAUTH_SCOPES: 'team:read,channels:history',
    } as NodeJS.ProcessEnv);

    expect(config.scopes).toEqual([...DEFAULT_SLACK_OAUTH_SCOPES]);

    const url = buildSlackAuthorizeUrl(config, 'signed-state');
    expect(url.toString()).toContain('https://slack.com/oauth/v2/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope')).toBe(DEFAULT_SLACK_OAUTH_SCOPES.join(','));
    expect(url.searchParams.get('state')).toBe('signed-state');
  });

  it('stores Slack workspace metadata without raw token values', () => {
    const metadata = slackConnectedMetadataFromOAuthResponse({
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
      enterprise: {
        id: 'E123',
        name: 'Enterprise',
      },
      authed_user: {
        id: 'U123',
        scope: 'team:read',
        access_token: 'xoxp-user-secret',
      },
    }, 'user-1', '2026-06-07T12:00:00.000Z');

    expect(metadata).toMatchObject({
      mode: 'oauth_connected',
      externalConnection: true,
      workspaceId: 'T123',
      workspaceName: 'Client Workspace',
      connectedBy: 'user-1',
      connectedAt: '2026-06-07T12:00:00.000Z',
      tokenStorage: 'deferred',
      tokenStored: false,
    });
    expect(JSON.stringify(metadata)).not.toContain('xoxb-secret-token');
    expect(JSON.stringify(metadata)).not.toContain('xoxp-user-secret');
  });
});
