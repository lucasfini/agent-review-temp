import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, getUserFromRequest, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { ensureFreshOneDriveConnection, isImportableOneDriveMimeType, mapOneDriveItem } from '../_helpers';

const SEARCH_TERMS = ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'webm', 'mkv'];

class OneDriveProviderError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'OneDriveProviderError';
  }
}

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  let connection = await getConnection(user.id, 'onedrive');
  if (!connection) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'RECONNECT_REQUIRED', action: 'list', status: 404, userId: user.id });
  }

  connection = await ensureFreshOneDriveConnection(connection);
  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'RECONNECT_REQUIRED', action: 'list', status: 401, userId: user.id });
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit') || 20);
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitParam) ? limitParam : 20));

  let responses;
  try {
    responses = await Promise.all(SEARCH_TERMS.map(async (term) => {
      const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/root/search(q='${term}')`);
      url.searchParams.set('$top', '25');
      url.searchParams.set('$select', 'id,name,size,createdDateTime,lastModifiedDateTime,file,webUrl');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new OneDriveProviderError(res.status, text);
      }
      return res.json();
    }));
  } catch (error) {
    const status = error instanceof OneDriveProviderError ? error.status : undefined;
    return integrationErrorResponse({
      provider: 'onedrive',
      code: status === 401 || status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: status === 401 || status === 403 ? 401 : 500,
      logPrefix: '[ONEDRIVE FILES] Provider API error:',
      cause: error,
      userId: user.id,
    });
  }

  const seen = new Set<string>();
  const files = responses
    .flatMap((data) => data.value || [])
    .filter((item: any) => item.id && item.file && isImportableOneDriveMimeType(item.file?.mimeType))
    .filter((item: any) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a: any, b: any) => new Date(b.lastModifiedDateTime || 0).getTime() - new Date(a.lastModifiedDateTime || 0).getTime())
    .slice(0, limit)
    .map(mapOneDriveItem);

  return NextResponse.json({ files });
}
