import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { INTEGRATIONS_COMING_SOON_MESSAGE, YOUTUBE_INTEGRATION_ENABLED } from '@/lib/integrations/availability';
import { integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';

const YOUTUBE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export async function GET(request: NextRequest) {
  if (!YOUTUBE_INTEGRATION_ENABLED) {
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

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return integrationErrorResponse({ provider: 'youtube', code: 'INTEGRATION_NOT_CONFIGURED', action: 'connect', status: 500 });
  }

  const state = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);

  const wantsJson = new URL(request.url).searchParams.get('mode') === 'json';
  const response = wantsJson
    ? NextResponse.json({ url: url.toString() })
    : NextResponse.redirect(url.toString());
  response.cookies.set('youtube_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  response.cookies.set('youtube_oauth_user', user.id, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}
