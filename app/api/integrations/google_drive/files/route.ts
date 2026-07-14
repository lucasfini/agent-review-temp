import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, getUserFromRequest, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { ensureFreshGoogleDriveConnection, mapGoogleDriveFile } from '../_helpers';

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  let connection = await getConnection(user.id, 'google_drive');
  if (!connection) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'RECONNECT_REQUIRED', action: 'list', status: 404, userId: user.id });
  }

  connection = await ensureFreshGoogleDriveConnection(connection);
  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'RECONNECT_REQUIRED', action: 'list', status: 401, userId: user.id });
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit') || 20);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(limitParam) ? limitParam : 20));
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('q', "trashed = false and (mimeType contains 'audio/' or mimeType contains 'video/')");
  url.searchParams.set('fields', 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,videoMediaMetadata),nextPageToken');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return integrationErrorResponse({
      provider: 'google_drive',
      code: res.status === 401 || res.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: res.status === 401 || res.status === 403 ? 401 : 500,
      logPrefix: '[GOOGLE DRIVE FILES] Provider API error:',
      cause: text,
      userId: user.id,
    });
  }

  const data = await res.json();
  const files = (data.files || [])
    .filter((file: any) => file.id && file.name)
    .map(mapGoogleDriveFile);

  return NextResponse.json({ files });
}
