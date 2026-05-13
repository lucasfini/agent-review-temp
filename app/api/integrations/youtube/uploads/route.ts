import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, getUserFromRequest } from '../../_utils';

const parseYouTubeDurationSeconds = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
};

export async function GET(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const connection = await getConnection(user.id, 'youtube');
  if (!connection) {
    return NextResponse.json({ error: 'YouTube not connected' }, { status: 404 });
  }

  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return NextResponse.json({ error: 'YouTube token missing' }, { status: 401 });
  }

  const maxResults = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get('limit') || 20)));

  const channelsRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!channelsRes.ok) {
    const text = await channelsRes.text();
    return NextResponse.json({ error: `Failed to fetch YouTube channel details: ${text}` }, { status: 500 });
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
    return NextResponse.json({ error: `Failed to fetch YouTube uploads: ${text}` }, { status: 500 });
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
    return NextResponse.json({ error: `Failed to fetch YouTube video details: ${text}` }, { status: 500 });
  }

  const detailsData = await detailsRes.json() as any;
  const detailsById = new Map<string, any>((detailsData.items || []).map((item: any) => [item.id, item]));

  const uploads = videoIds
    .map((videoId: string) => {
      const item = detailsById.get(videoId);
      if (!item) return null;
      if (item?.status?.privacyStatus !== 'public') return null;

      return {
        videoId,
        title: item?.snippet?.title || 'Untitled video',
        channelTitle: item?.snippet?.channelTitle || null,
        publishedAt: item?.snippet?.publishedAt || null,
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
