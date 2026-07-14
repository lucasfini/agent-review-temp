import { NextRequest, NextResponse } from 'next/server';
import { integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';
import { getNotionOAuthConfig } from '../_helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return integrationErrorResponse({ provider: 'notion', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const storedState = request.cookies.get('notion_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return integrationErrorResponse({ provider: 'notion', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const { clientId, clientSecret, redirectUri } = getNotionOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return integrationErrorResponse({ provider: 'notion', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return integrationErrorResponse({
      provider: 'notion',
      code: 'RECONNECT_REQUIRED',
      action: 'connect',
      status: 401,
      logPrefix: '[NOTION CALLBACK] Token exchange failed:',
      cause: text,
    });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'notion', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }

  const userId = request.cookies.get('notion_oauth_user')?.value;
  if (!userId) {
    return signedOutIntegrationResponse();
  }

  await upsertConnection({
    userId,
    provider: 'notion',
    externalAccountId: tokenData.workspace_id || tokenData.bot_id || 'notion-workspace',
    scopes: [],
    accessToken,
    refreshToken: null,
    expiresAt: null,
    metadata: {
      workspaceId: tokenData.workspace_id || null,
      workspaceName: tokenData.workspace_name || null,
      workspaceIcon: tokenData.workspace_icon || null,
      botId: tokenData.bot_id || null,
      owner: tokenData.owner || null,
    },
  });

  const configuredAppUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : null);
  const redirectBase = configuredAppUrl || new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/dashboard/integrations', redirectBase));
  response.cookies.delete('notion_oauth_state');
  response.cookies.delete('notion_oauth_user');
  return response;
}
