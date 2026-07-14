import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { integrationErrorResponse, getUserFromRequest, signedOutIntegrationResponse, type IntegrationProvider } from '../_utils';

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  const body = await request.json().catch(() => ({}));
  const provider = body?.provider;
  if (
    provider !== 'zoom'
    && provider !== 'microsoft'
    && provider !== 'youtube'
    && provider !== 'notion'
    && provider !== 'onedrive'
    && provider !== 'google_drive'
    && provider !== 'granola'
    && provider !== 'slack'
  ) {
    return integrationErrorResponse({ code: 'BAD_REQUEST', action: 'disconnect', status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('integration_connections')
    .update({ status: 'revoked', access_token_enc: null, refresh_token_enc: null, expires_at: null } as any)
    .eq('user_id', user.id)
    .eq('provider', provider);

  if (updateError) {
    return integrationErrorResponse({
      provider: provider as IntegrationProvider,
      code: 'DISCONNECT_FAILED',
      action: 'disconnect',
      status: 500,
      logPrefix: '[INTEGRATION DISCONNECT] Failed:',
      cause: updateError,
    });
  }

  return NextResponse.json({ success: true });
}
