/**
 * Cost calculation utilities for pay-as-you-go model
 * Tracks actual processing costs for accurate billing and analytics
 *
 * Pricing verified as of January 2025
 */

export interface CostBreakdown {
  transcription: number;
  diarization: number;
  aiProcessing: number; // Name extraction + role classification
  generation: number;
  total: number;
  totalWithMarkup?: number;
  provider: string;
  details?: {
    audioMinutes?: number;
    inputTokens?: number;
    outputTokens?: number;
    nameExtractionTokens?: {
      input: number;
      output: number;
      cost: number;
    };
    roleClassificationTokens?: {
      input: number;
      output: number;
      cost: number;
    };
  };
}

/**
 * Verified API Pricing (January 2025)
 * Sources listed in COST_ANALYSIS.md
 */
export const PRICING = {
  // Transcription providers
  OPENAI_WHISPER: {
    perMinute: 0.006, // $0.006 per minute (billed per second)
    perSecond: 0.0001, // $0.0001 per second
    name: 'OpenAI Whisper API'
  },
  ASSEMBLYAI_UNIVERSAL: {
    perHour: 0.37, // $0.37 per hour (Universal-3 / slam-1)
    perMinute: 0.006167, // $0.006167 per minute
    perSecond: 0.000102778, // $0.000102778 per second
    speakerDiarization: 0.0, // INCLUDED in base price
    name: 'AssemblyAI Universal-3'
  },

  // AI Processing (OpenAI GPT-4o-mini)
  OPENAI_GPT4O_MINI: {
    inputPerMillionTokens: 0.15, // $0.15 per 1M input tokens
    outputPerMillionTokens: 0.60, // $0.60 per 1M output tokens
    name: 'GPT-4o-mini'
  },

  // Speaker diarization (included in AssemblyAI or local Sortformer)
  SORTFORMER: {
    cost: 0.0, // Free - local processing
    name: 'Sortformer (Local)'
  },

  // AI generation (Claude)
  ANTHROPIC_CLAUDE_SONNET: {
    inputPerMillionTokens: 3.00, // $3 per million input tokens
    outputPerMillionTokens: 15.00, // $15 per million output tokens
    name: 'Claude Sonnet 4.5'
  },

  // Markup percentage (configurable)
  MARKUP_PERCENTAGE: parseFloat(process.env.COST_MARKUP_PERCENTAGE || '35') // Default 35%
} as const;

/**
 * Calculate transcription cost based on actual audio duration
 * Uses per-second pricing for maximum accuracy
 */
export function calculateTranscriptionCost(
  durationSeconds: number,
  provider: 'openai' | 'assemblyai'
): number {
  switch (provider) {
    case 'openai':
      // OpenAI bills per second, rounded up
      return Math.ceil(durationSeconds) * PRICING.OPENAI_WHISPER.perSecond;
    case 'assemblyai':
      // AssemblyAI bills per second
      return durationSeconds * PRICING.ASSEMBLYAI_UNIVERSAL.perSecond;
    default:
      return 0;
  }
}

/**
 * Calculate speaker diarization cost
 * AssemblyAI includes it, Sortformer is free (local)
 */
export function calculateDiarizationCost(
  method: 'sortformer' | 'assemblyai'
): number {
  // All current methods are free (local processing or included)
  return 0;
}

/**
 * Calculate AI processing costs (name extraction + role classification)
 * Uses actual token counts from OpenAI API responses
 */
export function calculateAIProcessingCost(tokenUsage: {
  nameExtraction?: { input: number; output: number };
  roleClassification?: { input: number; output: number };
}): number {
  let totalCost = 0;

  if (tokenUsage.nameExtraction) {
    const inputCost = (tokenUsage.nameExtraction.input / 1_000_000) * PRICING.OPENAI_GPT4O_MINI.inputPerMillionTokens;
    const outputCost = (tokenUsage.nameExtraction.output / 1_000_000) * PRICING.OPENAI_GPT4O_MINI.outputPerMillionTokens;
    totalCost += inputCost + outputCost;
  }

  if (tokenUsage.roleClassification) {
    const inputCost = (tokenUsage.roleClassification.input / 1_000_000) * PRICING.OPENAI_GPT4O_MINI.inputPerMillionTokens;
    const outputCost = (tokenUsage.roleClassification.output / 1_000_000) * PRICING.OPENAI_GPT4O_MINI.outputPerMillionTokens;
    totalCost += inputCost + outputCost;
  }

  return totalCost;
}

/**
 * Calculate AI generation cost based on token usage (Claude)
 */
export function calculateGenerationCost(
  inputTokens: number,
  outputTokens: number
): number {
  const inputCost = (inputTokens / 1_000_000) * PRICING.ANTHROPIC_CLAUDE_SONNET.inputPerMillionTokens;
  const outputCost = (outputTokens / 1_000_000) * PRICING.ANTHROPIC_CLAUDE_SONNET.outputPerMillionTokens;

  return inputCost + outputCost;
}

/**
 * Apply markup percentage to cost
 */
export function applyMarkup(cost: number, markupPercent?: number): number {
  const markup = markupPercent ?? PRICING.MARKUP_PERCENTAGE;
  return cost * (1 + markup / 100);
}

/**
 * Calculate total processing cost with breakdown
 */
export function calculateTotalCost(params: {
  audioSeconds: number;
  transcriptionProvider: 'openai' | 'assemblyai';
  diarizationMethod: 'sortformer' | 'assemblyai';
  aiProcessingTokens?: {
    nameExtraction?: { input: number; output: number };
    roleClassification?: { input: number; output: number };
  };
  generationInputTokens?: number;
  generationOutputTokens?: number;
  applyMarkupPercent?: boolean;
}): CostBreakdown {
  const transcriptionCost = calculateTranscriptionCost(
    params.audioSeconds,
    params.transcriptionProvider
  );

  const diarizationCost = calculateDiarizationCost(params.diarizationMethod);

  const aiProcessingCost = params.aiProcessingTokens
    ? calculateAIProcessingCost(params.aiProcessingTokens)
    : 0;

  const generationCost = params.generationInputTokens && params.generationOutputTokens
    ? calculateGenerationCost(params.generationInputTokens, params.generationOutputTokens)
    : 0;

  const total = transcriptionCost + diarizationCost + aiProcessingCost + generationCost;
  const totalWithMarkup = params.applyMarkupPercent ? applyMarkup(total) : undefined;

  return {
    transcription: Number(transcriptionCost.toFixed(4)),
    diarization: Number(diarizationCost.toFixed(4)),
    aiProcessing: Number(aiProcessingCost.toFixed(4)),
    generation: Number(generationCost.toFixed(4)),
    total: Number(total.toFixed(4)),
    totalWithMarkup: totalWithMarkup ? Number(totalWithMarkup.toFixed(4)) : undefined,
    provider: params.transcriptionProvider === 'openai'
      ? PRICING.OPENAI_WHISPER.name
      : PRICING.ASSEMBLYAI_UNIVERSAL.name,
    details: {
      audioMinutes: Number((params.audioSeconds / 60).toFixed(2)),
      inputTokens: params.generationInputTokens,
      outputTokens: params.generationOutputTokens,
      nameExtractionTokens: params.aiProcessingTokens?.nameExtraction ? {
        input: params.aiProcessingTokens.nameExtraction.input,
        output: params.aiProcessingTokens.nameExtraction.output,
        cost: Number(calculateAIProcessingCost({ nameExtraction: params.aiProcessingTokens.nameExtraction }).toFixed(6))
      } : undefined,
      roleClassificationTokens: params.aiProcessingTokens?.roleClassification ? {
        input: params.aiProcessingTokens.roleClassification.input,
        output: params.aiProcessingTokens.roleClassification.output,
        cost: Number(calculateAIProcessingCost({ roleClassification: params.aiProcessingTokens.roleClassification }).toFixed(6))
      } : undefined
    }
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

/**
 * Estimate cost before processing (for UI display)
 */
export function estimateCost(
  audioSeconds: number,
  performanceLevel: 'standard' | 'pro' | 'basic' | 'premium'
): number {
  const minutes = audioSeconds / 60;

  switch (performanceLevel) {
    case 'standard':
    case 'basic':
      // AssemblyAI transcription + diarization (numbered speakers)
      return minutes * PRICING.ASSEMBLYAI_UNIVERSAL.perMinute;

    case 'pro':
    case 'premium':
      // AssemblyAI + full AI enhancement (names, roles, chapters, takeaways, quotes)
      const premiumTranscription = minutes * PRICING.ASSEMBLYAI_UNIVERSAL.perMinute;
      const premiumGeneration = 0.20; // Full AI processing
      return premiumTranscription + premiumGeneration;

    default:
      return 0;
  }
}

/**
 * Get cost breakdown as JSON for database storage
 */
export function getCostBreakdownJSON(breakdown: CostBreakdown): object {
  return {
    transcription: breakdown.transcription,
    diarization: breakdown.diarization,
    aiProcessing: breakdown.aiProcessing,
    generation: breakdown.generation,
    provider: breakdown.provider,
    details: breakdown.details
  };
}

/**
 * Calculate cost per minute for analytics
 */
export function calculateCostPerMinute(
  totalCost: number,
  durationSeconds: number
): number {
  const minutes = durationSeconds / 60;
  if (minutes === 0) return 0;
  return Number((totalCost / minutes).toFixed(4));
}
