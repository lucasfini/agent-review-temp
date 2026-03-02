import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';

const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sinceIso = new Date(Date.now() - DAYS_7_MS).toISOString();

    const [{ count: activeProcessingCount }, { count: failedCount }] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .in('status', ['uploading', 'processing']),
      supabaseAdmin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('updated_at', sinceIso),
    ]);

    const { data: creditRows } = await supabaseAdmin
      .from('account_credits')
      .select('balance');
    const totalCreditsBalance = (creditRows || []).reduce((sum, row: any) => sum + Number(row.balance || 0), 0);

    const { data: debitRows } = await supabaseAdmin
      .from('credit_transactions')
      .select('amount')
      .eq('transaction_type', 'debit')
      .gte('created_at', sinceIso);
    const totalDebits7d = (debitRows || []).reduce((sum, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

    const { data: usageRows } = await supabaseAdmin
      .from('usage_events')
      .select('units, unit_type')
      .gte('created_at', sinceIso);
    const totalSeconds = (usageRows || [])
      .filter((row: any) => row.unit_type === 'seconds')
      .reduce((sum, row: any) => sum + Number(row.units || 0), 0);

    return NextResponse.json({
      success: true,
      activeProcessingCount: activeProcessingCount || 0,
      failedLast7dCount: failedCount || 0,
      totalCreditsBalance,
      totalDebits7d,
      processedMinutes7d: totalSeconds / 60,
    });
  } catch (error) {
    console.error('[ADMIN OVERVIEW] Error:', error);
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 });
  }
}
