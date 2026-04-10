import { NextRequest, NextResponse } from 'next/server';

import { logAdminAuditEvent } from '@/lib/admin/audit';
import { AdminAuthError, requireAdmin } from '@/lib/admin/require-admin';
import { cleanupExpiredAudio } from '@/lib/audio-retention';
import { reconcileBillingReservations } from '@/lib/billing/credit';
import { reconcileOrphanedStorage } from '@/lib/storage-lifecycle';
import { cleanupStaleUploads } from '@/lib/upload-cleanup';

export const runtime = 'nodejs';

const JOBS = {
  cleanup_stale_uploads: async (payload: Record<string, unknown>) => {
    const limit = Math.min(Math.max(Number(payload.limit || 50), 1), 200);
    const olderThanHours = Math.min(Math.max(Number(payload.olderThanHours || 6), 1), 168);
    return {
      params: { limit, olderThanHours },
      result: await cleanupStaleUploads(limit, olderThanHours),
    };
  },
  cleanup_expired_audio: async (payload: Record<string, unknown>) => {
    const limit = Math.min(Math.max(Number(payload.limit || 50), 1), 200);
    return {
      params: { limit },
      result: await cleanupExpiredAudio(limit),
    };
  },
  reconcile_orphaned_storage: async (payload: Record<string, unknown>) => {
    const limit = Math.min(Math.max(Number(payload.limit || 100), 1), 500);
    return {
      params: { limit },
      result: await reconcileOrphanedStorage({ limit }),
    };
  },
  reconcile_billing_reservations: async (payload: Record<string, unknown>) => {
    const limit = Math.min(Math.max(Number(payload.limit || 100), 1), 500);
    const staleActiveMinutes = Math.min(Math.max(Number(payload.staleActiveMinutes || 120), 1), 10080);
    const staleSettlingMinutes = Math.min(Math.max(Number(payload.staleSettlingMinutes || 15), 1), 1440);
    return {
      params: { limit, staleActiveMinutes, staleSettlingMinutes },
      result: await reconcileBillingReservations({
        limit,
        staleActiveMinutes,
        staleSettlingMinutes,
      }),
    };
  },
} satisfies Record<string, (payload: Record<string, unknown>) => Promise<{ params: Record<string, unknown>; result: unknown }>>;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  let admin: { id: string; email: string } | null = null;
  let jobKey = '';

  try {
    admin = await requireAdmin(request);
    jobKey = (await params).job;

    const runJob = JOBS[jobKey as keyof typeof JOBS];
    if (!runJob) {
      return NextResponse.json({ error: 'Unknown maintenance job' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const { params: runParams, result } = await runJob(body || {});

    await logAdminAuditEvent({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: `maintenance.${jobKey}`,
      targetType: 'maintenance_job',
      targetId: jobKey,
      targetLabel: jobKey,
      reason,
      metadata: {
        params: runParams,
        result,
      },
    });

    return NextResponse.json({
      success: true,
      job: jobKey,
      params: runParams,
      result,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    if (admin && jobKey) {
      await logAdminAuditEvent({
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: `maintenance.${jobKey}`,
        targetType: 'maintenance_job',
        targetId: jobKey,
        targetLabel: jobKey,
        reason: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
      });
    }

    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ADMIN MAINTENANCE] Error:', error);
    return NextResponse.json({ error: 'Failed to run maintenance job' }, { status: 500 });
  }
}
