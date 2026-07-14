import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getUserFromRequest, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { getSlackAccessToken, isImportableSlackMimeType, mapSlackFile } from '../_helpers';

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  const connection = await getConnection(user.id, 'slack');
  if (!connection) {
    return integrationErrorResponse({ provider: 'slack', code: 'RECONNECT_REQUIRED', action: 'list', status: 404, userId: user.id });
  }

  const accessToken = getSlackAccessToken(connection);
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'slack', code: 'RECONNECT_REQUIRED', action: 'list', status: 401, userId: user.id });
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit') || 20);
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitParam) ? limitParam : 20));
  const url = new URL('https://slack.com/api/files.list');
  url.searchParams.set('count', String(limit));
  url.searchParams.set('types', 'all');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    return integrationErrorResponse({
      provider: 'slack',
      code: res.status === 401 || res.status === 403 || data.error === 'invalid_auth' || data.error === 'not_authed'
        ? 'RECONNECT_REQUIRED'
        : 'LIST_FAILED',
      action: 'list',
      status: res.status === 401 || res.status === 403 || data.error === 'invalid_auth' || data.error === 'not_authed' ? 401 : 500,
      logPrefix: '[SLACK FILES] Provider API error:',
      cause: data.error || res.statusText,
      userId: user.id,
    });
  }

  const files = (data.files || [])
    .filter((file: any) => file.id && isImportableSlackMimeType(file.mimetype))
    .map(mapSlackFile);

  return NextResponse.json({ files });
}
