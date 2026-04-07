import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getFeaturesFromAnalysisOptions, getProjectAnalysisOptions } from '@/lib/analysis-options';
import { generatePodcastSummary } from '@/lib/content-generators/summary';
import { detectPodcastChapters } from '@/lib/content-generators/chapters';
import { extractKeyTakeaways } from '@/lib/content-generators/takeaways';
import { extractSocialQuotes } from '@/lib/content-generators/quotes';
import { processInsightsForProject } from '@/lib/insight-extraction';
import { extractSpeakerNames } from '@/lib/name-extraction';
import { classifySpeakerRoles } from '@/lib/speaker-role-classifier';
import { checkIdempotentUsage } from '@/lib/billing/track-usage';
import { failReservation, settleReservation } from '@/lib/billing/credit';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { aiRatelimit } from '@/lib/rate-limit';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { isDemoUser } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type AIProcessingFlags = {
  nameExtraction?: boolean;
  summary?: boolean;
  roles?: boolean;
  chapters?: boolean;
  takeaways?: boolean;
  quotes?: boolean;
  insights?: boolean;
};

function buildSpeakerContext(
  speakerData: any
): Record<string, { name: string; role?: string }> {
  const speakers = speakerData?.speakers || {};
  return Object.fromEntries(
    Object.entries(speakers).map(([id, speaker]: [string, any]) => [
      id,
      {
        name: speaker.finalName || speaker.fallbackName || id,
        role: speaker.role,
      },
    ])
  );
}

async function setFlag(
  projectId: string,
  speakerData: any,
  flag: keyof AIProcessingFlags,
  extraFields: Record<string, unknown> = {}
) {
  const updatedSpeakerData = {
    ...speakerData,
    detectionMetadata: {
      ...speakerData?.detectionMetadata,
      aiProcessing: {
        ...(speakerData?.detectionMetadata?.aiProcessing || {}),
        [flag]: true,
      },
    },
  };

  await (supabaseAdmin as any)
    .from('projects')
    .update({ speaker_data: updatedSpeakerData, ...extraFields })
    .eq('id', projectId);

  return updatedSpeakerData;
}

/**
 * POST /api/projects/[id]/reconcile
 *
 * Healing endpoint: detects missing AI features for a project's selected
 * runs only the generators needed to fill the gaps.
 *
 * Returns: { reconciled: boolean, flagFixed: string[], generated: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestReservationId: string | undefined;
  try {
    const { id: projectId } = await params;
    const body = await request.json().catch(() => null);
    const requestedTargets = Array.isArray(body?.targets)
      ? body.targets.filter((value: unknown): value is keyof AIProcessingFlags =>
          ['nameExtraction', 'summary', 'chapters', 'takeaways', 'quotes', 'insights'].includes(String(value))
        )
      : null;
    const reservationId = typeof body?.reservationId === 'string' ? body.reservationId : undefined;
    requestReservationId = reservationId;

    const isInternal = isAuthorizedMaintenanceRequest(request);
    let userIdForRateLimit: string | null = null;
    let authenticatedUserId: string | null = null;
    let authenticatedUserEmail: string | null = null;

    if (!isInternal) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      authenticatedUserId = user.id;
      authenticatedUserEmail = user.email ?? null;
      userIdForRateLimit = user.id;

      if (isDemoUser(user)) {
        return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
      }
    }

    // Fetch project with all relevant content fields
    const { data: project, error } = await (supabaseAdmin as any)
      .from('projects')
      .select(
        'id, status, performance_level, metadata, transcription_text, transcription_segments, speaker_data, preset_speakers, user_id, ai_summary, chapters, key_takeaways, social_quotes'
      )
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Ownership check
    if (!isInternal && project.user_id !== authenticatedUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (isInternal) {
      const { data: { user: projectUser } } = await supabaseAdmin.auth.admin.getUserById(project.user_id);
      if (isDemoUser(projectUser)) {
        return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
      }
    } else if (authenticatedUserEmail && isDemoUser({ email: authenticatedUserEmail })) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!userIdForRateLimit) {
      userIdForRateLimit = project.user_id;
    }

    if (userIdForRateLimit) {
      const { success } = await aiRatelimit.limit(userIdForRateLimit);
      if (!success) {
        return NextResponse.json({ error: 'Rate limit exceeded for AI operations. Please wait a moment.' }, { status: 429 });
      }
    }

    const analysisOptions = getProjectAnalysisOptions(project);
    const features = getFeaturesFromAnalysisOptions(analysisOptions);
    const aiProcessing: AIProcessingFlags =
      project.speaker_data?.detectionMetadata?.aiProcessing || {};
    let hasInsightsContent = false;

    if (features.insights || requestedTargets?.includes('insights')) {
      const { count: insightsCount, error: insightsCountError } = await (supabaseAdmin as any)
        .from('insights')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);

      if (insightsCountError) {
        console.error('[RECONCILE] Failed to inspect existing insights:', insightsCountError);
      } else {
        hasInsightsContent = Number(insightsCount || 0) > 0;
      }
    }

    // ── Categorise missing features ─────────────────────────────────────────
    // needsFlagOnly: content exists in DB but flag is wrong → just flip the flag
    // needsGeneration: content genuinely missing → regenerate (and bill)
    const flagFixed: string[] = [];
    const toGenerate: Array<keyof AIProcessingFlags> = [];

    const check = (
      flag: keyof AIProcessingFlags,
      featureEnabled: boolean,
      dbContent: unknown
    ) => {
      if (!featureEnabled) return;

      // FIX: treat empty arrays (DB default '[]'::jsonb) as missing content
      const hasContent = Array.isArray(dbContent) ? dbContent.length > 0 : !!dbContent;

      if (!hasContent) {
        toGenerate.push(flag);
        return;
      }

      if (!aiProcessing[flag]) {
        // Content is present but flag wasn't written — fix flag only, no billing
        flagFixed.push(flag as string);
      }
    };

    const hasNamedSpeakers = Object.values(project.speaker_data?.speakers || {}).some((speaker: any) => {
      const finalName = String(speaker?.finalName || '').trim();
      return finalName.length > 0 && !finalName.startsWith('Speaker ');
    });

    if (features.nameExtraction) {
      if (!hasNamedSpeakers) {
        toGenerate.push('nameExtraction');
      } else if (!aiProcessing.nameExtraction) {
        flagFixed.push('nameExtraction');
      }
    }

    check('summary', features.aiSummary, project.ai_summary);
    check('chapters', features.chapterDetection, project.chapters);
    check('takeaways', features.keyTakeaways, project.key_takeaways);
    check('quotes', features.quotesExtraction, project.social_quotes);
    check('insights', features.insights, hasInsightsContent);

    const filteredFlagFixed = requestedTargets
      ? flagFixed.filter((flag) => requestedTargets.includes(flag as keyof AIProcessingFlags))
      : flagFixed;
    const filteredToGenerate = requestedTargets
      ? toGenerate.filter((flag) => requestedTargets.includes(flag))
      : toGenerate;

    // ── Fix flag-only items (no LLM call) ───────────────────────────────────
    let currentSpeakerData = project.speaker_data;
    for (const flag of filteredFlagFixed) {
      console.log(`[RECONCILE] 🏷 Fixing flag-only: ${flag}`);
      currentSpeakerData = await setFlag(
        projectId,
        currentSpeakerData,
        flag as keyof AIProcessingFlags
      );
    }

    if (filteredToGenerate.length === 0 && filteredFlagFixed.length === 0) {
      if (reservationId) {
        await settleReservation(reservationId);
      }
      return NextResponse.json({
        reconciled: true,
        flagFixed: [],
        generated: [],
        message: 'All features present',
      });
    }

    // ── Regenerate missing features ──────────────────────────────────────────
    if (!project.transcription_text) {
      return NextResponse.json(
        { error: 'Transcription not available for regeneration' },
        { status: 422 }
      );
    }

    const openaiApiKey = await getOpenAIApiKeyForUser(project.user_id);
    const speakerContext = buildSpeakerContext(currentSpeakerData);
    const generated: string[] = [];

    for (const flag of filteredToGenerate) {
      // Idempotency: if we already billed for this feature, regenerate
      // without billing again (userId omitted → trackOpenAIUsage skipped)
      const alreadyBilled = await checkIdempotentUsage(projectId, flag as string);
      const userId = alreadyBilled ? undefined : project.user_id;

      if (alreadyBilled) {
        console.log(`[RECONCILE] ⚡ ${flag}: already billed — regenerating without debit`);
      } else {
        console.log(`[RECONCILE] 🔄 ${flag}: generating + billing`);
      }

      try {
        switch (flag) {
          case 'nameExtraction': {
            const speakerData = project.speaker_data || {};
            const segments = Array.isArray(speakerData.segments) ? speakerData.segments : [];
            const speakers = speakerData.speakers || {};

            const namedSpeakers = await extractSpeakerNames(
              project.transcription_text,
              speakers,
              segments,
              {
                userId,
                projectId,
                reservationId,
                rosterSpeakers: Array.isArray(project.preset_speakers)
                  ? project.preset_speakers
                  : undefined,
              }
            );

            const roleAssignments = await classifySpeakerRoles(
              Object.fromEntries(
                Object.entries(namedSpeakers).map(([speakerId, speaker]: [string, any]) => [
                  speakerId,
                  {
                    id: speakerId,
                    fallbackName: speaker.finalName || speaker.fallbackName,
                    totalDuration: speaker.totalDuration || 0,
                    segments: speaker.segments || [],
                    behavioralStats: speaker.profile?.behavioral ?? null,
                  },
                ])
              ),
              {
                transcriptContext: project.transcription_text,
                userId,
                projectId,
                reservationId,
                apiKey: openaiApiKey || undefined,
              }
            );

            const mergedSpeakers = Object.fromEntries(
              Object.entries(namedSpeakers).map(([speakerId, speaker]: [string, any]) => {
                const role = roleAssignments[speakerId];
                return [
                  speakerId,
                  role
                    ? {
                        ...speaker,
                        role: role.role,
                        roleConfidence: role.confidence,
                        roleSummary: role.summary,
                        roleEvidence: role.evidence,
                        autoRoleAssigned: true,
                      }
                    : speaker,
                ];
              })
            );

            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'nameExtraction', {
              speaker_data: {
                ...speakerData,
                speakers: mergedSpeakers,
              },
            });
            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'roles');
            generated.push('nameExtraction');
            break;
          }

          case 'summary': {
            const result = await generatePodcastSummary(project.transcription_text, {
              speakerContext,
              userId,
              projectId,
              reservationId,
              apiKey: openaiApiKey || undefined,
            });
            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'summary', {
              ai_summary: result.summary,
            });
            generated.push('summary');
            break;
          }

          case 'chapters': {
            const segs = project.transcription_segments || [];
            const result = await detectPodcastChapters(
              project.transcription_text,
              segs,
              {
                speakerContext,
                userId,
                projectId,
                reservationId,
                apiKey: openaiApiKey || undefined,
              }
            );
            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'chapters', {
              chapters: result.chapters,
            });
            generated.push('chapters');
            break;
          }

          case 'takeaways': {
            const result = await extractKeyTakeaways(project.transcription_text, {
              speakerContext,
              userId,
              projectId,
              reservationId,
              apiKey: openaiApiKey || undefined,
            });
            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'takeaways', {
              key_takeaways: result.takeaways,
            });
            generated.push('takeaways');
            break;
          }

          case 'quotes': {
            const result = await extractSocialQuotes(project.transcription_text, {
              speakerContext,
              userId,
              projectId,
              reservationId,
              apiKey: openaiApiKey || undefined,
            });
            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'quotes', {
              social_quotes: result.quotes,
            });
            generated.push('quotes');
            break;
          }

          case 'insights': {
            const result = await processInsightsForProject(projectId, userId, reservationId);
            if (result.success) {
              currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'insights');
              generated.push('insights');
            } else {
              throw new Error(result.error || 'Insight extraction failed');
            }
            break;
          }
        }
      } catch (err: any) {
        console.error(`[RECONCILE] ❌ Failed to repair ${flag}:`, err.message);
      }
    }

    const totalFixed = filteredFlagFixed.length + generated.length;
    console.log(
      `[RECONCILE] ✅ Done — flagFixed: [${filteredFlagFixed}], generated: [${generated}]`
    );

    if (reservationId) {
      await settleReservation(reservationId);
    }

    return NextResponse.json({
      reconciled: true,
      flagFixed: filteredFlagFixed,
      generated,
      totalFixed,
    });
  } catch (err: any) {
    console.error('[RECONCILE] Fatal error:', err);
    if (requestReservationId) {
      await failReservation(requestReservationId, err.message || 'Reconcile failed').catch((billingError) => {
        console.error('[RECONCILE] Failed to fail reservation:', billingError);
      });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
