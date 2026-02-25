import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, upsertConnection } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';

async function refreshMicrosoftToken(connection: any) {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const tenant = process.env.MS_TENANT_ID || 'common';
  if (!clientId || !clientSecret) return connection;

  const tokens = getDecryptedTokens(connection);
  if (!tokens.refreshToken) return connection;

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      scope: 'offline_access User.Read Files.Read'
    })
  });

  if (!res.ok) return connection;
  const data = await res.json();
  const expiresIn = data.expires_in as number | undefined;

  if (data.access_token) {
    await upsertConnection({
      userId: connection.user_id,
      provider: 'microsoft',
      externalAccountId: connection.external_account_id,
      scopes: (data.scope || connection.scopes || '').split(' ').filter(Boolean),
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let connection = await getConnection(user.id, 'microsoft');
  if (!connection) {
    return NextResponse.json({ error: 'Microsoft not connected' }, { status: 404 });
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  if (expiresAt && expiresAt < Date.now() + 60 * 1000) {
    connection = await refreshMicrosoftToken(connection);
  }

  const { accessToken } = getDecryptedTokens(connection);
  if (!accessToken) {
    return NextResponse.json({ error: 'Microsoft token missing' }, { status: 401 });
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/Recordings:/children', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json({ recordings: [] });
    }
    const text = await res.text();
    return NextResponse.json({ error: `Microsoft Graph error: ${text}` }, { status: 500 });
  }

  const data = await res.json();
  const recordings = (data.value || [])
    .filter((item: any) => item.file && item.size)
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      createdAt: item.createdDateTime,
      mimeType: item.file?.mimeType,
      downloadUrl: item['@microsoft.graph.downloadUrl']
    }));

  return NextResponse.json({ recordings });
}
