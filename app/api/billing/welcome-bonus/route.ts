import { NextRequest, NextResponse } from 'next/server';

import { formatSiteCreditDeltaFromUsd } from '@/lib/billing/display';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

const SIGNUP_BONUS_USD = 3;
const SIGNUP_BONUS_REASON = 'Welcome signup bonus';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ success: true, granted: false, skipped: true });
    }

    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const fullName = typeof meta.full_name === 'string' && meta.full_name.trim()
      ? meta.full_name.trim()
      : null;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email || '',
        full_name: fullName,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      return NextResponse.json({ error: profileError.message || 'Failed to prepare profile' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin.rpc('grant_signup_bonus', {
      p_user_id: user.id,
      p_amount: SIGNUP_BONUS_USD,
      p_reason: SIGNUP_BONUS_REASON,
    } as never) as {
      data: Array<{ granted: boolean; new_balance: number; transaction_id: string | null }> | null;
      error: { message?: string } | null;
    };

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to grant welcome bonus' }, { status: 500 });
    }

    const result = data?.[0] || { granted: false, new_balance: 0, transaction_id: null };

    return NextResponse.json({
      success: true,
      granted: result.granted,
      amountUsd: SIGNUP_BONUS_USD,
      formattedAmount: formatSiteCreditDeltaFromUsd(SIGNUP_BONUS_USD),
      newBalance: Number(result.new_balance || 0),
      transactionId: result.transaction_id,
    });
  } catch (error) {
    console.error('[WELCOME BONUS API] POST failed:', error);
    return NextResponse.json({ error: 'Failed to grant welcome bonus' }, { status: 500 });
  }
}
