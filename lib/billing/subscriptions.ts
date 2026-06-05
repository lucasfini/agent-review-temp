import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getPlanBySlugOrId,
  getPlanByStripePriceId,
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

export interface StripeSubscriptionLike {
  id: string;
  customer: string | { id: string } | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  trial_start?: number | null;
  trial_end?: number | null;
  metadata?: Record<string, string> | null;
  items?: {
    data?: Array<{
      current_period_start?: number | null;
      current_period_end?: number | null;
      price?: {
        id?: string | null;
      } | null;
    }>;
  } | null;
}

export interface StripeSubscriptionSyncOptions {
  organizationId?: string | null;
  planId?: string | null;
  planSlug?: string | null;
  checkoutSessionId?: string | null;
  eventType?: string | null;
  source?: string | null;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function stripeCustomerIdFromValue(value: StripeSubscriptionLike['customer']): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function toIsoFromUnixSeconds(value?: number | null): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function getFirstSubscriptionItem(subscription: StripeSubscriptionLike) {
  return subscription.items?.data?.[0] || null;
}

export function getStripeSubscriptionPriceId(subscription: StripeSubscriptionLike): string | null {
  return getFirstSubscriptionItem(subscription)?.price?.id || null;
}

export function getStripeSubscriptionPeriod(subscription: StripeSubscriptionLike): {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
} {
  const item = getFirstSubscriptionItem(subscription);

  return {
    currentPeriodStart: toIsoFromUnixSeconds(item?.current_period_start),
    currentPeriodEnd: toIsoFromUnixSeconds(item?.current_period_end),
  };
}

function normalizeJoinedPlan(plan: OrganizationSubscriptionRow['plan']): Plan | null {
  const planRow = Array.isArray(plan) ? plan[0] : plan;
  return planRow ? mapPlanRow(planRow) : null;
}

export function mapStripeSubscriptionStatus(status?: string | null): KnownSubscriptionStatus {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return status;
    case 'paused':
    default:
      return 'inactive';
  }
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

export async function getOrganizationStripeCustomerId(
  supabase: SupabaseClient<any> = supabaseAdmin,
  organizationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organizationId)
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: { stripe_customer_id: string | null } | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load organization Stripe customer');
  }

  return data?.stripe_customer_id || null;
}

export async function storeOrganizationStripeCustomerId(
  supabase: SupabaseClient<any> = supabaseAdmin,
  organizationId: string,
  stripeCustomerId: string,
  options: {
    planId?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<OrganizationSubscription | null> {
  const existing = await getOrganizationSubscription(supabase, organizationId);
  const metadata = {
    ...(existing?.metadata || {}),
    ...(options.metadata || {}),
    stripeCustomerId,
    customerStoredAt: new Date().toISOString(),
  };
  const payload = {
    organization_id: organizationId,
    plan_id: options.planId || existing?.planId || null,
    stripe_customer_id: stripeCustomerId,
    status: existing?.status || 'inactive',
    metadata_json: metadata,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .update(payload as any)
      .eq('id', existing.id)
      .select('*, plan:plans(*)')
      .maybeSingle() as {
        data: OrganizationSubscriptionRow | null;
        error: any;
      };

    if (error) {
      throw new Error(error.message || 'Failed to store Stripe customer');
    }

    return data ? mapOrganizationSubscriptionRow(data) : null;
  }

  const { data, error } = await supabase
    .from('organization_subscriptions')
    .insert(payload as any)
    .select('*, plan:plans(*)')
    .maybeSingle() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to store Stripe customer');
  }

  return data ? mapOrganizationSubscriptionRow(data) : null;
}

async function getSubscriptionRowByStripeSubscriptionId(
  supabase: SupabaseClient<any>,
  stripeSubscriptionId: string
): Promise<OrganizationSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select('*, plan:plans(*)')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .limit(1)
    .maybeSingle() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load subscription by Stripe subscription id');
  }

  return data;
}

async function getSubscriptionRowByOrganizationCustomer(
  supabase: SupabaseClient<any>,
  organizationId: string,
  stripeCustomerId: string
): Promise<OrganizationSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select('*, plan:plans(*)')
    .eq('organization_id', organizationId)
    .eq('stripe_customer_id', stripeCustomerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load subscription by Stripe customer');
  }

  return data;
}

async function getSubscriptionRowByStripeCustomerId(
  supabase: SupabaseClient<any>,
  stripeCustomerId: string
): Promise<OrganizationSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select('*, plan:plans(*)')
    .eq('stripe_customer_id', stripeCustomerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load subscription by Stripe customer');
  }

  return data;
}

async function organizationExists(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .limit(1)
    .maybeSingle() as {
      data: { id: string } | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to validate subscription organization');
  }

  return Boolean(data?.id);
}

async function resolveSubscriptionPlanId(
  supabase: SupabaseClient<any>,
  subscription: StripeSubscriptionLike,
  options: StripeSubscriptionSyncOptions,
  existing: OrganizationSubscriptionRow | null
): Promise<string | null> {
  const stripePriceId = getStripeSubscriptionPriceId(subscription);
  if (stripePriceId) {
    const plan = await getPlanByStripePriceId(supabase, stripePriceId, { activeOnly: false });
    if (plan) return plan.id;
  }

  for (const candidatePlanId of [options.planId, subscription.metadata?.plan_id]) {
    if (!candidatePlanId) continue;
    const plan = await getPlanBySlugOrId(supabase, candidatePlanId, { activeOnly: false });
    if (plan) return plan.id;

    console.warn(`[STRIPE] Ignoring unknown plan id from subscription ${subscription.id}: ${candidatePlanId}`);
  }

  if (existing?.plan_id) return existing.plan_id;

  const planSlug = options.planSlug || subscription.metadata?.plan_slug || null;
  if (planSlug) {
    const plan = await getPlanBySlugOrId(supabase, planSlug, { activeOnly: false });
    if (plan) return plan.id;
  }

  return existing?.plan_id || null;
}

export async function upsertOrganizationSubscriptionFromStripe(
  supabase: SupabaseClient<any> = supabaseAdmin,
  subscription: StripeSubscriptionLike,
  options: StripeSubscriptionSyncOptions = {}
): Promise<OrganizationSubscription | null> {
  const stripeCustomerId = stripeCustomerIdFromValue(subscription.customer);
  if (!stripeCustomerId) {
    console.warn(`[STRIPE] Subscription ${subscription.id} missing customer id; skipping sync`);
    return null;
  }

  const existingBySubscription = await getSubscriptionRowByStripeSubscriptionId(supabase, subscription.id);
  const existingByCustomer = existingBySubscription
    ? null
    : await getSubscriptionRowByStripeCustomerId(supabase, stripeCustomerId);
  const metadataOrganizationId = options.organizationId
    || subscription.metadata?.organization_id
    || null;
  const stableOrganizationId = existingBySubscription?.organization_id
    || existingByCustomer?.organization_id
    || null;
  const organizationId = stableOrganizationId || metadataOrganizationId;

  if (!organizationId) {
    console.warn(`[STRIPE] Subscription ${subscription.id} missing organization metadata; skipping sync`);
    return null;
  }

  if (stableOrganizationId && metadataOrganizationId && stableOrganizationId !== metadataOrganizationId) {
    console.warn(
      `[STRIPE] Ignoring mismatched organization metadata for subscription ${subscription.id}: ${metadataOrganizationId}`
    );
  }

  const existing = existingBySubscription
    || existingByCustomer
    || await getSubscriptionRowByOrganizationCustomer(supabase, organizationId, stripeCustomerId);

  if (!existing && !(await organizationExists(supabase, organizationId))) {
    console.warn(`[STRIPE] Subscription ${subscription.id} references unknown organization ${organizationId}; skipping sync`);
    return null;
  }

  const planId = await resolveSubscriptionPlanId(supabase, subscription, options, existing);
  const { currentPeriodStart, currentPeriodEnd } = getStripeSubscriptionPeriod(subscription);
  const metadata = {
    ...(existing ? normalizeMetadata(existing.metadata_json) : {}),
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: getStripeSubscriptionPriceId(subscription),
    checkoutSessionId: options.checkoutSessionId || null,
    eventType: options.eventType || null,
    source: options.source || 'stripe_webhook',
    syncedAt: new Date().toISOString(),
  };
  const payload = {
    organization_id: organizationId,
    plan_id: planId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription.id,
    status: mapStripeSubscriptionStatus(subscription.status),
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    trial_start: toIsoFromUnixSeconds(subscription.trial_start),
    trial_end: toIsoFromUnixSeconds(subscription.trial_end),
    metadata_json: metadata,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .update(payload as any)
      .eq('id', existing.id)
      .select('*, plan:plans(*)')
      .maybeSingle() as {
        data: OrganizationSubscriptionRow | null;
        error: any;
      };

    if (error) {
      throw new Error(error.message || 'Failed to update organization subscription');
    }

    return data ? mapOrganizationSubscriptionRow(data) : null;
  }

  const { data, error } = await supabase
    .from('organization_subscriptions')
    .insert(payload as any)
    .select('*, plan:plans(*)')
    .maybeSingle() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to insert organization subscription');
  }

  return data ? mapOrganizationSubscriptionRow(data) : null;
}
