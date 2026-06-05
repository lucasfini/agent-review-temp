import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { buildBillingOrgScopedLegacyFallbackFilter } from '@/lib/billing/organization-scope';
import type { PlanLimits, PlanSlug } from '@/lib/billing/plans';
import {
  getOrganizationSubscription,
  isSubscriptionUsable,
  type OrganizationSubscription,
  type SubscriptionStatus,
} from '@/lib/billing/subscriptions';
import {
  getUsageCounterKeyForAction,
  getUsageQuantityForCounter,
} from '@/lib/billing/subscription-usage-counters';
import { supabaseAdmin } from '@/lib/supabase/server';

export const ENTITLEMENT_ACTIONS = [
  'audio_upload',
  'transcription',
  'content_generation',
  'integration_import',
  'storage',
  'seat',
] as const;

export type EntitlementAction = typeof ENTITLEMENT_ACTIONS[number];
export type SubscriptionEnforcementMode = 'dry_run' | 'enforce';
export type EntitlementReasonCode =
  | 'subscription_missing'
  | 'subscription_inactive'
  | 'plan_missing'
  | 'limit_missing'
  | 'limit_exceeded'
  | 'within_limit'
  | 'legacy_credit_mode'
  | 'unsupported_action';

export interface EntitlementDecision {
  allowed: boolean;
  dryRun: boolean;
  action: EntitlementAction;
  organizationId: string | null;
  planSlug: PlanSlug | null;
  subscriptionStatus: SubscriptionStatus | 'missing' | null;
  reasonCode: EntitlementReasonCode;
  reasonMessage: string;
  limit: number | null;
  currentUsage: number;
  requestedAmount: number;
  projectedUsage: number;
  periodStart: string;
  periodEnd: string;
  checkedAt: string;
}

export interface EntitlementErrorBody {
  error: string;
  message: string;
  reasonCode: EntitlementReasonCode;
  action: EntitlementAction;
  limit: number | null;
  currentUsage: number;
  requestedAmount: number;
  projectedUsage: number;
  upgradeRequired: boolean;
  enforcementMode: SubscriptionEnforcementMode;
  dryRun: boolean;
  periodStart: string;
  periodEnd: string;
  checkedAt: string;
}

export interface EntitlementUsageSummary {
  action: EntitlementAction;
  organizationId: string | null;
  currentUsage: number;
  periodStart: string;
  periodEnd: string;
  source:
    | 'subscription_usage_counters'
    | 'usage_events'
    | 'billing_reservations'
    | 'projects'
    | 'organization_members'
    | 'unsupported';
}

export interface EntitlementUsagePeriod {
  periodStart: string;
  periodEnd: string;
  source: 'subscription_period' | 'calendar_month';
}

export interface ActionUsageCostInput {
  requestedAmount?: number | null;
  durationSeconds?: number | null;
  durationMinutes?: number | null;
  itemCount?: number | null;
  blockCount?: number | null;
  storageMb?: number | null;
  seatCount?: number | null;
}

interface CurrentPeriodUsageOptions {
  supabase?: SupabaseClient<any>;
  organizationId: string | null;
  legacyUserId?: string | null;
  action: EntitlementAction;
  subscription?: OrganizationSubscription | null;
  now?: Date;
}

interface BuildDecisionParams {
  action: EntitlementAction;
  organizationId: string | null;
  subscription?: OrganizationSubscription | null;
  currentUsage: number;
  requestedAmount: number;
  limit: number | null;
  periodStart: string;
  periodEnd: string;
  dryRun?: boolean;
  now?: Date;
}

export interface CheckOrganizationEntitlementOptions extends ActionUsageCostInput {
  supabase?: SupabaseClient<any>;
  organizationId: string | null;
  legacyUserId?: string | null;
  action: EntitlementAction;
  subscription?: OrganizationSubscription | null;
  dryRun?: boolean;
  now?: Date;
}

export interface EntitlementDryRunLogContext {
  userId?: string | null;
  projectId?: string | null;
  route?: string;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RunEntitlementGuardResult {
  decision: EntitlementDecision | null;
  response: NextResponse<EntitlementErrorBody> | null;
  enforcementMode: SubscriptionEnforcementMode;
  enforcementActive: boolean;
}

export interface RunEntitlementGuardOptions extends CheckOrganizationEntitlementOptions {
  logContext?: EntitlementDryRunLogContext;
  allowHardBlock?: boolean;
  enforcementMode?: SubscriptionEnforcementMode | string | null;
}

const warnedInvalidEnforcementModes = new Set<string>();

export function getSubscriptionEnforcementMode(
  value: string | undefined | null = process.env.SUBSCRIPTION_ENFORCEMENT_MODE
): SubscriptionEnforcementMode {
  if (value === 'enforce') return 'enforce';
  if (value === 'dry_run' || value === undefined || value === null || value === '') {
    return 'dry_run';
  }

  if (!warnedInvalidEnforcementModes.has(value)) {
    warnedInvalidEnforcementModes.add(value);
    console.warn('[ENTITLEMENT_ENFORCEMENT] Invalid SUBSCRIPTION_ENFORCEMENT_MODE value; falling back to dry_run.', {
      value,
      supportedValues: ['dry_run', 'enforce'],
    });
  }

  return 'dry_run';
}

export function shouldEnforceSubscriptionEntitlements(
  value: SubscriptionEnforcementMode | string | undefined | null = process.env.SUBSCRIPTION_ENFORCEMENT_MODE
): boolean {
  return getSubscriptionEnforcementMode(value) === 'enforce';
}

function roundUsage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(4));
}

function monthPeriod(now: Date): EntitlementUsagePeriod {
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
  };
}

export function getEntitlementUsagePeriod(
  subscription?: Pick<OrganizationSubscription, 'currentPeriodStart' | 'currentPeriodEnd'> | null,
  now: Date = new Date()
): EntitlementUsagePeriod {
  if (subscription?.currentPeriodStart && subscription.currentPeriodEnd) {
    const start = new Date(subscription.currentPeriodStart);
    const end = new Date(subscription.currentPeriodEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      return {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        source: 'subscription_period',
      };
    }
  }

  return monthPeriod(now);
}

export function getActionUsageCost(
  action: EntitlementAction,
  input: ActionUsageCostInput = {}
): number {
  if (typeof input.requestedAmount === 'number' && Number.isFinite(input.requestedAmount)) {
    return roundUsage(input.requestedAmount);
  }

  switch (action) {
    case 'transcription':
      if (typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)) {
        return roundUsage(input.durationMinutes);
      }
      if (typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds)) {
        return roundUsage(input.durationSeconds / 60);
      }
      return 1;
    case 'content_generation':
      if (typeof input.blockCount === 'number' && Number.isFinite(input.blockCount)) {
        return roundUsage(input.blockCount);
      }
      if (typeof input.itemCount === 'number' && Number.isFinite(input.itemCount)) {
        return roundUsage(input.itemCount);
      }
      return 1;
    case 'storage':
      if (typeof input.storageMb === 'number' && Number.isFinite(input.storageMb)) {
        return roundUsage(input.storageMb);
      }
      return 0;
    case 'seat':
      if (typeof input.seatCount === 'number' && Number.isFinite(input.seatCount)) {
        return roundUsage(input.seatCount);
      }
      return 1;
    case 'audio_upload':
    case 'integration_import':
      return 1;
    default:
      return 0;
  }
}

function getLimitForAction(limits: PlanLimits | null | undefined, action: EntitlementAction): number | null {
  if (!limits) return null;

  switch (action) {
    case 'audio_upload':
    case 'integration_import':
      return limits.monthlyImportLimit;
    case 'transcription':
      return limits.monthlyTranscriptionMinuteLimit;
    case 'content_generation':
      return limits.monthlyGenerationLimit;
    case 'storage':
      return limits.monthlyStorageMbLimit;
    case 'seat':
      return limits.seatLimit;
    default:
      return null;
  }
}

function metadataNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metadataArrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function usageUnitsToMinutes(row: { units?: unknown; unit_type?: unknown }): number {
  const units = typeof row.units === 'number'
    ? row.units
    : Number(row.units || 0);
  const unitType = typeof row.unit_type === 'string' ? row.unit_type : '';

  if (!Number.isFinite(units)) return 0;
  if (unitType === 'seconds') return units / 60;
  if (unitType === 'hours') return units * 60;
  if (unitType === 'minutes') return units;
  return 0;
}

function reservationUsageForAction(action: EntitlementAction, row: any): number {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};

  if (action === 'content_generation') {
    if (row.workflow_type === 'analysis_job') return 1;
    if (row.workflow_type !== 'content_generation') return 0;
    return metadataNumber(metadata.blockCount)
      ?? metadataArrayLength(metadata.blockIds)
      ?? metadataArrayLength(metadata.targetKeys)
      ?? 1;
  }

  if (action === 'audio_upload') {
    return row.workflow_type === 'upload_processing' ? 1 : 0;
  }

  if (action === 'integration_import') {
    if (row.workflow_type !== 'upload_processing') return 0;
    const source = typeof metadata.source === 'string' ? metadata.source : '';
    return ['zoom_import', 'microsoft_import', 'youtube_import'].includes(source) ? 1 : 0;
  }

  return 0;
}

function applyScopedFilter(query: any, organizationId: string | null, legacyUserId?: string | null) {
  if (organizationId && legacyUserId) {
    return query.or(buildBillingOrgScopedLegacyFallbackFilter(organizationId, legacyUserId));
  }
  if (organizationId) {
    return query.eq('organization_id', organizationId);
  }
  if (legacyUserId) {
    return query.eq('user_id', legacyUserId).is('organization_id', null);
  }
  return query;
}

async function getUsageEventsUsage(
  supabase: SupabaseClient<any>,
  options: CurrentPeriodUsageOptions,
  period: EntitlementUsagePeriod
): Promise<EntitlementUsageSummary> {
  let query: any = supabase
    .from('usage_events')
    .select('service_key, provider, units, unit_type, metadata, workflow_step, created_at')
    .gte('created_at', period.periodStart)
    .lt('created_at', period.periodEnd)
    .neq('status', 'failed');

  query = applyScopedFilter(query, options.organizationId, options.legacyUserId);

  const { data, error } = await query as { data: any[] | null; error: any };
  if (error) {
    throw new Error(error.message || 'Failed to calculate current period usage');
  }

  let currentUsage = 0;
  for (const row of data || []) {
    if (options.action === 'transcription' && row.service_key === 'assemblyai_transcription') {
      currentUsage += usageUnitsToMinutes(row);
    }
  }

  return {
    action: options.action,
    organizationId: options.organizationId,
    currentUsage: roundUsage(currentUsage),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    source: 'usage_events',
  };
}

async function getReservationUsage(
  supabase: SupabaseClient<any>,
  options: CurrentPeriodUsageOptions,
  period: EntitlementUsagePeriod
): Promise<EntitlementUsageSummary> {
  let query: any = supabase
    .from('billing_reservations')
    .select('workflow_type, metadata, created_at')
    .gte('created_at', period.periodStart)
    .lt('created_at', period.periodEnd)
    .neq('status', 'failed');

  query = applyScopedFilter(query, options.organizationId, options.legacyUserId);

  const { data, error } = await query as { data: any[] | null; error: any };
  if (error) {
    throw new Error(error.message || 'Failed to calculate current period reservation usage');
  }

  const currentUsage = (data || []).reduce(
    (sum, row) => sum + reservationUsageForAction(options.action, row),
    0
  );

  return {
    action: options.action,
    organizationId: options.organizationId,
    currentUsage: roundUsage(currentUsage),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    source: 'billing_reservations',
  };
}

async function getStorageUsage(
  supabase: SupabaseClient<any>,
  options: CurrentPeriodUsageOptions,
  period: EntitlementUsagePeriod
): Promise<EntitlementUsageSummary> {
  let query: any = supabase
    .from('projects')
    .select('audio_file_size');

  query = applyScopedFilter(query, options.organizationId, options.legacyUserId);

  const { data, error } = await query as { data: Array<{ audio_file_size: number | null }> | null; error: any };
  if (error) {
    throw new Error(error.message || 'Failed to calculate storage usage');
  }

  const totalBytes = (data || []).reduce((sum, row) => sum + Number(row.audio_file_size || 0), 0);

  return {
    action: options.action,
    organizationId: options.organizationId,
    currentUsage: roundUsage(totalBytes / 1024 / 1024),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    source: 'projects',
  };
}

async function getSeatUsage(
  supabase: SupabaseClient<any>,
  options: CurrentPeriodUsageOptions,
  period: EntitlementUsagePeriod
): Promise<EntitlementUsageSummary> {
  if (!options.organizationId) {
    return {
      action: options.action,
      organizationId: options.organizationId,
      currentUsage: 0,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      source: 'organization_members',
    };
  }

  const { count, error } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', options.organizationId)
    .eq('status', 'active') as { count: number | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to calculate seat usage');
  }

  return {
    action: options.action,
    organizationId: options.organizationId,
    currentUsage: count || 0,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    source: 'organization_members',
  };
}

export async function getCurrentPeriodUsage(
  options: CurrentPeriodUsageOptions
): Promise<EntitlementUsageSummary> {
  const supabase = options.supabase || supabaseAdmin;
  const period = getEntitlementUsagePeriod(options.subscription, options.now);
  const counterKey = getUsageCounterKeyForAction(options.action);

  if (options.organizationId && counterKey) {
    try {
      const counterUsage = await getUsageQuantityForCounter(supabase, {
        organizationId: options.organizationId,
        counterKey,
        subscription: options.subscription,
        now: options.now,
      });

      if (counterUsage.counter) {
        return {
          action: options.action,
          organizationId: options.organizationId,
          currentUsage: roundUsage(counterUsage.currentUsage),
          periodStart: counterUsage.periodStart,
          periodEnd: counterUsage.periodEnd,
          source: 'subscription_usage_counters',
        };
      }
    } catch (error) {
      console.warn('[ENTITLEMENT_DRY_RUN] Failed to read subscription usage counter, falling back to legacy usage approximation:', {
        action: options.action,
        organizationId: options.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  switch (options.action) {
    case 'transcription':
      return getUsageEventsUsage(supabase, options, period);
    case 'audio_upload':
    case 'content_generation':
    case 'integration_import':
      return getReservationUsage(supabase, options, period);
    case 'storage':
      return getStorageUsage(supabase, options, period);
    case 'seat':
      return getSeatUsage(supabase, options, period);
    default:
      return {
        action: options.action,
        organizationId: options.organizationId,
        currentUsage: 0,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        source: 'unsupported',
      };
  }
}

export function buildDryRunEntitlementDecision(params: BuildDecisionParams): EntitlementDecision {
  const dryRun = params.dryRun ?? true;
  const subscription = params.subscription || null;
  const plan = subscription?.plan || null;
  const currentUsage = roundUsage(params.currentUsage);
  const requestedAmount = roundUsage(params.requestedAmount);
  const projectedUsage = roundUsage(currentUsage + requestedAmount);
  const checkedAt = (params.now || new Date()).toISOString();

  const base = {
    dryRun,
    action: params.action,
    organizationId: params.organizationId,
    planSlug: plan?.slug || null,
    subscriptionStatus: subscription?.status || 'missing',
    limit: params.limit,
    currentUsage,
    requestedAmount,
    projectedUsage,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    checkedAt,
  };

  if (!subscription) {
    return {
      ...base,
      allowed: dryRun,
      reasonCode: dryRun ? 'legacy_credit_mode' : 'subscription_missing',
      reasonMessage: dryRun
        ? 'No organization subscription exists; legacy credit/pay-as-you-go mode remains allowed during dry-run.'
        : 'A subscription is required to use this feature.',
    };
  }

  if (!isSubscriptionUsable(subscription.status)) {
    return {
      ...base,
      allowed: false,
      reasonCode: 'subscription_inactive',
      reasonMessage: dryRun
        ? `Subscription status ${subscription.status} is not usable. Existing credit/pay-as-you-go behavior is still not blocked in dry-run.`
        : 'Your subscription is not active. Update billing to continue.',
    };
  }

  if (!plan) {
    return {
      ...base,
      allowed: false,
      reasonCode: 'plan_missing',
      reasonMessage: dryRun
        ? 'Subscription has no attached plan. Existing flow remains unblocked during dry-run.'
        : 'Your subscription plan could not be verified.',
    };
  }

  if (!ENTITLEMENT_ACTIONS.includes(params.action)) {
    return {
      ...base,
      allowed: true,
      reasonCode: 'unsupported_action',
      reasonMessage: 'This action is not mapped to an entitlement yet.',
    };
  }

  if (params.limit === null) {
    return {
      ...base,
      allowed: true,
      reasonCode: 'limit_missing',
      reasonMessage: 'The current plan has no limit for this action; dry-run treats it as unlimited.',
    };
  }

  if (projectedUsage > params.limit) {
    return {
      ...base,
      allowed: false,
      reasonCode: 'limit_exceeded',
      reasonMessage: dryRun
        ? `Projected usage ${projectedUsage} exceeds plan limit ${params.limit}. Existing flow remains unblocked during dry-run.`
        : 'Your current plan limit has been reached.',
    };
  }

  return {
    ...base,
    allowed: true,
    reasonCode: 'within_limit',
    reasonMessage: `Projected usage ${projectedUsage} is within plan limit ${params.limit}.`,
  };
}

export async function checkOrganizationEntitlement(
  options: CheckOrganizationEntitlementOptions
): Promise<EntitlementDecision> {
  const supabase = options.supabase || supabaseAdmin;
  const subscription = options.subscription !== undefined
    ? options.subscription
    : options.organizationId
      ? await getOrganizationSubscription(supabase, options.organizationId)
      : null;
  const requestedAmount = getActionUsageCost(options.action, options);
  const usage = await getCurrentPeriodUsage({
    supabase,
    organizationId: options.organizationId,
    legacyUserId: options.legacyUserId,
    action: options.action,
    subscription,
    now: options.now,
  });

  return buildDryRunEntitlementDecision({
    action: options.action,
    organizationId: options.organizationId,
    subscription,
    currentUsage: usage.currentUsage,
    requestedAmount,
    limit: getLimitForAction(subscription?.plan?.limits, options.action),
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    dryRun: options.dryRun,
    now: options.now,
  });
}

export function logEntitlementDecision(
  decision: EntitlementDecision,
  context: EntitlementDryRunLogContext = {},
  enforcementMode: SubscriptionEnforcementMode = getSubscriptionEnforcementMode()
) {
  const payload = {
    event: decision.dryRun ? 'subscription_entitlement_dry_run' : 'subscription_entitlement_enforce',
    route: context.route,
    userId: context.userId,
    projectId: context.projectId,
    requestId: context.requestId,
    action: decision.action,
    organizationId: decision.organizationId,
    allowed: decision.allowed,
    dryRun: decision.dryRun,
    enforcementMode,
    enforcementActive: !decision.dryRun && enforcementMode === 'enforce',
    reasonCode: decision.reasonCode,
    reasonMessage: decision.reasonMessage,
    planSlug: decision.planSlug,
    subscriptionStatus: decision.subscriptionStatus,
    limit: decision.limit,
    currentUsage: decision.currentUsage,
    requestedAmount: decision.requestedAmount,
    projectedUsage: decision.projectedUsage,
    periodStart: decision.periodStart,
    periodEnd: decision.periodEnd,
    checkedAt: decision.checkedAt,
    metadata: context.metadata,
  };

  const label = decision.dryRun ? '[ENTITLEMENT_DRY_RUN]' : '[ENTITLEMENT_ENFORCE]';
  if (decision.allowed) {
    console.info(label, payload);
  } else {
    console.warn(label, payload);
  }
}

function getEntitlementErrorCode(reasonCode: EntitlementReasonCode): string {
  switch (reasonCode) {
    case 'subscription_missing':
      return 'subscription_required';
    case 'subscription_inactive':
      return 'subscription_inactive';
    case 'plan_missing':
      return 'subscription_plan_missing';
    case 'limit_exceeded':
      return 'subscription_limit_exceeded';
    default:
      return 'subscription_entitlement_blocked';
  }
}

function getEntitlementErrorStatus(reasonCode: EntitlementReasonCode): number {
  switch (reasonCode) {
    case 'limit_exceeded':
      return 429;
    case 'subscription_missing':
    case 'subscription_inactive':
    case 'plan_missing':
      return 402;
    default:
      return 402;
  }
}

export function buildEntitlementErrorBody(
  decision: EntitlementDecision,
  enforcementMode: SubscriptionEnforcementMode = 'enforce'
): EntitlementErrorBody {
  return {
    error: getEntitlementErrorCode(decision.reasonCode),
    message: decision.reasonMessage,
    reasonCode: decision.reasonCode,
    action: decision.action,
    limit: decision.limit,
    currentUsage: decision.currentUsage,
    requestedAmount: decision.requestedAmount,
    projectedUsage: decision.projectedUsage,
    upgradeRequired: true,
    enforcementMode,
    dryRun: decision.dryRun,
    periodStart: decision.periodStart,
    periodEnd: decision.periodEnd,
    checkedAt: decision.checkedAt,
  };
}

export function buildEntitlementErrorResponse(
  decision: EntitlementDecision,
  enforcementMode: SubscriptionEnforcementMode = 'enforce'
): NextResponse<EntitlementErrorBody> {
  return NextResponse.json(
    buildEntitlementErrorBody(decision, enforcementMode),
    {
      status: getEntitlementErrorStatus(decision.reasonCode),
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      },
    }
  );
}

export async function runEntitlementGuard(
  options: RunEntitlementGuardOptions
): Promise<RunEntitlementGuardResult> {
  const enforcementMode = getSubscriptionEnforcementMode(options.enforcementMode);
  const enforcementActive = options.allowHardBlock !== false && enforcementMode === 'enforce';

  try {
    const decision = await checkOrganizationEntitlement({
      ...options,
      dryRun: !enforcementActive,
    });
    logEntitlementDecision(decision, options.logContext, enforcementMode);

    if (enforcementActive && !decision.allowed) {
      return {
        decision,
        response: buildEntitlementErrorResponse(decision, enforcementMode),
        enforcementMode,
        enforcementActive,
      };
    }

    return {
      decision,
      response: null,
      enforcementMode,
      enforcementActive,
    };
  } catch (error) {
    console.warn('[ENTITLEMENT_ENFORCEMENT] Failed to compute entitlement decision; request remains governed by existing billing checks.', {
      action: options.action,
      organizationId: options.organizationId,
      userId: options.legacyUserId,
      route: options.logContext?.route,
      projectId: options.logContext?.projectId,
      enforcementMode,
      enforcementActive,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      decision: null,
      response: null,
      enforcementMode,
      enforcementActive,
    };
  }
}

export async function runEntitlementDryRunCheck(
  options: CheckOrganizationEntitlementOptions & { logContext?: EntitlementDryRunLogContext }
): Promise<EntitlementDecision | null> {
  try {
    const decision = await checkOrganizationEntitlement({
      ...options,
      dryRun: true,
    });
    logEntitlementDecision(decision, options.logContext, getSubscriptionEnforcementMode());
    return decision;
  } catch (error) {
    console.warn('[ENTITLEMENT_DRY_RUN] Failed to compute dry-run entitlement decision:', {
      action: options.action,
      organizationId: options.organizationId,
      userId: options.legacyUserId,
      route: options.logContext?.route,
      projectId: options.logContext?.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
