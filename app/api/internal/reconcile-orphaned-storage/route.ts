import { NextRequest, NextResponse } from 'next/server';

import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { reconcileOrphanedStorage } from '@/lib/storage-lifecycle';

export const runtime = 'nodejs';

async function handleRequest(request: NextRequest) {
  if (!isAuthorizedMaintenanceRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 500)
    : 100;

  try {
    const result = await reconcileOrphanedStorage({ limit });
    return NextResponse.json({
      success: true,
      limit,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[STORAGE RECONCILE] Failed:', error);
    return NextResponse.json({ error: 'Failed to reconcile orphaned storage' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
