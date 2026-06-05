import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { importRecording } from '@/lib/integrations/importer';
import {
  validatePublicUrl,
  isYouTubeUrl,
  YouTubeImportError,
  downloadYouTubeAudio,
  downloadDirectMedia,
  extractAudioFromVideoBuffer
} from '@/lib/url-importer';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { estimateTranscriptionCostAsync } from '@/lib/billing/cost-map';
import { getProcessingTierForAnalysis, normalizeAnalysisOptions } from '@/lib/analysis-options';
import { createReservation, releaseReservation } from '@/lib/billing/credit';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { runEntitlementGuard } from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const enforceNamedSpeakersForRoster = (analysisOptions: any, rosterSpeakers: any[] | undefined) => {
  if (!Array.isArray(rosterSpeakers) || rosterSpeakers.length === 0) return analysisOptions;
  if (analysisOptions?.namedSpeakers === true) return analysisOptions;
  return {
    ...analysisOptions,
    namedSpeakers: true,
  };
};

const sanitizeTitle = (title: string) => {
  const trimmed = title.trim();
  return trimmed.length ? trimmed : 'URL import';
};

const getTitleFromFileName = (name: string) => {
  const cleaned = name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return cleaned || 'URL import';
};

const generateKeywordsFromName = (name: string): string[] => {
  const parts = name.toLowerCase().split(/\s+/).filter(p => p.length > 1);
  const keywords = [...parts, name.toLowerCase()];

  if (parts.length >= 2) {
    keywords.push(`${parts[0]} ${parts[parts.length - 1][0]}`);
  }

  if (parts.length > 0) {
    keywords.push(parts[0]);
  }

  return [...new Set(keywords)];
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    const titleInput = typeof body?.title === 'string' ? body.title : '';
    const requestedOrganizationId = typeof body?.organization_id === 'string'
      ? body.organization_id
      : null;
    const rosterSpeakers = Array.isArray(body?.rosterSpeakers) ? body.rosterSpeakers : undefined;
    const analysisOptions = enforceNamedSpeakersForRoster(
      normalizeAnalysisOptions(body?.analysisOptions),
      rosterSpeakers
    );
    const processingTier = getProcessingTierForAnalysis(analysisOptions);
    const speakerCount = typeof body?.speakerCount === 'number' ? body.speakerCount : undefined;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const estimatedDurationSeconds = typeof body?.estimatedDurationSeconds === 'number'
      ? Math.max(1, Math.round(body.estimatedDurationSeconds))
      : 60 * 60;
    const estimatedCost = await estimateTranscriptionCostAsync({
      durationSeconds: estimatedDurationSeconds,
      tier: processingTier,
      analysisOptions,
    });

    const estimatedHold = estimateReservationAmount(estimatedCost.total, 'upload_processing');
    const organizationId = await resolveOrganizationIdForWrite(user.id, requestedOrganizationId);
    const entitlementGuard = await runEntitlementGuard({
      organizationId,
      legacyUserId: user.id,
      action: 'audio_upload',
      requestedAmount: 1,
      logContext: {
        route: 'app/api/upload/url',
        userId: user.id,
        metadata: {
          estimatedDurationSeconds,
          processingTier,
          source: isYouTubeUrl(url) ? 'youtube_url' : 'direct_url',
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    await requireCredits(user.id, estimatedHold);

    await validatePublicUrl(url);

    let buffer: ArrayBuffer;
    let contentType = 'audio/mpeg';
    let fileName = 'url-import.mp3';
    let title = titleInput;

    if (isYouTubeUrl(url)) {
      const yt = await downloadYouTubeAudio(url);
      buffer = yt.buffer;
      contentType = yt.contentType;
      fileName = yt.fileName;
      title = title || yt.title;
    } else {
      const direct = await downloadDirectMedia(url);
      fileName = direct.fileName;
      contentType = direct.contentType;
      buffer = direct.buffer;

      if (direct.isVideo) {
        const audio = await extractAudioFromVideoBuffer(buffer);
        buffer = audio.buffer;
        contentType = audio.contentType;
        fileName = `${getTitleFromFileName(fileName)}.mp3`;
      }
    }

    const finalTitle = sanitizeTitle(title || getTitleFromFileName(fileName));
    const reservation = await createReservation({
      userId: user.id,
      organizationId,
      workflowType: 'upload_processing',
      amount: estimatedHold,
      metadata: {
        source: 'url_import',
        url,
        estimatedCost: estimatedCost.total,
        analysisOptions,
        estimatedDurationSeconds,
      },
      expiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString(),
    });

    let importResult;
    try {
      importResult = await importRecording({
        userId: user.id,
        title: finalTitle,
        fileName,
        contentType,
        buffer,
        performanceLevel: processingTier,
        analysisOptions,
        organizationId,
        reservationId: reservation.id,
        reservationHoldAmount: estimatedHold,
        reservationEstimatedCost: estimatedCost.total,
        speakerCount,
        externalSource: {
          provider: isYouTubeUrl(url) ? 'youtube' : 'direct',
          recordingId: url
        }
      });
    } catch (importError) {
      await releaseReservation(reservation.id, 'Released URL import hold after import failed').catch((releaseError) => {
        console.error('[URL IMPORT] Failed to release reservation after import failure:', releaseError);
      });
      throw importError;
    }

    if (rosterSpeakers?.length) {
      try {
        const keywords = rosterSpeakers.map((speaker: any) => ({
          rosterSpeakerId: speaker.id,
          keywords: generateKeywordsFromName(speaker.name),
          autoGenerated: true
        }));

        await (supabaseAdmin
          .from('projects') as any)
          .update({
            preset_speakers: rosterSpeakers,
            speaker_keywords: keywords
          })
          .eq('id', importResult.projectId);
      } catch {
        // Non-fatal for URL imports
      }
    }

    await recordSubscriptionUsage({
      organizationId: importResult.organizationId || organizationId,
      userId: user.id,
      counterKey: 'audio_upload',
      quantity: 1,
      idempotencyKey: `audio_upload:url:${importResult.projectId}`,
      metadata: {
        source: 'url_import',
        provider: isYouTubeUrl(url) ? 'youtube_url' : 'direct_url',
      },
      logContext: {
        route: 'app/api/upload/url',
        userId: user.id,
        projectId: importResult.projectId,
        source: 'url_import',
      },
    });

    return NextResponse.json({
      success: true,
      projectId: importResult.projectId,
      title: finalTitle
    });
  } catch (error) {
    console.error('[URL IMPORT] Failed:', error);
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) {
      return billingResponse;
    }
    if (error instanceof YouTubeImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'URL import failed' },
      { status: 500 }
    );
  }
}
