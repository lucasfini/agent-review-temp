import { NextRequest, NextResponse } from 'next/server';
import { upsertConnection } from '../../_utils';

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

type YouTubeChannel = {
  id?: string;
  snippet?: {
    title?: string;
    customUrl?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const storedState = request.cookies.get('youtube_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'YouTube OAuth not configured' }, { status: 500 });
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
    return NextResponse.json({ error: `YouTube token error: ${text}` }, { status: 500 });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;
  const refreshToken = tokenData.refresh_token as string | undefined;
  const expiresIn = tokenData.expires_in as number | undefined;

  if (!accessToken) {
    return NextResponse.json({ error: 'YouTube OAuth did not return an access token' }, { status: 500 });
  }

  const [userInfoRes, channelRes] = await Promise.all([
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!userInfoRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch Google user info' }, { status: 500 });
  }

  if (!channelRes.ok) {
    const text = await channelRes.text();
    return NextResponse.json({ error: `Failed to fetch YouTube channel: ${text}` }, { status: 500 });
  }

  const userInfo = await userInfoRes.json() as GoogleUserInfo;
  const channelData = await channelRes.json() as { items?: YouTubeChannel[] };
  const channel = channelData.items?.[0] || null;

  const userId = request.cookies.get('youtube_oauth_user')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Missing OAuth user context' }, { status: 401 });
  }

  await upsertConnection({
    userId,
    provider: 'youtube',
    externalAccountId: channel?.id || userInfo.sub || userInfo.email || 'youtube-account',
    scopes: (tokenData.scope || '').split(' ').filter(Boolean),
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    metadata: {
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.picture,
      channelId: channel?.id || null,
      channelTitle: channel?.snippet?.title || null,
      channelHandle: channel?.snippet?.customUrl || null,
      channelThumbnail:
        channel?.snippet?.thumbnails?.high?.url ||
        channel?.snippet?.thumbnails?.medium?.url ||
        channel?.snippet?.thumbnails?.default?.url ||
        null,
    },
  });

  const response = NextResponse.redirect(new URL('/dashboard/settings', request.url));
  response.cookies.delete('youtube_oauth_state');
  response.cookies.delete('youtube_oauth_user');
  return response;
}
