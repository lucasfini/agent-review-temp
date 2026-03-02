/**
 * Grouped Transactions API
 * GET /api/billing/transactions/grouped
 *
 * Groups debit transactions by projectId + time proximity (10-min window)
 * so individual sub-cent charges appear as meaningful project-level totals.
 * Non-debit transactions (purchases, bonuses, refunds) remain individual.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

interface GroupedTransaction {
  id: string;
  type: 'single' | 'grouped';
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
  projectTitle?: string;
  balanceAfter: number;
  invoiceNumber?: string | null;
  childCount?: number;
  children?: { reason: string; amount: number; createdAt: string }[];
}

const GROUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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

    // Fetch all transactions (we group client-side since grouping logic is complex)
    const { data: rawTransactions, error: txError, count } = await supabaseAdmin
      .from('credit_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }) as { data: any[] | null; error: any; count: number | null };

    if (txError) {
      throw new Error(`Failed to fetch transactions: ${txError.message}`);
    }

    const transactions = rawTransactions || [];

    // Collect unique project IDs from metadata or usage events
    const projectIds = new Set<string>();
    const usageEventIds = new Set<string>();
    for (const tx of transactions) {
      const pid = tx.metadata?.projectId;
      if (pid) projectIds.add(pid);
      if (tx.usage_event_id) usageEventIds.add(tx.usage_event_id);
    }

    // Fetch project IDs from usage events when metadata is missing
    const usageEventProjectMap: Record<string, string> = {};
    if (usageEventIds.size > 0) {
      const { data: usageEvents } = await supabaseAdmin
        .from('usage_events')
        .select('id, project_id')
        .in('id', Array.from(usageEventIds)) as { data: any[] | null; error: any };

      if (usageEvents) {
        for (const ue of usageEvents) {
          if (ue.project_id) {
            usageEventProjectMap[ue.id] = ue.project_id;
            projectIds.add(ue.project_id);
          }
        }
      }
    }

    // Fetch project titles
    const projectTitles: Record<string, string> = {};
    if (projectIds.size > 0) {
      const { data: projects } = await supabaseAdmin
        .from('projects')
        .select('id, title')
        .in('id', Array.from(projectIds)) as { data: any[] | null; error: any };

      if (projects) {
        for (const p of projects) {
          projectTitles[p.id] = p.title;
        }
      }
    }

    // Separate debits from non-debits
    const debits = transactions.filter((tx: any) => tx.transaction_type === 'debit');
    const nonDebits = transactions.filter((tx: any) => tx.transaction_type !== 'debit');

    // Group debits by projectId + time window
    const debitGroups: Map<string, any[]> = new Map();

    for (const tx of debits) {
      const pid = tx.metadata?.projectId || usageEventProjectMap[tx.usage_event_id] || 'unknown';
      const txTime = new Date(tx.created_at).getTime();

      // Find existing group for this project within time window
      let placed = false;
      const groupKey = `project:${pid}`;
      const existingGroups = debitGroups.get(groupKey) || [];

      for (const group of existingGroups) {
        const groupTime = new Date(group[0].created_at).getTime();
        if (Math.abs(txTime - groupTime) <= GROUP_WINDOW_MS) {
          group.push(tx);
          placed = true;
          break;
        }
      }

      if (!placed) {
        existingGroups.push([tx]);
        debitGroups.set(groupKey, existingGroups);
      }
    }

    // Build grouped results
    const grouped: GroupedTransaction[] = [];

    // Add non-debit transactions as singles
    for (const tx of nonDebits) {
      grouped.push({
        id: tx.id,
        type: 'single',
        createdAt: tx.created_at,
        transactionType: tx.transaction_type,
        amount: Number(tx.amount),
        reason: tx.reason || getDefaultReason(tx.transaction_type),
        balanceAfter: Number(tx.balance_after),
        invoiceNumber: tx.invoice_number ?? null,
      });
    }

    // Add grouped debits
    for (const [groupKey, groups] of debitGroups.entries()) {
      const pid = groupKey.replace('project:', '');

      for (const group of groups) {
        if (group.length === 1) {
          // Single debit — no grouping needed
          const tx = group[0];
          grouped.push({
            id: tx.id,
            type: 'single',
            createdAt: tx.created_at,
            transactionType: 'debit',
            amount: Number(tx.amount),
            reason: tx.reason || 'AI processing',
            projectTitle: pid !== 'unknown' ? projectTitles[pid] || undefined : undefined,
            balanceAfter: Number(tx.balance_after),
          });
        } else {
          // Multiple debits — group them
          const totalAmount = group.reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
          const latestTx = group[0]; // already sorted desc
          const earliestTx = group[group.length - 1];
          const title = pid !== 'unknown' ? projectTitles[pid] : undefined;

          grouped.push({
            id: `group-${latestTx.id}`,
            type: 'grouped',
            createdAt: latestTx.created_at,
            transactionType: 'debit',
            amount: Number(totalAmount.toFixed(6)),
            reason: title
              ? `Project: ${title} — Processing (${group.length} services)`
              : `Processing (${group.length} services)`,
            projectTitle: title,
            balanceAfter: Number(latestTx.balance_after),
            childCount: group.length,
            children: group.map((tx: any) => ({
              reason: tx.reason || 'AI processing',
              amount: Number(tx.amount),
              createdAt: tx.created_at,
            })),
          });
        }
      }
    }

    // Sort by date descending
    grouped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const total = grouped.length;
    const paginated = grouped.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      transactions: paginated,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[BILLING API] Error fetching grouped transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grouped transactions' },
      { status: 500 }
    );
  }
}

function getDefaultReason(type: string): string {
  switch (type) {
    case 'purchase': return 'Credit purchase';
    case 'bonus': return 'Bonus credits';
    case 'refund': return 'Refund';
    case 'admin_adjustment': return 'Admin adjustment';
    default: return type;
  }
}
