import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase/server';

export const PLAN_SLUGS = ['free', 'standard', 'pro', 'teams'] as const;
export const LEGACY_PLAN_SLUGS = ['starter', 'growth', 'scale', 'enterprise'] as const;

export type KnownPlanSlug = typeof PLAN_SLUGS[number];
export type PlanSlug = KnownPlanSlug | (string & {});
export type PlanBillingInterval = 'month' | 'year';

export interface PlanLimits {
  seatLimit: number | null;
  monthlyGenerationLimit: number | null;
  monthlyTranscriptionMinuteLimit: number | null;
  monthlyImportLimit: number | null;
  monthlyStorageMbLimit: number | null;
  integrationLimit: number | null;
}

export interface Plan {
  id: string;
  name: string;
  slug: PlanSlug;
  description: string | null;
  stripePriceId: string | null;
  stripeMonthlyPriceId: string | null;
  stripeAnnualPriceId: string | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  limits: PlanLimits;
  monthlyCreditGrant: number | null;
  creditRolloverMonths: number;
  topUpEnabled: boolean;
  topUpCreditExpiryMonths: number;
  maxUploadMinutes: number | null;
  extraSeatPriceCents: number | null;
  isPopular: boolean;
  features: Record<string, unknown>;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  stripe_price_id: string | null;
  stripe_monthly_price_id?: string | null;
  stripe_annual_price_id?: string | null;
  monthly_price_cents: number | null;
  annual_price_cents?: number | null;
  currency: string;
  seat_limit: number | null;
  monthly_generation_limit: number | null;
  monthly_transcription_minute_limit: number | null;
  monthly_import_limit: number | null;
  monthly_storage_mb_limit: number | null;
  integration_limit: number | null;
  monthly_credit_grant?: number | null;
  credit_rollover_months?: number | null;
  top_up_enabled?: boolean | null;
  top_up_credit_expiry_months?: number | null;
  max_upload_minutes?: number | null;
  extra_seat_price_cents?: number | null;
  is_popular?: boolean | null;
  features_json: unknown;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function emptyPlanLimits(): PlanLimits {
  return {
    seatLimit: null,
    monthlyGenerationLimit: null,
    monthlyTranscriptionMinuteLimit: null,
    monthlyImportLimit: null,
    monthlyStorageMbLimit: null,
    integrationLimit: null,
  };
}

function normalizeFeatures(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getPlanByColumn(
  supabase: SupabaseClient<any>,
  column: 'id' | 'slug',
  value: string,
  activeOnly: boolean
): Promise<Plan | null> {
  let query = supabase
    .from('plans')
    .select('*')
    .eq(column, value)
    .limit(1);

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.maybeSingle() as {
    data: PlanRow | null;
    error: any;
  };

  if (error) {
    throw new Error(error.message || 'Failed to load plan');
  }

  return data ? mapPlanRow(data) : null;
}

export function mapPlanRow(row: PlanRow): Plan {
  const stripeMonthlyPriceId = row.stripe_monthly_price_id ?? row.stripe_price_id ?? null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug as PlanSlug,
    description: row.description,
    stripePriceId: row.stripe_price_id ?? stripeMonthlyPriceId,
    stripeMonthlyPriceId,
    stripeAnnualPriceId: row.stripe_annual_price_id ?? null,
    monthlyPriceCents: row.monthly_price_cents,
    annualPriceCents: row.annual_price_cents ?? null,
    currency: row.currency,
    limits: {
      seatLimit: row.seat_limit,
      monthlyGenerationLimit: row.monthly_generation_limit,
      monthlyTranscriptionMinuteLimit: row.monthly_transcription_minute_limit,
      monthlyImportLimit: row.monthly_import_limit,
      monthlyStorageMbLimit: row.monthly_storage_mb_limit,
      integrationLimit: row.integration_limit,
    },
    monthlyCreditGrant: row.monthly_credit_grant ?? null,
    creditRolloverMonths: row.credit_rollover_months ?? 0,
    topUpEnabled: Boolean(row.top_up_enabled),
    topUpCreditExpiryMonths: row.top_up_credit_expiry_months ?? 12,
    maxUploadMinutes: row.max_upload_minutes ?? null,
    extraSeatPriceCents: row.extra_seat_price_cents ?? null,
    isPopular: Boolean(row.is_popular),
    features: normalizeFeatures(row.features_json),
    isActive: row.is_active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPlanStripePriceId(
  plan: Pick<Plan, 'stripePriceId' | 'stripeMonthlyPriceId' | 'stripeAnnualPriceId'>,
  interval: PlanBillingInterval = 'month'
): string | null {
  if (interval === 'year') {
    return plan.stripeAnnualPriceId || null;
  }

  return plan.stripeMonthlyPriceId || plan.stripePriceId || null;
}

export function getPlanLimits(plan?: Plan | null): PlanLimits {
  if (!plan) {
    return emptyPlanLimits();
  }

  return {
    seatLimit: plan.limits.seatLimit,
    monthlyGenerationLimit: plan.limits.monthlyGenerationLimit,
    monthlyTranscriptionMinuteLimit: plan.limits.monthlyTranscriptionMinuteLimit,
    monthlyImportLimit: plan.limits.monthlyImportLimit,
    monthlyStorageMbLimit: plan.limits.monthlyStorageMbLimit,
    integrationLimit: plan.limits.integrationLimit,
  };
}

export async function getActivePlans(
  supabase: SupabaseClient<any> = supabaseAdmin
): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true }) as { data: PlanRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load active plans');
  }

  return (data || []).map(mapPlanRow);
}

export async function getPlanBySlugOrId(
  supabase: SupabaseClient<any> = supabaseAdmin,
  identifier: string,
  options: { activeOnly?: boolean } = {}
): Promise<Plan | null> {
  const activeOnly = options.activeOnly ?? true;
  const bySlug = await getPlanByColumn(supabase, 'slug', identifier, activeOnly);
  if (bySlug) {
    return bySlug;
  }

  if (!isUuidLike(identifier)) {
    return null;
  }

  return getPlanByColumn(supabase, 'id', identifier, activeOnly);
}

export async function getPlanByStripePriceId(
  supabase: SupabaseClient<any> = supabaseAdmin,
  stripePriceId: string,
  options: { activeOnly?: boolean } = {}
): Promise<Plan | null> {
  const activeOnly = options.activeOnly ?? false;
  const columns = ['stripe_price_id', 'stripe_monthly_price_id', 'stripe_annual_price_id'] as const;

  for (const column of columns) {
    let query = supabase
      .from('plans')
      .select('*')
      .eq(column, stripePriceId)
      .limit(1);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.maybeSingle() as {
      data: PlanRow | null;
      error: any;
    };

    if (error) {
      throw new Error(error.message || 'Failed to load plan by Stripe price');
    }

    if (data) {
      return mapPlanRow(data);
    }
  }

  return null;
}
