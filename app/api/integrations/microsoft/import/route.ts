import { NextRequest, NextResponse } from 'next/server';
import { getConnection, getDecryptedTokens } from '../../_utils';
import { supabaseAdmin } from '@/lib/supabase/server';
import { importRecording } from '@/lib/integrations/importer';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { estimateTranscriptionCostAsync } from '@/lib/billing/cost-map';
import { getProcessingTierForAnalysis, normalizeAnalysisOptions } from '@/lib/analysis-options';
import { createReservation, releaseReservation } from '@/lib/billing/credit';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { runEntitlementDryRunCheck } from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';

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
    const itemId = body?.itemId;
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
        route: 'app/api/integrations/microsoft/import',
        userId: user.id,
        metadata: {
          provider: 'microsoft',
          estimatedDurationSeconds,
        },
      },
    });

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    }

    const connection = await getConnection(user.id, 'microsoft');
    if (!connection) return NextResponse.json({ error: 'Microsoft not connected' }, { status: 404 });

    const { accessToken } = getDecryptedTokens(connection);
    if (!accessToken) return NextResponse.json({ error: 'Microsoft token missing' }, { status: 401 });

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
      return NextResponse.json({ error: `Microsoft Graph error: ${text}` }, { status: 500 });
    }

    const item = await itemRes.json();
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      return NextResponse.json({ error: 'Download URL not available' }, { status: 400 });
    }

    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      return NextResponse.json({ error: `Microsoft download error: ${text}` }, { status: 500 });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileName = item.name || 'Teams Recording.mp4';
    const contentType = item.file?.mimeType || 'video/mp4';

    const reservation = await createReservation({
      userId: user.id,
      organizationId,
      workflowType: 'upload_processing',
      amount: estimatedHold,
      metadata: {
        source: 'microsoft_import',
        itemId,
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
        title: item.name?.replace(/\.[^/.]+$/, '') || 'Teams Recording',
        fileName,
        contentType,
        buffer: arrayBuffer,
        performanceLevel,
        analysisOptions,
        organizationId,
        reservationId: reservation.id,
        reservationHoldAmount: estimatedHold,
        reservationEstimatedCost: estimatedCost.total,
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
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
