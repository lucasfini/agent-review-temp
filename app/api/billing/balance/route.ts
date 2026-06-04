/**
 * User Credit Balance API
 * GET /api/billing/balance - Get current user's credit balance
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBillingOrganizationContext } from '@/lib/api/billing-org-context';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { getDisplayBalance } from '@/lib/billing/credit';
import { formatSiteCreditsFromUsd } from '@/lib/billing/display';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    await getBillingOrganizationContext(request, user.id);

    // Credit balance is still user-account scoped until account_credits has organization_id.
    const balance = await getDisplayBalance(user.id);

    return NextResponse.json({
      success: true,
      balance: balance.visibleBalance,
      availableBalance: balance.availableBalance,
      reservedPending: balance.reservedPending,
      formatted: formatSiteCreditsFromUsd(balance.visibleBalance),
      lifetimeCreditsAdded: balance.lifetimeCreditsAdded,
      lifetimeCreditsSpent: balance.lifetimeCreditsSpent,
      lastUpdated: balance.updatedAt,
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
