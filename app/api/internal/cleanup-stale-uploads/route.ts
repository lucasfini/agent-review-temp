import { NextRequest, NextResponse } from 'next/server';
import { cleanupStaleUploads, STALE_UPLOAD_HOURS } from '@/lib/upload-cleanup';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';

export const runtime = 'nodejs';

async function handleCleanup(request: NextRequest) {
  if (!isAuthorizedMaintenanceRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body.limit);
  const requestedOlderThanHours = Number(body.olderThanHours);

  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 200)
    : 50;
  const olderThanHours = Number.isFinite(requestedOlderThanHours) && requestedOlderThanHours > 0
    ? Math.min(requestedOlderThanHours, 168)
    : STALE_UPLOAD_HOURS;

  try {
    const result = await cleanupStaleUploads(limit, olderThanHours);
    return NextResponse.json({
      success: true,
      olderThanHours,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[UPLOAD CLEANUP] Cleanup route failed:', error);
    return NextResponse.json({
      error: 'Failed to clean up stale uploads',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleCleanup(request);
}

export async function GET(request: NextRequest) {
  return handleCleanup(request);
}
