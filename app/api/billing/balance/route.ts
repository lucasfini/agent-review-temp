/**
 * User Credit Balance API
 * GET /api/billing/balance - Get current user's credit balance
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBillingOrganizationContext } from '@/lib/api/billing-org-context';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { getDisplayBalance } from '@/lib/billing/credit';
import { formatSiteCreditsFromUsd } from '@/lib/billing/display';
import { getOrganizationPlanCreditBalance } from '@/lib/billing/plan-credits';
import { formatProductCredits } from '@/lib/billing/product-credits';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { organizationId } = await getBillingOrganizationContext(request, user.id);

    const [legacyBalance, planCredits] = await Promise.all([
      getDisplayBalance(user.id),
      getOrganizationPlanCreditBalance({
        organizationId,
        userId: user.id,
        ensureGrant: true,
      }),
    ]);

    return NextResponse.json({
      success: true,
      balance: planCredits.available,
      availableBalance: planCredits.available,
      reservedPending: 0,
      formatted: `${formatProductCredits(planCredits.available)} credits`,
      creditUnit: 'plan_credit',
      planSlug: planCredits.subscription?.plan?.slug || null,
      monthlyCreditGrant: planCredits.subscription?.plan?.monthlyCreditGrant || 0,
      creditRolloverMonths: planCredits.subscription?.plan?.creditRolloverMonths || 0,
      topUpEnabled: Boolean(planCredits.subscription?.plan?.topUpEnabled),
      rolloverCredits: planCredits.rollover,
      currentPlanCredits: planCredits.current,
      topUpCredits: planCredits.topUp,
      legacyBalance: legacyBalance.visibleBalance,
      legacyAvailableBalance: legacyBalance.availableBalance,
      legacyReservedPending: legacyBalance.reservedPending,
      legacyFormatted: formatSiteCreditsFromUsd(legacyBalance.visibleBalance),
      lifetimeCreditsAdded: legacyBalance.lifetimeCreditsAdded,
      lifetimeCreditsSpent: legacyBalance.lifetimeCreditsSpent,
      lastUpdated: legacyBalance.updatedAt,
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[BILLING API] Error fetching balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}
