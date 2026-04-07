/**
 * Usage Tracking Utilities
 *
 * Convenience wrappers for tracking AI service usage and billing credits.
 * Provides simple functions to instrument OpenAI (gpt-5, gpt-5-mini, gpt-5-nano, gpt-4o, gpt-4o-mini) and AssemblyAI calls.
 */

import { calculateServiceCost, calculateTokenCost } from './cost-map';
import { logUsageEvent, debitCredit } from './credit';

// ============================================================================
// OpenAI Usage Tracking
// ============================================================================

export interface OpenAIUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  uncachedTokens: number;
  totalTokens: number;
}

/**
 * Extract usage from OpenAI API response
 * Handles cached input tokens from prompt_tokens_details
 */
export function extractOpenAIUsage(response: any): OpenAIUsage {
  const usage = response?.usage;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens || 0;

  return {
    promptTokens,
    completionTokens,
    cachedTokens,
    uncachedTokens: promptTokens - cachedTokens,
    totalTokens: usage?.total_tokens || 0,
  };
}

/**
 * Map a model name to the correct cost-map service keys.
 * More-specific checks (gpt-5-nano, gpt-5-mini) must come before the
 * catch-all (gpt-5) because all three strings contain "gpt-5".
 */
function getOpenAIServiceKeys(modelName: string): { input: string; output: string } {
  if (modelName.includes('gpt-5-nano')) return { input: 'openai_gpt5_nano_input', output: 'openai_gpt5_nano_output' };
  if (modelName.includes('gpt-5-mini')) return { input: 'openai_gpt5_mini_input', output: 'openai_gpt5_mini_output' };
  if (modelName.includes('gpt-5'))      return { input: 'openai_gpt5_input',      output: 'openai_gpt5_output' };
  if (modelName.includes('gpt-4o-mini')) return { input: 'openai_gpt4o_mini_input', output: 'openai_gpt4o_mini_output' };
  if (modelName.includes('gpt-4o'))      return { input: 'openai_gpt4o_input',      output: 'openai_gpt4o_output' };
  // Fallback: cheapest known rate to avoid over-billing
  return { input: 'openai_gpt4o_mini_input', output: 'openai_gpt4o_mini_output' };
}

/**
 * Track OpenAI usage with correct per-model pricing
 *
 * Supports gpt-5, gpt-5-mini, gpt-5-nano, gpt-4o, and gpt-4o-mini with separate rates.
 * Handles cached input tokens at 50% discount.
 *
 * @param userId - User to bill
 * @param projectId - Project being processed
 * @param response - OpenAI API response object
 * @param modelName - Model name (gpt-5, gpt-5-mini, gpt-5-nano, gpt-4o, gpt-4o-mini, etc.)
 * @param purpose - Description for audit trail
 * @param metadata - Additional context
 * @param shouldDebit - Whether to debit credits immediately (default: true)
 */
export async function trackOpenAIUsage(params: {
  userId: string;
  projectId?: string;
  reservationId?: string;
  response: any;
  modelName?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
  shouldDebit?: boolean;
  strictBilling?: boolean;
}): Promise<{
  usageEventId: string;
  billedCost: number;
  rawCost: number;
}> {
  const {
    userId,
    projectId,
    reservationId,
    response,
    modelName = 'gpt-4o-mini',
    purpose,
    metadata,
    shouldDebit = reservationId ? false : true,
    strictBilling = false,
  } = params;

  // Extract token usage (including cached tokens)
  const usage = extractOpenAIUsage(response);

  // Determine service keys based on model
  const { input: inputServiceKey, output: outputServiceKey } = getOpenAIServiceKeys(modelName);
  // Cached input tokens use the same rate key (50% discount applied in calculateServiceCost)
  const cachedInputServiceKey = inputServiceKey;

  // Calculate costs for uncached input, cached input, and output separately
  const uncachedInputCost = calculateServiceCost(inputServiceKey, usage.uncachedTokens);
  const cachedInputCost = usage.cachedTokens > 0
    ? calculateServiceCost(cachedInputServiceKey, usage.cachedTokens)
    : { rawCost: 0, billedCost: 0 };
  const outputCost = calculateServiceCost(outputServiceKey, usage.completionTokens);

  const totalRawCost = Number((uncachedInputCost.rawCost + cachedInputCost.rawCost + outputCost.rawCost).toFixed(6));
  const totalBilledCost = Number((uncachedInputCost.billedCost + cachedInputCost.billedCost + outputCost.billedCost).toFixed(6));

  // Log combined usage event (single event per API call for cleaner history)
  let usageEventId = '';

  try {
    const usageEvent = await logUsageEvent({
      userId,
      projectId,
      reservationId,
      serviceKey: inputServiceKey,
      serviceName: `OpenAI ${modelName}`,
      provider: 'openai',
      units: usage.promptTokens + usage.completionTokens,
      unitType: 'tokens',
      rawCost: totalRawCost,
      marginPercent: 45,
      billedCost: totalBilledCost,
      metadata: {
        model: modelName,
        purpose,
        inputTokens: usage.promptTokens,
        cachedTokens: usage.cachedTokens,
        uncachedTokens: usage.uncachedTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        ...metadata,
      },
      status: reservationId ? 'pending' : 'completed',
      workflowStep: purpose,
    });
    usageEventId = usageEvent.id;
  } catch (error) {
    if (strictBilling) throw error;
    console.error('[BILLING] Failed to log OpenAI usage event, continuing:', error);
  }

  if (shouldDebit) {
    try {
      await debitCredit(userId, totalBilledCost, usageEventId || undefined, {
        reason: `OpenAI ${modelName} - ${purpose || 'API call'}`,
        metadata: {
          projectId,
          model: modelName,
          inputTokens: usage.promptTokens,
          cachedTokens: usage.cachedTokens,
          outputTokens: usage.completionTokens,
        },
      });
    } catch (error) {
      if (strictBilling) throw error;
      console.error('[BILLING] Failed to debit OpenAI usage, continuing:', error);
    }
  }

  return {
    usageEventId,
    billedCost: totalBilledCost,
    rawCost: totalRawCost,
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
  reservationId?: string;
  response: any;
  modelName: 'sonnet-4.5' | 'haiku-4.5';
  purpose?: string;
  metadata?: Record<string, unknown>;
  shouldDebit?: boolean;
  strictBilling?: boolean;
}): Promise<{
  usageEventId: string;
  billedCost: number;
  rawCost: number;
}> {
  const { userId, projectId, reservationId, response, modelName, purpose, metadata, shouldDebit = reservationId ? false : true, strictBilling = false } = params;

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
  let usageEventId = '';

  try {
    const usageEvent = await logUsageEvent({
      userId,
      projectId,
      reservationId,
      serviceKey: inputServiceKey,
      serviceName: `Claude ${modelName} Input`,
      provider: 'anthropic',
      units: usage.inputTokens,
      unitType: 'input_tokens',
      rawCost: costResult.breakdown.input.rawCost,
      marginPercent: 45,
      billedCost: costResult.breakdown.input.billedCost,
      metadata: {
        model: modelName,
        purpose,
        ...metadata,
      },
      status: reservationId ? 'pending' : 'completed',
      workflowStep: purpose,
    });
    usageEventId = usageEvent.id;

    await logUsageEvent({
      userId,
      projectId,
      reservationId,
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
      status: reservationId ? 'pending' : 'completed',
      workflowStep: purpose,
    });
  } catch (error) {
    if (strictBilling) throw error;
    console.error('[BILLING] Failed to log Anthropic usage event, continuing:', error);
  }

  if (shouldDebit) {
    try {
      await debitCredit(userId, costResult.billedCost, usageEventId || undefined, {
        reason: `Claude ${modelName} - ${purpose || 'API call'}`,
        metadata: {
          projectId,
          model: modelName,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
    } catch (error) {
      if (strictBilling) throw error;
      console.error('[BILLING] Failed to debit Anthropic usage, continuing:', error);
    }
  }

  return {
    usageEventId,
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
  reservationId?: string;
  durationSeconds: number;
  metadata?: Record<string, unknown>;
  shouldDebit?: boolean;
  strictBilling?: boolean;
}): Promise<{
  usageEventId: string;
  billedCost: number;
  rawCost: number;
}> {
  const { userId, projectId, reservationId, durationSeconds, metadata, shouldDebit = reservationId ? false : true, strictBilling = false } = params;

  // Calculate costs
  const costResult = calculateServiceCost('assemblyai_transcription', durationSeconds);

  // Log usage event
  let usageEventId = '';

  try {
    const usageEvent = await logUsageEvent({
      userId,
      projectId,
      reservationId,
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
      status: reservationId ? 'pending' : 'completed',
      workflowStep: 'Transcription',
    });
    usageEventId = usageEvent.id;
  } catch (error) {
    if (strictBilling) throw error;
    console.error('[BILLING] Failed to log AssemblyAI usage event, continuing:', error);
  }

  if (shouldDebit) {
    try {
      await debitCredit(userId, costResult.billedCost, usageEventId || undefined, {
        reason: `AssemblyAI Transcription - ${(durationSeconds / 60).toFixed(1)} minutes`,
        metadata: {
          projectId,
          durationSeconds,
        },
      });
    } catch (error) {
      if (strictBilling) throw error;
      console.error('[BILLING] Failed to debit AssemblyAI usage, continuing:', error);
    }
  }

  return {
    usageEventId,
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
  strictBilling?: boolean;
  reservationId?: string;
}): Promise<{
  totalBilledCost: number;
  totalRawCost: number;
  usageEventIds: string[];
}> {
  const { userId, projectId, usageEvents, shouldDebit = params.reservationId ? false : true, strictBilling = false, reservationId } = params;

  const usageEventIds: string[] = [];
  let totalBilledCost = 0;
  let totalRawCost = 0;

  // Log all usage events
  for (const event of usageEvents) {
    try {
      const usageEvent = await logUsageEvent({
        userId,
        projectId,
        reservationId,
        serviceKey: event.serviceKey,
        serviceName: event.serviceName,
        provider: event.provider,
        units: event.units,
        unitType: event.unitType,
        rawCost: event.rawCost,
        marginPercent: 45,
        billedCost: event.billedCost,
        metadata: event.metadata,
        status: reservationId ? 'pending' : 'completed',
      });

      usageEventIds.push(usageEvent.id);
    } catch (error) {
      if (strictBilling) throw error;
      console.error('[BILLING] Failed to log batch usage event, continuing:', error);
    }
    totalBilledCost += event.billedCost;
    totalRawCost += event.rawCost;
  }

  if (shouldDebit && totalBilledCost > 0) {
    try {
      await debitCredit(userId, totalBilledCost, usageEventIds[0], {
        reason: `Batch usage - ${usageEvents.length} services`,
        metadata: {
          projectId,
          eventCount: usageEvents.length,
          usageEventIds,
        },
      });
    } catch (error) {
      if (strictBilling) throw error;
      console.error('[BILLING] Failed to debit batch usage, continuing:', error);
    }
  }

  return {
    totalBilledCost,
    totalRawCost,
    usageEventIds,
  };
}

// ============================================================================
// Idempotency Helpers
// ============================================================================

/**
 * Check if a reconcile task has already been completed for a project+feature.
 * Looks for a usage_events record where metadata.reconcileTaskKey matches.
 * Returns true if already billed/completed (skip billing on retry).
 */
export async function checkIdempotentUsage(
  projectId: string,
  featureName: string
): Promise<boolean> {
  const { supabaseAdmin } = await import('@/lib/supabase/server');
  const taskKey = `${projectId}_${featureName}`;
  const { data } = await (supabaseAdmin as any)
    .from('usage_events')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .eq('metadata->>reconcileTaskKey', taskKey)
    .limit(1)
    .maybeSingle();
  return !!data;
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
