import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { decryptToken, encryptToken } from '@/lib/integrations/crypto';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';

export type IntegrationProvider = 'zoom' | 'microsoft' | 'youtube' | 'stripe' | 'onedrive' | 'google_drive' | 'granola' | 'slack';

export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return { user: null, error: 'Missing authorization' };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { user: null, error: 'Unauthorized' };
  return { user, error: null };
}

export async function getConnection(userId: string, provider: IntegrationProvider) {
  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('status', 'connected')
    .single() as { data: any; error: any };

  if (error) return null;
  return data;
}

export async function upsertConnection(params: {
  userId: string;
  organizationId?: string | null;
  provider: IntegrationProvider;
  externalAccountId: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, any>;
}) {
  const { userId, organizationId, provider, externalAccountId, scopes, accessToken, refreshToken, expiresAt, metadata } = params;
  const resolvedOrganizationId = await resolveOrganizationIdForWrite(userId, organizationId || null);

  const { data, error } = await supabaseAdmin
    .from('integration_connections')
    .upsert({
      user_id: userId,
      organization_id: resolvedOrganizationId,
      provider,
      external_account_id: externalAccountId,
      status: 'connected',
      scopes,
      access_token_enc: encryptToken(accessToken),
      refresh_token_enc: refreshToken ? encryptToken(refreshToken) : null,
      expires_at: expiresAt,
      metadata: metadata || {}
    } as any, { onConflict: 'user_id,provider' })
    .select()
    .single() as { data: any; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to save connection');
  }
  return data;
}

export function getDecryptedTokens(connection: any) {
  return {
    accessToken: connection?.access_token_enc ? decryptToken(connection.access_token_enc) : null,
    refreshToken: connection?.refresh_token_enc ? decryptToken(connection.refresh_token_enc) : null,
    expiresAt: connection?.expires_at || null
  };
}
