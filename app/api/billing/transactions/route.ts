/**
 * Credit Transactions API
 * GET /api/billing/transactions - Get user's credit transaction history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBillingOrganizationContext } from '@/lib/api/billing-org-context';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { getTransactionHistory } from '@/lib/billing/credit';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { organizationId } = await getBillingOrganizationContext(request, user.id);

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const transactionType = searchParams.get('type') as
      | 'purchase'
      | 'bonus'
      | 'refund'
      | 'debit'
      | 'admin_adjustment'
      | null;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    // Get transaction history
    const history = await getTransactionHistory(user.id, {
      organizationId,
      transactionType: transactionType || undefined,
      limit,
      offset,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      transactions: history.transactions,
      total: history.total,
      limit,
      offset,
      hasMore: offset + limit < history.total,
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[BILLING API] Error fetching transaction history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction history' },
      { status: 500 }
    );
  }
}
