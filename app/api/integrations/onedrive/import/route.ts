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
import { ensureFreshOneDriveConnection, isImportableOneDriveMimeType } from '../_helpers';

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
    const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
    const analysisOptions = normalizeAnalysisOptions(body?.analysisOptions);
    const performanceLevel = body?.performanceLevel || getProcessingTierForAnalysis(analysisOptions);
    if (!itemId) {
      return integrationErrorResponse({ provider: 'onedrive', code: 'BAD_REQUEST', action: 'import', status: 400 });
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
        route: 'app/api/integrations/onedrive/import',
        userId: user.id,
        metadata: {
          provider: 'onedrive',
          estimatedDurationSeconds,
          durationSource: resolvedDuration.durationSource,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    let connection = await getConnection(user.id, 'onedrive');
    if (!connection) {
      return integrationErrorResponse({ provider: 'onedrive', code: 'RECONNECT_REQUIRED', action: 'import', status: 404, userId: user.id });
    }

    connection = await ensureFreshOneDriveConnection(connection);
    const { accessToken } = getDecryptedTokens(connection);
    if (!accessToken) {
      return integrationErrorResponse({ provider: 'onedrive', code: 'RECONNECT_REQUIRED', action: 'import', status: 401, userId: user.id });
    }

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'onedrive')
      .eq('external_recording_id', itemId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const itemRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!itemRes.ok) {
      const text = await itemRes.text();
      return integrationErrorResponse({
        provider: 'onedrive',
        code: itemRes.status === 401 || itemRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
        action: 'import',
        status: itemRes.status === 401 || itemRes.status === 403 ? 401 : 500,
        logPrefix: '[ONEDRIVE IMPORT] Provider metadata error:',
        cause: text,
        userId: user.id,
      });
    }

    const item = await itemRes.json();
    if (!isImportableOneDriveMimeType(item.file?.mimeType)) {
      return integrationErrorResponse({ provider: 'onedrive', code: 'UNSUPPORTED_MEDIA', action: 'import', status: 400 });
    }

    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      return integrationErrorResponse({ provider: 'onedrive', code: 'DOWNLOAD_FAILED', action: 'download', status: 400 });
    }

    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      return integrationErrorResponse({
        provider: 'onedrive',
        code: 'DOWNLOAD_FAILED',
        action: 'download',
        status: 500,
        logPrefix: '[ONEDRIVE IMPORT] Provider download error:',
        cause: text,
      });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileName = item.name || 'OneDrive Import';
    const contentType = item.file?.mimeType || downloadRes.headers.get('content-type') || 'application/octet-stream';

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
        source: 'onedrive_import',
        itemId,
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
        title: fileName.replace(/\.[^/.]+$/, '') || 'OneDrive Import',
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
        externalSource: { provider: 'onedrive', recordingId: itemId },
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released OneDrive import hold after import failed').catch((releaseError) => {
        console.error('[ONEDRIVE IMPORT] Failed to release reservation after import error:', releaseError);
      });
      throw importError;
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: result.organizationId || organizationId,
      provider: 'onedrive',
      external_recording_id: itemId,
      project_id: result.projectId,
      status: 'imported',
    } as any);

    await recordSubscriptionUsage({
      organizationId: result.organizationId || organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:onedrive:${itemId}`,
      metadata: {
        source: 'onedrive_import',
        itemId,
        projectId: result.projectId,
      },
      logContext: {
        route: 'app/api/integrations/onedrive/import',
        userId: user.id,
        projectId: result.projectId,
        source: 'onedrive_import',
      },
    });

    return NextResponse.json({ projectId: result.projectId });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[ONEDRIVE IMPORT] Failed:', error);
    return integrationErrorResponse({ provider: 'onedrive', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
