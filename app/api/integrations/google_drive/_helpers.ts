import { supabaseAdmin } from '@/lib/supabase/server';
import { getDecryptedTokens, upsertConnection } from '../_utils';

export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
];

export type GoogleDriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  videoMediaMetadata?: {
    durationMillis?: string;
  };
};

export function getGoogleDriveOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
  };
}

export function isImportableDriveMimeType(mimeType?: string | null) {
  return Boolean(mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/')));
}

export function mapGoogleDriveFile(file: GoogleDriveFile) {
  const durationMillis = Number(file.videoMediaMetadata?.durationMillis || 0);
  return {
    id: file.id,
    name: file.name,
    size: file.size ? Number(file.size) : null,
    createdAt: file.createdTime || null,
    modifiedAt: file.modifiedTime || null,
    mimeType: file.mimeType || null,
    webViewLink: file.webViewLink || null,
    thumbnailUrl: file.thumbnailLink || null,
    durationSeconds: Number.isFinite(durationMillis) && durationMillis > 0
      ? Math.max(1, Math.round(durationMillis / 1000))
      : null,
  };
}

function resolveStoredScopes(nextScope: unknown, currentScopes: unknown) {
  if (typeof nextScope === 'string') return nextScope.split(' ').filter(Boolean);
  if (Array.isArray(currentScopes)) return currentScopes.filter((scope): scope is string => typeof scope === 'string');
  if (typeof currentScopes === 'string') return currentScopes.split(' ').filter(Boolean);
  return [];
}

export async function refreshGoogleDriveToken(connection: any) {
  const { clientId, clientSecret } = getGoogleDriveOAuthConfig();
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
    await upsertConnection({
      userId: connection.user_id,
      provider: 'google_drive',
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

export async function ensureFreshGoogleDriveConnection(connection: any) {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  if (expiresAt && expiresAt < Date.now() + 60 * 1000) {
    return refreshGoogleDriveToken(connection);
  }
  return connection;
}
