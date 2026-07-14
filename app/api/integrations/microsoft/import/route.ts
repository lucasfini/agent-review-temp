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
    const itemId = body?.itemId;
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
        route: 'app/api/integrations/microsoft/import',
        userId: user.id,
        metadata: {
          provider: 'microsoft',
          estimatedDurationSeconds,
          durationSource: resolvedDuration.durationSource,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    if (!itemId) {
      return integrationErrorResponse({ provider: 'microsoft', code: 'BAD_REQUEST', action: 'import', status: 400 });
    }

    const connection = await getConnection(user.id, 'microsoft');
    if (!connection) return integrationErrorResponse({ provider: 'microsoft', code: 'RECONNECT_REQUIRED', action: 'import', status: 404, userId: user.id });

    const { accessToken } = getDecryptedTokens(connection);
    if (!accessToken) return integrationErrorResponse({ provider: 'microsoft', code: 'RECONNECT_REQUIRED', action: 'import', status: 401, userId: user.id });

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .eq('external_recording_id', itemId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const itemRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!itemRes.ok) {
      const text = await itemRes.text();
      return integrationErrorResponse({
        provider: 'microsoft',
        code: itemRes.status === 401 || itemRes.status === 403 ? 'RECONNECT_REQUIRED' : 'LIST_FAILED',
        action: 'import',
        status: itemRes.status === 401 || itemRes.status === 403 ? 401 : 500,
        logPrefix: '[MICROSOFT IMPORT] Provider metadata error:',
        cause: text,
        userId: user.id,
      });
    }

    const item = await itemRes.json();
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      return integrationErrorResponse({ provider: 'microsoft', code: 'DOWNLOAD_FAILED', action: 'download', status: 400 });
    }

    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      return integrationErrorResponse({
        provider: 'microsoft',
        code: 'DOWNLOAD_FAILED',
        action: 'download',
        status: 500,
        logPrefix: '[MICROSOFT IMPORT] Provider download error:',
        cause: text,
      });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileName = item.name || 'Teams Recording.mp4';
    const contentType = item.file?.mimeType || 'video/mp4';

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
        source: 'microsoft_import',
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
        title: item.name?.replace(/\.[^/.]+$/, '') || 'Teams Recording',
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
        externalSource: { provider: 'microsoft', recordingId: itemId }
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released Microsoft import hold after import failed').catch((releaseError) => {
        console.error('[MICROSOFT IMPORT] Failed to release reservation after import error:', releaseError);
      });
      throw importError;
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: result.organizationId || organizationId,
      provider: 'microsoft',
      external_recording_id: itemId,
      project_id: result.projectId,
      status: 'imported'
    } as any);

    await recordSubscriptionUsage({
      organizationId: result.organizationId || organizationId,
      userId: user.id,
      counterKey: 'integration_import',
      quantity: 1,
      idempotencyKey: `integration_import:microsoft:${itemId}`,
      metadata: {
        source: 'microsoft_import',
        itemId,
        projectId: result.projectId,
      },
      logContext: {
        route: 'app/api/integrations/microsoft/import',
        userId: user.id,
        projectId: result.projectId,
        source: 'microsoft_import',
      },
    });

    return NextResponse.json({ projectId: result.projectId });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[MICROSOFT IMPORT] Failed:', error);
    return integrationErrorResponse({ provider: 'microsoft', code: 'IMPORT_FAILED', action: 'import', status: 500 });
  }
}
