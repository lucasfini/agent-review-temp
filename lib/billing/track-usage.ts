/**
 * Usage Tracking Utilities
 *
 * Convenience wrappers for tracking AI service usage and billing credits.
 * Provides simple functions to instrument OpenAI, Anthropic, and other AI calls.
 */

import { calculateServiceCost, calculateTokenCost } from './cost-map';
import { logUsageEvent, debitCredit } from './credit';

// ============================================================================
// OpenAI Usage Tracking
// ============================================================================

export interface OpenAIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Extract usage from OpenAI API response
 */
export function extractOpenAIUsage(response: any): OpenAIUsage {
  const usage = response?.usage;

  return {
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
    totalTokens: usage?.total_tokens || 0,
  };
}

/**
 * Track OpenAI GPT-4o-mini usage (most common model for this app)
 *
 * @param userId - User to bill
 * @param projectId - Project being processed
 * @param response - OpenAI API response object
 * @param metadata - Additional context (model, purpose, etc.)
 * @param shouldDebit - Whether to debit credits immediately (default: true)
 */
export async function trackOpenAIUsage(params: {
  userId: string;
  projectId?: string;
  response: any;
  modelName?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
  shouldDebit?: boolean;
}): Promise<{
  usageEventId: string;
  billedCost: number;
  rawCost: number;
}> {
  const { userId, projectId, response, modelName = 'gpt-4o-mini', purpose, metadata, shouldDebit = true } = params;

  // Extract token usage
  const usage = extractOpenAIUsage(response);

  // Determine service keys based on model
  let inputServiceKey = 'openai_gpt4o_mini_input';
  let outputServiceKey = 'openai_gpt4o_mini_output';

  // Could extend this to support other models in the future
  if (modelName.includes('gpt-4o')) {
    // Already correct
  }

  // Calculate costs
  const costResult = calculateTokenCost(
    inputServiceKey,
    outputServiceKey,
    usage.promptTokens,
    usage.completionTokens
  );

  // Log usage event
  const usageEvent = await logUsageEvent({
    userId,
    projectId,
    serviceKey: inputServiceKey,
    serviceName: `OpenAI ${modelName} Input`,
    provider: 'openai',
    units: usage.promptTokens,
    unitType: 'input_tokens',
    rawCost: costResult.breakdown.input.rawCost,
    marginPercent: 35,
    billedCost: costResult.breakdown.input.billedCost,
    metadata: {
      model: modelName,
      purpose,
      totalTokens: usage.totalTokens,
      ...metadata,
    },
  });

  // Log output tokens separately
  await logUsageEvent({
    userId,
    projectId,
    serviceKey: outputServiceKey,
    serviceName: `OpenAI ${modelName} Output`,
    provider: 'openai',
    units: usage.completionTokens,
    unitType: 'output_tokens',
    rawCost: costResult.breakdown.output.rawCost,
    marginPercent: 35,
    billedCost: costResult.breakdown.output.billedCost,
    metadata: {
      model: modelName,
      purpose,
      totalTokens: usage.totalTokens,
      ...metadata,
    },
  });

  // Debit credits if requested
  if (shouldDebit) {
    await debitCredit(userId, costResult.billedCost, usageEvent.id, {
      reason: `OpenAI ${modelName} - ${purpose || 'API call'}`,
      metadata: {
        projectId,
        model: modelName,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      },
    });
  }

  return {
    usageEventId: usageEvent.id,
    billedCost: costResult.billedCost,
    rawCost: costResult.rawCost,
  };
}

// ============================================================================
// Anthropic (Claude) Usage Tracking
// ============================================================================

export interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Extract usage from Anthropic API response
 */
export function extractAnthropicUsage(response: any): AnthropicUsage {
  const usage = response?.usage;

  return {
    inputTokens: usage?.input_tokens || 0,
    outputTokens: usage?.output_tokens || 0,
  };
}

/**
 * Track Anthropic Claude usage
 *
 * @param userId - User to bill
 * @param projectId - Project being processed
 * @param response - Anthropic API response object
 * @param modelName - Model name (sonnet-4.5, haiku-4.5, etc.)
 * @param metadata - Additional context
 * @param shouldDebit - Whether to debit credits immediately (default: true)
 */
export async function trackAnthropicUsage(params: {
  userId: string;
  projectId?: string;
  response: any;
  modelName: 'sonnet-4.5' | 'haiku-4.5';
  purpose?: string;
  metadata?: Record<string, unknown>;
  shouldDebit?: boolean;
}): Promise<{
  usageEventId: string;
  billedCost: number;
  rawCost: number;
}> {
  const { userId, projectId, response, modelName, purpose, metadata, shouldDebit = true } = params;

  // Extract token usage
  const usage = extractAnthropicUsage(response);

  // Determine service keys
  const isSonnet = modelName.includes('sonnet');
  const inputServiceKey = isSonnet ? 'claude_sonnet_input' : 'claude_haiku_input';
  const outputServiceKey = isSonnet ? 'claude_sonnet_output' : 'claude_haiku_output';

  // Calculate costs
  const costResult = calculateTokenCost(
    inputServiceKey,
    outputServiceKey,
    usage.inputTokens,
    usage.outputTokens
  );

  // Log usage event
  const usageEvent = await logUsageEvent({
    userId,
    projectId,
    serviceKey: inputServiceKey,
    serviceName: `Claude ${modelName} Input`,
    provider: 'anthropic',
    units: usage.inputTokens,
    unitType: 'input_tokens',
    rawCost: costResult.breakdown.input.rawCost,
    marginPercent: 35,
    billedCost: costResult.breakdown.input.billedCost,
    metadata: {
      model: modelName,
      purpose,
      ...metadata,
    },
  });

  // Log output tokens
  await logUsageEvent({
    userId,
    projectId,
    serviceKey: outputServiceKey,
    serviceName: `Claude ${modelName} Output`,
    provider: 'anthropic',
    units: usage.outputTokens,
    unitType: 'output_tokens',
    rawCost: costResult.breakdown.output.rawCost,
    marginPercent: 35,
    billedCost: costResult.breakdown.output.billedCost,
    metadata: {
      model: modelName,
      purpose,
      ...metadata,
    },
  });

  // Debit credits if requested
  if (shouldDebit) {
    await debitCredit(userId, costResult.billedCost, usageEvent.id, {
      reason: `Claude ${modelName} - ${purpose || 'API call'}`,
      metadata: {
        projectId,
        model: modelName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
  }

  return {
    usageEventId: usageEvent.id,
    billedCost: costResult.billedCost,
    rawCost: costResult.rawCost,
  };
}

// ============================================================================
// AssemblyAI Usage Tracking
// ============================================================================

/**
 * Track AssemblyAI transcription usage
 *
 * @param userId - User to bill
 * @param projectId - Project being processed
 * @param durationSeconds - Audio duration in seconds
 * @param metadata - Additional context
 * @param shouldDebit - Whether to debit credits immediately (default: true)
 */
export async function trackAssemblyAIUsage(params: {
  userId: string;
  projectId?: string;
  durationSeconds: number;
  metadata?: Record<string, unknown>;
  shouldDebit?: boolean;
}): Promise<{
  usageEventId: string;
  billedCost: number;
  rawCost: number;
}> {
  const { userId, projectId, durationSeconds, metadata, shouldDebit = true } = params;

  // Calculate costs
  const costResult = calculateServiceCost('assemblyai_transcription', durationSeconds);

  // Log usage event
  const usageEvent = await logUsageEvent({
    userId,
    projectId,
    serviceKey: 'assemblyai_transcription',
    serviceName: 'AssemblyAI Transcription',
    provider: 'assemblyai',
    units: durationSeconds,
    unitType: 'seconds',
    rawCost: costResult.rawCost,
    marginPercent: costResult.marginPercent,
    billedCost: costResult.billedCost,
    metadata: {
      durationMinutes: durationSeconds / 60,
      ...metadata,
    },
  });

  // Debit credits if requested
  if (shouldDebit) {
    await debitCredit(userId, costResult.billedCost, usageEvent.id, {
      reason: `AssemblyAI Transcription - ${(durationSeconds / 60).toFixed(1)} minutes`,
      metadata: {
        projectId,
        durationSeconds,
      },
    });
  }

  return {
    usageEventId: usageEvent.id,
    billedCost: costResult.billedCost,
    rawCost: costResult.rawCost,
  };
}

// ============================================================================
// Batch Tracking (for multiple API calls)
// ============================================================================

/**
 * Track multiple usage events and debit total cost atomically
 *
 * Useful when you make multiple API calls and want to debit once at the end
 */
export async function trackBatchUsage(params: {
  userId: string;
  projectId?: string;
  usageEvents: Array<{
    serviceKey: string;
    serviceName: string;
    provider: string;
    units: number;
    unitType: string;
    rawCost: number;
    billedCost: number;
    metadata?: Record<string, unknown>;
  }>;
  shouldDebit?: boolean;
}): Promise<{
  totalBilledCost: number;
  totalRawCost: number;
  usageEventIds: string[];
}> {
  const { userId, projectId, usageEvents, shouldDebit = true } = params;

  const usageEventIds: string[] = [];
  let totalBilledCost = 0;
  let totalRawCost = 0;

  // Log all usage events
  for (const event of usageEvents) {
    const usageEvent = await logUsageEvent({
      userId,
      projectId,
      serviceKey: event.serviceKey,
      serviceName: event.serviceName,
      provider: event.provider,
      units: event.units,
      unitType: event.unitType,
      rawCost: event.rawCost,
      marginPercent: 35,
      billedCost: event.billedCost,
      metadata: event.metadata,
    });

    usageEventIds.push(usageEvent.id);
    totalBilledCost += event.billedCost;
    totalRawCost += event.rawCost;
  }

  // Debit total cost once
  if (shouldDebit && totalBilledCost > 0) {
    await debitCredit(userId, totalBilledCost, usageEventIds[0], {
      reason: `Batch usage - ${usageEvents.length} services`,
      metadata: {
        projectId,
        eventCount: usageEvents.length,
        usageEventIds,
      },
    });
  }

  return {
    totalBilledCost,
    totalRawCost,
    usageEventIds,
  };
}

// ============================================================================
// Pre-flight Balance Checks
// ============================================================================

/**
 * Check if user has sufficient credits before processing
 * Throws InsufficientCreditError if balance too low
 */
export async function requireSufficientCredit(userId: string, estimatedCost: number): Promise<void> {
  const { checkSufficientCredit, InsufficientCreditError } = await import('./credit');

  const check = await checkSufficientCredit(userId, estimatedCost);

  if (!check.sufficient) {
    throw new InsufficientCreditError(userId, estimatedCost, check.balance);
  }
}
