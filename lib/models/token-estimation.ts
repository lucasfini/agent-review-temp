// Token estimation and calculation utilities

import { CONTENT_TYPES } from '@/lib/content-types';
import { ModelSpec } from './config';

export interface TokenEstimate {
  analysisTokens: number;
  contentGenerationTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  breakdown: TokenBreakdown[];
}

export interface TokenBreakdown {
  phase: string;
  inputTokens: number;
  outputTokens: number;
  description: string;
  contentTypeId?: string;
  pieces?: number;
}

export interface CompatibilityCheck {
  isCompatible: boolean;
  requiredTokens: number;
  availableTokens: number;
  utilizationPercentage: number;
  warning?: string;
  recommendation?: string;
}

/**
 * Estimate token count for text (rough approximation)
 * Real implementation would use tiktoken or similar
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  // Rough estimation: ~4 characters per token for English text
  // This is a simplification - real token counting varies by model
  const charCount = text.length;
  const estimatedTokens = Math.ceil(charCount / 4);
  
  // Add some buffer for encoding overhead
  return Math.ceil(estimatedTokens * 1.1);
}

/**
 * Calculate precise token requirements for content generation
 */
export function calculateTokenRequirements(
  transcriptionText: string,
  selectedContentTypes: string[]
): TokenEstimate {
  const transcriptionTokens = estimateTokenCount(transcriptionText);
  
  // Phase 1: Content Analysis
  const analysisInputTokens = Math.min(transcriptionTokens, 6000); // Truncate if too long
  const analysisOutputTokens = 2000; // JSON analysis response
  
  // Phase 2: Content Generation
  let generationInputTokens = 0;
  let generationOutputTokens = 0;
  
  const breakdown: TokenBreakdown[] = [
    {
      phase: 'Content Analysis',
      inputTokens: analysisInputTokens,
      outputTokens: analysisOutputTokens,
      description: 'Analyze transcription to extract key topics, quotes, and insights',
      pieces: 1
    }
  ];
  
  // Calculate tokens for each selected content type
  selectedContentTypes.forEach(typeId => {
    const contentType = CONTENT_TYPES.find(ct => ct.id === typeId);
    if (!contentType) return;
    
    // Input tokens: context + analysis data for each piece
    const contextTokens = Math.min(transcriptionTokens * 0.3, 2000); // 30% of transcription or max 2k
    const analysisContextTokens = 500; // Analysis data context
    const inputPerPiece = contextTokens + analysisContextTokens;
    const totalInputForType = inputPerPiece * contentType.count;
    
    // Output tokens: estimated content length
    const outputPerPiece = contentType.estimatedTokens;
    const totalOutputForType = outputPerPiece * contentType.count;
    
    generationInputTokens += totalInputForType;
    generationOutputTokens += totalOutputForType;
    
    breakdown.push({
      phase: `Generate ${contentType.name}`,
      inputTokens: totalInputForType,
      outputTokens: totalOutputForType,
      description: `Generate ${contentType.count} ${contentType.name.toLowerCase()}`,
      contentTypeId: contentType.id,
      pieces: contentType.count
    });
  });
  
  const totalInputTokens = analysisInputTokens + generationInputTokens;
  const totalOutputTokens = analysisOutputTokens + generationOutputTokens;
  const totalTokens = totalInputTokens + totalOutputTokens;
  
  return {
    analysisTokens: analysisInputTokens + analysisOutputTokens,
    contentGenerationTokens: generationInputTokens + generationOutputTokens,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    breakdown
  };
}

/**
 * Check if a model is compatible with the token requirements
 */
export function checkModelCompatibility(
  model: ModelSpec,
  tokenEstimate: TokenEstimate
): CompatibilityCheck {
  const requiredTokens = tokenEstimate.totalTokens;
  const availableTokens = model.contextLength;
  const utilizationPercentage = (requiredTokens / availableTokens) * 100;
  
  let isCompatible = true;
  let warning: string | undefined;
  let recommendation: string | undefined;
  
  if (requiredTokens > availableTokens) {
    isCompatible = false;
    recommendation = `This model cannot handle ${requiredTokens.toLocaleString()} tokens. Try reducing content selection or choose a model with larger context.`;
  } else if (utilizationPercentage > 90) {
    warning = `High token usage (${utilizationPercentage.toFixed(1)}%). Consider a model with more headroom.`;
    recommendation = `While this will work, consider a model with larger context for better reliability.`;
  } else if (utilizationPercentage > 75) {
    warning = `Moderate token usage (${utilizationPercentage.toFixed(1)}%). Should work but close to limit.`;
  }
  
  return {
    isCompatible,
    requiredTokens,
    availableTokens,
    utilizationPercentage,
    warning,
    recommendation
  };
}

/**
 * Find the most cost-effective compatible model
 */
export function findOptimalModel(
  models: ModelSpec[],
  tokenEstimate: TokenEstimate
): { model: ModelSpec; cost: number; reasoning: string } | null {
  const compatibleModels = models
    .map(model => {
      const compatibility = checkModelCompatibility(model, tokenEstimate);
      if (!compatibility.isCompatible) return null;
      
      const cost = calculateModelCost(model, tokenEstimate);
      return { model, cost, compatibility };
    })
    .filter(Boolean)
    .sort((a, b) => a!.cost - b!.cost); // Sort by cost
  
  if (compatibleModels.length === 0) return null;
  
  const optimal = compatibleModels[0]!;
  const reasoning = `Selected ${optimal.model.displayName} as the most cost-effective option at $${optimal.cost.toFixed(4)} for ${tokenEstimate.totalTokens.toLocaleString()} tokens`;
  
  return {
    model: optimal.model,
    cost: optimal.cost,
    reasoning
  };
}

/**
 * Calculate cost for a specific model and token usage
 */
export function calculateModelCost(model: ModelSpec, tokenEstimate: TokenEstimate): number {
  const inputCost = (tokenEstimate.totalInputTokens / 1000) * model.pricing.inputCostPer1kTokens;
  const outputCost = (tokenEstimate.totalOutputTokens / 1000) * model.pricing.outputCostPer1kTokens;
  return inputCost + outputCost;
}

/**
 * Get token usage recommendations
 */
export function getTokenOptimizationSuggestions(
  transcriptionLength: number,
  selectedContentTypes: string[]
): string[] {
  const suggestions: string[] = [];
  
  if (transcriptionLength > 20000) {
    suggestions.push("Consider using a summary or key excerpts instead of the full transcription");
  }
  
  if (selectedContentTypes.length > 5) {
    suggestions.push("Reduce the number of content types to lower token usage");
  }
  
  const hasLargeContent = selectedContentTypes.some(id => 
    ['blog_post', 'newsletter'].includes(id)
  );
  
  if (hasLargeContent) {
    suggestions.push("Blog posts and newsletters use significant tokens - consider generating separately");
  }
  
  return suggestions;
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return `${tokens} tokens`;
  } else if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K tokens`;
  } else {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  }
}

/**
 * Format percentage for display
 */
export function formatPercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}
