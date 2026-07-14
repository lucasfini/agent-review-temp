import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens, integrationErrorResponse, signedOutIntegrationResponse } from '../../_utils';
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
import { ensureFreshGoogleDriveConnection, isImportableDriveMimeType } from '../_helpers';

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
        route: 'app/api/integrations/google_drive/import',
        userId: user.id,
        metadata: {
          provider: 'google_drive',
          estimatedDurationSeconds,
          durationSource: resolvedDuration.durationSource,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    if (!fileId) {
      return integrationErrorResponse({ provider: 'google_drive', code: 'BAD_REQUEST', action: 'import', status: 400 });
    }

    let connection = await getConnection(user.id, 'google_drive');
    if (!connection) {
      return integrationErrorResponse({ provider: 'google_drive', code: 'RECONNECT_REQUIRED', action: 'import', status: 404, userId: user.id });
    }

    connection = await ensureFreshGoogleDriveConnection(connection);
    const { accessToken } = getDecryptedTokens(connection);
    if (!accessToken) {
      return integrationErrorResponse({ provider: 'google_drive', code: 'RECONNECT_REQUIRED', action: 'import', status: 401, userId: user.id });
    }

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'google_drive')
      .eq('external_recording_id', fileId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const itemUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
    itemUrl.searchParams.set('fields', 'id,name,mimeType,size,videoMediaMetadata');
    const itemRes = await fetch(itemUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!itemRes.ok) {
      const text = await itemRes.text();
      return integrationErrorResponse({
        provider: 'google_drive',
        code: itemRes.status === 401 || itemRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
        action: 'import',
        status: itemRes.status === 401 || itemRes.status === 403 ? 401 : 500,
        logPrefix: '[GOOGLE DRIVE IMPORT] Provider metadata error:',
        cause: text,
        userId: user.id,
      });
    }

    const item = await itemRes.json();
    if (!isImportableDriveMimeType(item.mimeType)) {
      return integrationErrorResponse({ provider: 'google_drive', code: 'UNSUPPORTED_MEDIA', action: 'import', status: 400 });
    }

    const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      return integrationErrorResponse({
        provider: 'google_drive',
        code: downloadRes.status === 401 || downloadRes.status === 403 ? 'RECONNECT_REQUIRED' : 'DOWNLOAD_FAILED',
        action: 'download',
        status: downloadRes.status === 401 || downloadRes.status === 403 ? 401 : 500,
        logPrefix: '[GOOGLE DRIVE IMPORT] Provider download error:',
        cause: text,
        userId: user.id,
      });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileName = item.name || 'Google Drive Import';
    const contentType = item.mimeType || downloadRes.headers.get('content-type') || 'application/octet-stream';

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
        source: 'google_drive_import',
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
        title: fileName.replace(/\.[^/.]+$/, '') || 'Google Drive Import',
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
        externalSource: { provider: 'google_drive', recordingId: fileId },
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released Google Drive import hold after import failed').catch((releaseError) => {
        console.error('[GOOGLE DRIVE IMPORT] Failed to release reservation after import error:', releaseError);
      });
      throw importError;
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: result.organizationId || organizationId,
      provider: 'google_drive',
      external_recording_id: fileId,
      project_id: result.projectId,
      status: 'imported',
    } as any);

    await recordSubscriptionUsage({
      organizationId: result.organizationId || organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:google_drive:${fileId}`,
      metadata: {
        source: 'google_drive_import',
        fileId,
        projectId: result.projectId,
      },
      logContext: {
        route: 'app/api/integrations/google_drive/import',
        userId: user.id,
        projectId: result.projectId,
        source: 'google_drive_import',
      },
    });

    return NextResponse.json({ projectId: result.projectId });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[GOOGLE DRIVE IMPORT] Failed:', error);
    return integrationErrorResponse({ provider: 'google_drive', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
