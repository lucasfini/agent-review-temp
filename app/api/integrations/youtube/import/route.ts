import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';
import { importRecording } from '@/lib/integrations/importer';
import { downloadYouTubeAudio, YouTubeImportError } from '@/lib/url-importer';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { estimateTranscriptionCostAsync } from '@/lib/billing/cost-map';
import { getProcessingTierForAnalysis, normalizeAnalysisOptions } from '@/lib/analysis-options';
import { createReservation, releaseReservation } from '@/lib/billing/credit';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { runEntitlementDryRunCheck } from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const analysisOptions = normalizeAnalysisOptions(body?.analysisOptions);
    const performanceLevel = body?.performanceLevel || getProcessingTierForAnalysis(analysisOptions);
    const estimatedDurationSeconds = typeof body?.estimatedDurationSeconds === 'number'
      ? Math.max(1, Math.round(body.estimatedDurationSeconds))
      : 60 * 60;

    const estimatedCost = await estimateTranscriptionCostAsync({
      durationSeconds: estimatedDurationSeconds,
      tier: performanceLevel,
      analysisOptions,
    });
    const estimatedHold = estimateReservationAmount(estimatedCost.total, 'upload_processing');

    await requireCredits(user.id, estimatedHold);
    const organizationId = await resolveOrganizationIdForWrite(user.id);
    await runEntitlementDryRunCheck({
      organizationId,
      legacyUserId: user.id,
      action: 'integration_import',
      requestedAmount: 1,
      logContext: {
        route: 'app/api/integrations/youtube/import',
        userId: user.id,
        metadata: {
          provider: 'youtube',
          estimatedDurationSeconds,
        },
      },
    });

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    const connection = await getConnection(user.id, 'youtube');
    if (!connection) {
      return NextResponse.json({ error: 'YouTube not connected' }, { status: 404 });
    }

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'youtube')
      .eq('external_recording_id', videoId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const yt = await downloadYouTubeAudio(url);

    const reservation = await createReservation({
      userId: user.id,
      organizationId,
      workflowType: 'upload_processing',
      amount: estimatedHold,
      metadata: {
        source: 'youtube_import',
        videoId,
        estimatedCost: estimatedCost.total,
        analysisOptions,
        estimatedDurationSeconds,
      },
      expiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(),
    });

    let result;
    try {
      result = await importRecording({
        userId: user.id,
        title: yt.title || 'YouTube import',
        fileName: yt.fileName,
        contentType: yt.contentType,
        buffer: yt.buffer,
        performanceLevel,
        analysisOptions,
        organizationId,
        reservationId: reservation.id,
        reservationHoldAmount: estimatedHold,
        reservationEstimatedCost: estimatedCost.total,
        externalSource: { provider: 'youtube', recordingId: videoId }
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released YouTube import hold after import failed').catch((releaseError) => {
        console.error('[YOUTUBE IMPORT] Failed to release reservation after import error:', releaseError);
      });
      throw importError;
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: result.organizationId || organizationId,
      provider: 'youtube',
      external_recording_id: videoId,
      project_id: result.projectId,
      status: 'imported'
    } as any);

    await recordSubscriptionUsage({
      organizationId: result.organizationId || organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:youtube:${videoId}`,
      metadata: {
        source: 'youtube_import',
        videoId,
        projectId: result.projectId,
      },
      logContext: {
        route: 'app/api/integrations/youtube/import',
        userId: user.id,
        projectId: result.projectId,
        source: 'youtube_import',
      },
    });

    return NextResponse.json({ projectId: result.projectId });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    if (error instanceof YouTubeImportError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[YOUTUBE IMPORT] Failed:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
