import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, integrationErrorResponse, signedOutIntegrationResponse, upsertConnection } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';

async function refreshZoomToken(connection: any) {
  const refreshToken = connection?.refresh_token_enc;
  if (!refreshToken) return connection;

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return connection;

  const tokens = getDecryptedTokens(connection);
  if (!tokens.refreshToken) return connection;

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken
    })
  });

  if (!res.ok) return connection;
  const data = await res.json();
  const expiresIn = data.expires_in as number | undefined;

  if (data.access_token) {
    await upsertConnection({
      userId: connection.user_id,
      provider: 'zoom',
      externalAccountId: connection.external_account_id,
      scopes: connection.scopes || [],
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      metadata: connection.metadata || {}
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
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return signedOutIntegrationResponse();
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  let connection = await getConnection(user.id, 'zoom');
  if (!connection) {
    return integrationErrorResponse({ provider: 'zoom', code: 'RECONNECT_REQUIRED', action: 'list', status: 404, userId: user.id });
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  if (expiresAt && expiresAt < Date.now() + 60 * 1000) {
    connection = await refreshZoomToken(connection);
  }

  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return integrationErrorResponse({ provider: 'zoom', code: 'RECONNECT_REQUIRED', action: 'list', status: 401, userId: user.id });
  }

  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const url = new URL('https://api.zoom.us/v2/users/me/recordings');
  url.searchParams.set('from', from.toISOString().split('T')[0]);
  url.searchParams.set('to', to.toISOString().split('T')[0]);
  url.searchParams.set('page_size', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    return integrationErrorResponse({
      provider: 'zoom',
      code: res.status === 401 || res.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
      action: 'list',
      status: res.status === 401 || res.status === 403 ? 401 : 500,
      logPrefix: '[ZOOM RECORDINGS] Provider API error:',
      cause: text,
      userId: user.id,
    });
  }

  const data = await res.json();
  const recordings = (data.meetings || []).map((m: any) => ({
    meetingId: m.uuid || m.id,
    topic: m.topic,
    startTime: m.start_time,
    duration: m.duration,
    files: (m.recording_files || []).map((f: any) => ({
      fileId: f.id,
      fileType: f.file_type,
      fileExtension: f.file_extension,
      fileSize: f.file_size,
      downloadUrl: f.download_url
    }))
  }));

  return NextResponse.json({ recordings });
}
