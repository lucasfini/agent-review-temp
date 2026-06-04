import { NextRequest, NextResponse } from 'next/server';
import { getBillingOrganizationContext } from '@/lib/api/billing-org-context';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { getGroupedTransactions } from '@/lib/billing/grouped-transactions';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { organizationId } = await getBillingOrganizationContext(request, user.id);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const { transactions, total, hasMore } = await getGroupedTransactions(user.id, limit, offset, {
      organizationId,
    });

    return NextResponse.json({
      success: true,
      transactions,
      total,
      limit,
      offset,
      hasMore,
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[BILLING API] Error fetching grouped transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grouped transactions' },
      { status: 500 }
    );
  }
}
