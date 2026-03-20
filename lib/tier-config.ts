// Tier configuration for pricing, feature access, and backward-compat mapping.

export type TierLevel = 'transcript' | 'content_kit' | 'repurpose_pack';
export type LegacyTierLevel = 'basic' | 'standard' | 'pro' | 'premium';
export type AnyTierLevel = TierLevel | LegacyTierLevel;

export interface TierFeatures {
  transcription: true;
  speakerDiarization: true;
  wordTimestamps: true;

  nameExtraction: boolean;
  aiSummary: boolean;
  roleClassification: boolean;
  chapterDetection: boolean;
  keyTakeaways: boolean;
  quotesExtraction: boolean;
  insights: boolean;
  contentGeneration: boolean;
  autoGenerateContent: boolean;

  speakerLabels: 'generic' | 'named' | 'named-with-roles';
}

export interface TierPricing {
  totalPerHour: number;
  description: string;
}

export const TIER_CONFIG: Record<TierLevel, TierFeatures> = {
  transcript: {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: false,
    aiSummary: false,
    roleClassification: false,
    chapterDetection: false,
    keyTakeaways: false,
    quotesExtraction: false,
    insights: false,
    contentGeneration: false,
    autoGenerateContent: false,
    speakerLabels: 'generic',
  },
  content_kit: {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: true,
    aiSummary: true,
    roleClassification: true,
    chapterDetection: true,
    keyTakeaways: true,
    quotesExtraction: true,
    insights: true,
    contentGeneration: false,
    autoGenerateContent: false,
    speakerLabels: 'named-with-roles',
  },
  repurpose_pack: {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: true,
    aiSummary: true,
    roleClassification: true,
    chapterDetection: true,
    keyTakeaways: true,
    quotesExtraction: true,
    insights: true,
    contentGeneration: true,
    autoGenerateContent: true,
    speakerLabels: 'named-with-roles',
  },
};

export const TIER_PRICING: Record<TierLevel, TierPricing> = {
  transcript: {
    totalPerHour: 0.49,
    description: 'Clean transcript with speaker labels',
  },
  content_kit: {
    totalPerHour: 1.49,
    description: 'Transcript plus analysis outputs',
  },
  repurpose_pack: {
    totalPerHour: 2.49,
    description: 'Analysis plus all 11 content types',
  },
};

const TIER_NORMALIZATION: Record<string, TierLevel> = {
  basic: 'transcript',
  standard: 'transcript',
  transcript: 'transcript',
  pro: 'content_kit',
  medium: 'content_kit',
  content_kit: 'content_kit',
  premium: 'repurpose_pack',
  high: 'repurpose_pack',
  repurpose_pack: 'repurpose_pack',
};

const TIER_LABELS: Record<TierLevel, string> = {
  transcript: 'Transcript',
  content_kit: 'Content Kit',
  repurpose_pack: 'Repurpose Pack',
};

export function getTierFeatures(tier: TierLevel): TierFeatures {
  return TIER_CONFIG[tier];
}

export function getTierPricing(tier: TierLevel): TierPricing {
  return TIER_PRICING[tier];
}

export function calculateTierCost(
  tier: TierLevel,
  audioDurationSeconds: number
): {
  totalCost: number;
} {
  const pricing = TIER_PRICING[tier];
  const durationHours = audioDurationSeconds / 3600;

  return {
    totalCost: pricing.totalPerHour * durationHours,
  };
}

export function normalizeTier(raw?: string | null): TierLevel {
  if (!raw) return 'content_kit';
  return TIER_NORMALIZATION[raw.toLowerCase()] || 'content_kit';
}

export function isValidTier(tier: string): tier is TierLevel {
  return Object.prototype.hasOwnProperty.call(TIER_CONFIG, tier);
}

export function isKnownTierValue(tier: string): tier is AnyTierLevel {
  return Object.prototype.hasOwnProperty.call(TIER_NORMALIZATION, tier);
}

export function getTierLabel(tier?: string | null): string {
  return TIER_LABELS[normalizeTier(tier)];
}

export function isAnalysisTier(tier?: string | null): boolean {
  const normalized = normalizeTier(tier);
  return normalized === 'content_kit' || normalized === 'repurpose_pack';
}

export function canGenerateContent(tier?: string | null): boolean {
  return getTierFeatures(normalizeTier(tier)).contentGeneration;
}

export function shouldAutoGenerateContent(tier?: string | null): boolean {
  return getTierFeatures(normalizeTier(tier)).autoGenerateContent;
}

export function getTierFromEnv(): TierLevel {
  const envTier = process.env.PERFORMANCE_LEVEL?.toLowerCase() || '';
  return normalizeTier(envTier);
}
