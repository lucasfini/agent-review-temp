import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase/server';

export const PLAN_SLUGS = ['starter', 'growth', 'scale', 'enterprise'] as const;

export type KnownPlanSlug = typeof PLAN_SLUGS[number];
export type PlanSlug = KnownPlanSlug | (string & {});

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
  monthlyPriceCents: number | null;
  currency: string;
  limits: PlanLimits;
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
  monthly_price_cents: number | null;
  currency: string;
  seat_limit: number | null;
  monthly_generation_limit: number | null;
  monthly_transcription_minute_limit: number | null;
  monthly_import_limit: number | null;
  monthly_storage_mb_limit: number | null;
  integration_limit: number | null;
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

export function mapPlanRow(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug as PlanSlug,
    description: row.description,
    stripePriceId: row.stripe_price_id,
    monthlyPriceCents: row.monthly_price_cents,
    currency: row.currency,
    limits: {
      seatLimit: row.seat_limit,
      monthlyGenerationLimit: row.monthly_generation_limit,
      monthlyTranscriptionMinuteLimit: row.monthly_transcription_minute_limit,
      monthlyImportLimit: row.monthly_import_limit,
      monthlyStorageMbLimit: row.monthly_storage_mb_limit,
      integrationLimit: row.integration_limit,
    },
    features: normalizeFeatures(row.features_json),
    isActive: row.is_active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
