import { NextRequest, NextResponse } from 'next/server';
import { getConnection, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';
import { importRecording } from '@/lib/integrations/importer';
import { downloadYouTubeAudio, YouTubeImportError } from '@/lib/url-importer';
import { billingErrorResponse } from '@/lib/billing/middleware';
import { estimateTranscriptionCostAsync } from '@/lib/billing/cost-map';
import { getProcessingTierForAnalysis, normalizeAnalysisOptions } from '@/lib/analysis-options';
import { releaseReservation } from '@/lib/billing/credit';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { runEntitlementGuard } from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';
import { createPlanCreditReservation, resolvePlanUploadDuration } from '@/lib/billing/plan-credits';
import { getUploadProcessingReservationExpiresAt } from '@/lib/billing/plan-upload-limits';
import { estimateAudioProductCredits } from '@/lib/billing/product-credits';

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
    if (!user) return signedOutIntegrationResponse();

    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const analysisOptions = normalizeAnalysisOptions(body?.analysisOptions);
    const performanceLevel = body?.performanceLevel || getProcessingTierForAnalysis(analysisOptions);
    const organizationId = await resolveOrganizationIdForWrite(user.id);
    const resolvedDuration = await resolvePlanUploadDuration({
      organizationId,
      userId: user.id,
      durationSeconds: typeof body?.estimatedDurationSeconds === 'number'
        ? body.estimatedDurationSeconds
        : null,
    });
    const estimatedDurationSeconds = resolvedDuration.durationSeconds;
    const subscription = resolvedDuration.subscription;

    const estimatedCost = await estimateTranscriptionCostAsync({
      durationSeconds: estimatedDurationSeconds,
      tier: performanceLevel,
      analysisOptions,
    });
    const entitlementGuard = await runEntitlementGuard({
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
          durationSource: resolvedDuration.durationSource,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    if (!videoId) {
      return integrationErrorResponse({ provider: 'youtube', code: 'BAD_REQUEST', action: 'import', status: 400 });
    }

    const connection = await getConnection(user.id, 'youtube');
    if (!connection) {
      return integrationErrorResponse({ provider: 'youtube', code: 'RECONNECT_REQUIRED', action: 'import', status: 404, userId: user.id });
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

    const estimatedProductCredits = estimateAudioProductCredits({
      durationSeconds: estimatedDurationSeconds,
      tier: performanceLevel,
    });
    const reservation = await createPlanCreditReservation({
      userId: user.id,
      organizationId,
      workflowType: 'upload_processing',
      amount: estimatedProductCredits,
      subscription,
      metadata: {
        source: 'youtube_import',
        videoId,
        estimatedCost: estimatedCost.total,
        estimatedProviderCost: estimatedCost.total,
        productCreditAmount: estimatedProductCredits,
        productCreditWorkflow: performanceLevel,
        analysisOptions,
        estimatedDurationSeconds,
        durationSource: resolvedDuration.durationSource,
      },
      expiresAt: getUploadProcessingReservationExpiresAt(),
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
        reservationHoldAmount: estimatedProductCredits,
        reservationEstimatedCost: estimatedCost.total,
        estimatedDurationSeconds,
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
      return integrationErrorResponse({
        provider: 'youtube',
        code: 'DOWNLOAD_FAILED',
        action: 'download',
        status: error.status,
        logPrefix: '[YOUTUBE IMPORT] Download failed:',
        cause: error.details || error.message,
      });
    }
    console.error('[YOUTUBE IMPORT] Failed:', error);
    return integrationErrorResponse({ provider: 'youtube', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
