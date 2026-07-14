import { NextRequest, NextResponse } from 'next/server';
import { getConnection, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';
import { importRecording } from '@/lib/integrations/importer';
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
import { getSlackAccessToken, isImportableSlackMimeType } from '../_helpers';

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
    const fileId = typeof body?.fileId === 'string' ? body.fileId.trim() : '';
    const analysisOptions = normalizeAnalysisOptions(body?.analysisOptions);
    const performanceLevel = body?.performanceLevel || getProcessingTierForAnalysis(analysisOptions);
    if (!fileId) {
      return integrationErrorResponse({ provider: 'slack', code: 'BAD_REQUEST', action: 'import', status: 400 });
    }

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
        route: 'app/api/integrations/slack/import',
        userId: user.id,
        metadata: {
          provider: 'slack',
          estimatedDurationSeconds,
          durationSource: resolvedDuration.durationSource,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    const connection = await getConnection(user.id, 'slack');
    if (!connection) {
      return integrationErrorResponse({ provider: 'slack', code: 'RECONNECT_REQUIRED', action: 'import', status: 404, userId: user.id });
    }

    const accessToken = getSlackAccessToken(connection);
    if (!accessToken) {
      return integrationErrorResponse({ provider: 'slack', code: 'RECONNECT_REQUIRED', action: 'import', status: 401, userId: user.id });
    }

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'slack')
      .eq('external_recording_id', fileId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const infoUrl = new URL('https://slack.com/api/files.info');
    infoUrl.searchParams.set('file', fileId);
    const fileRes = await fetch(infoUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const fileData = await fileRes.json();

    if (!fileRes.ok || !fileData.ok) {
      return integrationErrorResponse({
        provider: 'slack',
        code: fileRes.status === 401 || fileRes.status === 403 || fileData.error === 'invalid_auth' || fileData.error === 'not_authed'
          ? 'RECONNECT_REQUIRED'
          : 'LIST_FAILED',
        action: 'import',
        status: fileRes.status === 401 || fileRes.status === 403 || fileData.error === 'invalid_auth' || fileData.error === 'not_authed' ? 401 : 500,
        logPrefix: '[SLACK IMPORT] Provider file info error:',
        cause: fileData.error || fileRes.statusText,
        userId: user.id,
      });
    }

    const file = fileData.file;
    if (!isImportableSlackMimeType(file?.mimetype)) {
      return integrationErrorResponse({ provider: 'slack', code: 'UNSUPPORTED_MEDIA', action: 'import', status: 400 });
    }

    const downloadUrl = file.url_private_download || file.url_private;
    if (!downloadUrl) {
      return integrationErrorResponse({ provider: 'slack', code: 'DOWNLOAD_FAILED', action: 'download', status: 400 });
    }

    const downloadRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      return integrationErrorResponse({
        provider: 'slack',
        code: downloadRes.status === 401 || downloadRes.status === 403 ? 'RECONNECT_REQUIRED' : 'DOWNLOAD_FAILED',
        action: 'download',
        status: downloadRes.status === 401 || downloadRes.status === 403 ? 401 : 500,
        logPrefix: '[SLACK IMPORT] Provider download error:',
        cause: text,
        userId: user.id,
      });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileName = file.title || file.name || 'Slack Import';
    const contentType = file.mimetype || downloadRes.headers.get('content-type') || 'application/octet-stream';

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
        source: 'slack_import',
        fileId,
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
        title: fileName.replace(/\.[^/.]+$/, '') || 'Slack Import',
        fileName,
        contentType,
        buffer: arrayBuffer,
        performanceLevel,
        analysisOptions,
        organizationId,
        reservationId: reservation.id,
        reservationHoldAmount: estimatedProductCredits,
        reservationEstimatedCost: estimatedCost.total,
        estimatedDurationSeconds,
        externalSource: { provider: 'slack', recordingId: fileId },
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released Slack import hold after import failed').catch((releaseError) => {
        console.error('[SLACK IMPORT] Failed to release reservation after import error:', releaseError);
      });
      throw importError;
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: result.organizationId || organizationId,
      provider: 'slack',
      external_recording_id: fileId,
      project_id: result.projectId,
      status: 'imported',
    } as any);

    await recordSubscriptionUsage({
      organizationId: result.organizationId || organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:slack:${fileId}`,
      metadata: {
        source: 'slack_import',
        fileId,
        projectId: result.projectId,
      },
      logContext: {
        route: 'app/api/integrations/slack/import',
        userId: user.id,
        projectId: result.projectId,
        source: 'slack_import',
      },
    });

    return NextResponse.json({ projectId: result.projectId });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[SLACK IMPORT] Failed:', error);
    return integrationErrorResponse({ provider: 'slack', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
