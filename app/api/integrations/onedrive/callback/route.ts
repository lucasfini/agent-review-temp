import { NextRequest, NextResponse } from 'next/server';
import { integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';
import { getOneDriveOAuthConfig, ONEDRIVE_SCOPES } from '../_helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const storedState = request.cookies.get('onedrive_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const { clientId, clientSecret, redirectUri, tenant } = getOneDriveOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      scope: ONEDRIVE_SCOPES,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return integrationErrorResponse({
      provider: 'onedrive',
      code: 'RECONNECT_REQUIRED',
      action: 'connect',
      status: 401,
      logPrefix: '[ONEDRIVE CALLBACK] Token exchange failed:',
      cause: text,
    });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const expiresIn = tokenData.expires_in as number | undefined;

  if (!accessToken) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }

  const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }
  const msUser = await userRes.json();

  const userId = request.cookies.get('onedrive_oauth_user')?.value;
  if (!userId) {
    return signedOutIntegrationResponse();
  }

  await upsertConnection({
    userId,
    provider: 'onedrive',
    externalAccountId: msUser.id,
    scopes: (tokenData.scope || '').split(' ').filter(Boolean),
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    metadata: { email: msUser.userPrincipalName, name: msUser.displayName },
  });

  const configuredAppUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : null);
  const redirectBase = configuredAppUrl || new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/dashboard/integrations', redirectBase));
  response.cookies.delete('onedrive_oauth_state');
  response.cookies.delete('onedrive_oauth_user');
  return response;
}
