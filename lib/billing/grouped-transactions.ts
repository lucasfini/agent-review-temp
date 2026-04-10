import { supabaseAdmin } from '@/lib/supabase/server';
import { formatWorkflowReason } from '@/lib/billing/presentation';

export interface GroupedTransactionChild {
  reason: string;
  amount: number;
  createdAt: string;
  kind?: 'hold' | 'charge' | 'release' | 'usage';
}

export interface GroupedTransaction {
  id: string;
  type: 'single' | 'workflow';
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
  projectTitle?: string;
  balanceAfter: number;
  invoiceNumber?: string | null;
  childCount?: number;
  children?: GroupedTransactionChild[];
  workflowType?: string;
  holdAmount?: number;
  finalCharge?: number;
  releasedAmount?: number;
  reservationStatus?: string;
}

function getDefaultReason(type: string): string {
  switch (type) {
    case 'purchase': return 'Credit purchase';
    case 'bonus': return 'Bonus credits';
    case 'refund': return 'Refund';
    case 'admin_adjustment': return 'Admin adjustment';
    case 'reserve': return 'Estimated hold';
    case 'settle': return 'Final charge';
    case 'release': return 'Released back';
    default: return type;
  }
}

export async function getGroupedTransactions(
  userId: string,
  limit: number,
  offset: number
): Promise<{
  transactions: GroupedTransaction[];
  total: number;
  hasMore: boolean;
}> {
  const { data: rawTransactions, error: txError } = await supabaseAdmin
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

  if (txError) {
    throw new Error(`Failed to fetch transactions: ${txError.message}`);
  }

  const transactions = rawTransactions || [];
  const reservationIds = Array.from(new Set(transactions.map((tx: any) => tx.reservation_id).filter(Boolean)));
  const usageEventIds = Array.from(new Set(transactions.map((tx: any) => tx.usage_event_id).filter(Boolean)));

  const reservationMap: Record<string, any> = {};
  const projectIds = new Set<string>();
  const usageEventProjectMap: Record<string, string> = {};

  if (reservationIds.length > 0) {
    const { data: reservations } = await supabaseAdmin
      .from('billing_reservations')
      .select('id, project_id, workflow_type, status, reserved_amount, settled_amount, released_amount, metadata, created_at, updated_at, completed_at')
      .in('id', reservationIds) as { data: any[] | null; error: any };

    for (const reservation of reservations || []) {
      reservationMap[reservation.id] = reservation;
      if (reservation.project_id) projectIds.add(reservation.project_id);
    }
  }

  if (usageEventIds.length > 0) {
    const { data: usageEvents } = await supabaseAdmin
      .from('usage_events')
      .select('id, project_id')
      .in('id', usageEventIds) as { data: any[] | null; error: any };

    for (const usageEvent of usageEvents || []) {
      if (usageEvent.project_id) {
        usageEventProjectMap[usageEvent.id] = usageEvent.project_id;
        projectIds.add(usageEvent.project_id);
      }
    }
  }

  for (const tx of transactions) {
    const projectId = tx.metadata?.projectId || usageEventProjectMap[tx.usage_event_id];
    if (projectId) projectIds.add(projectId);
  }

  const projectTitles: Record<string, string> = {};
  if (projectIds.size > 0) {
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, title')
      .in('id', Array.from(projectIds)) as { data: any[] | null; error: any };

    for (const project of projects || []) {
      projectTitles[project.id] = project.title;
    }
  }

  const grouped: GroupedTransaction[] = [];
  const reservationTransactions = new Map<string, any[]>();
  const standaloneTransactions: any[] = [];

  for (const tx of transactions) {
    if (tx.reservation_id) {
      const list = reservationTransactions.get(tx.reservation_id) || [];
      list.push(tx);
      reservationTransactions.set(tx.reservation_id, list);
    } else {
      standaloneTransactions.push(tx);
    }
  }

  for (const [reservationId, txs] of reservationTransactions.entries()) {
    const reservation = reservationMap[reservationId];
    const sortedTxs = [...txs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latestTx = sortedTxs[0];
    const reserveTx = sortedTxs.find((tx) => tx.transaction_type === 'reserve');
    const releaseTxs = sortedTxs.filter((tx) => tx.transaction_type === 'release');

    const projectId = reservation?.project_id || latestTx.metadata?.projectId || usageEventProjectMap[latestTx.usage_event_id];
    const projectTitle = projectId ? projectTitles[projectId] : undefined;
    const holdAmount = Math.abs(Number(reserveTx?.amount || 0));
    const finalCharge = Number(reservation?.settled_amount || 0);
    const releasedAmount = Number(releaseTxs.reduce((sum, tx) => sum + Math.max(0, Number(tx.amount || 0)), 0).toFixed(4));

    grouped.push({
      id: reservationId,
      type: 'workflow',
      createdAt: latestTx.created_at,
      transactionType: 'workflow',
      amount: -finalCharge,
      reason: formatWorkflowReason({
        workflowType: reservation?.workflow_type,
        metadata: reservation?.metadata || latestTx.metadata || {},
      }),
      projectTitle,
      balanceAfter: Number(latestTx.balance_after),
      childCount: 0,
      children: [],
      workflowType: reservation?.workflow_type,
      holdAmount,
      finalCharge,
      releasedAmount,
      reservationStatus: reservation?.status,
    });
  }

  for (const tx of standaloneTransactions) {
    grouped.push({
      id: tx.id,
      type: 'single',
      createdAt: tx.created_at,
      transactionType: tx.transaction_type,
      amount: Number(tx.amount),
      reason: tx.reason || getDefaultReason(tx.transaction_type),
      projectTitle: tx.metadata?.projectId ? projectTitles[tx.metadata.projectId] : undefined,
      balanceAfter: Number(tx.balance_after),
      invoiceNumber: tx.invoice_number ?? null,
    });
  }

  grouped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = grouped.length;
  return {
    transactions: grouped.slice(offset, offset + limit),
    total,
    hasMore: offset + limit < total,
  };
}
