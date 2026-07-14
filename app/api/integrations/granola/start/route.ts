import { NextResponse } from 'next/server';
import { INTEGRATIONS_COMING_SOON_MESSAGE, GRANOLA_INTEGRATION_ENABLED } from '@/lib/integrations/availability';

export async function GET(request: Request) {
  if (!GRANOLA_INTEGRATION_ENABLED) {
    return NextResponse.json({ error: INTEGRATIONS_COMING_SOON_MESSAGE }, { status: 503 });
  }

  const wantsJson = new URL(request.url).searchParams.get('mode') === 'json';
  const redirectUrl = new URL('/dashboard/upload?tab=integrations&provider=granola', request.url);
  return wantsJson
    ? NextResponse.json({ url: redirectUrl.toString() })
    : NextResponse.redirect(redirectUrl);
}
