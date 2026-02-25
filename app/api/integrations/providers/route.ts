import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getUserFromRequest } from '../_utils';

export async function GET(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from('integration_connections')
    .select('provider,status,metadata,created_at,updated_at,external_account_id')
    .eq('user_id', user.id);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message || 'Failed to load integrations' }, { status: 500 });
  }

  const providers = ['zoom', 'microsoft'].map(provider => {
    const row = data?.find((c: any) => c.provider === provider && c.status === 'connected');
    return {
      provider,
      connected: Boolean(row),
      metadata: row?.metadata || null,
      externalAccountId: row?.external_account_id || null,
      updatedAt: row?.updated_at || null
    };
  });

  return NextResponse.json({ providers });
}
