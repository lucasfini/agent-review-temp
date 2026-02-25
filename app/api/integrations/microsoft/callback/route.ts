import { NextRequest, NextResponse } from 'next/server';
import { upsertConnection } from '../../_utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const storedState = request.cookies.get('ms_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }

  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI;
  const tenant = process.env.MS_TENANT_ID || 'common';

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 });
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
      scope: 'offline_access User.Read Files.Read'
    })
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json({ error: `Microsoft token error: ${text}` }, { status: 500 });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const expiresIn = tokenData.expires_in as number | undefined;

  const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch Microsoft user' }, { status: 500 });
  }
  const msUser = await userRes.json();

  const userId = request.cookies.get('ms_oauth_user')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Missing OAuth user context' }, { status: 401 });
  }

  await upsertConnection({
    userId,
    provider: 'microsoft',
    externalAccountId: msUser.id,
    scopes: (tokenData.scope || '').split(' ').filter(Boolean),
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    metadata: { email: msUser.userPrincipalName, name: msUser.displayName }
  });

  const response = NextResponse.redirect(new URL('/dashboard/settings', request.url));
  response.cookies.delete('ms_oauth_state');
  response.cookies.delete('ms_oauth_user');
  return response;
}
