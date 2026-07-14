import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { GOOGLE_DRIVE_INTEGRATION_ENABLED, INTEGRATIONS_COMING_SOON_MESSAGE } from '@/lib/integrations/availability';
import { getGoogleDriveOAuthConfig, GOOGLE_DRIVE_SCOPES } from '../_helpers';
import { integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';

export async function GET(request: NextRequest) {
  if (!GOOGLE_DRIVE_INTEGRATION_ENABLED) {
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

  const { clientId, redirectUri } = getGoogleDriveOAuthConfig();
  if (!clientId || !redirectUri) {
    return integrationErrorResponse({ provider: 'google_drive', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', GOOGLE_DRIVE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  const wantsJson = new URL(request.url).searchParams.get('mode') === 'json';
  const response = wantsJson
    ? NextResponse.json({ url: url.toString() })
    : NextResponse.redirect(url.toString());
  response.cookies.set('google_drive_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  response.cookies.set('google_drive_oauth_user', user.id, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}
