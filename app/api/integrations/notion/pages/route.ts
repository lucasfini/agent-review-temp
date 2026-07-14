import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, getUserFromRequest, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { getNotionHeaders, mapNotionPage } from '../_helpers';

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  const connection = await getConnection(user.id, 'notion');
  if (!connection) {
    return integrationErrorResponse({ provider: 'notion', code: 'RECONNECT_REQUIRED', action: 'list', status: 404, userId: user.id });
  }

  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'notion', code: 'RECONNECT_REQUIRED', action: 'list', status: 401, userId: user.id });
  }

  const limitParam = Number(new URL(request.url).searchParams.get('limit') || 20);
  const pageSize = Math.min(50, Math.max(1, Number.isFinite(limitParam) ? limitParam : 20));
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: getNotionHeaders(accessToken),
    body: JSON.stringify({
      page_size: pageSize,
      filter: {
        property: 'object',
        value: 'page',
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return integrationErrorResponse({
      provider: 'notion',
      code: res.status === 401 || res.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: res.status === 401 || res.status === 403 ? 401 : 500,
      logPrefix: '[NOTION PAGES] Provider API error:',
      cause: text,
      userId: user.id,
    });
  }

  const data = await res.json();
  const pages = (data.results || []).map(mapNotionPage);
  return NextResponse.json({ pages });
}
