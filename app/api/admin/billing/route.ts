import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

function parseRangeToIso(range: string | null): string | null {
  if (!range || range === 'all') return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const map: Record<string, number> = {
    '7d': 7 * day,
    '30d': 30 * day,
    '6m': 180 * day,
  };
  const offset = map[range];
  if (!offset) return null;
  return new Date(now - offset).toISOString();
}

function normalizeSearch(search: string | null): string | null {
  const trimmed = search?.trim();
  if (!trimmed) return null;

  // PostgREST .or() uses commas and parentheses as syntax, so keep admin search plain.
  return trimmed.replace(/[(),]/g, ' ').slice(0, 100).trim() || null;
}

function parseBoundedInteger(
  value: string | null,
  defaultValue: number,
  { min, max }: { min: number; max: number }
): { value?: number; error?: string } {
  if (!value) return { value: defaultValue };

  if (!/^\d+$/.test(value)) {
    return { error: `Must be an integer between ${min} and ${max}` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return { error: `Must be an integer between ${min} and ${max}` };
  }

  return { value: parsed };
}

function aggregateTotals(rows: any[]) {
  return rows.reduce(
    (acc: any, row: any) => {
      const amount = Number(row.amount || 0);
      if (row.transaction_type === 'purchase') acc.purchases += amount;
      if (row.transaction_type === 'refund') acc.refunds += Math.abs(amount);
      if (row.transaction_type === 'debit') acc.debits += Math.abs(amount);
      return acc;
    },
    { purchases: 0, refunds: 0, debits: 0 }
  );
}

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

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range');
    const search = normalizeSearch(searchParams.get('search'));
    const parsedLimit = parseBoundedInteger(searchParams.get('limit'), 30, { min: 1, max: 100 });
    const parsedOffset = parseBoundedInteger(searchParams.get('offset'), 0, { min: 0, max: 100000 });

    if (parsedLimit.error || parsedOffset.error) {
      return NextResponse.json(
        {
          error: 'Invalid pagination parameters',
          details: {
            limit: parsedLimit.error || null,
            offset: parsedOffset.error || null,
          },
        },
        { status: 400 }
      );
    }

    const limit = parsedLimit.value!;
    const offset = parsedOffset.value!;

    const sinceIso = range === 'all'
      ? null
      : parseRangeToIso(range) || new Date(Date.now() - DAYS_30_MS).toISOString();

    let txQuery = supabaseAdmin
      .from('credit_transactions')
      .select('id, user_id, amount, transaction_type, reason, invoice_number, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sinceIso) {
      txQuery = txQuery.gte('created_at', sinceIso);
    }

    if (search) {
      txQuery = txQuery.or(
        `reason.ilike.%${search}%,transaction_type.ilike.%${search}%,invoice_number.ilike.%${search}%`
      );
    }

    const { data: txRows, error: txError, count: total } = await txQuery;
    if (txError) {
      throw new Error(`Failed to load billing transactions: ${txError.message}`);
    }

    const fallbackTotals = aggregateTotals(txRows || []);

    const { data: aggregateRows, error: aggregateError } = await supabaseAdmin.rpc('get_admin_billing_totals', {
      p_since: sinceIso,
      p_search: search,
    } as any) as { data: any[] | null; error: any };

    if (aggregateError) {
      console.warn('[ADMIN BILLING] Falling back to paged totals because aggregate RPC failed:', aggregateError.message || aggregateError);
    }

    const aggregate = aggregateRows?.[0];
    const totals = aggregateError || !aggregate
      ? fallbackTotals
      : {
        purchases: Number(aggregate.purchases || 0),
        refunds: Number(aggregate.refunds || 0),
        debits: Number(aggregate.debits || 0),
      };

    const userIds = Array.from(new Set((txRows || []).map((row: any) => row.user_id))).filter(Boolean);
    const userEmailMap: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (id) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        if (data?.user?.email) userEmailMap[id] = data.user.email;
      })
    );

    const transactions = (txRows || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: userEmailMap[row.user_id] || 'unknown',
      amount: Number(row.amount),
      transactionType: row.transaction_type,
      reason: row.reason,
      invoiceNumber: row.invoice_number,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      success: true,
      totals,
      totalsScope: aggregateError ? 'current_page_fallback' : 'all_matching_rows',
      transactions,
      rangeDays: range === '7d' ? 7 : range === '6m' ? 180 : range === 'all' ? null : 30,
      total: total || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[ADMIN BILLING] Error:', error);
    return NextResponse.json({ error: 'Failed to load billing data' }, { status: 500 });
  }
}
