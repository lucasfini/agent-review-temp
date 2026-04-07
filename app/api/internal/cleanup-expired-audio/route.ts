import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredAudio } from '@/lib/audio-retention';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';

export const runtime = 'nodejs';

async function handleCleanup(request: NextRequest) {
  if (!isAuthorizedMaintenanceRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.floor(requestedLimit), 200)
    : 50;

  try {
    const result = await cleanupExpiredAudio(limit);
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AUDIO RETENTION] Cleanup route failed:', error);
    return NextResponse.json({
      error: 'Failed to clean up expired audio',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleCleanup(request);
}
