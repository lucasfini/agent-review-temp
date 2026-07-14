import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { decryptToken, encryptToken } from '@/lib/integrations/crypto';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { getIntegrationProviderLabel } from '@/lib/integrations/error-messages';
import {
  buildIntegrationErrorPayload,
  type IntegrationErrorAction,
  type IntegrationErrorCode,
  type IntegrationProvider,
} from '@/lib/integrations/error-messages';

export type { IntegrationProvider };

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

export function integrationErrorResponse(params: {
  provider?: IntegrationProvider;
  code: IntegrationErrorCode;
  status: number;
  action?: IntegrationErrorAction;
  logPrefix?: string;
  cause?: unknown;
  userId?: string;
}) {
  if (params.cause && params.logPrefix) {
    console.error(params.logPrefix, params.cause);
  }

  if (
    params.userId &&
    params.provider &&
    (params.code === 'RECONNECT_REQUIRED' || params.code === 'LIST_FAILED')
  ) {
    void markIntegrationConnectionForReview({
      userId: params.userId,
      provider: params.provider,
      issue: params.code === 'RECONNECT_REQUIRED' ? 'reconnect_required' : 'provider_error',
    });
  }

  return NextResponse.json(
    buildIntegrationErrorPayload({
      provider: params.provider,
      code: params.code,
      action: params.action,
    }),
    { status: params.status }
  );
}

export function signedOutIntegrationResponse() {
  return integrationErrorResponse({ code: 'SIGN_IN_REQUIRED', status: 401 });
}

export async function markIntegrationConnectionForReview(params: {
  userId: string;
  provider: IntegrationProvider;
  issue: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from('integration_connections')
    .select('metadata')
    .eq('user_id', params.userId)
    .eq('provider', params.provider)
    .maybeSingle() as { data: { metadata: Record<string, unknown> | null } | null };

  const metadata = {
    ...(existing?.metadata || {}),
    healthIssue: params.issue,
    healthMessage: `${getIntegrationProviderLabel(params.provider)} needs to be reconnected.`,
    healthUpdatedAt: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('integration_connections')
    .update({ status: 'needs_attention', metadata } as any)
    .eq('user_id', params.userId)
    .eq('provider', params.provider);

  if (error) {
    console.error('[INTEGRATION HEALTH] Failed to mark connection for review:', error);
  }
}
