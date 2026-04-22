import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase/server';
import { transcribeWithAssemblyAI, checkAssemblyAIAvailability } from '@/lib/assemblyai-integration';
import { transcribeWithDeepgram, checkDeepgramAvailability } from '@/lib/deepgram-integration';
import { groupSegmentsBySpeaker } from '@/lib/speaker-utils';
import { extractSpeakerNames } from '@/lib/name-extraction';
import { classifySpeakerRoles } from '@/lib/speaker-role-classifier';
import { generatePodcastSummary } from '@/lib/content-generators/summary';
import { detectPodcastChapters } from '@/lib/content-generators/chapters';
import { extractKeyTakeaways, type KeyTakeaway } from '@/lib/content-generators/takeaways';
import { extractSocialQuotes } from '@/lib/content-generators/quotes';
import { preProcessTranscript } from '@/lib/content-generators/pre-processor';
import { getFeaturesFromAnalysisOptions, getProcessingTierForAnalysis, getProjectAnalysisOptions, normalizeAnalysisOptions } from '@/lib/analysis-options';
import { scheduleBackgroundTask } from '@/lib/background-task';
import type { TierFeatures, TierLevel } from '@/lib/tier-config';
import { updateProcessingProgress, markProcessingFailed } from '@/lib/progress-tracker';
import { ProcessingStage } from '@/lib/tier-progress-config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SpeakerSegment, TranscriptionSegment } from '@/lib/types';
import { estimateTranscriptionCost } from '@/lib/billing/cost-map';
import { trackAssemblyAIUsage, requireSufficientCredit } from '@/lib/billing/track-usage';
import { InsufficientCreditError, failReservation, settleReservation } from '@/lib/billing/credit';
import { aiRatelimit } from '@/lib/rate-limit';
import { autoCorrectSpeakers, applySpeakerCorrections } from '@/lib/utils/autoCorrectSpeakers';
import { classifyProjectTypeWithAI, type ProjectType } from '@/lib/utils/classifyProjectType';
import { correctDebateSpeakers, applyDebateCorrectionToSpeakerData, summarizeDebateCorrections } from '@/lib/utils/correctDebateSpeakers';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import {
  applyNeighborSmoothing,
  attachSpeakerAssignmentMetadata,
  collectSpeakerPipelineSnapshot,
  enforceFinalSpeakerIdContract,
  finalizeSpeakerAttributionForStorage,
  logSpeakerAssignmentCounts,
  mergeDuplicateSpeakersByName,
} from '@/lib/speaker-finalization';
import {
  detectShowIdentityFromContext,
  detectGenericShowIdentityFromProjects,
  extractLearnedShowRosterFromProjects,
  mergeShowRosterEntries,
  type ShowRosterEntry,
} from '@/lib/show-speaker-memory';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Allow this function to run for up to 5 minutes (300 seconds)
export const maxDuration = 300;

// Global file storage for temporary solution
declare global {
  var uploadedFiles: Map<string, {
    buffer: ArrayBuffer;
    contentType: string;
    originalName: string;
    size: number;
  }>;
}

const sanitizeFileName = (name: string) => {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'audio_upload';
};

const buildInMemoryKeys = (fileName: string) => {
  const keys = new Set<string>();
  if (!fileName) return [];
  keys.add(fileName);
  const pathParts = fileName.split('/');
  const base = pathParts.pop() || fileName;
  const dir = pathParts.join('/');
  keys.add(base);
  const sanitizedBase = sanitizeFileName(base);
  keys.add(sanitizedBase);
  if (dir) {
    keys.add(`${dir}/${base}`);
    keys.add(`${dir}/${sanitizedBase}`);
  }
  return Array.from(keys).filter(Boolean);
};

const buildStorageKeys = (projectId: string, fileName: string) => {
  const keys = new Set<string>();
  if (!fileName) return [];
  keys.add(fileName);
  if (!fileName.includes('/')) {
    keys.add(`${projectId}/${fileName}`);
  }
  return Array.from(keys).filter(Boolean);
};

async function loadAudioFromStorage(projectId: string, fileName: string) {
  const candidateKeys = buildStorageKeys(projectId, fileName);

  for (const key of candidateKeys) {
    try {
      const response = await r2Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      );

      if (!response.Body) {
        continue;
      }

      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      console.log(`[TRANSCRIPTION] ✅ Loaded file from storage with key: "${key}"`);

      return {
        buffer,
        size: buffer.byteLength,
        contentType: response.ContentType || 'audio/mpeg',
        originalName: key.split('/').pop() || fileName,
        storageKey: key,
      };
    } catch (error: any) {
      const isMissing =
        error?.name === 'NoSuchKey' ||
        error?.$metadata?.httpStatusCode === 404;

      if (!isMissing) {
        console.warn(`[TRANSCRIPTION] ⚠️ Failed loading storage key "${key}":`, error);
      }
    }
  }

  return null;
}

const purgeInMemoryAudio = (fileName: string | undefined) => {
  if (!fileName || !global.uploadedFiles) return;
  const keys = buildInMemoryKeys(fileName);
  keys.forEach(key => global.uploadedFiles?.delete(key));
};

type AIProcessingFlags = {
  nameExtraction?: boolean;
  summary?: boolean;
  roles?: boolean;
  chapters?: boolean;
  takeaways?: boolean;
  quotes?: boolean;
  insights?: boolean;
  debateCorrectionApplied?: boolean;
  backgroundStartedAt?: string;
  backgroundCompletedAt?: string;
  backgroundErrors?: Record<string, string>;
};

async function updateProjectWithSpeakerData(
  projectId: string,
  speakerData: any,
  extraFields: Record<string, any> = {}
) {
  return supabaseAdmin
    .from('projects')
    .update({
      speaker_data: speakerData,
      ...extraFields
    })
    .eq('id', projectId);
}

function buildSpeakerContextFromData(speakerData: any): Record<string, { name: string }> {
  const speakers = speakerData?.speakers || {};
  return Object.fromEntries(
    Object.entries(speakers).map(([id, speaker]: [string, any]) => [
      id,
      { name: speaker.finalName || speaker.fallbackName || id }
    ])
  );
}

async function inferRecurringShowRoster(params: {
  userId?: string;
  projectId: string;
  title?: string | null;
  filename?: string | null;
  segments?: SpeakerSegment[];
  explicitRoster?: Array<{ name: string; role?: string | null; aliases?: string[] }> | null;
}): Promise<{
  showIdentity: ReturnType<typeof detectShowIdentityFromContext>;
  effectiveRoster: ShowRosterEntry[];
}> {
  let showIdentity = detectShowIdentityFromContext({
    title: params.title || null,
    filename: params.filename || null,
    segments: params.segments,
  });

  let priorProjects: any[] = [];
  if (params.userId) {
    const { data } = await (supabaseAdmin as any)
      .from('projects')
      .select('id, title, metadata, speaker_data, preset_speakers, processing_completed_at, status')
      .eq('user_id', params.userId)
      .eq('status', 'completed')
      .neq('id', params.projectId)
      .order('processing_completed_at', { ascending: false })
      .limit(40);

    priorProjects = Array.isArray(data) ? data : [];
  }

  if (!showIdentity) {
    showIdentity = detectGenericShowIdentityFromProjects({
      title: params.title || null,
      filename: params.filename || null,
      segments: params.segments,
      projects: priorProjects,
    });
  }

  if (!showIdentity && (!params.explicitRoster || params.explicitRoster.length === 0)) {
    return { showIdentity: null, effectiveRoster: [] };
  }

  const learnedRoster = extractLearnedShowRosterFromProjects(priorProjects, showIdentity);
  const effectiveRoster = mergeShowRosterEntries(
    showIdentity?.roster,
    learnedRoster,
    params.explicitRoster || undefined
  );

  return {
    showIdentity,
    effectiveRoster,
  };
}

async function runBackgroundContentTasks(params: {
  projectId: string;
  speakerData: any;
  finalTranscription: string;
  transcriptionSegments: any[];
  features: TierFeatures;
  userId?: string;
  openaiApiKey?: string;
  reservationId?: string;
}) {
  const { projectId, speakerData, finalTranscription, transcriptionSegments, features, userId, openaiApiKey, reservationId } = params;
  let workingSpeakerData = speakerData;

  const aiProcessing: AIProcessingFlags = {
    ...(workingSpeakerData?.detectionMetadata?.aiProcessing || {})
  };

  aiProcessing.backgroundStartedAt = new Date().toISOString();
  aiProcessing.backgroundErrors = aiProcessing.backgroundErrors || {};

  workingSpeakerData = {
    ...workingSpeakerData,
    detectionMetadata: {
      ...workingSpeakerData.detectionMetadata,
      aiProcessing
    }
  };

  await updateProjectWithSpeakerData(projectId, workingSpeakerData);

  const speakerContext = buildSpeakerContextFromData(workingSpeakerData);

  const markSuccess = async (key: keyof AIProcessingFlags, extraFields: Record<string, any> = {}) => {
    const nextProcessing = {
      ...(workingSpeakerData.detectionMetadata.aiProcessing || {}),
      [key]: true
    };
    workingSpeakerData = {
      ...workingSpeakerData,
      detectionMetadata: {
        ...workingSpeakerData.detectionMetadata,
        aiProcessing: nextProcessing
      }
    };
    await updateProjectWithSpeakerData(projectId, workingSpeakerData, extraFields);
  };

  const markFailure = async (key: keyof AIProcessingFlags, error: any) => {
    const nextProcessing = {
      ...(workingSpeakerData.detectionMetadata.aiProcessing || {}),
      [key]: false,
      backgroundErrors: {
        ...(workingSpeakerData.detectionMetadata.aiProcessing?.backgroundErrors || {}),
        [key]: error?.message || String(error)
      }
    };
    workingSpeakerData = {
      ...workingSpeakerData,
      detectionMetadata: {
        ...workingSpeakerData.detectionMetadata,
        aiProcessing: nextProcessing
      }
    };
    await updateProjectWithSpeakerData(projectId, workingSpeakerData);
  };

  if (features.roleClassification) {
    try {
      console.log('[BACKGROUND] 👥 Classifying speaker roles...');
      const roleAssignments = await classifySpeakerRoles(
        Object.fromEntries(
          Object.entries(workingSpeakerData.speakers).map(([id, speaker]: [string, any]) => [
            id,
            {
              id,
              fallbackName: speaker.finalName || speaker.fallbackName,
              totalDuration: speaker.totalDuration,
              segments: speaker.segments,
              behavioralStats: speaker.profile?.behavioral ?? null
            }
          ])
        ),
        {
          transcriptContext: finalTranscription,
          userId,
          projectId,
          apiKey: openaiApiKey || undefined,
          reservationId,
        }
      );

      for (const [speakerId, assignment] of Object.entries(roleAssignments)) {
        if (!workingSpeakerData.speakers[speakerId]) continue;
        workingSpeakerData.speakers[speakerId] = {
          ...workingSpeakerData.speakers[speakerId],
          role: (assignment as any).role,
          roleConfidence: (assignment as any).confidence,
          roleSummary: (assignment as any).summary,
          roleEvidence: (assignment as any).evidence,
          autoRoleAssigned: true,
        };
      }

      await markSuccess('roles');
    } catch (error: any) {
      console.error('[BACKGROUND] ⚠️ Role classification failed:', error.message);
      await markFailure('roles', error);
    }
  }

  if (features.aiSummary) {
    try {
      console.log('[BACKGROUND] 📄 Generating summary...');
      const summary = await generatePodcastSummary(finalTranscription, {
        speakerContext,
        userId,
        projectId,
        apiKey: openaiApiKey || undefined,
        reservationId,
      });
      await markSuccess('summary', { ai_summary: summary.summary });
    } catch (error: any) {
      console.error('[BACKGROUND] ⚠️ Summary generation failed:', error.message);
      await markFailure('summary', error);
    }
  }

  if (features.chapterDetection) {
    try {
      console.log('[BACKGROUND] 📚 Detecting chapters...');
      const chapters = await detectPodcastChapters(finalTranscription, transcriptionSegments, {
        speakerContext,
        userId,
        projectId,
        apiKey: openaiApiKey || undefined,
        reservationId,
      });
      await markSuccess('chapters', { chapters: chapters.chapters });
    } catch (error: any) {
      console.error('[BACKGROUND] ⚠️ Chapter detection failed:', error.message);
      await markFailure('chapters', error);
    }
  }

  if (features.keyTakeaways) {
    try {
      console.log('[BACKGROUND] 💎 Extracting takeaways...');
      const takeaways = await extractKeyTakeaways(finalTranscription, {
        speakerContext,
        userId,
        projectId,
        apiKey: openaiApiKey || undefined,
        reservationId,
      });
      await markSuccess('takeaways', { key_takeaways: takeaways.takeaways });
    } catch (error: any) {
      console.error('[BACKGROUND] ⚠️ Takeaway extraction failed:', error.message);
      await markFailure('takeaways', error);
    }
  }

  if (features.quotesExtraction) {
    try {
      console.log('[BACKGROUND] 💬 Extracting quotes...');
      const quotes = await extractSocialQuotes(finalTranscription, {
        speakerContext,
        userId,
        projectId,
        apiKey: openaiApiKey || undefined,
        reservationId,
      });
      await markSuccess('quotes', { social_quotes: quotes.quotes });
    } catch (error: any) {
      console.error('[BACKGROUND] ⚠️ Quote extraction failed:', error.message);
      await markFailure('quotes', error);
    }
  }

  if (features.insights && finalTranscription && workingSpeakerData) {
    try {
      console.log('[BACKGROUND] 🔍 Starting insight extraction...');
      const { processInsightsForProject } = await import('@/lib/insight-extraction');
      const result = await processInsightsForProject(projectId, userId, reservationId);
      if (result.success) {
        console.log(`[BACKGROUND] ✅ Extracted ${result.insightCount} insights.`);
        await markSuccess('insights');
      } else {
        console.warn(`[BACKGROUND] ⚠️ Insights failed:`, result.error);
        await markFailure('insights', result.error || 'Insights failed');
      }
    } catch (error: any) {
      console.error('[BACKGROUND] ❌ Insights error:', error);
      await markFailure('insights', error);
    }
  }

  const finalProcessing = {
    ...(workingSpeakerData.detectionMetadata.aiProcessing || {}),
    backgroundCompletedAt: new Date().toISOString()
  };
  workingSpeakerData = {
    ...workingSpeakerData,
    detectionMetadata: {
      ...workingSpeakerData.detectionMetadata,
      aiProcessing: finalProcessing
    }
  };
  await updateProjectWithSpeakerData(projectId, workingSpeakerData);

  if (reservationId) {
    await settleReservation(reservationId);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let tempAudioFilePath: string | null = null;
  let parsedProjectId: string | undefined;

  try {
    // Auth: accept internal job token (from finalize route) OR user bearer token
    const isMaintenance = isAuthorizedMaintenanceRequest(request);
    let callerUserId: string | null = null;

    if (!isMaintenance) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { data: { user } } = await supabaseAdmin.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      callerUserId = user.id;

      const { success } = await aiRatelimit.limit(user.id);
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded for AI operations. Please wait a moment.' },
          { status: 429 }
        );
      }
    }

    // Parse request
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const { projectId, fileName, performanceLevel, analysisOptions: payloadAnalysisOptions, diarizationProvider = 'assemblyai', speakerCount } = payload as {
      projectId?: string;
      fileName?: string;
      performanceLevel?: TierLevel;
      analysisOptions?: Record<string, unknown>;
      diarizationProvider?: 'assemblyai' | 'deepgram';
      speakerCount?: number;
    };

    if (!projectId || !fileName) {
      return NextResponse.json(
        { error: 'Missing projectId or fileName' },
        { status: 400 }
      );
    }

    parsedProjectId = projectId;

    console.log(`\n========================================`);
    console.log(`[TRANSCRIPTION] 🚀 Starting upload processing`);
    console.log(`[TRANSCRIPTION] Provider: ${diarizationProvider}`);
    console.log(`[TRANSCRIPTION] Project ID: ${projectId}`);
    console.log(`[TRANSCRIPTION] File: ${fileName}`);
    if (speakerCount) console.log(`[TRANSCRIPTION] Expected speakers: ${speakerCount}`);
    console.log(`========================================\n`);

    // Check if project already has cached transcription
    const { data: existingProject, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription_text, transcription_segments, speaker_data, audio_duration, user_id, title, preset_speakers, metadata, performance_level')
      .eq('id', projectId)
      .single() as {
        data: {
          transcription_text: string | null;
          transcription_segments: any;
          speaker_data: any;
          audio_duration: number | null;
          user_id: string;
          title: string;
          preset_speakers: any[] | null;
          metadata?: any;
          performance_level?: string | null;
        } | null;
        error: any
      };

    // Project must exist before any provider work begins
    if (projectError || !existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Non-internal callers must own the project
    if (callerUserId && existingProject.user_id !== callerUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const analysisOptions = existingProject
      ? getProjectAnalysisOptions(existingProject)
      : normalizeAnalysisOptions(payloadAnalysisOptions);
    const uploadReservationId: string | undefined = existingProject?.metadata?.billing?.uploadReservationId;
    const tier: TierLevel = getProcessingTierForAnalysis(analysisOptions);
    const features = getFeaturesFromAnalysisOptions(analysisOptions);

    const selectedContentBlocks: string[] = [];
    if (features.nameExtraction) selectedContentBlocks.push('named_speakers');
    if (features.aiSummary) selectedContentBlocks.push('summary');
    if (features.insights) selectedContentBlocks.push('insights');
    if (features.chapterDetection) selectedContentBlocks.push('chapters');
    if (features.keyTakeaways) selectedContentBlocks.push('takeaways');
    if (features.quotesExtraction) selectedContentBlocks.push('quotes');

    void (async () => {
      try {
        const nextMetadata = {
          ...(existingProject?.metadata || {}),
          analysis_options: analysisOptions,
          selected_content_blocks: selectedContentBlocks,
        };
        await (supabaseAdmin as any)
          .from('projects')
          .update({ metadata: nextMetadata })
          .eq('id', projectId);
        console.log(`[TRANSCRIBE] 📋 Persisted analysis options and selected blocks: [${selectedContentBlocks}]`);
      } catch (err: any) {
        console.warn('[TRANSCRIBE] ⚠️ Failed to persist analysis options:', err.message);
      }
    })();

    console.log(`[TRANSCRIPTION] Analysis options:`, analysisOptions);
    console.log(`[TRANSCRIPTION] Internal processing tier: ${tier}`);
    if (performanceLevel) {
      console.log(`[TRANSCRIPTION] Legacy performanceLevel hint received: ${performanceLevel}`);
    }

    const hasCache = existingProject && existingProject.transcription_text;
    const openaiApiKey = await getOpenAIApiKeyForUser(existingProject?.user_id);

    if (hasCache) {
      console.log('[TRANSCRIPTION] ♻️ Cache detected - skipping transcription, will apply selected analysis only');
    }

    // Check Provider availability (skip if cache exists)
    if (!hasCache) {
      let providerAvailable = false;
      if (diarizationProvider === 'deepgram') {
        providerAvailable = await checkDeepgramAvailability();
        if (!providerAvailable) {
          console.error('[TRANSCRIPTION] ❌ Deepgram not available');
          throw new Error('Deepgram not configured. Please set DEEPGRAM_API_KEY in your .env file.');
        }
      } else {
        providerAvailable = await checkAssemblyAIAvailability();
        if (!providerAvailable) {
          console.error('[TRANSCRIPTION] ❌ AssemblyAI not available');
          throw new Error('AssemblyAI not configured. Please set ASSEMBLYAI_API_KEY in your .env file.');
        }
      }
    }

    // Initialize transcription data variables
    let finalTranscription = '';
    let totalDuration = 0;
    let transcriptionSegments: any[] = [];
    let speakerSegments: any[] = [];
    let baseCost = 0;
    let metadata: any = null;

    // Step 1: Get base transcription
    if (hasCache) {
      // Use cached data
      console.log('[TRANSCRIPTION] ♻️ Using cached base transcription');
      finalTranscription = existingProject.transcription_text || '';
      totalDuration = existingProject.audio_duration || 0;
      transcriptionSegments = existingProject.transcription_segments || [];

      // Extract speaker segments from cached speaker_data
      if (existingProject.speaker_data && typeof existingProject.speaker_data === 'object') {
        const speakerData = existingProject.speaker_data as any;
        const rawSegments: any[] = speakerData.segments || [];
        // Reset speakerId back to the original raw diarization cluster ID (initialSpeakerId)
        // so the speaker pipeline re-runs on clean acoustic clusters rather than stale
        // pipeline-output IDs (e.g. "speaker_1") which would cause the cluster-count
        // logic and GPT context to see the wrong number of distinct voices.
        speakerSegments = rawSegments.map((seg: any) => ({
          ...seg,
          speakerId: seg.initialSpeakerId || seg.rawClusterId || seg.speakerId,
        }));
      }

      baseCost = 0; // No cost for cached transcription
      console.log(`[TRANSCRIPTION] ♻️ Loaded ${speakerSegments.length} speaker segments from cache`);

      // Increment cache reference since we successfully used it
      const { incrementReferenceCount } = await import('@/lib/transcription-cache');
      const fingerprint = payload.fingerprint as string | undefined;
      await incrementReferenceCount(fingerprint);
    } else {
      let fileBuffer: Buffer | null = null;
      let fileSize = 0;

      const storageFile = await loadAudioFromStorage(projectId, fileName);
      if (storageFile) {
        fileBuffer = storageFile.buffer;
        fileSize = storageFile.size;
      } else if (global.uploadedFiles) {
        const fileKeys = buildInMemoryKeys(fileName);
        let fileData: {
          buffer: ArrayBuffer;
          contentType: string;
          originalName: string;
          size: number;
        } | undefined;

        for (const key of fileKeys) {
          fileData = global.uploadedFiles.get(key);
          if (fileData) {
            console.log(`[TRANSCRIPTION] ✅ Found file in memory with key: "${key}"`);
            break;
          }
        }

        if (fileData) {
          fileBuffer = Buffer.from(fileData.buffer);
          fileSize = fileData.size;
        } else {
          throw new Error(`Audio file not found. Tried storage and in-memory keys: ${fileKeys.join(', ')}`);
        }
      } else {
        throw new Error('Audio file not available for transcription.');
      }

      console.log(`[TRANSCRIPTION] 📊 File size: ${Math.round(fileSize / 1024 / 1024 * 100) / 100}MB`);

      // Save audio file to temp location
      const tempDir = os.tmpdir();
      const tempFileName = `${diarizationProvider}_${Date.now()}_${fileName.split('/').pop()}`;
      tempAudioFilePath = path.join(tempDir, tempFileName);

      await fs.writeFile(tempAudioFilePath, fileBuffer);
      console.log(`[TRANSCRIPTION] 📁 Temp audio file created: ${tempAudioFilePath}`);

      // Pre-flight credit balance check
      const userId = existingProject?.user_id;
      if (userId && !uploadReservationId) {
        try {
          // Estimate transcription cost based on file size (rough estimate: 1MB ≈ 60 seconds)
          const estimatedDurationSeconds = Math.ceil((fileSize / 1024 / 1024) * 60);
          const estimatedCost = estimateTranscriptionCost({
            durationSeconds: estimatedDurationSeconds,
            tier,
            analysisOptions,
          });

          console.log(`[BILLING] 💰 Estimated cost: $${estimatedCost.total.toFixed(4)} for ~${(estimatedDurationSeconds / 60).toFixed(1)} minutes`);

          // Check if user has sufficient credits
          await requireSufficientCredit(userId, estimatedCost.total);
          console.log(`[BILLING] ✅ User has sufficient credits`);
        } catch (error) {
          if (error instanceof InsufficientCreditError) {
            console.error(`[BILLING] ❌ Insufficient credits: need $${error.required.toFixed(4)}, have $${error.available.toFixed(4)}`);
            return NextResponse.json(
              {
                error: 'Insufficient credits',
                required: error.required,
                available: error.available,
                shortfall: error.required - error.available,
              },
              { status: 402 } // Payment Required
            );
          }
          console.error('[BILLING] ⚠️ Credit check failed, continuing anyway:', error);
        }
      }

      // Update progress: Starting transcription
      await updateProcessingProgress(projectId, {
        stage: 'transcribing' as ProcessingStage,
        progress: 0,
        message: `Starting transcription with ${diarizationProvider === 'deepgram' ? 'Deepgram' : 'AssemblyAI'}...`
      });

      // Call Provider for transcription + diarization
      let result: any;
      let transcriptionDone = false;

      // Background drip: advance stage progress while the provider works.
      // delayMs values are CUMULATIVE from start (not per-step).
      // Stops as soon as the real transcription result arrives.
      const drip = (async () => {
        const steps = [
          { delayMs: 5_000,   progress: 10, message: 'Transcribing audio...' },
          { delayMs: 12_000,  progress: 20, message: 'Transcribing audio...' },
          { delayMs: 30_000,  progress: 35, message: 'Transcribing audio...' },
          { delayMs: 55_000,  progress: 50, message: 'Transcribing audio...' },
          { delayMs: 85_000,  progress: 65, message: 'Transcribing audio...' },
          { delayMs: 120_000, progress: 80, message: 'Almost done transcribing...' },
        ];
        const dripStart = Date.now();
        for (const step of steps) {
          const elapsed = Date.now() - dripStart;
          const delta = step.delayMs - elapsed;
          if (delta > 0) await sleep(delta);
          if (transcriptionDone) break;
          await updateProcessingProgress(projectId, {
            stage: 'transcribing' as ProcessingStage,
            progress: step.progress,
            message: step.message,
          });
        }
      })();

      if (diarizationProvider === 'deepgram') {
        console.log('[TRANSCRIPTION] 📡 Starting Deepgram transcription...');
        result = await transcribeWithDeepgram(tempAudioFilePath);
      } else {
        console.log('[TRANSCRIPTION] 📡 Starting AssemblyAI transcription...');
        result = await transcribeWithAssemblyAI(tempAudioFilePath, {
          speakersExpected: speakerCount
        });
      }

      transcriptionDone = true;
      void drip; // drip will exit on its next iteration check

      if (!result.success) {
        throw new Error(result.error || 'Transcription failed');
      }

      console.log(`[TRANSCRIPTION] ✅ Processing completed in ${result.metadata?.processing_time.toFixed(1)}s`);
      console.log(`[TRANSCRIPTION] 📊 Duration: ${result.metadata?.audio_duration.toFixed(1)}s`);
      console.log(`[TRANSCRIPTION] 📊 Detected ${result.metadata?.total_speakers} speakers`);

      finalTranscription = result.text || '';
      totalDuration = result.metadata?.audio_duration || 0;
      transcriptionSegments = result.transcription_segments || [];
      speakerSegments = result.speaker_segments || [];
      baseCost = result.metadata?.cost_usd || 0;
      metadata = result.metadata || null;

      // Track usage and debit credits
      if (userId && totalDuration > 0) {
        try {
          // Use trackAssemblyAIUsage for Deepgram too for now, as it handles general time-based billing
          // In future, we should add specific trackDeepgramUsage if costs differ significantly structure-wise
          const billingResult = await trackAssemblyAIUsage({
            userId,
            projectId,
            reservationId: uploadReservationId,
            durationSeconds: totalDuration,
            metadata: {
              processingTime: metadata?.processing_time,
              speakerCount: metadata?.total_speakers,
              confidence: metadata?.confidence,
              provider: diarizationProvider
            },
            shouldDebit: uploadReservationId ? false : true,
          });

          console.log(`[BILLING] ✅ Tracked usage: $${billingResult.billedCost.toFixed(4)} (${(totalDuration / 60).toFixed(1)} minutes)`);
        } catch (error) {
          console.error('[BILLING] ⚠️ Failed to track usage:', error);
        }
      }

      // Update progress: Transcription completed
      await updateProcessingProgress(projectId, {
        stage: 'transcribing' as ProcessingStage,
        progress: 100,
        message: 'Transcription completed successfully!'
      });

      // Cache the base transcription
      const { cacheTranscriptionResult } = await import('@/lib/transcription-cache');
      const fingerprint = payload.fingerprint as string | undefined;

      if (fingerprint) {
        const detectedSpeakersForCache = groupSegmentsBySpeaker(speakerSegments);
        await cacheTranscriptionResult(fingerprint, {
          transcriptionText: finalTranscription,
          transcriptionSegments,
          speakerData: {
            segments: speakerSegments,
            speakers: detectedSpeakersForCache,
            detectionMetadata: {
              method: diarizationProvider,
              processedAt: new Date().toISOString(),
              ...metadata
            }
          },
          duration: totalDuration
        });

        const { incrementReferenceCount } = await import('@/lib/transcription-cache');
        await incrementReferenceCount(fingerprint);
      }
    }

    // Calculate base transcription cost
    let aiProcessingCost = 0;
    const aiTokenUsage: Record<string, { input: number; output: number }> = {};

    // SEGMENT LABELING: Detect ad reads and intro segments for labeling (not filtering)
    let nonSpeakerFilters = new Map();

    try {
      console.log('[SEGMENT LABELING] Detecting ad reads and intro segments for labeling...');
      const { detectNonSpeakerSegments } = await import('@/lib/speaker-segment-filter');
      nonSpeakerFilters = detectNonSpeakerSegments(speakerSegments);

      if (nonSpeakerFilters.size > 0) {
        console.log('[SEGMENT LABELING] Detected special segments for labeling:');
        for (const [speakerId, filter] of nonSpeakerFilters) {
          console.log(`  - ${speakerId}: ${filter.filterReason} (confidence: ${filter.confidence.toFixed(2)})`);
        }
      } else {
        console.log('[SEGMENT LABELING] No special segments detected');
      }
    } catch (error) {
      console.error('[SEGMENT LABELING] Error during detection, continuing without labels:', error);
    }

    // Group segments by speaker
    const detectedSpeakers = groupSegmentsBySpeaker(speakerSegments);
    console.log(`[TRANSCRIPTION] 📊 Grouped into ${Object.keys(detectedSpeakers).length} unique speakers`);

    // Default to numbered speakers unless name extraction is requested
    const sortedSpeakerIds = Object.keys(detectedSpeakers).sort();
    for (let i = 0; i < sortedSpeakerIds.length; i++) {
      const speakerId = sortedSpeakerIds[i];
      const speaker = detectedSpeakers[speakerId] as any;
      speaker.fallbackName = `Speaker ${i + 1}`;
      speaker.finalName = `Speaker ${i + 1}`;
    }

    // Update progress: Diarization completed
    await updateProcessingProgress(projectId, {
      stage: 'diarization' as ProcessingStage,
      progress: 100,
      message: `Identified ${Object.keys(detectedSpeakers).length} speakers in the conversation`
    });

    // ============================================================
    // STEP 2: EARLY CLASSIFICATION (Hoist and Branch Pattern)
    // Classify project type FIRST before any LLM processing
    // This allows us to skip expensive LLM calls for DEBATE content
    // ============================================================
    let projectType: ProjectType = 'OTHER';
    let classificationConfidence = 0;
    let classificationSignals: any[] = [];
    let classificationMetadata: any = {};

    try {
      console.log(`\n[CLASSIFY] 🎯 EARLY CLASSIFICATION: Detecting project type BEFORE LLM processing...`);
      const classification = await classifyProjectTypeWithAI(
        finalTranscription,
        speakerSegments, // Use RAW segments, not LLM-processed ones
        {
          openaiApiKey: openaiApiKey ?? undefined,
          userId: existingProject?.user_id,
          projectId,
        }
      );

      projectType = classification.type;
      classificationConfidence = classification.confidence;
      classificationSignals = classification.signals.filter(s => s.detected);
      classificationMetadata = classification.metadata;

      console.log(`[CLASSIFY] ✅ Detected type: ${projectType} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);
      if (classification.metadata.moderatorCandidate) {
        console.log(`[CLASSIFY] 🎤 Moderator candidate: ${classification.metadata.moderatorCandidate}`);
      }
    } catch (classifyError) {
      console.error('[CLASSIFY] ⚠️ Early classification failed, defaulting to OTHER:', classifyError);
      projectType = 'OTHER';
    }

    // ============================================================
    // STEP 3: LLM PIPELINE (Always runs first)
    // GPT-5 extracts speaker names → GPT-5-nano reassigns segments
    // This provides the ROSTER that debate correction needs
    // ============================================================
    let speakersWithNames = detectedSpeakers;
    let reassignedSegments = speakerSegments; // Will be updated by LLM pipeline
    let debateCorrectionResult: any = null; // Store debate correction metadata
    let llmExtractedRoster: Array<{ name: string; aliases: string[] }> = []; // Roster from LLM
    let pipelineDiagnostics: any = null;
    const explicitPresetRoster = Array.isArray(existingProject?.preset_speakers)
      ? existingProject!.preset_speakers!.map((speaker: any) => ({
          name: speaker.name,
          role: speaker.role ?? null,
          aliases: Array.isArray(speaker.aliases) ? speaker.aliases : undefined,
        }))
      : [];
    const inferredShowContext = await inferRecurringShowRoster({
      userId: existingProject?.user_id,
      projectId,
      title: existingProject?.title || fileName,
      filename: fileName,
      segments: speakerSegments,
      explicitRoster: explicitPresetRoster,
    });
    const effectivePresetRoster = inferredShowContext.effectiveRoster;

    // Check if we have any roster guidance (user-provided or inferred recurring show memory)
    const hasRoster = effectivePresetRoster.length > 0;

    // Do not infer speakerCount from preset roster size.
    // A partial roster (e.g. 2 names for a 5-speaker file) should not constrain GPT extraction.
    const effectiveSpeakerCount = speakerCount;
    if (!effectiveSpeakerCount && hasRoster) {
      console.log('[TRANSCRIPTION] Preset roster detected; speakerCount left unset so GPT can discover additional speakers');
    }
    if (inferredShowContext.showIdentity) {
      console.log(
        `[SHOW MEMORY] Matched ${inferredShowContext.showIdentity.displayName} via ${inferredShowContext.showIdentity.matchedBy}; ` +
        `effective recurring roster: ${effectivePresetRoster.map((speaker) => `${speaker.name}${speaker.role ? ` [${speaker.role}]` : ''}`).join(', ')}`
      );
    }

    // Run the LLM speaker pipeline only when named speakers are requested
    if (features.nameExtraction || features.aiSummary) {
      console.log(`\n========================================`);
      console.log(`[LLM] 🤖 STEP 1: Running LLM Pipeline (Always First)`);
      console.log(`[LLM] Using GPT-5 (intelligence) + GPT-5-nano (reassignment)`);
      console.log(`[LLM] Purpose: Extract speaker names to build roster`);
      console.log(`========================================\n`);

      if (features.nameExtraction) {
        try {
          // Update progress: Starting speaker attribution
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 0,
            message: 'Running speaker attribution (GPT-5 + GPT-5-nano)...'
          });

          console.log('[AI] 📝 Starting refactored speaker attribution pipeline...');

          // Run refactored pipeline: GPT-5 (intelligence) → GPT-5-nano (reassignment)
          const { runRefactoredSpeakerPipeline } = await import('@/lib/refactored-speaker-pipeline');

          const pipelineResult = await runRefactoredSpeakerPipeline(speakerSegments, {
            openaiApiKey: openaiApiKey ?? undefined,
            userId: existingProject?.user_id,
            projectId,
            reservationId: uploadReservationId,
            filename: fileName, // Pass filename for priming
            title: existingProject?.title || undefined,
            speakerCount: effectiveSpeakerCount, // Pass expected speaker count (explicit or inferred)
            projectType,
            mappingMode: 'csp',
            hasPresetRoster: hasRoster ?? undefined,
            presetRoster: hasRoster ? effectivePresetRoster : undefined,
          });

          // Use GPT's authoritative speaker data
          speakersWithNames = pipelineResult.speakerData.speakers;
          reassignedSegments = pipelineResult.segments; // Use GPT-5-nano reassigned segments
          pipelineDiagnostics = pipelineResult.diagnostics;
          pipelineDiagnostics = {
            ...(pipelineDiagnostics || {}),
            finalizationSnapshots: Array.isArray(pipelineDiagnostics?.finalizationSnapshots)
              ? pipelineDiagnostics.finalizationSnapshots
              : [],
            showIdentity: inferredShowContext.showIdentity
              ? {
                  id: inferredShowContext.showIdentity.id,
                  displayName: inferredShowContext.showIdentity.displayName,
                  matchedBy: inferredShowContext.showIdentity.matchedBy,
                }
              : null,
            showRosterMatches: effectivePresetRoster.map((speaker) => ({
              name: speaker.name,
              role: speaker.role || null,
              aliases: speaker.aliases || [],
              confidenceSource: speaker.confidenceSource || null,
            })),
          };
          pipelineDiagnostics.finalizationSnapshots.push(
            collectSpeakerPipelineSnapshot(
              'pipeline_return',
              reassignedSegments,
              speakersWithNames,
              {
                projectType,
                title: existingProject?.title || undefined,
                filename: fileName,
                showIdentity: inferredShowContext.showIdentity,
                showRoster: effectivePresetRoster,
              }
            )
          );
          console.log(`[PIPELINE] Mapper used: ${pipelineResult.diagnostics?.mapperUsed || 'unknown'}`);

          const finalIdCount = (pipelineResult.segments || []).filter(
            (s: any) => s.finalSpeakerId
          ).length;
          if (finalIdCount === 0 && (pipelineResult.segments || []).length > 0) {
            console.warn('[PIPELINE] ⚠️ No finalSpeakerId markers detected on segments');
          } else {
            console.log(`[PIPELINE] Final speaker IDs present on ${finalIdCount} segments`);
          }

          // Build roster from LLM-extracted names for potential debate correction
          llmExtractedRoster = pipelineResult.speakers
            .filter(s => s.name && s.name !== 'Unknown' && !s.name.startsWith('Speaker '))
            .map(s => ({
              name: s.name!,
              aliases: [], // LLM doesn't provide aliases, but the name is authoritative
            }));

          // Log pipeline results
          console.log(`[AI] ✅ Pipeline complete:`);
          console.log(`  - GPT-5 identified ${pipelineResult.speakers.length} authoritative speakers`);
          console.log(`  - GPT-5-nano reassigned: ${pipelineResult.segments.length} segments`);
          console.log(`  - LLM Roster extracted: ${llmExtractedRoster.map(r => r.name).join(', ') || '(none)'}`);
          console.log(`  - Cost: ~$0.015-0.03 (GPT-5 + GPT-5-nano)`);

          pipelineResult.speakers.forEach(speaker => {
            console.log(`    ${speaker.id}: ${speaker.name || '(unnamed)'} [${speaker.role}]`);
          });

          // Update progress
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 100,
            message: `Identified ${pipelineResult.speakers.length} speakers (GPT-5 + GPT-5-nano)`
          });
        } catch (error: any) {
          console.error('[AI] ⚠️ Refactored pipeline failed:', error.message);
          console.error('[AI] Stack trace:', error.stack);
          console.error('[AI] Falling back to numbered speakers');

          // Fallback: Use numbered speakers
          speakersWithNames = detectedSpeakers;
        }
      }

      // Pre-process transcript to extract signal and filter noise
      let narrativeMetadata;
      try {
        console.log('[AI] 🔍 Pre-processing transcript to extract signal...');
        const speakerContext = Object.fromEntries(
          Object.entries(speakersWithNames).map(([id, speaker]: [string, any]) => [
            id,
            { name: speaker.finalName || speaker.fallbackName || id }
          ])
        );

        const preProcessResult = await preProcessTranscript(finalTranscription, {
          speakerContext,
          userId: existingProject?.user_id,
          projectId,
          reservationId: uploadReservationId,
          apiKey: openaiApiKey || undefined,
        });
        narrativeMetadata = preProcessResult.metadata;
        console.log('[AI] ✅ Pre-processing complete');
      } catch (error: any) {
        console.error('[AI] ⚠️  Pre-processing failed:', error.message);
        // Continue without pre-processing if it fails
      }

      // ============================================================
      // STEP 4: DEBATE POST-PROCESSING (Cleanup Layer)
      // If DEBATE detected, use the LLM-extracted roster to fix drift
      // ============================================================
      if (projectType === 'DEBATE') {
        console.log(`\n========================================`);
        console.log(`[DEBATE] 🔒 STEP 2: DEBATE Post-Processing Cleanup`);
        console.log(`[DEBATE] LLM ran first → Now applying Moderator Flow correction`);
        console.log(`[DEBATE] Purpose: Fix any "drift" in LLM assignments`);
        console.log(`========================================\n`);

        // Determine which roster to use: preset_speakers (if provided) or LLM-extracted
        const hasPresetRoster = existingProject?.preset_speakers &&
          Array.isArray(existingProject.preset_speakers) &&
          existingProject.preset_speakers.length > 0;

        let roster: Array<{ id?: string; name: string; role?: string; aliases: string[] }>;

        if (hasPresetRoster) {
          roster = buildDebateRosterEntriesFromPreset(existingProject!.preset_speakers!, speakersWithNames);
          console.log(`[DEBATE] Using PRESET roster: ${roster.map(r => r.name).join(', ')}`);
        } else if (llmExtractedRoster.length > 0) {
          roster = buildDebateRosterEntriesFromSpeakerMap(speakersWithNames);
          console.log(`[DEBATE] Using LLM-EXTRACTED roster: ${roster.map(r => r.name).join(', ')}`);
        } else {
          // No roster available - skip debate correction
          console.log(`[DEBATE] ⚠️ No roster available (preset or LLM-extracted)`);
          console.log(`[DEBATE] Skipping debate correction - keeping LLM assignments`);
          roster = [];
        }

        // DISABLED: correctDebateSpeakers was creating phantom speakers (e.g. "in")
        // by overwriting correct assignments with broken lookahead logic.
        // Keeping the pipeline at: GPT → Orphan Recovery → Conflict Detection → CSP → Reconciliation
        const ENABLE_DEBATE_CORRECTION = false;

        if (roster.length > 0 && ENABLE_DEBATE_CORRECTION) {
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 50,
            message: 'Applying debate-specific speaker correction...'
          });

          // Run debate correction on the LLM-reassigned segments
          const debateResult = correctDebateSpeakers(reassignedSegments, roster);

          // Log the full summary
          console.log(`\n${summarizeDebateCorrections(debateResult)}\n`);

          // Count segments that were actually modified
          const modifiedSegmentCount = debateResult.segments.filter(
            (s: any) => s._debateCorrected
          ).length;

          console.log(`[DEBATE] Fixed ${modifiedSegmentCount} speaker labels across ${debateResult.segments.length} total segments`);

          if (debateResult.corrections.length > 0) {
            // Apply corrections to speaker data
            const correctedData = applyDebateCorrectionToSpeakerData(
              { segments: reassignedSegments, speakers: speakersWithNames },
              debateResult
            );

            speakersWithNames = correctedData.speakers as typeof speakersWithNames;
            reassignedSegments = correctedData.segments;
            const debateRemap = applyDebateCorrectionsToFinalIds(
              reassignedSegments,
              speakersWithNames,
              debateResult.corrections
            );
            reassignedSegments = debateRemap.segments;
            speakersWithNames = debateRemap.speakers;
            const lockResult = applyIntroHandoffLocks(
              reassignedSegments,
              speakersWithNames,
              debateResult
            );
            reassignedSegments = lockResult.segments;
            if (lockResult.lockedSegments > 0) {
              console.log(`[DEBATE] Intro handoff locks applied: ${lockResult.lockedSegments} segments`);
            }
            reassignedSegments = enforceFinalSpeakerIdContract(
              reassignedSegments,
              '[DEBATE] post-correction'
            );
            logSpeakerAssignmentCounts(reassignedSegments, '[DEBATE] post-correction');

            // Store correction metadata
            debateCorrectionResult = {
              hostId: debateResult.hostId,
              hostConfidence: debateResult.hostConfidence,
              hostDetectionMethod: debateResult.algorithmMetadata.hostDetectionMethod,
              rosterSource: hasPresetRoster ? 'preset_speakers' : 'llm_extracted',
              corrections: debateResult.corrections.map(c => ({
                speakerId: c.speakerId,
                assignedName: c.assignedName,
                reason: c.assignmentReason,
                confidence: c.confidence,
                introducedAtSegment: c.introducedAtSegment,
                introducedByPhrase: c.introducedByPhrase,
              })),
              metadata: {
                ...debateResult.algorithmMetadata,
                modifiedSegmentCount,
              },
              debugLog: debateResult.debugLog,
            };

            console.log(`[DEBATE] ✅ Applied ${debateResult.corrections.length} debate corrections:`);
            console.log(`[DEBATE]   Host: ${debateResult.hostId || 'Not detected'} (method: ${debateResult.algorithmMetadata.hostDetectionMethod})`);
            console.log(`[DEBATE]   Lookahead assignments: ${debateResult.algorithmMetadata.lookaheadAssignments}`);
            console.log(`[DEBATE]   Name introductions found: ${debateResult.algorithmMetadata.nameIntroductionsFound}`);

            debateResult.corrections.forEach(c => {
              const phraseInfo = c.introducedByPhrase ? ` via "${c.introducedByPhrase}"` : '';
              console.log(`[DEBATE]   ${c.speakerId} → "${c.assignedName}" (${c.assignmentReason}, ${(c.confidence * 100).toFixed(0)}%${phraseInfo})`);
            });

            if (debateResult.unassignedSpeakers.length > 0) {
              console.log(`[DEBATE]   ⚠️ Unassigned speakers: ${debateResult.unassignedSpeakers.join(', ')}`);
            }
          } else {
            console.log(`[DEBATE] ℹ️ No corrections needed - LLM assignments appear correct`);
            console.log(`[DEBATE] Debug: Host detection method: ${debateResult.algorithmMetadata.hostDetectionMethod}`);
            console.log(`[DEBATE] Debug: Host ID: ${debateResult.hostId || 'NOT FOUND'}`);

            // Log last debug entries for troubleshooting
            if (debateResult.debugLog.length > 0) {
              console.log(`[DEBATE] Last debug entries:`);
              debateResult.debugLog.slice(-10).forEach((log: string) => console.log(`[DEBATE]   ${log}`));
            }
          }

          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 100,
            message: `Debate correction complete: ${debateResult.corrections.length} fixes applied`
          });
        } else if (roster.length > 0 && !ENABLE_DEBATE_CORRECTION) {
          console.log(`[DEBATE] ⚠️ Debate correction DISABLED (roster has ${roster.length} speakers)`);
          console.log(`[DEBATE] Using speaker assignments from: GPT → Orphan Recovery → Conflict Detection → CSP → Reconciliation`);
          console.log(`[DEBATE] Speaker names from earlier passes will be preserved (no lookahead overwrites)`);
        }
      } else {
        console.log(`[CLASSIFY] ℹ️ ${projectType} detected - no debate post-processing needed`);
      }

    } // End of: if (features.nameExtraction || features.aiSummary)
    // NOTE: Summary, roles, chapters, takeaways, quotes now run in background

    // Cost calculation
    // Note: AI processing costs are now billed directly by the generator functions
    // via trackOpenAIUsage using the centralized COST_MAP.

    // We only track the base transcription cost here as that's handled by this route
    let totalCost = baseCost;

    console.log(`\n[COST] 💰 Cost Summary:`);
    console.log(`[COST]   Transcription: $${baseCost.toFixed(4)} (${diarizationProvider})`);
    console.log(`[COST]   AI Processing: Billed individually by features`);
    console.log(`[COST]   Total Base Cost: $${totalCost.toFixed(4)}`);

    // ============================================================
    // STEP 4: POST-PROCESSING CORRECTIONS (Non-DEBATE only)
    // For INTERVIEW/PODCAST/OTHER with a roster, apply Self-ID corrections
    // Note: DEBATE was already handled in the early branch above
    // ============================================================
    if (projectType !== 'DEBATE' && hasRoster) {
      try {
        const roster = effectivePresetRoster.map((speaker: any) => ({
          name: speaker.name || speaker,
          aliases: speaker.aliases || [],
        }));

        console.log(`\n[CORRECTION] 🎯 Applying Self-ID anchor patterns for ${projectType}...`);
        console.log(`[CORRECTION] Roster entries: ${roster.map((r: any) => r.name).join(', ')}`);

        const anchorResult = autoCorrectSpeakers(reassignedSegments, roster);

        if (anchorResult.corrections.length > 0) {
          // Apply corrections to speaker names
          const correctedSpeakerData = applySpeakerCorrections(
            { segments: reassignedSegments, speakers: speakersWithNames },
            anchorResult.corrections
          );
          speakersWithNames = correctedSpeakerData.speakers as typeof speakersWithNames;

          console.log(`[CORRECTION] ✅ Applied ${anchorResult.corrections.length} anchor corrections:`);
          anchorResult.corrections.forEach(c => {
            console.log(`[CORRECTION]   ${c.speakerId} → "${c.correctedName}" (pattern: "${c.anchor.pattern}", ${(c.anchor.confidence * 100).toFixed(0)}%)`);
          });
        } else {
          console.log(`[CORRECTION] ℹ️ No self-identification phrases found matching roster`);
        }

        reassignedSegments = enforceFinalSpeakerIdContract(
          reassignedSegments,
          '[CORRECTION] post-anchor'
        );
        logSpeakerAssignmentCounts(reassignedSegments, '[CORRECTION] post-anchor');
      } catch (correctionError) {
        console.error('[CORRECTION] ⚠️ Self-ID correction failed (non-fatal):', correctionError);
      }
    }

    // ============================================================
    // STEP 4.5: POST-CORRECTION DUPLICATE NAME MERGE
    // ============================================================
    const mergeResult = mergeDuplicateSpeakersByName(reassignedSegments, speakersWithNames, {
      projectType,
      title: existingProject?.title || undefined,
      filename: fileName,
      showIdentity: inferredShowContext.showIdentity,
      showRoster: effectivePresetRoster,
    });
    if (mergeResult.mergedCount > 0) {
      reassignedSegments = mergeResult.segments;
      speakersWithNames = mergeResult.speakers;
      reassignedSegments = enforceFinalSpeakerIdContract(
        reassignedSegments,
        '[MERGE] post-duplicate-name'
      );
      logSpeakerAssignmentCounts(reassignedSegments, '[MERGE] post-duplicate-name');
      console.log(`[MERGE] ✅ Merged ${mergeResult.mergedCount} duplicate speaker name(s)`);
    }
    if (pipelineDiagnostics?.finalizationSnapshots) {
      pipelineDiagnostics.finalizationSnapshots.push(
        collectSpeakerPipelineSnapshot(
          'post-duplicate-merge',
          reassignedSegments,
          speakersWithNames,
          {
            projectType,
            title: existingProject?.title || undefined,
            filename: fileName,
            showIdentity: inferredShowContext.showIdentity,
            showRoster: effectivePresetRoster,
          }
        )
      );
    }

    const smoothingResult = applyNeighborSmoothing(reassignedSegments, { projectType });
    reassignedSegments = smoothingResult.segments;
    if (smoothingResult.updatedSegments > 0) {
      console.log(`[SMOOTH] Neighbor smoothing applied: ${smoothingResult.updatedSegments} segments`);
    }
    if (pipelineDiagnostics?.finalizationSnapshots) {
      pipelineDiagnostics.finalizationSnapshots.push(
        collectSpeakerPipelineSnapshot(
          'post-neighbor-smoothing',
          reassignedSegments,
          speakersWithNames,
          {
            projectType,
            title: existingProject?.title || undefined,
            filename: fileName,
            showIdentity: inferredShowContext.showIdentity,
            showRoster: effectivePresetRoster,
          }
        )
      );
    }

    // ============================================================
    // STEP 5: BUILD UNIFIED SPEAKER DATA (Both branches feed here)
    // ============================================================
    let finalSegments = enforceFinalSpeakerIdContract(
      reassignedSegments,
      '[FINAL] post-corrections'
    );
    logSpeakerAssignmentCounts(finalSegments, '[FINAL] post-corrections');

    if (pipelineDiagnostics?.finalizationSnapshots) {
      pipelineDiagnostics.finalizationSnapshots.push(
        collectSpeakerPipelineSnapshot(
          'pre-build-speaker-data',
          finalSegments,
          speakersWithNames,
          {
            projectType,
            title: existingProject?.title || undefined,
            filename: fileName,
            showIdentity: inferredShowContext.showIdentity,
            showRoster: effectivePresetRoster,
          }
        )
      );
    }

    const finalHumanNaming = finalizeSpeakerAttributionForStorage(
      speakersWithNames,
      finalSegments,
      {
        projectType,
        title: existingProject?.title || undefined,
        filename: fileName,
        showIdentity: inferredShowContext.showIdentity,
        showRoster: effectivePresetRoster,
      }
    );
    finalSegments = finalHumanNaming.segments;
    speakersWithNames = finalHumanNaming.speakers;
    if (finalHumanNaming.namingAssigned > 0) {
      console.log(`[FINAL NAMING] Assigned ${finalHumanNaming.namingAssigned} conversational speaker name(s)`);
    }
    for (const infoLine of finalHumanNaming.namingInfo) {
      console.log(infoLine);
    }
    if (pipelineDiagnostics?.finalizationSnapshots) {
      pipelineDiagnostics.finalizationSnapshots.push(finalHumanNaming.snapshot);
    }

    const speakersFromSegments = finalHumanNaming.speakerDataSpeakers;

    const rawSpeakerData: any = {
      segments: finalSegments,
      speakers: speakersFromSegments,
      // Classification metadata (from early classification)
      projectType,
      classificationConfidence,
      classificationSignals,
      classificationMetadata,
      detectionMetadata: {
        totalSpeakers: Object.keys(speakersFromSegments).length,
        totalSegments: finalSegments.length,
        processedAt: new Date().toISOString(),
        processingTimeMs: (metadata?.processing_time || 0) * 1000,
        method: hasCache ? 'cache' : (features.nameExtraction ? 'gpt-pipeline' : diarizationProvider),
        confidence: metadata?.confidence || 0,
        tier,
        finalSpeakerIdAuthoritative: true,
        pipelineDiagnostics,
        pipelineBranch: 'LLM_FIRST', // LLM always runs first now
        debatePostProcessing: projectType === 'DEBATE', // Debate correction as cleanup layer
        aiProcessing: {
          nameExtraction: features.nameExtraction,
          summary: features.aiSummary ? false : true,
          roles: features.roleClassification ? false : true,
          chapters: features.chapterDetection ? false : true,
          takeaways: features.keyTakeaways ? false : true,
          quotes: features.quotesExtraction ? false : true,
          insights: features.insights ? false : true,
          debateCorrectionApplied: projectType === 'DEBATE' && debateCorrectionResult !== null,
        }
      }
    };
    const speakerData = attachSpeakerAssignmentMetadata(rawSpeakerData);

    // Add debate correction metadata if applicable
    if (debateCorrectionResult) {
      speakerData.debateCorrections = debateCorrectionResult;
    }

    // Add segment labels for special segments (ad reads, intros, etc.)
    if (nonSpeakerFilters.size > 0) {
      const labeledSegments = Array.from(nonSpeakerFilters.entries()).map(([id, filter]) => ({
        speakerId: id,
        label: filter.filterReason,  // ad_read, intro, etc.
        confidence: filter.confidence,
        evidence: filter.evidence
      }));
      speakerData.segmentLabels = labeledSegments;
      console.log(`[LABELING] 💾 Storing labels for ${labeledSegments.length} special segments in speaker_data`);
    }

    // Build cost breakdown
    const costBreakdown = {
      transcription: baseCost,
      diarization: 0,
      aiProcessing: aiProcessingCost,
      generation: 0,
      total: totalCost,
      provider: diarizationProvider,
      tier,
      aiTokenUsage
    };

    // Prepare database update
    const updateData: any = {
      transcription_text: finalTranscription,
      transcription_segments: JSON.stringify(transcriptionSegments),
      speaker_data: speakerData,
      status: 'completed',
      processing_completed_at: new Date().toISOString(),
      processing_time_seconds: Math.round((Date.now() - startTime) / 1000),
      audio_duration_seconds: totalDuration,
      actual_processing_cost: totalCost,
      cost_breakdown: costBreakdown,
      performance_level: tier,
      project_type: projectType, // Context-aware classification (DEBATE, INTERVIEW, etc.)
    };

    await updateProcessingProgress(projectId, {
      stage: 'finalizing' as ProcessingStage,
      progress: 50,
      message: 'Saving conversation results...'
    });

    console.log(`\n[DATABASE] 💾 Saving results to project ${projectId}...`);
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    if (updateError) {
      console.error('[DATABASE] ❌ Failed to save results:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    await updateProcessingProgress(projectId, {
      stage: 'completed' as ProcessingStage,
      progress: 100,
      message: 'Conversation ready. Generating summaries and insights in the background...'
    });

    // Background AI content processing (summary, roles, chapters, takeaways, quotes, insights)
    if (finalTranscription && speakerData) {
      scheduleBackgroundTask(
        runBackgroundContentTasks({
          projectId,
          speakerData,
          finalTranscription,
          transcriptionSegments,
          features,
          userId: existingProject?.user_id,
          openaiApiKey: openaiApiKey ?? undefined,
          reservationId: uploadReservationId,
        })
          .catch((error) => {
            console.error('[BACKGROUND] ❌ Failed to run background tasks:', error);
          })
      );
    }

    if (uploadReservationId && !selectedContentBlocks.length) {
      await settleReservation(uploadReservationId);
    }

    // Cleanup
    try {
      if (tempAudioFilePath) await fs.unlink(tempAudioFilePath);
      purgeInMemoryAudio(fileName);
    } catch (e) { }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n========================================`);
    console.log(`[TRANSCRIPTION] ✅ Completed in ${totalTime.toFixed(1)}s`);
    console.log(`========================================\n`);

    return NextResponse.json({
      success: true,
      tier,
      analysisOptions,
      transcription: finalTranscription,
      speakers: Object.keys(speakersWithNames).length,
      duration: totalDuration,
      cost: totalCost,
      costBreakdown,
      features: {
        summary: false,
        chapters: false,
        takeaways: false,
        quotes: false,
        roles: false
      }
    });

  } catch (error: any) {
    console.error('[TRANSCRIPTION] ❌ Error:', error);

    if (parsedProjectId) {
      try {
        const { data: failedProject } = await supabaseAdmin
          .from('projects')
          .select('metadata')
          .eq('id', parsedProjectId)
          .maybeSingle() as { data: any };
        const reservationId: string | undefined = failedProject?.metadata?.billing?.uploadReservationId;
        if (reservationId) {
          await failReservation(reservationId, error.message || 'Transcription failed');
        }
      } catch (billingError) {
        console.error('[TRANSCRIPTION] ❌ Failed to clean up upload reservation:', billingError);
      }
    }

    // Mark project as failed so the UI stops polling
    if (parsedProjectId) {
      try {
        await markProcessingFailed(parsedProjectId, error.message || 'Transcription failed');
        console.log(`[TRANSCRIPTION] ❌ Marked project ${parsedProjectId} as failed`);
      } catch (statusError) {
        console.error('[TRANSCRIPTION] ❌ Could not update project status to failed:', statusError);
      }
    }

    if (tempAudioFilePath) {
      try { await fs.unlink(tempAudioFilePath); } catch { }
    }
    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}

function normalizeSpeakerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getSpeakerNameForMerge(speaker: any): string | null {
  return speaker?.finalName ||
    speaker?.customName ||
    speaker?.extractedName?.name ||
    speaker?.fallbackName ||
    speaker?.name ||
    null;
}

function applyDebateCorrectionsToFinalIds(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  corrections: Array<{ speakerId: string; assignedName: string }>
): { segments: SpeakerSegment[]; speakers: Record<string, any> } {
  if (!corrections || corrections.length === 0) {
    return { segments, speakers };
  }

  const nameToId = new Map<string, string>();
  for (const [id, speaker] of Object.entries(speakers)) {
    const name = getSpeakerNameForMerge(speaker);
    if (!name) continue;
    nameToId.set(normalizeSpeakerName(name), id);
  }

  const remap = new Map<string, string>();
  for (const correction of corrections) {
    const targetName = correction.assignedName;
    if (!targetName) continue;
    const normalized = normalizeSpeakerName(targetName);
    let targetId = nameToId.get(normalized);
    if (!targetId) {
      // Create a new speaker entry if missing
      const newId = `speaker_${Object.keys(speakers).length + 1}`;
      speakers[newId] = {
        id: newId,
        finalName: targetName,
        role: 'guest',
        confidence: 0.8,
        source: 'debate_correction',
      };
      targetId = newId;
      nameToId.set(normalized, newId);
    }
    remap.set(correction.speakerId, targetId);
  }

  if (remap.size === 0) return { segments, speakers };

  const updatedSegments = segments.map(seg => {
    const currentId = (seg as any).finalSpeakerId || seg.speakerId;
    const target = remap.get(currentId);
    if (!target) return seg;
    const confidence = typeof seg.confidence === 'number' ? seg.confidence : 0.8;
    return {
      ...seg,
      speakerId: target,
      finalSpeakerId: target,
      confidence,
      status: seg.status ?? 'tentative',
    };
  });

  return { segments: updatedSegments, speakers };
}

function applyIntroHandoffLocks(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  debateResult: {
    corrections: Array<{ speakerId: string; assignedName: string; assignmentReason: string; introducedAtSegment?: number }>;
    hostId: string | null;
  }
): { segments: SpeakerSegment[]; speakers: Record<string, any>; lockedSegments: number } {
  if (!debateResult?.corrections?.length) {
    return { segments, speakers, lockedSegments: 0 };
  }

  const hostId = debateResult.hostId;
  const nameToId = new Map<string, string>();
  for (const [id, speaker] of Object.entries(speakers)) {
    const name = getSpeakerNameForMerge(speaker);
    if (!name) continue;
    nameToId.set(normalizeSpeakerName(name), id);
  }

  const lockTargets = debateResult.corrections.filter(c =>
    c.assignmentReason === 'lookahead' || c.assignmentReason === 'auto_advance' || c.assignmentReason === 'name_introduction'
  );

  if (lockTargets.length === 0) {
    return { segments, speakers, lockedSegments: 0 };
  }

  const updated = [...segments];
  let lockedSegments = 0;

  for (const correction of lockTargets) {
    const targetId = nameToId.get(normalizeSpeakerName(correction.assignedName));
    if (!targetId) continue;
    const anchorIndex = typeof correction.introducedAtSegment === 'number'
      ? correction.introducedAtSegment
      : -1;
    if (anchorIndex < 0 || anchorIndex >= updated.length) continue;

    let locked = 0;
    for (let i = anchorIndex + 1; i < updated.length && locked < 3; i++) {
      const seg = updated[i];
      const currentId = (seg as any).finalSpeakerId || seg.speakerId;
      if (hostId && currentId === hostId) continue;
      // Skip if segment already has a strong correction marker
      if ((seg as any)._debateCorrected || (seg as any)._correctionReason) continue;
      // Lock only low-confidence segments
      const confidence = seg.confidence ?? 1;
      if (confidence < 0.7 || seg.status === 'tentative' || seg.status === 'uncertain') {
        updated[i] = {
          ...seg,
          speakerId: targetId,
          finalSpeakerId: targetId,
          confidence,
          status: seg.status ?? 'tentative',
        };
        locked++;
        lockedSegments++;
      }
    }
  }

  return { segments: updated, speakers, lockedSegments };
}

function buildAliasesFromName(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>();
  aliases.add(trimmed);
  if (parts.length >= 1) aliases.add(parts[0]);
  if (parts.length >= 2) {
    const initials = parts.map(p => p[0]).join('');
    if (initials.length >= 2) aliases.add(initials);
    aliases.add(`${parts[0]} ${parts[parts.length - 1][0]}.`);
  }
  return [...aliases];
}

function buildDebateRosterEntriesFromSpeakerMap(speakers: Record<string, any>) {
  return Object.values(speakers).map((speaker: any) => ({
    id: speaker.id,
    name: speaker.finalName || speaker.name || speaker.fallbackName || speaker.id,
    role: speaker.role,
    aliases: speaker.aliases || buildAliasesFromName(speaker.finalName || speaker.name || speaker.fallbackName || speaker.id),
  }));
}

function buildDebateRosterEntriesFromPreset(preset: any[], speakers: Record<string, any>) {
  return preset.map((entry: any) => {
    const name = entry.name || entry;
    const normalized = name.toLowerCase();
    const matched = Object.values(speakers).find((s: any) =>
      (s.finalName || s.name || '').toLowerCase() === normalized
    );
    return {
      id: matched?.id,
      name,
      role: matched?.role,
      aliases: entry.aliases || buildAliasesFromName(name),
    };
  });
}
