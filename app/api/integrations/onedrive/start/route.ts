import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { INTEGRATIONS_COMING_SOON_MESSAGE, ONEDRIVE_INTEGRATION_ENABLED } from '@/lib/integrations/availability';
import { getOneDriveOAuthConfig, ONEDRIVE_SCOPES } from '../_helpers';
import { integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';

export async function GET(request: NextRequest) {
  if (!ONEDRIVE_INTEGRATION_ENABLED) {
    return NextResponse.json({ error: INTEGRATIONS_COMING_SOON_MESSAGE }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return signedOutIntegrationResponse();
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return signedOutIntegrationResponse();
  }

  const { clientId, redirectUri, tenant } = getOneDriveOAuthConfig();
  if (!clientId || !redirectUri) {
    return integrationErrorResponse({ provider: 'onedrive', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const state = crypto.randomUUID();
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', ONEDRIVE_SCOPES);
  url.searchParams.set('state', state);

  const wantsJson = new URL(request.url).searchParams.get('mode') === 'json';
  const response = wantsJson
    ? NextResponse.json({ url: url.toString() })
    : NextResponse.redirect(url.toString());
  response.cookies.set('onedrive_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  response.cookies.set('onedrive_oauth_user', user.id, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}
