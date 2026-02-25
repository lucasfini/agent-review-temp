// Cost estimation utility for content generation

import { CONTENT_TYPES, type ContentType } from '@/lib/content-types';
import { calculateTokenRequirements, type TokenEstimate } from '@/lib/models/token-estimation';
import { getModelById, MODEL_SPECS, type ModelSpec } from '@/lib/models/config';

export { CONTENT_TYPES };
export type { ContentType };

export interface CostBreakdownEntry {
  type: string;
  contentTypeId?: string;
  pieces: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface CostEstimate {
  modelId: string;
  modelName: string;
  totalPieces: number;
  totalTokens: number;
  totalCost: number;
  breakdown: CostBreakdownEntry[];
  tokenEstimate: TokenEstimate | null;
}

export interface CostEstimateOptions {
  modelId?: string;
  tokenEstimate?: TokenEstimate | null;
}

const DEFAULT_MODEL_ID = 'gpt-5-mini';

const getDefaultModel = (): ModelSpec => {
  const fallback = getModelById(DEFAULT_MODEL_ID);
  return fallback || MODEL_SPECS[0];
};

const formatBreakdownEntry = (
  entry: TokenEstimate['breakdown'][number],
  model: ModelSpec
): CostBreakdownEntry => {
  const cost =
    ((entry.inputTokens / 1000) * model.pricing.inputCostPer1kTokens) +
    ((entry.outputTokens / 1000) * model.pricing.outputCostPer1kTokens);

  return {
    type: entry.phase,
    contentTypeId: entry.contentTypeId,
    pieces: entry.pieces || 1,
    tokens: Math.round(entry.inputTokens + entry.outputTokens),
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cost: Math.round(cost * 100) / 100
  };
};

/**
 * Calculate cost estimate based on selected content types and model pricing
 */
export function calculateCostEstimate(
  selectedTypes: string[],
  transcriptionText: string,
  options: CostEstimateOptions = {}
): CostEstimate {
  const model = options.modelId ? (getModelById(options.modelId) || getDefaultModel()) : getDefaultModel();

  if (!selectedTypes.length || !transcriptionText) {
    return {
      modelId: model.id,
      modelName: model.displayName,
      totalPieces: 0,
      totalTokens: 0,
      totalCost: 0,
      breakdown: [],
      tokenEstimate: null
    };
  }

  const tokenEstimate =
    options.tokenEstimate ||
    calculateTokenRequirements(transcriptionText, selectedTypes);

  const breakdown = tokenEstimate.breakdown.map(entry =>
    formatBreakdownEntry(entry, model)
  );

  const totalCost = breakdown.reduce((sum, entry) => sum + entry.cost, 0);

  const totalPieces = selectedTypes.reduce((sum, typeId) => {
    const contentType = getContentType(typeId);
    return sum + (contentType?.count || 0);
  }, 0);

  return {
    modelId: model.id,
    modelName: model.displayName,
    totalPieces,
    totalTokens: Math.round(tokenEstimate.totalTokens),
    totalCost: Math.round(totalCost * 100) / 100,
    breakdown,
    tokenEstimate
  };
}

/**
 * Get content type by ID
 */
export function getContentType(id: string): ContentType | undefined {
  return CONTENT_TYPES.find(type => type.id === id);
}

/**
 * Get all content types for a specific platform
 */
export function getContentTypesByPlatform(platform: string): ContentType[] {
  return CONTENT_TYPES.filter(type => type.platform === platform);
}

/**
 * Calculate total if all content types are selected
 */
export function getMaxCostEstimate(
  transcriptionText: string = '',
  options?: CostEstimateOptions
): CostEstimate {
  const allTypeIds = CONTENT_TYPES.map(type => type.id);
  return calculateCostEstimate(allTypeIds, transcriptionText, options);
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K tokens`;
  return `${(tokens / 1000000).toFixed(1)}M tokens`;
}
