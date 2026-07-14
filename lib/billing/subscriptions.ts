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
  extraSeatCount: number;
  stripeExtraSeatSubscriptionItemId: string | null;
  stripeExtraSeatPriceId: string | null;
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
  extra_seat_count?: number | null;
  stripe_extra_seat_subscription_item_id?: string | null;
  stripe_extra_seat_price_id?: string | null;
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
      id?: string | null;
      quantity?: number | null;
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

function stringFromMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function getStripeSubscriptionItems(subscription: StripeSubscriptionLike) {
  return subscription.items?.data || [];
}

function positiveInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function deriveBillingInterval(plan: Plan | null, stripePriceId: string | null): 'month' | 'year' | null {
  if (!plan || !stripePriceId) return null;
  if (plan.stripeAnnualPriceId && stripePriceId === plan.stripeAnnualPriceId) return 'year';
  if (
    (plan.stripeMonthlyPriceId && stripePriceId === plan.stripeMonthlyPriceId)
    || (plan.stripePriceId && stripePriceId === plan.stripePriceId)
  ) {
    return 'month';
  }
  return null;
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

function getStripeSubscriptionPeriodFromItem(
  item: ReturnType<typeof getFirstSubscriptionItem>
): {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
} {
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

function isFreeSubscription(subscription: OrganizationSubscription): boolean {
  return subscription.plan?.slug === 'free';
}

function subscriptionPreference(subscription: OrganizationSubscription): number {
  if (!isSubscriptionUsable(subscription.status)) return 0;
  if (subscription.plan && !isFreeSubscription(subscription)) return 3;
  if (subscription.stripeSubscriptionId && !isFreeSubscription(subscription)) return 2;
  if (isFreeSubscription(subscription)) return 1;
  return 0;
}

function subscriptionUpdatedTime(subscription: OrganizationSubscription): number {
  const updated = new Date(subscription.updatedAt || subscription.createdAt).getTime();
  return Number.isFinite(updated) ? updated : 0;
}

export function selectPreferredOrganizationSubscription(
  subscriptions: OrganizationSubscription[]
): OrganizationSubscription | null {
  if (subscriptions.length === 0) return null;

  return [...subscriptions].sort((a, b) => {
    const preferenceDiff = subscriptionPreference(b) - subscriptionPreference(a);
    if (preferenceDiff !== 0) return preferenceDiff;

    return subscriptionUpdatedTime(b) - subscriptionUpdatedTime(a);
  })[0] || null;
}

export function getSubscriptionBaseSeatLimit(subscription?: OrganizationSubscription | null): number | null {
  const seatLimit = subscription?.plan?.limits.seatLimit;
  return typeof seatLimit === 'number' && seatLimit > 0 ? seatLimit : null;
}

export function getSubscriptionSeatLimit(subscription?: OrganizationSubscription | null): number | null {
  const baseSeatLimit = getSubscriptionBaseSeatLimit(subscription);
  if (!baseSeatLimit) return null;
  return baseSeatLimit + positiveInteger(subscription?.extraSeatCount);
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
    extraSeatCount: row.extra_seat_count ?? 0,
    stripeExtraSeatSubscriptionItemId: row.stripe_extra_seat_subscription_item_id ?? null,
    stripeExtraSeatPriceId: row.stripe_extra_seat_price_id ?? null,
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
  return selectPreferredOrganizationSubscription(subscriptions);
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
    pendingCheckoutPlanId: options.planId || null,
    customerStoredAt: new Date().toISOString(),
  };
  const payload = {
    organization_id: organizationId,
    plan_id: existing?.planId || null,
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

export async function updateOrganizationSubscriptionMetadata(
  supabase: SupabaseClient<any> = supabaseAdmin,
  subscriptionId: string,
  metadata: Record<string, unknown>
): Promise<OrganizationSubscription | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .update({ metadata_json: metadata } as any)
    .eq('id', subscriptionId)
    .select('*, plan:plans(*)')
    .maybeSingle() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to update organization subscription metadata');
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

async function resolveSubscriptionPlan(
  supabase: SupabaseClient<any>,
  subscription: StripeSubscriptionLike,
  options: StripeSubscriptionSyncOptions,
  existing: OrganizationSubscriptionRow | null
): Promise<Plan | null> {
  for (const item of getStripeSubscriptionItems(subscription)) {
    const stripePriceId = item.price?.id || null;
    if (!stripePriceId) continue;
    const plan = await getPlanByStripePriceId(supabase, stripePriceId, { activeOnly: false });
    if (plan) return plan;
  }

  for (const candidatePlanId of [options.planId, subscription.metadata?.plan_id]) {
    if (!candidatePlanId) continue;
    const plan = await getPlanBySlugOrId(supabase, candidatePlanId, { activeOnly: false });
    if (plan) return plan;

    console.warn(`[STRIPE] Ignoring unknown plan id from subscription ${subscription.id}: ${candidatePlanId}`);
  }

  if (existing?.plan_id) {
    const plan = normalizeJoinedPlan(existing.plan);
    if (plan) return plan;
  }

  const planSlug = options.planSlug || subscription.metadata?.plan_slug || null;
  if (planSlug) {
    const plan = await getPlanBySlugOrId(supabase, planSlug, { activeOnly: false });
    if (plan) return plan;
  }

  return null;
}

function getStripeSubscriptionItemForPrice(subscription: StripeSubscriptionLike, priceId?: string | null) {
  if (!priceId) return null;
  return getStripeSubscriptionItems(subscription).find((item) => item.price?.id === priceId) || null;
}

function getBasePlanSubscriptionItem(subscription: StripeSubscriptionLike, plan: Plan | null) {
  if (!plan) return getFirstSubscriptionItem(subscription);
  for (const priceId of [plan.stripeMonthlyPriceId, plan.stripeAnnualPriceId, plan.stripePriceId]) {
    const item = getStripeSubscriptionItemForPrice(subscription, priceId);
    if (item) return item;
  }
  return getFirstSubscriptionItem(subscription);
}

function getExtraSeatPriceIdsForInterval(plan: Plan | null, billingInterval?: 'month' | 'year' | string | null): Array<string | null> {
  if (!plan) return [];
  if (billingInterval === 'month') return [plan.stripeExtraSeatMonthlyPriceId, plan.stripeExtraSeatAnnualPriceId];
  if (billingInterval === 'year') return [plan.stripeExtraSeatAnnualPriceId, plan.stripeExtraSeatMonthlyPriceId];
  return [plan.stripeExtraSeatMonthlyPriceId, plan.stripeExtraSeatAnnualPriceId];
}

function getExtraSeatItemSnapshot(
  subscription: StripeSubscriptionLike,
  plan: Plan | null,
  billingInterval?: 'month' | 'year' | string | null
): {
  count: number;
  priceId: string | null;
  subscriptionItemId: string | null;
} {
  const configuredPriceIds = getExtraSeatPriceIdsForInterval(plan, billingInterval).filter(Boolean) as string[];
  const item = configuredPriceIds
    .map((priceId) => getStripeSubscriptionItemForPrice(subscription, priceId))
    .find(Boolean) || null;

  if (!item) {
    return {
      count: 0,
      priceId: null,
      subscriptionItemId: null,
    };
  }

  return {
    count: positiveInteger(item.quantity),
    priceId: item.price?.id || null,
    subscriptionItemId: item.id || null,
  };
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

  const plan = await resolveSubscriptionPlan(supabase, subscription, options, existing);
  const planId = plan?.id || existing?.plan_id || null;
  const baseSubscriptionItem = getBasePlanSubscriptionItem(subscription, plan);
  const baseStripePriceId = baseSubscriptionItem?.price?.id || null;
  const { currentPeriodStart, currentPeriodEnd } = getStripeSubscriptionPeriodFromItem(baseSubscriptionItem);
  const existingMetadata = normalizeMetadata(existing?.metadata_json);
  const billingInterval = deriveBillingInterval(plan, baseStripePriceId)
    || stringFromMetadata(subscription.metadata?.billing_interval)
    || stringFromMetadata(existingMetadata.billing_interval)
    || null;
  const extraSeatSnapshot = getExtraSeatItemSnapshot(subscription, plan, billingInterval);
  const metadata = {
    ...(existing ? normalizeMetadata(existing.metadata_json) : {}),
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: baseStripePriceId,
    stripeBaseSubscriptionItemId: baseSubscriptionItem?.id || null,
    stripeExtraSeatPriceId: extraSeatSnapshot.priceId,
    stripeExtraSeatSubscriptionItemId: extraSeatSnapshot.subscriptionItemId,
    extraSeatCount: extraSeatSnapshot.count,
    billing_interval: billingInterval,
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
    extra_seat_count: extraSeatSnapshot.count,
    stripe_extra_seat_subscription_item_id: extraSeatSnapshot.subscriptionItemId,
    stripe_extra_seat_price_id: extraSeatSnapshot.priceId,
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
