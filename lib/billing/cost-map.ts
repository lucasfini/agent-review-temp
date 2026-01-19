/**
 * Cost Map - AI Service Pricing with 35% Margin
 *
 * Enumerates all AI services used in the application with:
 * - Provider rates (raw cost from API providers)
 * - Margin-adjusted prices (with 35% markup)
 * - Unit types and conversion helpers
 *
 * Pricing verified as of January 2025
 * Margin: 35% standard markup on all services
 */

export type UnitType =
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'input_tokens'
  | 'output_tokens'
  | 'tokens'
  | 'requests';

export type Provider =
  | 'assemblyai'
  | 'openai'
  | 'anthropic'
  | 'perplexity'
  | 'local';

export interface ServiceCost {
  serviceKey: string; // Unique identifier for usage_events
  serviceName: string; // Human-readable name
  provider: Provider;
  unitType: UnitType;

  // Provider pricing (raw cost)
  providerRate: number; // Cost per unit from provider
  providerRateDisplay: string; // Human-readable rate (e.g., "$0.27/hour")

  // Margin-adjusted pricing (what we charge)
  marginPercent: number; // Markup percentage (default 35%)
  billedRate: number; // Rate charged to user
  billedRateDisplay: string; // Human-readable billed rate

  // Additional metadata
  notes?: string;
  minimumCharge?: number; // Minimum billable amount
}

/**
 * Complete map of all AI services with provider and billed rates
 */
export const COST_MAP: Record<string, ServiceCost> = {
  // ============================================================================
  // AssemblyAI - Transcription with Built-in Diarization
  // ============================================================================
  assemblyai_transcription: {
    serviceKey: 'assemblyai_transcription',
    serviceName: 'AssemblyAI Transcription',
    provider: 'assemblyai',
    unitType: 'seconds',
    providerRate: 0.000075, // $0.27/hour = $0.000075/second
    providerRateDisplay: '$0.27/hour',
    marginPercent: 35,
    billedRate: 0.00010125, // $0.000075 * 1.35
    billedRateDisplay: '$0.3645/hour',
    notes: 'Universal-1 model. Includes speaker diarization for 95+ languages.',
  },

  // ============================================================================
  // OpenAI - GPT-4o-mini (Name Extraction, Role Classification)
  // ============================================================================
  openai_gpt4o_mini_input: {
    serviceKey: 'openai_gpt4o_mini_input',
    serviceName: 'GPT-4o-mini Input Tokens',
    provider: 'openai',
    unitType: 'input_tokens',
    providerRate: 0.15 / 1_000_000, // $0.15 per 1M tokens
    providerRateDisplay: '$0.15/1M tokens',
    marginPercent: 35,
    billedRate: (0.15 / 1_000_000) * 1.35,
    billedRateDisplay: '$0.2025/1M tokens',
  },

  openai_gpt4o_mini_output: {
    serviceKey: 'openai_gpt4o_mini_output',
    serviceName: 'GPT-4o-mini Output Tokens',
    provider: 'openai',
    unitType: 'output_tokens',
    providerRate: 0.60 / 1_000_000, // $0.60 per 1M tokens
    providerRateDisplay: '$0.60/1M tokens',
    marginPercent: 35,
    billedRate: (0.60 / 1_000_000) * 1.35,
    billedRateDisplay: '$0.81/1M tokens',
  },

  // ============================================================================
  // Anthropic - Claude Sonnet 4.5 (Summary, Chapters, Takeaways, Quotes)
  // ============================================================================
  claude_sonnet_input: {
    serviceKey: 'claude_sonnet_input',
    serviceName: 'Claude Sonnet 4.5 Input Tokens',
    provider: 'anthropic',
    unitType: 'input_tokens',
    providerRate: 3.00 / 1_000_000, // $3 per 1M tokens
    providerRateDisplay: '$3/1M tokens',
    marginPercent: 35,
    billedRate: (3.00 / 1_000_000) * 1.35,
    billedRateDisplay: '$4.05/1M tokens',
  },

  claude_sonnet_output: {
    serviceKey: 'claude_sonnet_output',
    serviceName: 'Claude Sonnet 4.5 Output Tokens',
    provider: 'anthropic',
    unitType: 'output_tokens',
    providerRate: 15.00 / 1_000_000, // $15 per 1M tokens
    providerRateDisplay: '$15/1M tokens',
    marginPercent: 35,
    billedRate: (15.00 / 1_000_000) * 1.35,
    billedRateDisplay: '$20.25/1M tokens',
  },

  // ============================================================================
  // Anthropic - Claude Haiku 4.5 (Insight Extraction)
  // ============================================================================
  claude_haiku_input: {
    serviceKey: 'claude_haiku_input',
    serviceName: 'Claude Haiku 4.5 Input Tokens',
    provider: 'anthropic',
    unitType: 'input_tokens',
    providerRate: 1.00 / 1_000_000, // $1 per 1M tokens
    providerRateDisplay: '$1/1M tokens',
    marginPercent: 35,
    billedRate: (1.00 / 1_000_000) * 1.35,
    billedRateDisplay: '$1.35/1M tokens',
  },

  claude_haiku_output: {
    serviceKey: 'claude_haiku_output',
    serviceName: 'Claude Haiku 4.5 Output Tokens',
    provider: 'anthropic',
    unitType: 'output_tokens',
    providerRate: 5.00 / 1_000_000, // $5 per 1M tokens
    providerRateDisplay: '$5/1M tokens',
    marginPercent: 35,
    billedRate: (5.00 / 1_000_000) * 1.35,
    billedRateDisplay: '$6.75/1M tokens',
  },

  // ============================================================================
  // Perplexity - Sonar Pro (Research Links in Insights)
  // ============================================================================
  perplexity_sonar_input: {
    serviceKey: 'perplexity_sonar_input',
    serviceName: 'Perplexity Sonar Pro Input Tokens',
    provider: 'perplexity',
    unitType: 'input_tokens',
    providerRate: 3.00 / 1_000_000, // $3 per 1M tokens
    providerRateDisplay: '$3/1M tokens',
    marginPercent: 35,
    billedRate: (3.00 / 1_000_000) * 1.35,
    billedRateDisplay: '$4.05/1M tokens',
  },

  perplexity_sonar_output: {
    serviceKey: 'perplexity_sonar_output',
    serviceName: 'Perplexity Sonar Pro Output Tokens',
    provider: 'perplexity',
    unitType: 'output_tokens',
    providerRate: 15.00 / 1_000_000, // $15 per 1M tokens
    providerRateDisplay: '$15/1M tokens',
    marginPercent: 35,
    billedRate: (15.00 / 1_000_000) * 1.35,
    billedRateDisplay: '$20.25/1M tokens',
  },
} as const;

/**
 * Calculate cost for a service given units consumed
 */
export function calculateServiceCost(
  serviceKey: string,
  units: number
): {
  rawCost: number;
  billedCost: number;
  marginPercent: number;
  unitType: UnitType;
  serviceName: string;
} {
  const service = COST_MAP[serviceKey];

  if (!service) {
    throw new Error(`Unknown service key: ${serviceKey}`);
  }

  const rawCost = units * service.providerRate;
  const billedCost = units * service.billedRate;

  return {
    rawCost: Number(rawCost.toFixed(6)),
    billedCost: Number(billedCost.toFixed(6)),
    marginPercent: service.marginPercent,
    unitType: service.unitType,
    serviceName: service.serviceName,
  };
}

/**
 * Calculate combined cost for input + output tokens (for LLMs)
 */
export function calculateTokenCost(
  inputServiceKey: string,
  outputServiceKey: string,
  inputTokens: number,
  outputTokens: number
): {
  rawCost: number;
  billedCost: number;
  breakdown: {
    input: { units: number; rawCost: number; billedCost: number };
    output: { units: number; rawCost: number; billedCost: number };
  };
} {
  const inputCost = calculateServiceCost(inputServiceKey, inputTokens);
  const outputCost = calculateServiceCost(outputServiceKey, outputTokens);

  return {
    rawCost: Number((inputCost.rawCost + outputCost.rawCost).toFixed(6)),
    billedCost: Number((inputCost.billedCost + outputCost.billedCost).toFixed(6)),
    breakdown: {
      input: {
        units: inputTokens,
        rawCost: inputCost.rawCost,
        billedCost: inputCost.billedCost,
      },
      output: {
        units: outputTokens,
        rawCost: outputCost.rawCost,
        billedCost: outputCost.billedCost,
      },
    },
  };
}

/**
 * Convert time units to seconds (for AssemblyAI billing)
 */
export function convertToSeconds(value: number, fromUnit: 'seconds' | 'minutes' | 'hours'): number {
  switch (fromUnit) {
    case 'seconds':
      return value;
    case 'minutes':
      return value * 60;
    case 'hours':
      return value * 3600;
    default:
      throw new Error(`Invalid time unit: ${fromUnit}`);
  }
}

/**
 * Get all services for a specific provider
 */
export function getServicesByProvider(provider: Provider): ServiceCost[] {
  return Object.values(COST_MAP).filter((service) => service.provider === provider);
}

/**
 * Get total margin collected on a cost
 */
export function calculateMarginAmount(rawCost: number, marginPercent: number = 35): number {
  return Number((rawCost * (marginPercent / 100)).toFixed(6));
}

/**
 * Apply margin to get billed cost
 */
export function applyMargin(rawCost: number, marginPercent: number = 35): number {
  return Number((rawCost * (1 + marginPercent / 100)).toFixed(6));
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.001) return '<$0.001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Estimate total cost for a transcription job
 * Used for pre-flight balance checks
 */
export function estimateTranscriptionCost(params: {
  durationSeconds: number;
  tier: 'basic' | 'pro' | 'premium';
  estimatedTranscriptLength?: number; // characters
}): {
  transcription: number;
  aiProcessing: number;
  total: number;
  breakdown: Array<{ service: string; cost: number }>;
} {
  const { durationSeconds, tier, estimatedTranscriptLength } = params;

  // Transcription cost (same for all tiers)
  const transcriptionCost = calculateServiceCost(
    'assemblyai_transcription',
    durationSeconds
  ).billedCost;

  // Estimate AI processing based on tier
  let aiProcessingCost = 0;
  const breakdown: Array<{ service: string; cost: number }> = [
    { service: 'AssemblyAI Transcription', cost: transcriptionCost },
  ];

  // Estimate tokens based on transcript length (rough: 1 token ≈ 4 characters)
  const estimatedTokens = estimatedTranscriptLength
    ? Math.ceil(estimatedTranscriptLength / 4)
    : Math.ceil(durationSeconds * 3); // Fallback: ~3 tokens per second of audio

  if (tier === 'pro' || tier === 'premium') {
    // Name extraction (GPT-4o-mini): ~500-1000 input, ~100 output
    const nameExtraction = calculateTokenCost(
      'openai_gpt4o_mini_input',
      'openai_gpt4o_mini_output',
      estimatedTokens + 500,
      100
    );
    aiProcessingCost += nameExtraction.billedCost;
    breakdown.push({ service: 'Name Extraction', cost: nameExtraction.billedCost });

    // Summary (Claude Sonnet): ~1000 input, ~500 output
    const summary = calculateTokenCost(
      'claude_sonnet_input',
      'claude_sonnet_output',
      estimatedTokens,
      500
    );
    aiProcessingCost += summary.billedCost;
    breakdown.push({ service: 'AI Summary', cost: summary.billedCost });
  }

  if (tier === 'premium') {
    // Role classification (GPT-4o-mini): ~300-500 input, ~50 output
    const roleClassification = calculateTokenCost(
      'openai_gpt4o_mini_input',
      'openai_gpt4o_mini_output',
      500,
      50
    );
    aiProcessingCost += roleClassification.billedCost;
    breakdown.push({ service: 'Role Classification', cost: roleClassification.billedCost });

    // Chapters (Claude Sonnet): ~1000 input, ~400 output
    const chapters = calculateTokenCost(
      'claude_sonnet_input',
      'claude_sonnet_output',
      estimatedTokens,
      400
    );
    aiProcessingCost += chapters.billedCost;
    breakdown.push({ service: 'Chapter Detection', cost: chapters.billedCost });

    // Takeaways (Claude Sonnet): ~1000 input, ~300 output
    const takeaways = calculateTokenCost(
      'claude_sonnet_input',
      'claude_sonnet_output',
      estimatedTokens,
      300
    );
    aiProcessingCost += takeaways.billedCost;
    breakdown.push({ service: 'Key Takeaways', cost: takeaways.billedCost });

    // Quotes (Claude Sonnet): ~1000 input, ~400 output
    const quotes = calculateTokenCost(
      'claude_sonnet_input',
      'claude_sonnet_output',
      estimatedTokens,
      400
    );
    aiProcessingCost += quotes.billedCost;
    breakdown.push({ service: 'Social Quotes', cost: quotes.billedCost });
  }

  const total = transcriptionCost + aiProcessingCost;

  return {
    transcription: Number(transcriptionCost.toFixed(6)),
    aiProcessing: Number(aiProcessingCost.toFixed(6)),
    total: Number(total.toFixed(6)),
    breakdown,
  };
}

/**
 * Get service info for display
 */
export function getServiceInfo(serviceKey: string): ServiceCost | null {
  return COST_MAP[serviceKey] || null;
}

/**
 * Validate service key exists
 */
export function isValidServiceKey(serviceKey: string): boolean {
  return serviceKey in COST_MAP;
}
