import { NextRequest, NextResponse } from 'next/server';
import { reconcileBillingReservations } from '@/lib/billing/credit';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';

export const runtime = 'nodejs';

async function handleReconcile(request: NextRequest) {
  if (!isAuthorizedMaintenanceRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body.limit);
  const requestedStaleActiveMinutes = Number(body.staleActiveMinutes);
  const requestedStaleSettlingMinutes = Number(body.staleSettlingMinutes);

  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 500)
    : 100;
  const staleActiveMinutes = Number.isFinite(requestedStaleActiveMinutes) && requestedStaleActiveMinutes > 0
    ? Math.min(Math.floor(requestedStaleActiveMinutes), 7 * 24 * 60)
    : 120;
  const staleSettlingMinutes = Number.isFinite(requestedStaleSettlingMinutes) && requestedStaleSettlingMinutes > 0
    ? Math.min(Math.floor(requestedStaleSettlingMinutes), 24 * 60)
    : 15;

  try {
    const result = await reconcileBillingReservations({
      limit,
      staleActiveMinutes,
      staleSettlingMinutes,
    });

    return NextResponse.json({
      success: true,
      limit,
      staleActiveMinutes,
      staleSettlingMinutes,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[BILLING RECONCILER] Route failed:', error);
    return NextResponse.json(
      { error: 'Failed to reconcile billing reservations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleReconcile(request);
}

export async function GET(request: NextRequest) {
  return handleReconcile(request);
}
