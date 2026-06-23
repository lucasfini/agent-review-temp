import { normalizeTier, type TierLevel } from '@/lib/tier-config';

export const PRODUCT_CREDIT_RATES = {
  transcriptPerAudioMinute: 1,
  contentKitPerAudioMinute: 3,
  repurposePackPerAudioMinute: 5,
  extraDraftOrRegeneration: 25,
} as const;

export type ProductCreditWorkflow = 'transcript' | 'content_kit' | 'repurpose_pack';

export function roundProductCredits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(4));
}

export function getProductCreditRateForWorkflow(workflow: ProductCreditWorkflow): number {
  switch (workflow) {
    case 'transcript':
      return PRODUCT_CREDIT_RATES.transcriptPerAudioMinute;
    case 'content_kit':
      return PRODUCT_CREDIT_RATES.contentKitPerAudioMinute;
    case 'repurpose_pack':
      return PRODUCT_CREDIT_RATES.repurposePackPerAudioMinute;
    default:
      return PRODUCT_CREDIT_RATES.contentKitPerAudioMinute;
  }
}

export function workflowFromTier(tier?: string | null): ProductCreditWorkflow {
  return normalizeTier(tier) as TierLevel;
}

export function estimateAudioProductCredits(params: {
  durationSeconds: number;
  workflow?: ProductCreditWorkflow | string | null;
  tier?: string | null;
}): number {
  const durationMinutes = Math.max(0, params.durationSeconds || 0) / 60;
  const workflow = params.workflow
    ? workflowFromTier(params.workflow)
    : workflowFromTier(params.tier || 'content_kit');

  return roundProductCredits(durationMinutes * getProductCreditRateForWorkflow(workflow));
}

export function estimateDraftProductCredits(count: number): number {
  return roundProductCredits(Math.max(0, count || 0) * PRODUCT_CREDIT_RATES.extraDraftOrRegeneration);
}

export function getRepurposePackHoursFromCredits(credits: number): number {
  const hours = Math.max(0, credits || 0) / (PRODUCT_CREDIT_RATES.repurposePackPerAudioMinute * 60);
  return Number(hours.toFixed(hours >= 10 ? 0 : 1));
}

export function formatProductCredits(credits: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(credits) ? 0 : 1,
  }).format(credits);
}
