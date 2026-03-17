import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getTierFeatures, type TierLevel } from '@/lib/tier-config';
import { generatePodcastSummary } from '@/lib/content-generators/summary';
import { detectPodcastChapters } from '@/lib/content-generators/chapters';
import { extractKeyTakeaways } from '@/lib/content-generators/takeaways';
import { extractSocialQuotes } from '@/lib/content-generators/quotes';
import { processInsightsForProject } from '@/lib/insight-extraction';
import { checkIdempotentUsage } from '@/lib/billing/track-usage';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { aiRatelimit } from '@/lib/rate-limit';

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
 * Healing endpoint: detects missing AI features for a project's tier and
 * runs only the generators needed to fill the gaps.
 *
 * Returns: { reconciled: boolean, flagFixed: string[], generated: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { success } = await aiRatelimit.limit(user.id);
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded for AI operations. Please wait a moment.' }, { status: 429 });
    }

    // Fetch project with all relevant content fields
    const { data: project, error } = await (supabaseAdmin as any)
      .from('projects')
      .select(
        'id, status, performance_level, transcription_text, transcription_segments, speaker_data, user_id, ai_summary, chapters, key_takeaways, social_quotes'
      )
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Ownership check
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawLevel = project.performance_level || 'standard';
    const tier = (rawLevel === 'basic' ? 'standard' : rawLevel === 'premium' ? 'pro' : rawLevel) as TierLevel;
    const features = getTierFeatures(tier);
    const aiProcessing: AIProcessingFlags =
      project.speaker_data?.detectionMetadata?.aiProcessing || {};

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
      if (aiProcessing[flag]) return; // already done

      // FIX: treat empty arrays (DB default '[]'::jsonb) as missing content
      const hasContent = Array.isArray(dbContent) ? dbContent.length > 0 : !!dbContent;

      if (hasContent) {
        // Content is present but flag wasn't written — fix flag only, no billing
        flagFixed.push(flag as string);
      } else {
        // Content genuinely missing — need to regenerate
        toGenerate.push(flag);
      }
    };

    check('summary', features.aiSummary, project.ai_summary);
    check('chapters', features.chapterDetection, project.chapters);
    check('takeaways', features.keyTakeaways, project.key_takeaways);
    check('quotes', features.quotesExtraction, project.social_quotes);
    check('insights', features.insights, null);

    // ── Fix flag-only items (no LLM call) ───────────────────────────────────
    let currentSpeakerData = project.speaker_data;
    for (const flag of flagFixed) {
      console.log(`[RECONCILE] 🏷 Fixing flag-only: ${flag}`);
      currentSpeakerData = await setFlag(
        projectId,
        currentSpeakerData,
        flag as keyof AIProcessingFlags
      );
    }

    if (toGenerate.length === 0 && flagFixed.length === 0) {
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

    for (const flag of toGenerate) {
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
          case 'summary': {
            const result = await generatePodcastSummary(project.transcription_text, {
              speakerContext,
              userId,
              projectId,
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
              apiKey: openaiApiKey || undefined,
            });
            currentSpeakerData = await setFlag(projectId, currentSpeakerData, 'quotes', {
              social_quotes: result.quotes,
            });
            generated.push('quotes');
            break;
          }

          case 'insights': {
            const result = await processInsightsForProject(projectId, userId);
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

    const totalFixed = flagFixed.length + generated.length;
    console.log(
      `[RECONCILE] ✅ Done — flagFixed: [${flagFixed}], generated: [${generated}]`
    );

    return NextResponse.json({
      reconciled: true,
      flagFixed,
      generated,
      totalFixed,
    });
  } catch (err: any) {
    console.error('[RECONCILE] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
