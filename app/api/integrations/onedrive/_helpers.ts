import { supabaseAdmin } from '@/lib/supabase/server';
import { getDecryptedTokens, upsertConnection } from '../_utils';

export const ONEDRIVE_SCOPES = 'offline_access User.Read Files.Read';

export function getOneDriveOAuthConfig() {
  return {
    clientId: process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    tenant: process.env.MS_TENANT_ID || 'common',
    redirectUri: process.env.ONEDRIVE_REDIRECT_URI,
  };
}

export function isImportableOneDriveMimeType(mimeType?: string | null) {
  return Boolean(mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/')));
}

export function mapOneDriveItem(item: any) {
  return {
    id: item.id,
    name: item.name,
    size: item.size || null,
    createdAt: item.createdDateTime || null,
    modifiedAt: item.lastModifiedDateTime || null,
    mimeType: item.file?.mimeType || null,
    webUrl: item.webUrl || null,
    downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
  };
}

function resolveStoredScopes(nextScope: unknown, currentScopes: unknown) {
  if (typeof nextScope === 'string') return nextScope.split(' ').filter(Boolean);
  if (Array.isArray(currentScopes)) return currentScopes.filter((scope): scope is string => typeof scope === 'string');
  if (typeof currentScopes === 'string') return currentScopes.split(' ').filter(Boolean);
  return [];
}

export async function refreshOneDriveToken(connection: any) {
  const { clientId, clientSecret, tenant } = getOneDriveOAuthConfig();
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
      scope: ONEDRIVE_SCOPES,
    }),
  });

  if (!res.ok) return connection;
  const data = await res.json();
  const expiresIn = data.expires_in as number | undefined;

  if (data.access_token) {
    await upsertConnection({
      userId: connection.user_id,
      provider: 'onedrive',
      externalAccountId: connection.external_account_id,
      scopes: resolveStoredScopes(data.scope, connection.scopes),
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

export async function ensureFreshOneDriveConnection(connection: any) {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  if (expiresAt && expiresAt < Date.now() + 60 * 1000) {
    return refreshOneDriveToken(connection);
  }
  return connection;
}
