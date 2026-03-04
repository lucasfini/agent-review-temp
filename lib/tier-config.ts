// Tier Configuration for Content Generation
// Defines features and capabilities for each pricing tier

export type TierLevel = 'basic' | 'pro' | 'premium';

export interface TierFeatures {
  // Transcription (all tiers use AssemblyAI)
  transcription: true;
  speakerDiarization: true;
  wordTimestamps: true;

  // AI Enhancement Features
  nameExtraction: boolean;
  aiSummary: boolean;
  roleClassification: boolean;
  chapterDetection: boolean;
  keyTakeaways: boolean;
  quotesExtraction: boolean;

  // Display labels
  speakerLabels: 'generic' | 'named' | 'named-with-roles';
}

export interface TierPricing {
  baseTranscriptionPerHour: number;
  estimatedAIProcessingPerHour: number;
  totalPerHour: number;
  totalWithMarkup: number;
  markupPercentage: number;
}

export const TIER_CONFIG: Record<TierLevel, TierFeatures> = {
  basic: {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: false,
    aiSummary: false,
    roleClassification: false,
    chapterDetection: false,
    keyTakeaways: false,
    quotesExtraction: false,
    speakerLabels: 'generic'
  },

  pro: {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: true,
    aiSummary: true,
    roleClassification: false,
    chapterDetection: false,
    keyTakeaways: false,
    quotesExtraction: false,
    speakerLabels: 'named'
  },

  premium: {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: true,
    aiSummary: true,
    roleClassification: true,
    chapterDetection: true,
    keyTakeaways: true,
    quotesExtraction: true,
    speakerLabels: 'named-with-roles'
  }
};

export const TIER_PRICING: Record<TierLevel, TierPricing> = {
  basic: {
    baseTranscriptionPerHour: 0.27, // AssemblyAI Universal
    estimatedAIProcessingPerHour: 0,
    totalPerHour: 0.27,
    totalWithMarkup: 0.39,
    markupPercentage: 45
  },

  pro: {
    baseTranscriptionPerHour: 0.27,
    estimatedAIProcessingPerHour: 0.051, // GPT-5-mini: speaker naming + summary
    totalPerHour: 0.321,
    totalWithMarkup: 0.47,
    markupPercentage: 45
  },

  premium: {
    baseTranscriptionPerHour: 0.27,
    estimatedAIProcessingPerHour: 0.11, // GPT-5: roles/chapters/takeaways/quotes/insights
    totalPerHour: 0.38,
    totalWithMarkup: 0.55,
    markupPercentage: 45
  }
};

/**
 * Get features enabled for a specific tier
 */
export function getTierFeatures(tier: TierLevel): TierFeatures {
  return TIER_CONFIG[tier];
}

/**
 * Get pricing for a specific tier
 */
export function getTierPricing(tier: TierLevel): TierPricing {
  return TIER_PRICING[tier];
}

/**
 * Calculate total cost for audio duration at specific tier
 */
export function calculateTierCost(
  tier: TierLevel,
  audioDurationSeconds: number,
  includeMarkup: boolean = true
): {
  baseCost: number;
  aiProcessingCost: number;
  totalCost: number;
  costWithMarkup: number;
} {
  const pricing = TIER_PRICING[tier];
  const durationHours = audioDurationSeconds / 3600;

  const baseCost = pricing.baseTranscriptionPerHour * durationHours;
  const aiProcessingCost = pricing.estimatedAIProcessingPerHour * durationHours;
  const totalCost = baseCost + aiProcessingCost;
  const costWithMarkup = includeMarkup
    ? totalCost * (1 + pricing.markupPercentage / 100)
    : totalCost;

  return {
    baseCost,
    aiProcessingCost,
    totalCost,
    costWithMarkup
  };
}

/**
 * Validate tier level
 */
export function isValidTier(tier: string): tier is TierLevel {
  return ['basic', 'pro', 'premium'].includes(tier);
}

/**
 * Get tier from environment or default
 */
export function getTierFromEnv(): TierLevel {
  const envTier = process.env.PERFORMANCE_LEVEL?.toLowerCase() || '';
  return isValidTier(envTier) ? envTier : 'basic';
}
