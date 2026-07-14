import { NextRequest, NextResponse } from 'next/server';
import { integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';
import { getSlackOAuthConfig } from '../_helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return integrationErrorResponse({ provider: 'slack', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const storedState = request.cookies.get('slack_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return integrationErrorResponse({ provider: 'slack', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const { clientId, clientSecret, redirectUri } = getSlackOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return integrationErrorResponse({ provider: 'slack', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.ok) {
    return integrationErrorResponse({
      provider: 'slack',
      code: 'RECONNECT_REQUIRED',
      action: 'connect',
      status: 401,
      logPrefix: '[SLACK CALLBACK] Token exchange failed:',
      cause: tokenData.error || tokenRes.statusText,
    });
  }

  const accessToken = tokenData.access_token as string | undefined;
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'slack', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }

  const userId = request.cookies.get('slack_oauth_user')?.value;
  if (!userId) {
    return signedOutIntegrationResponse();
  }

  await upsertConnection({
    userId,
    provider: 'slack',
    externalAccountId: tokenData.team?.id || tokenData.enterprise?.id || 'slack-workspace',
    scopes: typeof tokenData.scope === 'string' ? tokenData.scope.split(',').filter(Boolean) : [],
    accessToken,
    refreshToken: null,
    expiresAt: null,
    metadata: {
      teamId: tokenData.team?.id || null,
      teamName: tokenData.team?.name || null,
      enterpriseId: tokenData.enterprise?.id || null,
      appId: tokenData.app_id || null,
      botUserId: tokenData.bot_user_id || null,
    },
  });

  const configuredAppUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : null);
  const redirectBase = configuredAppUrl || new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/dashboard/integrations', redirectBase));
  response.cookies.delete('slack_oauth_state');
  response.cookies.delete('slack_oauth_user');
  return response;
}
