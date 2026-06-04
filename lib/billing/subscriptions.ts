import type { SupabaseClient } from '@supabase/supabase-js';

import {
  mapPlanRow,
  type Plan,
  type PlanRow,
} from '@/lib/billing/plans';
import { supabaseAdmin } from '@/lib/supabase/server';

export const SUBSCRIPTION_STATUSES = [
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
] as const;

export type KnownSubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];
export type SubscriptionStatus = KnownSubscriptionStatus | (string & {});

export interface OrganizationSubscription {
  id: string;
  organizationId: string;
  planId: string | null;
  plan: Plan | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialStart: string | null;
  trialEnd: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSubscriptionRow {
  id: string;
  organization_id: string;
  plan_id: string | null;
  plan?: PlanRow | PlanRow[] | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_start: string | null;
  trial_end: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeJoinedPlan(plan: OrganizationSubscriptionRow['plan']): Plan | null {
  const planRow = Array.isArray(plan) ? plan[0] : plan;
  return planRow ? mapPlanRow(planRow) : null;
}

export function isSubscriptionUsable(status?: SubscriptionStatus | null): boolean {
  return status === 'active' || status === 'trialing';
}

export function mapOrganizationSubscriptionRow(
  row: OrganizationSubscriptionRow
): OrganizationSubscription {
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    plan: normalizeJoinedPlan(row.plan),
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    status: row.status as SubscriptionStatus,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    trialStart: row.trial_start,
    trialEnd: row.trial_end,
    metadata: normalizeMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrganizationSubscription(
  supabase: SupabaseClient<any> = supabaseAdmin,
  organizationId: string
): Promise<OrganizationSubscription | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select('*, plan:plans(*)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(10) as { data: OrganizationSubscriptionRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load organization subscription');
  }

  const subscriptions = (data || []).map(mapOrganizationSubscriptionRow);
  return subscriptions.find((subscription) => isSubscriptionUsable(subscription.status))
    || subscriptions[0]
    || null;
}
