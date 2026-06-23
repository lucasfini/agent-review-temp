import type { SupabaseClient } from '@supabase/supabase-js';

import { getEntitlementUsagePeriod } from '@/lib/billing/entitlement-guards';
import {
  getPlanBySlugOrId,
  type Plan,
} from '@/lib/billing/plans';
import {
  getOrganizationSubscription,
  isSubscriptionUsable,
  mapOrganizationSubscriptionRow,
  type OrganizationSubscription,
  type OrganizationSubscriptionRow,
} from '@/lib/billing/subscriptions';
import { roundProductCredits } from '@/lib/billing/product-credits';
import { supabaseAdmin } from '@/lib/supabase/server';

export type BillingCreditGrantSourceType = 'plan_grant' | 'rollover' | 'top_up' | 'promo' | 'adjustment';

export interface BillingCreditGrant {
  id: string;
  organizationId: string;
  userId: string | null;
  subscriptionId: string | null;
  planId: string | null;
  sourceType: BillingCreditGrantSourceType;
  creditsGranted: number;
  creditsRemaining: number;
  periodStart: string | null;
  periodEnd: string | null;
  expiresAt: string;
  idempotencyKey: string;
  stripePaymentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

type ReservationLike = {
  id: string;
  userId?: string | null;
  organizationId?: string | null;
  workflowType?: string;
  reservedAmount: number;
  settledAmount: number;
  releasedAmount: number;
  metadata?: Record<string, unknown>;
};

type GrantRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  subscription_id: string | null;
  plan_id: string | null;
  source_type: BillingCreditGrantSourceType;
  credits_granted: string | number;
  credits_remaining: string | number;
  period_start: string | null;
  period_end: string | null;
  expires_at: string;
  idempotency_key: string;
  stripe_payment_id: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type AllocationRow = {
  id: string;
  reservation_id: string;
  grant_id: string;
  reserved_credits: string | number;
  settled_credits: string | number;
  released_credits: string | number;
  created_at: string;
  updated_at: string;
};

export class InsufficientPlanCreditsError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly required: number,
    public readonly available: number,
    public readonly planSlug: string | null,
    public readonly topUpsEnabled: boolean
  ) {
    super(`Insufficient plan credits: need ${required.toFixed(4)}, have ${available.toFixed(4)}`);
    this.name = 'InsufficientPlanCreditsError';
  }

  get upgradeRequired() {
    return !this.topUpsEnabled;
  }
}

export class PlanUploadLimitError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly requestedMinutes: number,
    public readonly maxUploadMinutes: number,
    public readonly planSlug: string | null
  ) {
    super(`Upload is ${requestedMinutes.toFixed(1)} minutes; ${planSlug || 'current plan'} allows ${maxUploadMinutes} minutes`);
    this.name = 'PlanUploadLimitError';
  }
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapGrantRow(row: GrantRow): BillingCreditGrant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    subscriptionId: row.subscription_id,
    planId: row.plan_id,
    sourceType: row.source_type,
    creditsGranted: Number(row.credits_granted || 0),
    creditsRemaining: Number(row.credits_remaining || 0),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    expiresAt: row.expires_at,
    idempotencyKey: row.idempotency_key,
    stripePaymentId: row.stripe_payment_id,
    metadata: normalizeMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function calendarMonthPeriod(now: Date) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

function periodForPlanGrant(subscription: OrganizationSubscription, now: Date) {
  const period = getEntitlementUsagePeriod(subscription, now);
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}

function planGrantExpiry(plan: Plan, periodEnd: string): string {
  const end = new Date(periodEnd);
  const rolloverMonths = Math.max(0, plan.creditRolloverMonths || 0);
  return addUtcMonths(end, rolloverMonths).toISOString();
}

function buildPlanGrantIdempotencyKey(subscription: OrganizationSubscription, periodStart: string, periodEnd: string) {
  return `plan_grant:${subscription.organizationId}:${subscription.id}:${subscription.planId || 'free'}:${periodStart}:${periodEnd}`;
}

function isCurrentPlanGrant(grant: BillingCreditGrant, now: Date): boolean {
  if (grant.sourceType !== 'plan_grant' || !grant.periodStart || !grant.periodEnd) return false;
  const start = new Date(grant.periodStart).getTime();
  const end = new Date(grant.periodEnd).getTime();
  const current = now.getTime();
  return start <= current && current < end;
}

function isRolloverPlanGrant(grant: BillingCreditGrant, now: Date): boolean {
  if (grant.sourceType !== 'plan_grant' || !grant.periodEnd) return false;
  return new Date(grant.periodEnd).getTime() <= now.getTime()
    && new Date(grant.expiresAt).getTime() > now.getTime();
}

function grantPriority(grant: BillingCreditGrant, now: Date): number {
  if (isRolloverPlanGrant(grant, now)) return 1;
  if (isCurrentPlanGrant(grant, now)) return 2;
  if (grant.sourceType === 'top_up') return 3;
  return 4;
}

function sortGrantsForConsumption(grants: BillingCreditGrant[], now: Date): BillingCreditGrant[] {
  return [...grants].sort((a, b) => {
    const priorityDiff = grantPriority(a, now) - grantPriority(b, now);
    if (priorityDiff !== 0) return priorityDiff;
    const expiryDiff = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    if (expiryDiff !== 0) return expiryDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

async function reserveGrantCredits(
  supabase: SupabaseClient<any>,
  grant: BillingCreditGrant,
  amount: number
) {
  const reserveAmount = roundProductCredits(amount);
  const nextRemaining = roundProductCredits(grant.creditsRemaining - reserveAmount);

  const { data, error } = await supabase
    .from('billing_credit_grants')
    .update({ credits_remaining: nextRemaining } as any)
    .eq('id', grant.id)
    .eq('updated_at', grant.updatedAt)
    .gte('credits_remaining', reserveAmount)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to reserve grant credits');
  }

  if (!data) {
    throw new Error('Credit grant changed while reserving credits; please retry');
  }
}

async function ensureFreeSubscriptionForOrganization(
  supabase: SupabaseClient<any>,
  organizationId: string,
  now: Date
): Promise<OrganizationSubscription> {
  const freePlan = await getPlanBySlugOrId(supabase, 'free', { activeOnly: true });
  if (!freePlan) {
    throw new Error('Free plan is not configured');
  }

  const { periodStart, periodEnd } = calendarMonthPeriod(now);
  const metadata = {
    source: 'internal_free_plan',
    ensuredAt: now.toISOString(),
  };

  const { data, error } = await supabase
    .from('organization_subscriptions')
    .insert({
      organization_id: organizationId,
      plan_id: freePlan.id,
      status: 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      metadata_json: metadata,
    } as any)
    .select('*, plan:plans(*)')
    .single() as {
      data: OrganizationSubscriptionRow | null;
      error: any;
    };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create free subscription');
  }

  return mapOrganizationSubscriptionRow(data);
}

export async function getOrCreateCreditSubscription(params: {
  supabase?: SupabaseClient<any>;
  organizationId: string;
  now?: Date;
}): Promise<OrganizationSubscription> {
  const supabase = params.supabase || supabaseAdmin;
  const now = params.now || new Date();
  const existing = await getOrganizationSubscription(supabase, params.organizationId);

  if (existing && isSubscriptionUsable(existing.status) && existing.plan) {
    return existing;
  }

  return ensureFreeSubscriptionForOrganization(supabase, params.organizationId, now);
}

export async function ensureCurrentPlanCreditGrant(params: {
  supabase?: SupabaseClient<any>;
  organizationId: string;
  userId?: string | null;
  subscription?: OrganizationSubscription | null;
  now?: Date;
}): Promise<{ subscription: OrganizationSubscription; grant: BillingCreditGrant | null }> {
  const supabase = params.supabase || supabaseAdmin;
  const now = params.now || new Date();
  const subscription = params.subscription || await getOrCreateCreditSubscription({
    supabase,
    organizationId: params.organizationId,
    now,
  });
  const plan = subscription.plan;
  const monthlyGrant = Math.max(0, plan?.monthlyCreditGrant || 0);

  if (!plan || monthlyGrant <= 0) {
    return { subscription, grant: null };
  }

  const { periodStart, periodEnd } = periodForPlanGrant(subscription, now);
  const idempotencyKey = buildPlanGrantIdempotencyKey(subscription, periodStart, periodEnd);
  const expiresAt = planGrantExpiry(plan, periodEnd);

  const { data: existing, error: existingError } = await supabase
    .from('billing_credit_grants')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .limit(1)
    .maybeSingle() as { data: GrantRow | null; error: any };

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load plan credit grant');
  }

  if (existing) {
    return { subscription, grant: mapGrantRow(existing) };
  }

  const { data, error } = await supabase
    .from('billing_credit_grants')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId || null,
      subscription_id: subscription.id,
      plan_id: plan.id,
      source_type: 'plan_grant',
      credits_granted: monthlyGrant,
      credits_remaining: monthlyGrant,
      period_start: periodStart,
      period_end: periodEnd,
      expires_at: expiresAt,
      idempotency_key: idempotencyKey,
      metadata_json: {
        planSlug: plan.slug,
        creditRolloverMonths: plan.creditRolloverMonths,
      },
    } as any)
    .select('*')
    .single() as { data: GrantRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create plan credit grant');
  }

  return { subscription, grant: mapGrantRow(data) };
}

export async function getOrganizationPlanCreditBalance(params: {
  supabase?: SupabaseClient<any>;
  organizationId: string;
  now?: Date;
  ensureGrant?: boolean;
  userId?: string | null;
}): Promise<{
  available: number;
  rollover: number;
  current: number;
  topUp: number;
  subscription: OrganizationSubscription | null;
}> {
  const supabase = params.supabase || supabaseAdmin;
  const now = params.now || new Date();
  const subscription = params.ensureGrant
    ? (await ensureCurrentPlanCreditGrant({
        supabase,
        organizationId: params.organizationId,
        userId: params.userId,
        now,
      })).subscription
    : await getOrganizationSubscription(supabase, params.organizationId);

  const { data, error } = await supabase
    .from('billing_credit_grants')
    .select('*')
    .eq('organization_id', params.organizationId)
    .gt('credits_remaining', 0)
    .gt('expires_at', now.toISOString()) as { data: GrantRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load credit grants');
  }

  const grants = (data || []).map(mapGrantRow);
  const totals = grants.reduce((acc, grant) => {
    if (isRolloverPlanGrant(grant, now)) {
      acc.rollover += grant.creditsRemaining;
    } else if (isCurrentPlanGrant(grant, now)) {
      acc.current += grant.creditsRemaining;
    } else if (grant.sourceType === 'top_up') {
      acc.topUp += grant.creditsRemaining;
    }
    return acc;
  }, { rollover: 0, current: 0, topUp: 0 });

  const available = roundProductCredits(totals.rollover + totals.current + totals.topUp);
  return {
    available,
    rollover: roundProductCredits(totals.rollover),
    current: roundProductCredits(totals.current),
    topUp: roundProductCredits(totals.topUp),
    subscription,
  };
}

export async function assertPlanUploadDuration(params: {
  supabase?: SupabaseClient<any>;
  organizationId: string;
  userId?: string | null;
  durationSeconds: number;
  subscription?: OrganizationSubscription | null;
  now?: Date;
}): Promise<OrganizationSubscription> {
  const supabase = params.supabase || supabaseAdmin;
  const now = params.now || new Date();
  const subscription = params.subscription || await getOrCreateCreditSubscription({
    supabase,
    organizationId: params.organizationId,
    now,
  });
  const maxUploadMinutes = subscription.plan?.maxUploadMinutes || null;
  const requestedMinutes = roundProductCredits(Math.max(0, params.durationSeconds || 0) / 60);

  if (maxUploadMinutes && requestedMinutes > maxUploadMinutes + 0.0001) {
    throw new PlanUploadLimitError(
      params.organizationId,
      requestedMinutes,
      maxUploadMinutes,
      subscription.plan?.slug || null
    );
  }

  return subscription;
}

export async function createPlanCreditReservation(params: {
  supabase?: SupabaseClient<any>;
  userId: string;
  organizationId: string;
  projectId?: string;
  workflowType: string;
  amount: number;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  now?: Date;
  subscription?: OrganizationSubscription | null;
}): Promise<any> {
  const supabase = params.supabase || supabaseAdmin;
  const now = params.now || new Date();
  const amount = roundProductCredits(params.amount);

  if (amount <= 0) {
    throw new Error('Plan credit reservation amount must be positive');
  }

  const { subscription } = await ensureCurrentPlanCreditGrant({
    supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    subscription: params.subscription || null,
    now,
  });

  const { data, error } = await supabase
    .from('billing_credit_grants')
    .select('*')
    .eq('organization_id', params.organizationId)
    .gt('credits_remaining', 0)
    .gt('expires_at', now.toISOString()) as { data: GrantRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load credit grants');
  }

  const grants = sortGrantsForConsumption((data || []).map(mapGrantRow), now);
  const available = roundProductCredits(grants.reduce((sum, grant) => sum + grant.creditsRemaining, 0));

  if (available + 0.0001 < amount) {
    throw new InsufficientPlanCreditsError(
      params.organizationId,
      amount,
      available,
      subscription.plan?.slug || null,
      Boolean(subscription.plan?.topUpEnabled)
    );
  }

  const { data: reservation, error: reservationError } = await supabase
    .from('billing_reservations')
    .insert({
      user_id: params.userId,
      organization_id: params.organizationId,
      project_id: params.projectId || null,
      workflow_type: params.workflowType,
      status: 'active',
      reserved_amount: amount,
      settled_amount: 0,
      released_amount: 0,
      currency: 'CREDITS',
      credit_unit: 'plan_credit',
      metadata: {
        ...(params.metadata || {}),
        creditUnit: 'plan_credit',
        productCreditAmount: amount,
        planSlug: subscription.plan?.slug || null,
      },
      expires_at: params.expiresAt || null,
    } as any)
    .select('*')
    .single() as { data: any; error: any };

  if (reservationError || !reservation) {
    throw new Error(reservationError?.message || 'Failed to create plan credit reservation');
  }

  const allocations: Array<{ grant: BillingCreditGrant; amount: number }> = [];
  let remaining = amount;

  try {
    for (const grant of grants) {
      if (remaining <= 0) break;
      const reserveAmount = roundProductCredits(Math.min(remaining, grant.creditsRemaining));
      if (reserveAmount <= 0) continue;

      await reserveGrantCredits(supabase, grant, reserveAmount);
      allocations.push({ grant, amount: reserveAmount });
      remaining = roundProductCredits(remaining - reserveAmount);
    }

    const { error: allocationError } = await supabase
      .from('billing_reservation_credit_allocations')
      .insert(allocations.map((allocation) => ({
        reservation_id: reservation.id,
        grant_id: allocation.grant.id,
        reserved_credits: allocation.amount,
        settled_credits: 0,
        released_credits: 0,
      })) as any);

    if (allocationError) {
      throw new Error(allocationError.message || 'Failed to create reservation grant allocations');
    }

    await supabase.from('credit_transactions').insert({
      user_id: params.userId,
      amount: -amount,
      balance_before: available,
      balance_after: roundProductCredits(available - amount),
      transaction_type: 'reserve',
      reservation_id: reservation.id,
      reason: `Reserved product credits for ${params.workflowType}`,
      metadata: {
        ...(params.metadata || {}),
        organizationId: params.organizationId,
        creditUnit: 'plan_credit',
        planSlug: subscription.plan?.slug || null,
      },
    } as any);

    return reservation;
  } catch (reserveError) {
    for (const allocation of allocations) {
      await restoreGrantCredits(supabase, allocation.grant.id, allocation.amount).catch((restoreError) => {
        console.error('[PLAN_CREDITS] Failed to rollback grant reservation:', restoreError);
      });
    }
    await supabase
      .from('billing_reservations')
      .update({
        status: 'failed',
        released_amount: amount,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        metadata: {
          ...(params.metadata || {}),
          creditUnit: 'plan_credit',
          reservationFailure: reserveError instanceof Error ? reserveError.message : String(reserveError),
        },
      } as any)
      .eq('id', reservation.id);
    throw reserveError;
  }
}

async function restoreGrantCredits(
  supabase: SupabaseClient<any>,
  grantId: string,
  amount: number
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('billing_credit_grants')
      .select('credits_remaining, credits_granted, updated_at')
      .eq('id', grantId)
      .single() as {
        data: {
          credits_remaining: string | number;
          credits_granted: string | number;
          updated_at: string;
        } | null;
        error: any;
      };

    if (error || !data) {
      throw new Error(error?.message || 'Failed to load credit grant for restore');
    }

    const restored = roundProductCredits(Math.min(
      Number(data.credits_granted || 0),
      Number(data.credits_remaining || 0) + amount
    ));

    const { data: updated, error: updateError } = await supabase
      .from('billing_credit_grants')
      .update({ credits_remaining: restored } as any)
      .eq('id', grantId)
      .eq('updated_at', data.updated_at)
      .select('id')
      .maybeSingle() as { data: { id: string } | null; error: any };

    if (updateError) {
      throw new Error(updateError.message || 'Failed to restore credit grant');
    }

    if (updated) {
      return;
    }
  }

  throw new Error('Credit grant changed while restoring credits; please retry');
}

async function getAllocations(
  supabase: SupabaseClient<any>,
  reservationId: string,
  reverse = false
): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from('billing_reservation_credit_allocations')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: !reverse }) as { data: AllocationRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load reservation credit allocations');
  }

  return data || [];
}

export function isPlanCreditReservation(reservation: ReservationLike & { creditUnit?: string | null }): boolean {
  return reservation.creditUnit === 'plan_credit'
    || reservation.metadata?.creditUnit === 'plan_credit';
}

export async function releasePlanCreditReservation(params: {
  supabase?: SupabaseClient<any>;
  reservation: ReservationLike;
  amount: number;
  reason: string;
  nextStatus: string;
}): Promise<void> {
  const supabase = params.supabase || supabaseAdmin;
  const releaseAmount = roundProductCredits(params.amount);
  const releaseFromEnd = params.nextStatus === 'settling';
  let remaining = releaseAmount;
  const allocations = await getAllocations(supabase, params.reservation.id, releaseFromEnd);

  for (const allocation of allocations) {
    if (remaining <= 0) break;
    const releasable = roundProductCredits(
      Number(allocation.reserved_credits || 0)
      - Number(allocation.settled_credits || 0)
      - Number(allocation.released_credits || 0)
    );
    const toRelease = roundProductCredits(Math.min(remaining, releasable));
    if (toRelease <= 0) continue;

    await restoreGrantCredits(supabase, allocation.grant_id, toRelease);

    const { error: allocationError } = await supabase
      .from('billing_reservation_credit_allocations')
      .update({
        released_credits: roundProductCredits(Number(allocation.released_credits || 0) + toRelease),
      } as any)
      .eq('id', allocation.id);

    if (allocationError) {
      throw new Error(allocationError.message || 'Failed to release reservation allocation');
    }

    remaining = roundProductCredits(remaining - toRelease);
  }

  const updatedReleased = roundProductCredits((params.reservation.releasedAmount || 0) + releaseAmount - remaining);
  const completed = params.nextStatus !== 'settling';
  const { error: reservationError } = await supabase
    .from('billing_reservations')
    .update({
      status: params.nextStatus,
      released_amount: updatedReleased,
      updated_at: new Date().toISOString(),
      completed_at: completed ? new Date().toISOString() : null,
      metadata: {
        ...(params.reservation.metadata || {}),
        releaseReason: params.reason,
      },
    } as any)
    .eq('id', params.reservation.id);

  if (reservationError) {
    throw new Error(reservationError.message || 'Failed to update released plan credit reservation');
  }

  await supabase.from('credit_transactions').insert({
    user_id: params.reservation.userId || null,
    amount: releaseAmount - remaining,
    balance_before: 0,
    balance_after: 0,
    transaction_type: 'release',
    reservation_id: params.reservation.id,
    reason: params.reason,
    metadata: {
      ...(params.reservation.metadata || {}),
      creditUnit: 'plan_credit',
    },
  } as any);
}

export async function settlePlanCreditReservationAmount(params: {
  supabase?: SupabaseClient<any>;
  reservation: ReservationLike;
  actualCredits: number;
  usageEventIds?: string[];
}): Promise<void> {
  const supabase = params.supabase || supabaseAdmin;
  const actualCredits = roundProductCredits(params.actualCredits);
  if (actualCredits > params.reservation.reservedAmount + 0.0001) {
    throw new Error(`Plan credit settlement ${actualCredits} exceeds reserved ${params.reservation.reservedAmount}`);
  }

  const releaseAmount = roundProductCredits(params.reservation.reservedAmount - actualCredits);
  if (releaseAmount > 0) {
    await releasePlanCreditReservation({
      supabase,
      reservation: params.reservation,
      amount: releaseAmount,
      reason: `Release unused product credits for ${params.reservation.workflowType || 'workflow'}`,
      nextStatus: 'settling',
    });
  }

  let remaining = actualCredits;
  const allocations = await getAllocations(supabase, params.reservation.id);

  for (const allocation of allocations) {
    if (remaining <= 0) break;
    const availableToSettle = roundProductCredits(
      Number(allocation.reserved_credits || 0)
      - Number(allocation.settled_credits || 0)
      - Number(allocation.released_credits || 0)
    );
    const toSettle = roundProductCredits(Math.min(remaining, availableToSettle));
    if (toSettle <= 0) continue;

    const { error: allocationError } = await supabase
      .from('billing_reservation_credit_allocations')
      .update({
        settled_credits: roundProductCredits(Number(allocation.settled_credits || 0) + toSettle),
      } as any)
      .eq('id', allocation.id);

    if (allocationError) {
      throw new Error(allocationError.message || 'Failed to settle reservation allocation');
    }

    remaining = roundProductCredits(remaining - toSettle);
  }

  const { error } = await supabase
    .from('billing_reservations')
    .update({
      status: actualCredits > 0 ? 'settled' : 'released',
      settled_amount: actualCredits,
      released_amount: releaseAmount,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        ...(params.reservation.metadata || {}),
        settledProductCredits: actualCredits,
        usageEventIds: params.usageEventIds || [],
      },
    } as any)
    .eq('id', params.reservation.id);

  if (error) {
    throw new Error(error.message || 'Failed to settle plan credit reservation');
  }

  await supabase.from('credit_transactions').insert({
    user_id: params.reservation.userId || null,
    amount: 0,
    balance_before: 0,
    balance_after: 0,
    transaction_type: 'settle',
    reservation_id: params.reservation.id,
    reason: `Settled product credits for ${params.reservation.workflowType || 'workflow'}`,
    metadata: {
      ...(params.reservation.metadata || {}),
      creditUnit: 'plan_credit',
      settledProductCredits: actualCredits,
      usageEventIds: params.usageEventIds || [],
    },
  } as any);
}

export async function grantTopUpCredits(params: {
  supabase?: SupabaseClient<any>;
  organizationId: string;
  userId: string;
  credits: number;
  paymentId?: string | null;
  invoiceNumber?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  now?: Date;
}): Promise<BillingCreditGrant> {
  const supabase = params.supabase || supabaseAdmin;
  const now = params.now || new Date();
  const { subscription } = await ensureCurrentPlanCreditGrant({
    supabase,
    organizationId: params.organizationId,
    userId: params.userId,
    now,
  });

  if (!subscription.plan?.topUpEnabled) {
    throw new Error('Top-ups are not enabled for the current plan');
  }

  const credits = roundProductCredits(params.credits);
  if (credits <= 0) {
    throw new Error('Top-up credits must be positive');
  }

  const { data: existing, error: existingError } = await supabase
    .from('billing_credit_grants')
    .select('*')
    .eq('idempotency_key', params.idempotencyKey)
    .limit(1)
    .maybeSingle() as { data: GrantRow | null; error: any };

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load existing top-up grant');
  }
  if (existing) {
    return mapGrantRow(existing);
  }

  const expiryMonths = Math.max(1, subscription.plan.topUpCreditExpiryMonths || 12);
  const expiresAt = addUtcMonths(now, expiryMonths).toISOString();

  const { data, error } = await supabase
    .from('billing_credit_grants')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      subscription_id: subscription.id,
      plan_id: subscription.plan.id,
      source_type: 'top_up',
      credits_granted: credits,
      credits_remaining: credits,
      expires_at: expiresAt,
      idempotency_key: params.idempotencyKey,
      stripe_payment_id: params.paymentId || null,
      metadata_json: {
        ...(params.metadata || {}),
        planSlug: subscription.plan.slug,
        invoiceNumber: params.invoiceNumber || null,
        expiryMonths,
      },
    } as any)
    .select('*')
    .single() as { data: GrantRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to grant top-up credits');
  }

  await supabase.from('credit_transactions').insert({
    user_id: params.userId,
    amount: credits,
    balance_before: 0,
    balance_after: 0,
    transaction_type: 'purchase',
    payment_id: params.paymentId || null,
    invoice_number: params.invoiceNumber || null,
    reason: 'Stripe top-up credit purchase',
    metadata: {
      ...(params.metadata || {}),
      organizationId: params.organizationId,
      creditUnit: 'plan_credit',
      grantId: data.id,
      expiresAt,
    },
  } as any);

  return mapGrantRow(data);
}
