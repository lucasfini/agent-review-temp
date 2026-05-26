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
    const meetingId = body?.meetingId;
    const fileId = body?.fileId;
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

    if (!meetingId || !fileId) {
      return NextResponse.json({ error: 'Missing meetingId or fileId' }, { status: 400 });
    }

    const connection = await getConnection(user.id, 'zoom');
    if (!connection) return NextResponse.json({ error: 'Zoom not connected' }, { status: 404 });

    const { accessToken } = getDecryptedTokens(connection);
    if (!accessToken) return NextResponse.json({ error: 'Zoom token missing' }, { status: 401 });

    const detailsRes = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/recordings`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!detailsRes.ok) {
      const text = await detailsRes.text();
      return NextResponse.json({ error: `Zoom API error: ${text}` }, { status: 500 });
    }

    const details = await detailsRes.json();
    const file = (details.recording_files || []).find((f: any) => f.id === fileId);
    if (!file) {
      return NextResponse.json({ error: 'Recording file not found' }, { status: 404 });
    }

    const existing = await supabaseAdmin
      .from('integration_imports')
      .select('project_id')
      .eq('user_id', user.id)
      .eq('provider', 'zoom')
      .eq('external_recording_id', fileId)
      .single() as { data: any; error: any };

    if (existing?.data?.project_id) {
      return NextResponse.json({ projectId: existing.data.project_id, deduped: true });
    }

    const downloadRes = await fetch(file.download_url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!downloadRes.ok) {
      const text = await downloadRes.text();
      return NextResponse.json({ error: `Zoom download error: ${text}` }, { status: 500 });
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileName = file.file_name || `${details.topic || 'Zoom Recording'}.${(file.file_extension || 'mp4').toLowerCase()}`;
    const contentType = file.file_type === 'MP4' ? 'video/mp4' : 'audio/m4a';

    const reservation = await createReservation({
      userId: user.id,
      organizationId,
      workflowType: 'upload_processing',
      amount: estimatedHold,
      metadata: {
        source: 'zoom_import',
        meetingId,
        fileId,
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
        title: details.topic || 'Zoom Recording',
        fileName,
        contentType,
        buffer: arrayBuffer,
        performanceLevel,
        analysisOptions,
        organizationId,
        reservationId: reservation.id,
        reservationHoldAmount: estimatedHold,
        reservationEstimatedCost: estimatedCost.total,
        externalSource: { provider: 'zoom', recordingId: fileId }
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released Zoom import hold after import failed').catch((releaseError) => {
        console.error('[ZOOM IMPORT] Failed to release reservation after import error:', releaseError);
      });
      throw importError;
    }

    await supabaseAdmin.from('integration_imports').insert({
      user_id: user.id,
      organization_id: result.organizationId || organizationId,
      provider: 'zoom',
      external_recording_id: fileId,
      project_id: result.projectId,
      status: 'imported'
    } as any);

    return NextResponse.json({ projectId: result.projectId });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) return billingResponse;
    console.error('[ZOOM IMPORT] Failed:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
