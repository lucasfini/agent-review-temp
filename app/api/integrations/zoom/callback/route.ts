import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return integrationErrorResponse({ provider: 'zoom', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const storedState = request.cookies.get('zoom_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return integrationErrorResponse({ provider: 'zoom', code: 'OAUTH_LINK_EXPIRED', action: 'callback', status: 400 });
  }

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const redirectUri = process.env.ZOOM_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return integrationErrorResponse({ provider: 'zoom', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    return integrationErrorResponse({
      provider: 'zoom',
      code: 'RECONNECT_REQUIRED',
      action: 'connect',
      status: 401,
      logPrefix: '[ZOOM CALLBACK] Token exchange failed:',
      cause: errorText,
    });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const expiresIn = tokenData.expires_in as number | undefined;

  const userRes = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!userRes.ok) {
    return integrationErrorResponse({ provider: 'zoom', code: 'RECONNECT_REQUIRED', action: 'connect', status: 401 });
  }

  const zoomUser = await userRes.json();

  const userId = request.cookies.get('zoom_oauth_user')?.value;
  if (!userId) {
    return signedOutIntegrationResponse();
  }

  await upsertConnection({
    userId,
    provider: 'zoom',
    externalAccountId: zoomUser.id,
    scopes: (tokenData.scope || '').split(' ').filter(Boolean),
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    metadata: { email: zoomUser.email, name: zoomUser.first_name ? `${zoomUser.first_name} ${zoomUser.last_name}` : zoomUser.email }
  });

  const response = NextResponse.redirect(new URL('/dashboard/integrations', request.url));
  response.cookies.delete('zoom_oauth_state');
  response.cookies.delete('zoom_oauth_user');
  return response;
}
