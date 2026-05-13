import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getUserFromRequest } from '../_utils';

export async function POST(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const provider = body?.provider;
  if (provider !== 'zoom' && provider !== 'microsoft' && provider !== 'youtube') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('integration_connections')
    .update({ status: 'revoked', access_token_enc: null, refresh_token_enc: null, expires_at: null } as any)
    .eq('user_id', user.id)
    .eq('provider', provider);

  if (updateError) {
    return NextResponse.json({ error: updateError.message || 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
