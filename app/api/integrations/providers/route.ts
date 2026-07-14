import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { integrationErrorResponse, getUserFromRequest, signedOutIntegrationResponse } from '../_utils';
import { getIntegrationConnectionHealth, INTEGRATION_HEALTH_PROVIDERS } from '@/lib/integrations/connection-health';

export async function GET(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from('integration_connections')
    .select('provider,status,metadata,created_at,updated_at,external_account_id,access_token_enc,refresh_token_enc,expires_at')
    .eq('user_id', user.id);

  if (fetchError) {
    return integrationErrorResponse({
      code: 'TEMPORARY_UNAVAILABLE',
      status: 500,
      action: 'list',
      logPrefix: '[INTEGRATION PROVIDERS] Failed to load connections:',
      cause: fetchError,
    });
  }

  const providers = INTEGRATION_HEALTH_PROVIDERS.map(provider => {
    const row = data?.find((c: any) => c.provider === provider && c.status !== 'revoked');
    const health = getIntegrationConnectionHealth(row);
    return {
      provider,
      connected: health.connected,
      healthStatus: health.healthStatus,
      needsReview: health.needsReview,
      issue: health.issue,
      metadata: row?.metadata || null,
      externalAccountId: row?.external_account_id || null,
      updatedAt: row?.updated_at || null
    };
  });

  return NextResponse.json({ providers });
}
