import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, getUserFromRequest, integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';

const parseYouTubeDurationSeconds = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

async function refreshYouTubeToken(connection: any) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return connection;

  const tokens = getDecryptedTokens(connection);
  if (!tokens.refreshToken) return connection;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!res.ok) return connection;
  const data = await res.json();
  const expiresIn = data.expires_in as number | undefined;

  if (data.access_token) {
    const existingScopes = Array.isArray(connection.scopes)
      ? connection.scopes
      : String(connection.scopes || '').split(' ').filter(Boolean);

    await upsertConnection({
      userId: connection.user_id,
      provider: 'youtube',
      externalAccountId: connection.external_account_id,
      scopes: String(data.scope || '').split(' ').filter(Boolean).length
        ? String(data.scope || '').split(' ').filter(Boolean)
        : existingScopes,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      metadata: connection.metadata || {},
    });
  }

  const { data: updated } = await supabaseAdmin
    .from('integration_connections')
    .select('*')
    .eq('id', connection.id)
    .single() as { data: any };
  return updated || connection;
}

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  let connection = await getConnection(user.id, 'youtube');
  if (!connection) {
    return integrationErrorResponse({ provider: 'youtube', code: 'RECONNECT_REQUIRED', action: 'list', status: 404, userId: user.id });
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  if (expiresAt && expiresAt < Date.now() + 60 * 1000) {
    connection = await refreshYouTubeToken(connection);
  }

  let { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'youtube', code: 'RECONNECT_REQUIRED', action: 'list', status: 401, userId: user.id });
  }

  const maxResults = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get('limit') || 20)));

  let channelsRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (channelsRes.status === 401) {
    connection = await refreshYouTubeToken(connection);
    accessToken = getDecryptedTokens(connection).accessToken;
    if (accessToken) {
      channelsRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
    }
  }

  if (!channelsRes.ok) {
    const text = await channelsRes.text();
    return integrationErrorResponse({
      provider: 'youtube',
      code: channelsRes.status === 401 || channelsRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: channelsRes.status === 401 || channelsRes.status === 403 ? 401 : 500,
      logPrefix: '[YOUTUBE UPLOADS] Provider channel error:',
      cause: text,
      userId: user.id,
    });
  }

  const channelsData = await channelsRes.json() as any;
  const uploadsPlaylistId = channelsData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    return NextResponse.json({ uploads: [] });
  }

  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${maxResults}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );

  if (!playlistRes.ok) {
    const text = await playlistRes.text();
    return integrationErrorResponse({
      provider: 'youtube',
      code: playlistRes.status === 401 || playlistRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: playlistRes.status === 401 || playlistRes.status === 403 ? 401 : 500,
      logPrefix: '[YOUTUBE UPLOADS] Provider playlist error:',
      cause: text,
      userId: user.id,
    });
  }

  const playlistData = await playlistRes.json() as any;
  const videoIds = (playlistData.items || [])
    .map((item: any) => item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    return NextResponse.json({ uploads: [] });
  }

  const detailsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status,snippet&id=${encodeURIComponent(videoIds.join(','))}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );

  if (!detailsRes.ok) {
    const text = await detailsRes.text();
    return integrationErrorResponse({
      provider: 'youtube',
      code: detailsRes.status === 401 || detailsRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: detailsRes.status === 401 || detailsRes.status === 403 ? 401 : 500,
      logPrefix: '[YOUTUBE UPLOADS] Provider details error:',
      cause: text,
      userId: user.id,
    });
  }

  const detailsData = await detailsRes.json() as any;
  const detailsById = new Map<string, any>((detailsData.items || []).map((item: any) => [item.id, item]));

  const uploads = videoIds
    .map((videoId: string) => {
      const item = detailsById.get(videoId);
      if (!item) return null;

      return {
        videoId,
        title: item?.snippet?.title || 'Untitled video',
        channelTitle: item?.snippet?.channelTitle || null,
        publishedAt: item?.snippet?.publishedAt || null,
        privacyStatus: item?.status?.privacyStatus || null,
        thumbnailUrl:
          item?.snippet?.thumbnails?.medium?.url ||
          item?.snippet?.thumbnails?.default?.url ||
          null,
        durationSeconds: parseYouTubeDurationSeconds(item?.contentDetails?.duration),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ uploads });
}
