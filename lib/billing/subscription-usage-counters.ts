import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  getOrganizationSubscription,
  type OrganizationSubscription,
} from '@/lib/billing/subscriptions';
import type { EntitlementAction } from '@/lib/billing/entitlement-guards';

export const SUBSCRIPTION_USAGE_COUNTER_KEYS = [
  'content_generation',
  'transcription_minutes',
  'audio_upload',
  'integration_import',
  'storage_mb',
  'seat',
] as const;

export type SubscriptionUsageCounterKey = typeof SUBSCRIPTION_USAGE_COUNTER_KEYS[number];
export type SubscriptionUsageCounterUnit = 'count' | 'minutes' | 'mb';
export type SubscriptionUsagePeriodSource = 'subscription_period' | 'calendar_month';

export interface SubscriptionUsagePeriod {
  periodStart: string;
  periodEnd: string;
  source: SubscriptionUsagePeriodSource;
  subscriptionId: string | null;
}

export interface SubscriptionUsageCounter {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  periodStart: string;
  periodEnd: string;
  counterKey: SubscriptionUsageCounterKey;
  quantity: number;
  unit: SubscriptionUsageCounterUnit;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionUsageCounterRow {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  period_start: string;
  period_end: string;
  counter_key: string;
  quantity: number | string;
  unit: string;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface UsageCounterQuantityResult {
  counter: SubscriptionUsageCounter | null;
  currentUsage: number;
  periodStart: string;
  periodEnd: string;
  period: SubscriptionUsagePeriod;
  source: 'subscription_usage_counters' | 'missing';
}

export interface IncrementSubscriptionUsageCounterParams {
  organizationId: string;
  subscriptionId?: string | null;
  periodStart: string;
  periodEnd: string;
  counterKey: SubscriptionUsageCounterKey;
  quantity: number;
  unit?: SubscriptionUsageCounterUnit;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

export interface IncrementSubscriptionUsageCounterResult {
  counter: SubscriptionUsageCounter;
  duplicate: boolean;
}

export interface RecordSubscriptionUsageParams {
  supabase?: SupabaseClient<any>;
  organizationId?: string | null;
  userId?: string | null;
  subscription?: OrganizationSubscription | null;
  counterKey: SubscriptionUsageCounterKey;
  quantity: number;
  unit?: SubscriptionUsageCounterUnit;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  now?: Date;
  logContext?: {
    route?: string;
    projectId?: string | null;
    userId?: string | null;
    source?: string | null;
  };
}

function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(4));
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractIdempotencyKeys(metadata: Record<string, unknown>): string[] {
  const value = metadata.idempotencyKeys;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function withRecordedIdempotencyKey(
  metadata: Record<string, unknown>,
  idempotencyKey?: string | null
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...metadata,
    lastRecordedAt: new Date().toISOString(),
  };

  if (!idempotencyKey) {
    return next;
  }

  const keys = extractIdempotencyKeys(metadata);
  if (!keys.includes(idempotencyKey)) {
    keys.push(idempotencyKey);
  }

  // Keep metadata bounded until a dedicated idempotency table/RPC exists.
  next.idempotencyKeys = keys.slice(-100);
  return next;
}

function isUniqueConflict(error: any): boolean {
  return error?.code === '23505'
    || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
}

function isMissingRpc(error: any): boolean {
  return error?.code === 'PGRST202'
    || error?.code === '404'
    || (typeof error?.message === 'string'
      && error.message.toLowerCase().includes('could not find the function'));
}

export function getFallbackCalendarUsagePeriod(now: Date = new Date()): SubscriptionUsagePeriod {
  const periodStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
    0,
    0,
    0,
    0
  ));
  const periodEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0
  ));

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    source: 'calendar_month',
    subscriptionId: null,
  };
}

export function getCurrentSubscriptionUsagePeriod(
  subscription?: Pick<OrganizationSubscription, 'id' | 'currentPeriodStart' | 'currentPeriodEnd'> | null,
  now: Date = new Date()
): SubscriptionUsagePeriod {
  if (subscription?.currentPeriodStart && subscription.currentPeriodEnd) {
    const start = new Date(subscription.currentPeriodStart);
    const end = new Date(subscription.currentPeriodEnd);

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      return {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        source: 'subscription_period',
        subscriptionId: subscription.id,
      };
    }
  }

  return getFallbackCalendarUsagePeriod(now);
}

export function getUsageCounterKeyForAction(
  action: EntitlementAction
): SubscriptionUsageCounterKey | null {
  switch (action) {
    case 'audio_upload':
      return 'audio_upload';
    case 'transcription':
      return 'transcription_minutes';
    case 'content_generation':
      return 'content_generation';
    case 'integration_import':
      return 'integration_import';
    case 'storage':
      return 'storage_mb';
    case 'seat':
      return 'seat';
    default:
      return null;
  }
}

export function getUnitForCounterKey(
  counterKey: SubscriptionUsageCounterKey
): SubscriptionUsageCounterUnit {
  switch (counterKey) {
    case 'transcription_minutes':
      return 'minutes';
    case 'storage_mb':
      return 'mb';
    case 'audio_upload':
    case 'content_generation':
    case 'integration_import':
    case 'seat':
      return 'count';
    default:
      return 'count';
  }
}

export function mapSubscriptionUsageCounterRow(
  row: SubscriptionUsageCounterRow
): SubscriptionUsageCounter {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    periodStart: new Date(row.period_start).toISOString(),
    periodEnd: new Date(row.period_end).toISOString(),
    counterKey: row.counter_key as SubscriptionUsageCounterKey,
    quantity: roundQuantity(Number(row.quantity || 0)),
    unit: row.unit as SubscriptionUsageCounterUnit,
    metadata: normalizeMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSubscriptionForPeriod(
  supabase: SupabaseClient<any>,
  organizationId: string,
  subscription?: OrganizationSubscription | null
): Promise<OrganizationSubscription | null> {
  if (subscription !== undefined) {
    return subscription;
  }
  return getOrganizationSubscription(supabase, organizationId);
}

async function getCounterRow(
  supabase: SupabaseClient<any>,
  params: {
    organizationId: string;
    periodStart: string;
    periodEnd: string;
    counterKey: SubscriptionUsageCounterKey;
  }
): Promise<SubscriptionUsageCounter | null> {
  const { data, error } = await supabase
    .from('subscription_usage_counters')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('period_start', params.periodStart)
    .eq('period_end', params.periodEnd)
    .eq('counter_key', params.counterKey)
    .maybeSingle() as { data: SubscriptionUsageCounterRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load subscription usage counter');
  }

  return data ? mapSubscriptionUsageCounterRow(data) : null;
}

async function updateExistingCounter(
  supabase: SupabaseClient<any>,
  existing: SubscriptionUsageCounter,
  params: IncrementSubscriptionUsageCounterParams
): Promise<IncrementSubscriptionUsageCounterResult> {
  const idempotencyKeys = extractIdempotencyKeys(existing.metadata);
  if (params.idempotencyKey && idempotencyKeys.includes(params.idempotencyKey)) {
    return { counter: existing, duplicate: true };
  }

  const nextQuantity = roundQuantity(existing.quantity + roundQuantity(params.quantity));
  const nextMetadata = withRecordedIdempotencyKey(
    {
      ...existing.metadata,
      ...(params.metadata || {}),
    },
    params.idempotencyKey
  );

  const { data, error } = await supabase
    .from('subscription_usage_counters')
    .update({
      subscription_id: params.subscriptionId ?? existing.subscriptionId,
      quantity: nextQuantity,
      unit: params.unit || existing.unit,
      metadata_json: nextMetadata,
    } as any)
    .eq('id', existing.id)
    .select('*')
    .maybeSingle() as { data: SubscriptionUsageCounterRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update subscription usage counter');
  }

  return { counter: mapSubscriptionUsageCounterRow(data), duplicate: false };
}

async function incrementSubscriptionUsageCounterViaRpc(
  supabase: SupabaseClient<any>,
  params: IncrementSubscriptionUsageCounterParams,
  quantity: number,
  unit: SubscriptionUsageCounterUnit
): Promise<IncrementSubscriptionUsageCounterResult | null> {
  if (typeof (supabase as any).rpc !== 'function') {
    return null;
  }

  const { data, error } = await (supabase as any).rpc('increment_subscription_usage_counter', {
    p_organization_id: params.organizationId,
    p_subscription_id: params.subscriptionId || null,
    p_period_start: params.periodStart,
    p_period_end: params.periodEnd,
    p_counter_key: params.counterKey,
    p_quantity: quantity,
    p_unit: unit,
    p_metadata_json: params.metadata || {},
    p_idempotency_key: params.idempotencyKey || null,
  }) as { data: SubscriptionUsageCounterRow | SubscriptionUsageCounterRow[] | null; error: any };

  if (error) {
    if (isMissingRpc(error)) {
      return null;
    }
    throw new Error(error.message || 'Failed to increment subscription usage counter');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Failed to increment subscription usage counter');
  }

  return {
    counter: mapSubscriptionUsageCounterRow(row),
    duplicate: false,
  };
}

export async function incrementSubscriptionUsageCounter(
  supabase: SupabaseClient<any> = supabaseAdmin,
  params: IncrementSubscriptionUsageCounterParams
): Promise<IncrementSubscriptionUsageCounterResult> {
  const quantity = roundQuantity(params.quantity);
  if (quantity <= 0) {
    throw new Error('Counter quantity must be greater than zero');
  }

  const unit = params.unit || getUnitForCounterKey(params.counterKey);
  const rpcResult = await incrementSubscriptionUsageCounterViaRpc(supabase, params, quantity, unit);
  if (rpcResult) {
    return rpcResult;
  }

  const existing = await getCounterRow(supabase, params);
  if (existing) {
    return updateExistingCounter(supabase, existing, { ...params, quantity, unit });
  }

  const metadata = withRecordedIdempotencyKey(params.metadata || {}, params.idempotencyKey);
  const { data, error } = await supabase
    .from('subscription_usage_counters')
    .insert({
      organization_id: params.organizationId,
      subscription_id: params.subscriptionId || null,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      counter_key: params.counterKey,
      quantity,
      unit,
      metadata_json: metadata,
    } as any)
    .select('*')
    .single() as { data: SubscriptionUsageCounterRow | null; error: any };

  if (error || !data) {
    if (isUniqueConflict(error)) {
      const retryExisting = await getCounterRow(supabase, params);
      if (retryExisting) {
        return updateExistingCounter(supabase, retryExisting, { ...params, quantity, unit });
      }
    }
    throw new Error(error?.message || 'Failed to insert subscription usage counter');
  }

  return { counter: mapSubscriptionUsageCounterRow(data), duplicate: false };
}

export async function getUsageQuantityForCounter(
  supabase: SupabaseClient<any> = supabaseAdmin,
  options: {
    organizationId: string;
    counterKey: SubscriptionUsageCounterKey;
    subscription?: OrganizationSubscription | null;
    now?: Date;
  }
): Promise<UsageCounterQuantityResult> {
  const subscription = await getSubscriptionForPeriod(
    supabase,
    options.organizationId,
    options.subscription
  );
  const period = getCurrentSubscriptionUsagePeriod(subscription, options.now);
  const counter = await getCounterRow(supabase, {
    organizationId: options.organizationId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    counterKey: options.counterKey,
  });

  return {
    counter,
    currentUsage: counter?.quantity || 0,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    period,
    source: counter ? 'subscription_usage_counters' : 'missing',
  };
}

export async function getSubscriptionUsageCounters(
  supabase: SupabaseClient<any> = supabaseAdmin,
  options: {
    organizationId: string;
    subscription?: OrganizationSubscription | null;
    now?: Date;
  }
): Promise<{
  period: SubscriptionUsagePeriod;
  counters: SubscriptionUsageCounter[];
}> {
  const subscription = await getSubscriptionForPeriod(
    supabase,
    options.organizationId,
    options.subscription
  );
  const period = getCurrentSubscriptionUsagePeriod(subscription, options.now);

  const { data, error } = await supabase
    .from('subscription_usage_counters')
    .select('*')
    .eq('organization_id', options.organizationId)
    .eq('period_start', period.periodStart)
    .eq('period_end', period.periodEnd)
    .order('counter_key', { ascending: true }) as {
      data: SubscriptionUsageCounterRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load subscription usage counters');
  }

  return {
    period,
    counters: (data || []).map(mapSubscriptionUsageCounterRow),
  };
}

export async function recordSubscriptionUsage(
  params: RecordSubscriptionUsageParams
): Promise<SubscriptionUsageCounter | null> {
  const supabase = params.supabase || supabaseAdmin;

  try {
    const organizationId = params.organizationId
      || (params.userId ? await resolveOrganizationIdForWrite(params.userId, null, supabase) : null);

    if (!organizationId) {
      return null;
    }

    const subscription = await getSubscriptionForPeriod(
      supabase,
      organizationId,
      params.subscription
    );
    const period = getCurrentSubscriptionUsagePeriod(subscription, params.now);
    const result = await incrementSubscriptionUsageCounter(supabase, {
      organizationId,
      subscriptionId: period.subscriptionId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      counterKey: params.counterKey,
      quantity: params.quantity,
      unit: params.unit || getUnitForCounterKey(params.counterKey),
      idempotencyKey: params.idempotencyKey,
      metadata: {
        ...(params.metadata || {}),
        periodSource: period.source,
      },
    });

    return result.counter;
  } catch (error) {
    console.warn('[SUBSCRIPTION_USAGE_COUNTERS] Failed to record usage counter:', {
      counterKey: params.counterKey,
      organizationId: params.organizationId,
      userId: params.logContext?.userId || params.userId,
      route: params.logContext?.route,
      projectId: params.logContext?.projectId,
      source: params.logContext?.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function reconcileUsageEventsToCounters() {
  return {
    supported: false,
    message:
      'Phase 2E does not backfill counters automatically. Reconciliation should be run as a reviewed one-off job after validating usage_events/reservation mappings.',
  };
}
