/**
 * Billing Middleware and Error Handling
 *
 * Provides utilities for:
 * - Checking credits before expensive operations
 * - Standardized error responses for billing issues
 * - API route wrappers with built-in billing checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBalance, checkSufficientCredit, InsufficientCreditError } from './credit';
import { formatSiteCreditsFromUsd } from './display';
import { InsufficientPlanCreditsError, PlanUploadLimitError } from './plan-credits';
import { formatProductCredits } from './product-credits';
import { buildPlanUploadLimitMessage, getUploadLimitUpgradeTarget } from './plan-upload-limits';

// ============================================================================
// Error Response Formatting
// ============================================================================

/**
 * Standardized error response for billing failures
 */
export function billingErrorResponse(error: unknown): NextResponse {
  if (error instanceof PlanUploadLimitError) {
    const upgradePlanSlug = getUploadLimitUpgradeTarget(error.planSlug);
    return NextResponse.json(
      {
        error: 'Upload exceeds plan limit',
        code: 'PLAN_UPLOAD_LIMIT_EXCEEDED',
        requestedMinutes: error.requestedMinutes,
        requestedSeconds: error.requestedSeconds,
        maxUploadMinutes: error.maxUploadMinutes,
        planSlug: error.planSlug,
        upgradePlanSlug,
        upgradeRequired: true,
        message: buildPlanUploadLimitMessage({
          requestedSeconds: error.requestedSeconds,
          planSlug: error.planSlug,
          maxUploadMinutes: error.maxUploadMinutes,
        }),
      },
      { status: 402 }
    );
  }

  if (error instanceof InsufficientPlanCreditsError) {
    const shortfall = Math.max(0, error.required - error.available);
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        code: 'INSUFFICIENT_PLAN_CREDITS',
        required: error.required,
        available: error.available,
        shortfall,
        planSlug: error.planSlug,
        topUpsEnabled: error.topUpsEnabled,
        topUpPath: error.topUpsEnabled ? '/dashboard/billing' : null,
        upgradeRequired: error.upgradeRequired,
        message: error.topUpsEnabled
          ? `This recording requires about ${formatProductCredits(error.required)} credits. You have ${formatProductCredits(error.available)} credits available.`
          : `This recording requires about ${formatProductCredits(error.required)} credits. You have ${formatProductCredits(error.available)} credits available.`,
      },
      { status: 402 }
    );
  }

  // Insufficient credits - 402 Payment Required
  if (error instanceof InsufficientCreditError) {
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        code: 'INSUFFICIENT_CREDITS',
        required: error.required,
        available: error.available,
        shortfall: error.required - error.available,
        message: `You need ${formatSiteCreditsFromUsd(error.required)} but only have ${formatSiteCreditsFromUsd(error.available)}. Please add ${formatSiteCreditsFromUsd(error.required - error.available)}.`,
      },
      { status: 402 }
    );
  }

  // Generic billing error - 500 Internal Server Error
  if (error instanceof Error) {
    console.error('[BILLING] Unexpected billing error:', error);
    return NextResponse.json(
      {
        error: 'Billing system error',
        code: 'BILLING_ERROR',
        message: 'An error occurred while processing billing. Please try again.',
      },
      { status: 500 }
    );
  }

  // Unknown error
  return NextResponse.json(
    {
      error: 'Unknown billing error',
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred.',
    },
    { status: 500 }
  );
}

// ============================================================================
// Pre-flight Balance Checks
// ============================================================================

/**
 * Check if user has sufficient credits before processing
 *
 * @throws InsufficientCreditError if balance too low
 */
export async function requireCredits(userId: string, estimatedCost: number): Promise<void> {
  const check = await checkSufficientCredit(userId, estimatedCost);

  if (!check.sufficient) {
    throw new InsufficientCreditError(userId, estimatedCost, check.balance);
  }
}

/**
 * Get user balance with formatted display
 */
export async function getUserBalance(userId: string): Promise<{
  balance: number;
  formatted: string;
  lifetimeAdded: number;
  lifetimeSpent: number;
}> {
  const balanceInfo = await getBalance(userId);

  return {
    balance: balanceInfo.balance,
    formatted: formatSiteCreditsFromUsd(balanceInfo.balance),
    lifetimeAdded: balanceInfo.lifetimeCreditsAdded,
    lifetimeSpent: balanceInfo.lifetimeCreditsSpent,
  };
}

// ============================================================================
// API Route Wrappers
// ============================================================================

type APIHandler = (request: NextRequest, context?: any) => Promise<NextResponse>;

export interface BillingCheckOptions {
  /** Estimated cost for this operation (triggers pre-flight check) */
  estimatedCost?: number;

  /** User ID (will be extracted from project if not provided) */
  userId?: string;

  /** Project ID (used to fetch user_id if userId not provided) */
  projectId?: string;

  /** Whether to skip billing checks (e.g., for free-tier features) */
  skipBilling?: boolean;
}

/**
 * Wrap an API route handler with billing checks
 *
 * Usage:
 * ```ts
 * export const POST = withBillingCheck(async (request) => {
 *   // Your handler code
 * }, { estimatedCost: 0.50 });
 * ```
 */
export function withBillingCheck(
  handler: APIHandler,
  options: BillingCheckOptions = {}
): APIHandler {
  return async (request: NextRequest, context?: any) => {
    try {
      // Skip billing checks if requested
      if (options.skipBilling) {
        return await handler(request, context);
      }

      // Get userId from options or extract from request
      let userId = options.userId;

      if (!userId && options.projectId) {
        // Fetch userId from project (would need supabase client)
        // This is a placeholder - implement based on your needs
        console.warn('[BILLING] projectId provided but userId extraction not implemented');
      }

      // Pre-flight credit check if estimatedCost provided
      if (options.estimatedCost && userId) {
        await requireCredits(userId, options.estimatedCost);
        console.log(`[BILLING] ✅ User ${userId} has sufficient credits for $${options.estimatedCost.toFixed(4)}`);
      }

      // Call the wrapped handler
      return await handler(request, context);
    } catch (error) {
      // Handle billing errors with standardized responses
      if (error instanceof InsufficientCreditError) {
        return billingErrorResponse(error);
      }

      // Re-throw non-billing errors
      throw error;
    }
  };
}

// ============================================================================
// Billing Status Helpers
// ============================================================================

/**
 * Get billing status for a user
 */
export async function getBillingStatus(userId: string): Promise<{
  hasCredits: boolean;
  balance: number;
  formatted: string;
  canProcess: boolean;
  minimumRequired: number;
}> {
  const balance = await getBalance(userId);
  const minimumRequired = 0.01; // $0.01 minimum to process anything

  return {
    hasCredits: balance.balance > 0,
    balance: balance.balance,
    formatted: formatSiteCreditsFromUsd(balance.balance),
    canProcess: balance.balance >= minimumRequired,
    minimumRequired,
  };
}

/**
 * Check if user can afford an operation
 */
export async function canAfford(userId: string, estimatedCost: number): Promise<boolean> {
  const check = await checkSufficientCredit(userId, estimatedCost);
  return check.sufficient;
}

// ============================================================================
// Error Messages
// ============================================================================

export const BILLING_MESSAGES = {
  INSUFFICIENT_CREDITS: 'You do not have enough credits to complete this operation.',
  ADD_CREDITS: 'Please add credits to your account to continue.',
  BILLING_ERROR: 'An error occurred while processing your payment.',
  CONTACT_SUPPORT: 'If this problem persists, please contact support.',
  MINIMUM_PURCHASE: 'Minimum credit purchase is $5.00.',
} as const;

/**
 * Generate user-friendly billing error message
 */
export function getBillingErrorMessage(error: unknown): string {
  if (error instanceof InsufficientCreditError) {
    const shortfall = error.required - error.available;
    return `${BILLING_MESSAGES.INSUFFICIENT_CREDITS} You need an additional ${formatSiteCreditsFromUsd(shortfall)}. ${BILLING_MESSAGES.ADD_CREDITS}`;
  }

  return BILLING_MESSAGES.BILLING_ERROR;
}
