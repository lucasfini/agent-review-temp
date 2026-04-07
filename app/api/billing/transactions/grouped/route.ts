import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getGroupedTransactions } from '@/lib/billing/grouped-transactions';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { transactions, total, hasMore } = await getGroupedTransactions(user.id, limit, offset);

    return NextResponse.json({
      success: true,
      transactions,
      total,
      limit,
      offset,
      hasMore,
    });
  } catch (error) {
    console.error('[BILLING API] Error fetching grouped transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grouped transactions' },
      { status: 500 }
    );
  }
}
