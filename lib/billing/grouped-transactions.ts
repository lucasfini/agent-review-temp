import { supabaseAdmin } from '@/lib/supabase/server';
import { formatUsageEventReason, formatWorkflowReason } from '@/lib/billing/presentation';
import { buildBillingOrgScopedLegacyFallbackFilter } from '@/lib/billing/organization-scope';

export interface GroupedTransactionChild {
  reason: string;
  amount: number;
  createdAt: string;
  kind?: 'hold' | 'charge' | 'release' | 'usage';
  detail?: string;
}

export interface GroupedTransaction {
  id: string;
  type: 'single' | 'workflow' | 'project';
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

interface ProjectBucket {
  id: string;
  title: string;
  amount: number;
  createdAt: string;
  balanceAfter: number;
  children: GroupedTransactionChild[];
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
  offset: number,
  options?: {
    organizationId?: string;
  }
): Promise<{
  transactions: GroupedTransaction[];
  total: number;
  hasMore: boolean;
}> {
  const scopeFilter = options?.organizationId
    ? buildBillingOrgScopedLegacyFallbackFilter(options.organizationId, userId)
    : null;
  const { data: rawTransactions, error: txError } = await supabaseAdmin
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

  if (txError) {
    throw new Error(`Failed to fetch transactions: ${txError.message}`);
  }

  const rawRows = rawTransactions || [];
  const rawReservationIds = Array.from(new Set(rawRows.map((tx: any) => tx.reservation_id).filter(Boolean)));
  const rawUsageEventIds = Array.from(new Set(rawRows.map((tx: any) => tx.usage_event_id).filter(Boolean)));

  const reservationMap: Record<string, any> = {};
  const projectIds = new Set<string>();
  const usageEventProjectMap: Record<string, string> = {};
  const usageEventProjectTitleMap: Record<string, string> = {};
  const usageEventsByReservation = new Map<string, any[]>();
  const usageEventsById = new Map<string, any>();

  if (rawReservationIds.length > 0) {
    let reservationQuery = supabaseAdmin
      .from('billing_reservations')
      .select('id, project_id, workflow_type, status, reserved_amount, settled_amount, released_amount, metadata, created_at, updated_at, completed_at')
      .in('id', rawReservationIds);

    if (scopeFilter) {
      reservationQuery = reservationQuery.or(scopeFilter);
    }

    const { data: reservations } = await reservationQuery as { data: any[] | null; error: any };

    for (const reservation of reservations || []) {
      reservationMap[reservation.id] = reservation;
      if (reservation.project_id) projectIds.add(reservation.project_id);
    }
  }

  if (rawUsageEventIds.length > 0 || rawReservationIds.length > 0) {
    let usageEventsQuery = supabaseAdmin
      .from('usage_events')
      .select('id, project_id, project_title, reservation_id, service_name, provider, units, unit_type, billed_cost, metadata, status, created_at')
      .order('created_at', { ascending: false });

    if (scopeFilter) {
      usageEventsQuery = usageEventsQuery.or(scopeFilter);
    } else {
      usageEventsQuery = usageEventsQuery.eq('user_id', userId);
    }

    const { data: usageEvents } = await usageEventsQuery as { data: any[] | null; error: any };

    for (const usageEvent of usageEvents || []) {
      const belongsToKnownTransaction =
        rawUsageEventIds.includes(usageEvent.id) ||
        (usageEvent.reservation_id && rawReservationIds.includes(usageEvent.reservation_id));

      if (!belongsToKnownTransaction) continue;

      usageEventsById.set(usageEvent.id, usageEvent);

      if (usageEvent.reservation_id) {
        const list = usageEventsByReservation.get(usageEvent.reservation_id) || [];
        list.push(usageEvent);
        usageEventsByReservation.set(usageEvent.reservation_id, list);
      }

      if (usageEvent.project_id) {
        usageEventProjectMap[usageEvent.id] = usageEvent.project_id;
        projectIds.add(usageEvent.project_id);
      }
      if (usageEvent.project_title) {
        usageEventProjectTitleMap[usageEvent.id] = usageEvent.project_title;
      }
    }
  }

  const transactions = scopeFilter
    ? rawRows.filter((tx: any) => {
        if (tx.reservation_id) return Boolean(reservationMap[tx.reservation_id]);
        if (tx.usage_event_id) return usageEventsById.has(tx.usage_event_id);
        return true;
      })
    : rawRows;

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
  const projectGroups = new Map<string, ProjectBucket>();
  const reservationTransactions = new Map<string, any[]>();
  const standaloneTransactions: any[] = [];

  const getProjectInfo = (projectId?: string | null, titleSnapshot?: string | null) => {
    if (projectId) {
      return {
        key: `project:${projectId}`,
        title: projectTitles[projectId] || titleSnapshot || 'Untitled project',
      };
    }
    if (titleSnapshot) {
      return {
        key: `deleted:${titleSnapshot}`,
        title: `${titleSnapshot} (Deleted)`,
      };
    }
    return null;
  };

  const addProjectChild = (params: {
    projectId?: string | null;
    projectTitle?: string | null;
    amount: number;
    createdAt: string;
    balanceAfter: number;
    reason: string;
    detail?: string;
    kind?: GroupedTransactionChild['kind'];
  }) => {
    const projectInfo = getProjectInfo(params.projectId, params.projectTitle);
    const amount = Number(params.amount || 0);
    if (!projectInfo || amount >= 0) return false;

    const existing = projectGroups.get(projectInfo.key) || {
      id: projectInfo.key,
      title: projectInfo.title,
      amount: 0,
      createdAt: params.createdAt,
      balanceAfter: params.balanceAfter,
      children: [],
    };

    existing.amount = Number((existing.amount + amount).toFixed(4));
    if (new Date(params.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      existing.createdAt = params.createdAt;
      existing.balanceAfter = params.balanceAfter;
    }
    existing.children.push({
      reason: params.reason,
      amount,
      createdAt: params.createdAt,
      detail: params.detail,
      kind: params.kind || 'usage',
    });
    projectGroups.set(projectInfo.key, existing);
    return true;
  };

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
    const projectTitle = projectId ? projectTitles[projectId] : usageEventProjectTitleMap[latestTx.usage_event_id];
    const holdAmount = Math.abs(Number(reserveTx?.amount || 0));
    const finalCharge = Number(reservation?.settled_amount || 0);
    const releasedAmount = Number(releaseTxs.reduce((sum, tx) => sum + Math.max(0, Number(tx.amount || 0)), 0).toFixed(4));
    const usageEvents = [...(usageEventsByReservation.get(reservationId) || [])]
      .filter((event) => event.status !== 'failed')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    let groupedUsageEventCount = 0;
    for (const event of usageEvents) {
      if (addProjectChild({
        projectId: event.project_id || projectId,
        projectTitle: event.project_title || projectTitle,
        amount: -Math.abs(Number(event.billed_cost || 0)),
        createdAt: event.created_at || latestTx.created_at,
        balanceAfter: Number(latestTx.balance_after),
        reason: formatUsageEventReason({
          serviceName: event.service_name,
          provider: event.provider,
          metadata: event.metadata,
          workflowType: reservation?.workflow_type,
        }),
        kind: 'usage',
      })) {
        groupedUsageEventCount += 1;
      }
    }
    const groupedIntoProject = groupedUsageEventCount > 0;

    if (!groupedIntoProject) {
      const addedFallbackProjectChild = addProjectChild({
        projectId,
        projectTitle,
        amount: -finalCharge,
        createdAt: latestTx.created_at,
        balanceAfter: Number(latestTx.balance_after),
        reason: formatWorkflowReason({
          workflowType: reservation?.workflow_type,
          metadata: reservation?.metadata || latestTx.metadata || {},
        }),
        detail: reservation?.workflow_type,
        kind: 'charge',
      });

      if (addedFallbackProjectChild) {
        continue;
      }
    } else {
      continue;
    }

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
    const usageEvent = tx.usage_event_id ? usageEventsById.get(tx.usage_event_id) : null;
    const projectId = tx.metadata?.projectId || usageEvent?.project_id;
    const projectTitle = projectId ? projectTitles[projectId] : usageEvent?.project_title;
    const groupedIntoProject = addProjectChild({
      projectId,
      projectTitle,
      amount: Number(tx.amount),
      createdAt: tx.created_at,
      balanceAfter: Number(tx.balance_after),
      reason: usageEvent
        ? formatUsageEventReason({
            serviceName: usageEvent.service_name,
            provider: usageEvent.provider,
            metadata: usageEvent.metadata,
          })
        : tx.reason || getDefaultReason(tx.transaction_type),
      kind: tx.transaction_type === 'debit' ? 'usage' : 'charge',
    });

    if (groupedIntoProject) {
      continue;
    }

    grouped.push({
      id: tx.id,
      type: 'single',
      createdAt: tx.created_at,
      transactionType: tx.transaction_type,
      amount: Number(tx.amount),
      reason: tx.reason || getDefaultReason(tx.transaction_type),
      projectTitle: projectTitle || undefined,
      balanceAfter: Number(tx.balance_after),
      invoiceNumber: tx.invoice_number ?? null,
    });
  }

  for (const project of projectGroups.values()) {
    const children = project.children.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    grouped.push({
      id: project.id,
      type: 'project',
      createdAt: project.createdAt,
      transactionType: 'project',
      amount: Number(project.amount.toFixed(4)),
      reason: project.title,
      projectTitle: project.title,
      balanceAfter: project.balanceAfter,
      childCount: children.length,
      children,
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
