import { NextRequest, NextResponse } from 'next/server';
import { integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';
import { getGoogleDriveOAuthConfig } from '../_helpers';

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const storedState = request.cookies.get('google_drive_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const { clientId, clientSecret, redirectUri } = getGoogleDriveOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return integrationErrorResponse({
      provider: 'google_drive',
      code: 'RECONNECT_REQUIRED',
      action: 'connect',
      status: 401,
      logPrefix: '[GOOGLE DRIVE CALLBACK] Token exchange failed:',
      cause: text,
    });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const expiresIn = tokenData.expires_in as number | undefined;

  if (!accessToken) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoRes.ok) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }

  const userInfo = await userInfoRes.json() as GoogleUserInfo;
  const userId = request.cookies.get('google_drive_oauth_user')?.value;
  if (!userId) {
    return signedOutIntegrationResponse();
  }

  await upsertConnection({
    userId,
    provider: 'google_drive',
    externalAccountId: userInfo.sub || userInfo.email || 'google-drive-account',
    scopes: (tokenData.scope || '').split(' ').filter(Boolean),
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    metadata: {
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture,
    },
  });

  const configuredAppUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : null);
  const redirectBase = configuredAppUrl || new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/dashboard/integrations', redirectBase));
  response.cookies.delete('google_drive_oauth_state');
  response.cookies.delete('google_drive_oauth_user');
  return response;
}
