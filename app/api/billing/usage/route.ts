/**
 * Usage History API
 * GET /api/billing/usage - Get user's usage history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBillingOrganizationContext } from '@/lib/api/billing-org-context';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { getUsageHistory } from '@/lib/billing/credit';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { organizationId } = await getBillingOrganizationContext(request, user.id);

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const serviceKey = searchParams.get('serviceKey');
    const provider = searchParams.get('provider');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    // Get usage history
    const history = await getUsageHistory(user.id, {
      organizationId,
      projectId: projectId || undefined,
      serviceKey: serviceKey || undefined,
      provider: provider || undefined,
      limit,
      offset,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      events: history.events,
      total: history.total,
      limit,
      offset,
      hasMore: offset + limit < history.total,
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[BILLING API] Error fetching usage history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage history' },
      { status: 500 }
    );
  }
}
