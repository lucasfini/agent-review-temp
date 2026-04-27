import { CONTENT_OUTPUT_PRICES } from '@/lib/pricing-config';
import { supabaseAdmin } from '@/lib/supabase/server';

export const BILLING_PRICE_OVERRIDES_KEY = 'billing_prices_v1';

export type EditableServicePrice = {
  serviceKey: string;
  providerRate: number;
  billedRate?: number;
  marginPercent?: number;
};

export type EditableAnalysisPrice = {
  key: string;
  multiplier: number;
  minimumCharge: number;
};

export type BillingPriceOverrides = {
  services?: Record<string, Partial<EditableServicePrice>>;
  analysis?: Record<string, Partial<EditableAnalysisPrice>>;
  contentOutputs?: Record<string, number>;
};

export type EditablePriceConfig = {
  services: Record<string, EditableServicePrice>;
  analysis: Record<string, EditableAnalysisPrice>;
  contentOutputs: Record<string, number>;
};

const DEFAULT_SERVICES: EditablePriceConfig['services'] = {
  assemblyai_transcription: {
    serviceKey: 'assemblyai_transcription',
    providerRate: 0.21 / 3600,
    billedRate: 0.39 / 3600,
    marginPercent: 85.71,
  },
  openai_gpt5_input: { serviceKey: 'openai_gpt5_input', providerRate: 1.25 / 1_000_000, marginPercent: 45 },
  openai_gpt5_output: { serviceKey: 'openai_gpt5_output', providerRate: 10 / 1_000_000, marginPercent: 45 },
  openai_gpt5_cached_input: { serviceKey: 'openai_gpt5_cached_input', providerRate: 0.125 / 1_000_000, marginPercent: 45 },
  openai_gpt5_mini_input: { serviceKey: 'openai_gpt5_mini_input', providerRate: 0.25 / 1_000_000, marginPercent: 45 },
  openai_gpt5_mini_output: { serviceKey: 'openai_gpt5_mini_output', providerRate: 2 / 1_000_000, marginPercent: 45 },
  openai_gpt5_mini_cached_input: { serviceKey: 'openai_gpt5_mini_cached_input', providerRate: 0.025 / 1_000_000, marginPercent: 45 },
  openai_gpt5_nano_input: { serviceKey: 'openai_gpt5_nano_input', providerRate: 0.05 / 1_000_000, marginPercent: 45 },
  openai_gpt5_nano_output: { serviceKey: 'openai_gpt5_nano_output', providerRate: 0.4 / 1_000_000, marginPercent: 45 },
  openai_gpt5_nano_cached_input: { serviceKey: 'openai_gpt5_nano_cached_input', providerRate: 0.005 / 1_000_000, marginPercent: 45 },
  openai_gpt4o_input: { serviceKey: 'openai_gpt4o_input', providerRate: 2.5 / 1_000_000, marginPercent: 45 },
  openai_gpt4o_output: { serviceKey: 'openai_gpt4o_output', providerRate: 10 / 1_000_000, marginPercent: 45 },
  openai_gpt4o_cached_input: { serviceKey: 'openai_gpt4o_cached_input', providerRate: 1.25 / 1_000_000, marginPercent: 45 },
  openai_gpt4o_mini_input: { serviceKey: 'openai_gpt4o_mini_input', providerRate: 0.15 / 1_000_000, marginPercent: 45 },
  openai_gpt4o_mini_output: { serviceKey: 'openai_gpt4o_mini_output', providerRate: 0.6 / 1_000_000, marginPercent: 45 },
  openai_gpt4o_mini_cached_input: { serviceKey: 'openai_gpt4o_mini_cached_input', providerRate: 0.075 / 1_000_000, marginPercent: 45 },
  claude_sonnet_input: { serviceKey: 'claude_sonnet_input', providerRate: 3 / 1_000_000, marginPercent: 45 },
  claude_sonnet_output: { serviceKey: 'claude_sonnet_output', providerRate: 15 / 1_000_000, marginPercent: 45 },
  claude_haiku_input: { serviceKey: 'claude_haiku_input', providerRate: 1 / 1_000_000, marginPercent: 45 },
  claude_haiku_output: { serviceKey: 'claude_haiku_output', providerRate: 5 / 1_000_000, marginPercent: 45 },
  perplexity_sonar_input: { serviceKey: 'perplexity_sonar_input', providerRate: 3 / 1_000_000, marginPercent: 45 },
  perplexity_sonar_output: { serviceKey: 'perplexity_sonar_output', providerRate: 15 / 1_000_000, marginPercent: 45 },
};

const DEFAULT_ANALYSIS: EditablePriceConfig['analysis'] = {
  namedSpeakers: { key: 'namedSpeakers', multiplier: 2.25, minimumCharge: 0.12 },
  insights: { key: 'insights', multiplier: 2.25, minimumCharge: 0.1 },
  summary: { key: 'summary', multiplier: 2, minimumCharge: 0.04 },
  chapters: { key: 'chapters', multiplier: 2, minimumCharge: 0.03 },
  takeaways: { key: 'takeaways', multiplier: 2, minimumCharge: 0.03 },
  quotes: { key: 'quotes', multiplier: 2, minimumCharge: 0.04 },
};

const DEFAULT_CONTENT_OUTPUTS = { ...CONTENT_OUTPUT_PRICES };

let cachedConfig: { config: EditablePriceConfig; expiresAt: number } | null = null;

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function mergeBillingPriceOverrides(overrides?: BillingPriceOverrides | null): EditablePriceConfig {
  const services = Object.fromEntries(
    Object.entries(DEFAULT_SERVICES).map(([key, defaults]) => {
      const override = overrides?.services?.[key] || {};
      const providerRate = positiveNumber(override.providerRate, defaults.providerRate);
      const marginPercent = override.marginPercent === undefined
        ? defaults.marginPercent
        : positiveNumber(override.marginPercent, defaults.marginPercent || 0);
      const billedRate = override.billedRate === undefined
        ? defaults.billedRate
        : positiveNumber(override.billedRate, defaults.billedRate || providerRate * (1 + (marginPercent || 0) / 100));

      return [key, {
        serviceKey: key,
        providerRate,
        marginPercent,
        ...(billedRate === undefined ? {} : { billedRate }),
      }];
    })
  );

  const analysis = Object.fromEntries(
    Object.entries(DEFAULT_ANALYSIS).map(([key, defaults]) => {
      const override = overrides?.analysis?.[key] || {};
      return [key, {
        key,
        multiplier: positiveNumber(override.multiplier, defaults.multiplier),
        minimumCharge: positiveNumber(override.minimumCharge, defaults.minimumCharge),
      }];
    })
  );

  const contentOutputs = Object.fromEntries(
    Object.entries(DEFAULT_CONTENT_OUTPUTS).map(([key, defaults]) => [
      key,
      positiveNumber(overrides?.contentOutputs?.[key], defaults),
    ])
  ) as Record<string, number>;

  return { services, analysis, contentOutputs };
}

export async function getEditablePriceConfig(options?: { forceRefresh?: boolean }): Promise<EditablePriceConfig> {
  if (!options?.forceRefresh && cachedConfig && cachedConfig.expiresAt > Date.now()) {
    return cachedConfig.config;
  }

  const { data, error } = await supabaseAdmin
    .from('billing_price_overrides')
    .select('value')
    .eq('key', BILLING_PRICE_OVERRIDES_KEY)
    .maybeSingle() as { data: { value: BillingPriceOverrides } | null; error: any };

  if (error) {
    console.error('[BILLING PRICES] Failed to load overrides, using defaults:', error);
  }

  const config = mergeBillingPriceOverrides(data?.value || null);
  cachedConfig = { config, expiresAt: Date.now() + 30_000 };
  return config;
}

export async function saveEditablePriceConfig(
  config: EditablePriceConfig,
  adminUserId: string
): Promise<EditablePriceConfig> {
  const normalized = mergeBillingPriceOverrides(config);
  const value: BillingPriceOverrides = {
    services: normalized.services,
    analysis: normalized.analysis,
    contentOutputs: normalized.contentOutputs,
  };

  const { error } = await supabaseAdmin
    .from('billing_price_overrides')
    .upsert({
      key: BILLING_PRICE_OVERRIDES_KEY,
      value,
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'key' });

  if (error) {
    throw new Error(`Failed to save billing price overrides: ${error.message}`);
  }

  cachedConfig = { config: normalized, expiresAt: Date.now() + 30_000 };
  return normalized;
}
