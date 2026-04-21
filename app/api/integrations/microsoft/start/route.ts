import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { INTEGRATIONS_COMING_SOON_MESSAGE, INTEGRATIONS_ENABLED } from '@/lib/integrations/availability';

export async function GET(request: NextRequest) {
  if (!INTEGRATIONS_ENABLED) {
    return NextResponse.json({ error: INTEGRATIONS_COMING_SOON_MESSAGE }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.MS_CLIENT_ID;
  const redirectUri = process.env.MS_REDIRECT_URI;
  const tenant = process.env.MS_TENANT_ID || 'common';
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', 'offline_access User.Read Files.Read');
  url.searchParams.set('state', state);

  const wantsJson = new URL(request.url).searchParams.get('mode') === 'json';
  const response = wantsJson
    ? NextResponse.json({ url: url.toString() })
    : NextResponse.redirect(url.toString());
  response.cookies.set('ms_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  response.cookies.set('ms_oauth_user', user.id, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}
