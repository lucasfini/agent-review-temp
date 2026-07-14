import type { SupabaseClient } from '@supabase/supabase-js';

import { roundProductCredits } from '@/lib/billing/product-credits';
import { supabaseAdmin } from '@/lib/supabase/server';

type PlanCreditReservationRow = {
  id: string;
  organization_id?: string | null;
  user_id?: string | null;
  project_id?: string | null;
  workflow_type?: string | null;
  status?: string | null;
  reserved_amount?: string | number | null;
  settled_amount?: string | number | null;
  released_amount?: string | number | null;
  credit_unit?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};

type UsageEventRow = {
  id: string;
  reservation_id?: string | null;
  project_id?: string | null;
  project_title?: string | null;
  service_name?: string | null;
  provider?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type ProjectRow = {
  id: string;
  title?: string | null;
};

export interface PlanCreditUsageProject {
  id: string;
  title: string;
  credits: number;
  events: number;
  workflowCount: number;
  serviceCount: number;
  isDeleted: boolean;
}

export interface PlanCreditUsageTrendPoint {
  date: string;
  cost: number;
  events: number;
}

export interface PlanCreditUsageSummary {
  creditUnit: 'plan_credit';
  totalCredits: number;
  pendingCredits: number;
  apiCallCount: number;
  projectCount: number;
  averageCreditsPerProject: number;
  projects: PlanCreditUsageProject[];
  trend: PlanCreditUsageTrendPoint[];
}

type SummaryInput = {
  reservations: PlanCreditReservationRow[];
  usageEvents?: UsageEventRow[];
  projects?: ProjectRow[];
};

function toNumber(value: string | number | null | undefined): number {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isActiveReservation(status?: string | null): boolean {
  return status === 'pending' || status === 'active' || status === 'settling';
}

function dateKey(value?: string | null): { label: string; timestamp: number } | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    label: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    timestamp: date.getTime(),
  };
}

function projectFallbackTitle(reservation: PlanCreditReservationRow, event?: UsageEventRow): string {
  if (event?.project_title) return `${event.project_title} (Deleted)`;

  const metadata = reservation.metadata || {};
  const metadataTitle = metadata.projectTitle || metadata.title;
  if (typeof metadataTitle === 'string' && metadataTitle.trim()) {
    return metadataTitle.trim();
  }

  return 'Untitled project';
}

export function summarizePlanCreditUsage(input: SummaryInput): PlanCreditUsageSummary {
  const usageEventsByReservation = new Map<string, UsageEventRow[]>();
  const projectTitles = new Map<string, string>();

  for (const project of input.projects || []) {
    if (project.id && project.title) {
      projectTitles.set(project.id, project.title);
    }
  }

  for (const event of input.usageEvents || []) {
    if (!event.reservation_id || event.status === 'failed') continue;
    const events = usageEventsByReservation.get(event.reservation_id) || [];
    events.push(event);
    usageEventsByReservation.set(event.reservation_id, events);
  }

  const projects = new Map<string, {
    title: string;
    credits: number;
    events: number;
    workflowCount: number;
    services: Set<string>;
    isDeleted: boolean;
  }>();
  const trend = new Map<string, { cost: number; events: number; timestamp: number }>();

  let totalCredits = 0;
  let pendingCredits = 0;
  let apiCallCount = 0;

  for (const reservation of input.reservations || []) {
    if (reservation.credit_unit !== 'plan_credit' || reservation.status === 'failed') continue;

    const settledCredits = roundProductCredits(toNumber(reservation.settled_amount));
    const reservedCredits = roundProductCredits(toNumber(reservation.reserved_amount));
    const releasedCredits = roundProductCredits(toNumber(reservation.released_amount));
    const reservationEvents = usageEventsByReservation.get(reservation.id) || [];
    const eventCount = reservationEvents.length;
    apiCallCount += eventCount;

    if (isActiveReservation(reservation.status)) {
      pendingCredits = roundProductCredits(
        pendingCredits + Math.max(0, reservedCredits - settledCredits - releasedCredits)
      );
    }

    if (settledCredits <= 0) continue;

    totalCredits = roundProductCredits(totalCredits + settledCredits);

    const representativeEvent = reservationEvents.find((event) => event.project_title) || reservationEvents[0];
    const projectId = reservation.project_id || representativeEvent?.project_id || null;
    const projectKey = projectId
      ? `project:${projectId}`
      : `reservation:${reservation.id}`;
    const existing = projects.get(projectKey) || {
      title: projectId
        ? projectTitles.get(projectId) || projectFallbackTitle(reservation, representativeEvent)
        : projectFallbackTitle(reservation, representativeEvent),
      credits: 0,
      events: 0,
      workflowCount: 0,
      services: new Set<string>(),
      isDeleted: !projectId && Boolean(representativeEvent?.project_title),
    };

    existing.credits = roundProductCredits(existing.credits + settledCredits);
    existing.events += eventCount;
    existing.workflowCount += 1;
    for (const event of reservationEvents) {
      if (event.service_name) existing.services.add(event.service_name);
    }
    projects.set(projectKey, existing);

    const key = dateKey(reservation.completed_at || reservation.updated_at || reservation.created_at);
    if (key) {
      const existingTrend = trend.get(key.label) || { cost: 0, events: 0, timestamp: key.timestamp };
      trend.set(key.label, {
        cost: roundProductCredits(existingTrend.cost + settledCredits),
        events: existingTrend.events + eventCount,
        timestamp: Math.max(existingTrend.timestamp, key.timestamp),
      });
    }
  }

  const projectRows = Array.from(projects.entries())
    .map(([id, project]) => ({
      id,
      title: project.title,
      credits: roundProductCredits(project.credits),
      events: project.events,
      workflowCount: project.workflowCount,
      serviceCount: project.services.size,
      isDeleted: project.isDeleted,
    }))
    .sort((a, b) => b.credits - a.credits);

  return {
    creditUnit: 'plan_credit',
    totalCredits,
    pendingCredits,
    apiCallCount,
    projectCount: projectRows.length,
    averageCreditsPerProject: projectRows.length > 0
      ? roundProductCredits(totalCredits / projectRows.length)
      : 0,
    projects: projectRows,
    trend: Array.from(trend.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(-30)
      .map(([date, data]) => ({
        date,
        cost: roundProductCredits(data.cost),
        events: data.events,
      })),
  };
}

export async function getPlanCreditUsageSummary(params: {
  supabase?: SupabaseClient<any>;
  organizationId: string;
  userId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}): Promise<PlanCreditUsageSummary> {
  const client = params.supabase || supabaseAdmin;
  const limit = Math.max(1, Math.min(1000, params.limit || 500));

  let reservationsQuery = client
    .from('billing_reservations')
    .select('id, organization_id, user_id, project_id, workflow_type, status, reserved_amount, settled_amount, released_amount, credit_unit, metadata, created_at, updated_at, completed_at')
    .eq('organization_id', params.organizationId)
    .eq('credit_unit', 'plan_credit')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.startDate) {
    reservationsQuery = reservationsQuery.gte('created_at', params.startDate);
  }
  if (params.endDate) {
    reservationsQuery = reservationsQuery.lt('created_at', params.endDate);
  }

  const { data: reservations, error: reservationError } = await reservationsQuery as {
    data: PlanCreditReservationRow[] | null;
    error: any;
  };

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to load plan credit reservations');
  }

  const reservationRows = reservations || [];
  const reservationIds = reservationRows.map((reservation) => reservation.id).filter(Boolean);
  const projectIds = new Set<string>();
  for (const reservation of reservationRows) {
    if (reservation.project_id) projectIds.add(reservation.project_id);
  }

  let usageEvents: UsageEventRow[] = [];
  if (reservationIds.length > 0) {
    const { data, error } = await client
      .from('usage_events')
      .select('id, reservation_id, project_id, project_title, service_name, provider, status, created_at')
      .in('reservation_id', reservationIds) as { data: UsageEventRow[] | null; error: any };

    if (error) {
      throw new Error(error.message || 'Failed to load reservation usage events');
    }

    usageEvents = data || [];
    for (const event of usageEvents) {
      if (event.project_id) projectIds.add(event.project_id);
    }
  }

  let projects: ProjectRow[] = [];
  if (projectIds.size > 0) {
    const { data, error } = await client
      .from('projects')
      .select('id, title')
      .in('id', Array.from(projectIds)) as { data: ProjectRow[] | null; error: any };

    if (error) {
      throw new Error(error.message || 'Failed to load usage project titles');
    }

    projects = data || [];
  }

  return summarizePlanCreditUsage({
    reservations: reservationRows,
    usageEvents,
    projects,
  });
}
