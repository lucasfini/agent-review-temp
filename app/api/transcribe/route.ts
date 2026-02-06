import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
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
import { getTierFeatures, calculateTierCost, type TierLevel } from '@/lib/tier-config';
import { updateProcessingProgress, markProcessingFailed } from '@/lib/progress-tracker';
import { ProcessingStage } from '@/lib/tier-progress-config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SpeakerSegment, TranscriptionSegment } from '@/lib/types';
import { estimateTranscriptionCost } from '@/lib/billing/cost-map';
import { trackAssemblyAIUsage, requireSufficientCredit } from '@/lib/billing/track-usage';
import { InsufficientCreditError } from '@/lib/billing/credit';
import { autoCorrectSpeakers, applySpeakerCorrections } from '@/lib/utils/autoCorrectSpeakers';
import { classifyProjectTypeWithAI, type ProjectType } from '@/lib/utils/classifyProjectType';
import { correctDebateSpeakers, applyDebateCorrectionToSpeakerData, summarizeDebateCorrections } from '@/lib/utils/correctDebateSpeakers';

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

const purgeInMemoryAudio = (fileName: string | undefined) => {
  if (!fileName || !global.uploadedFiles) return;
  const keys = buildInMemoryKeys(fileName);
  keys.forEach(key => global.uploadedFiles?.delete(key));
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let tempAudioFilePath: string | null = null;
  let parsedProjectId: string | undefined;

  try {
    // Parse request
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const {projectId, fileName, performanceLevel, diarizationProvider = 'assemblyai', speakerCount} = payload as {
      projectId?: string;
      fileName?: string;
      performanceLevel?: TierLevel;
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
    const tier: TierLevel = performanceLevel || 'basic';
    const features = getTierFeatures(tier);

    console.log(`\n========================================`);
    console.log(`[TRANSCRIPTION] 🚀 Starting ${tier.toUpperCase()} tier processing`);
    console.log(`[TRANSCRIPTION] Provider: ${diarizationProvider}`);
    console.log(`[TRANSCRIPTION] Project ID: ${projectId}`);
    console.log(`[TRANSCRIPTION] File: ${fileName}`);
    if (speakerCount) console.log(`[TRANSCRIPTION] Expected speakers: ${speakerCount}`);
    console.log(`========================================\n`);

    // Check if project already has cached transcription
    const { data: existingProject, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription_text, transcription_segments, speaker_data, audio_duration, user_id, title, preset_speakers')
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
        } | null;
        error: any
      };

    const hasCache = existingProject && existingProject.transcription_text;

    if (hasCache) {
      console.log('[TRANSCRIPTION] ♻️ Cache detected - skipping transcription, will apply tier features only');
    }

    // Check Provider availability (skip if cache exists)
    if (!hasCache) {
      let providerAvailable = false;
      if (diarizationProvider === 'deepgram') {
        providerAvailable = await checkDeepgramAvailability();
        if (!providerAvailable) {
          console.error('[TRANSCRIPTION] ❌ Deepgram not available');
          return NextResponse.json(
            { error: 'Deepgram not configured. Please set DEEPGRAM_API_KEY in your .env file.' },
            { status: 500 }
          );
        }
      } else {
        providerAvailable = await checkAssemblyAIAvailability();
        if (!providerAvailable) {
          console.error('[TRANSCRIPTION] ❌ AssemblyAI not available');
          return NextResponse.json(
            { error: 'AssemblyAI not configured. Please set ASSEMBLYAI_API_KEY in your .env file.' },
            { status: 500 }
          );
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
        speakerSegments = speakerData.segments || [];
      }

      baseCost = 0; // No cost for cached transcription
      console.log(`[TRANSCRIPTION] ♻️ Loaded ${speakerSegments.length} speaker segments from cache`);

      // Increment cache reference since we successfully used it
      const { incrementReferenceCount } = await import('@/lib/transcription-cache');
      const fingerprint = payload.fingerprint as string | undefined;
      await incrementReferenceCount(fingerprint);
    } else {
      // Retrieve audio file from memory
      if (!global.uploadedFiles) {
        return NextResponse.json(
          { error: 'No file found in memory. Please upload the file first.' },
          { status: 400 }
        );
      }

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

      if (!fileData) {
        return NextResponse.json(
          { error: `Audio file not found in memory. Tried keys: ${fileKeys.join(', ')}` },
          { status: 404 }
        );
      }

      const fileBuffer = Buffer.from(fileData.buffer);
      console.log(`[TRANSCRIPTION] 📊 File size: ${Math.round(fileData.size / 1024 / 1024 * 100) / 100}MB`);

      // Save audio file to temp location
      const tempDir = os.tmpdir();
      const tempFileName = `${diarizationProvider}_${Date.now()}_${fileName.split('/').pop()}`;
      tempAudioFilePath = path.join(tempDir, tempFileName);

      await fs.writeFile(tempAudioFilePath, fileBuffer);
      console.log(`[TRANSCRIPTION] 📁 Temp audio file created: ${tempAudioFilePath}`);

      // Pre-flight credit balance check
      const userId = existingProject?.user_id;
      if (userId) {
        try {
          // Estimate transcription cost based on file size (rough estimate: 1MB ≈ 60 seconds)
          const estimatedDurationSeconds = Math.ceil((fileData.size / 1024 / 1024) * 60);
          const estimatedCost = estimateTranscriptionCost({
            durationSeconds: estimatedDurationSeconds,
            tier,
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
      if (diarizationProvider === 'deepgram') {
        console.log('[TRANSCRIPTION] 📡 Starting Deepgram transcription...');
        result = await transcribeWithDeepgram(tempAudioFilePath);
      } else {
        console.log('[TRANSCRIPTION] 📡 Starting AssemblyAI transcription...');
        result = await transcribeWithAssemblyAI(tempAudioFilePath, {
          speakersExpected: speakerCount
        });
      }

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
            durationSeconds: totalDuration,
            metadata: {
              processingTime: metadata?.processing_time,
              speakerCount: metadata?.total_speakers,
              confidence: metadata?.confidence,
              provider: diarizationProvider
            },
            shouldDebit: true, // Debit credits immediately
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

    // Assign numbered speaker names for Basic tier
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
          openaiApiKey: process.env.OPENAI_API_KEY,
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
    // GPT-4o extracts speaker names → GPT-4o-mini reassigns segments
    // This provides the ROSTER that debate correction needs
    // ============================================================
    let speakersWithNames = detectedSpeakers;
    let summaryData: any = null;
    let chaptersData: any = null;
    let takeawaysData: any = null;
    let quotesData: any = null;
    let roleAssignments: Record<string, any> = {};
    let reassignedSegments = speakerSegments; // Will be updated by LLM pipeline
    let debateCorrectionResult: any = null; // Store debate correction metadata
    let llmExtractedRoster: Array<{ name: string; aliases: string[] }> = []; // Roster from LLM
    let pipelineDiagnostics: any = null;

    // Check if we have a preset roster (user-provided speakers)
    const hasRoster = existingProject?.preset_speakers &&
                      Array.isArray(existingProject.preset_speakers) &&
                      existingProject.preset_speakers.length > 0;

    // Infer speakerCount from roster if not explicitly provided
    // This ensures the pipeline respects the roster size as a ceiling
    let effectiveSpeakerCount = speakerCount;
    if (!effectiveSpeakerCount && hasRoster) {
      effectiveSpeakerCount = existingProject.preset_speakers!.length;
      console.log(`[TRANSCRIPTION] 💡 Inferred expected speakers from roster: ${effectiveSpeakerCount}`);
    }

    // PRO tier and above: Run LLM Pipeline FIRST (before any branching)
    if (features.nameExtraction || features.aiSummary) {
      console.log(`\n========================================`);
      console.log(`[LLM] 🤖 STEP 1: Running LLM Pipeline (Always First)`);
      console.log(`[LLM] Using GPT-4o (intelligence) + GPT-4o-mini (reassignment)`);
      console.log(`[LLM] Purpose: Extract speaker names to build roster`);
      console.log(`========================================\n`);

      if (features.nameExtraction) {
        try {
          // Update progress: Starting speaker attribution
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 0,
            message: 'Running speaker attribution (GPT + Claude)...'
          });

          console.log('[AI] 📝 Starting refactored speaker attribution pipeline...');

          // Run refactored pipeline: GPT-4o (intelligence) → GPT-4o-mini (reassignment)
          const { runRefactoredSpeakerPipeline } = await import('@/lib/refactored-speaker-pipeline');

          const pipelineResult = await runRefactoredSpeakerPipeline(speakerSegments, {
            openaiApiKey: process.env.OPENAI_API_KEY,
            userId: existingProject?.user_id,
            projectId,
            filename: fileName, // Pass filename for priming
            speakerCount: effectiveSpeakerCount, // Pass expected speaker count (explicit or inferred)
            projectType
          });

          // Use GPT's authoritative speaker data
          speakersWithNames = pipelineResult.speakerData.speakers;
          reassignedSegments = pipelineResult.segments; // Use GPT-4o-mini reassigned segments
          pipelineDiagnostics = pipelineResult.diagnostics;

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
          console.log(`  - GPT-4o identified ${pipelineResult.speakers.length} authoritative speakers`);
          console.log(`  - GPT-4o-mini reassigned: ${pipelineResult.segments.length} segments`);
          console.log(`  - LLM Roster extracted: ${llmExtractedRoster.map(r => r.name).join(', ') || '(none)'}`);
          console.log(`  - Cost: ~$0.015-0.03 (GPT-4o + GPT-4o-mini)`);

          pipelineResult.speakers.forEach(speaker => {
            console.log(`    ${speaker.id}: ${speaker.name || '(unnamed)'} [${speaker.role}]`);
          });

          // Update progress
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 100,
            message: `Identified ${pipelineResult.speakers.length} speakers (GPT-4o + GPT-4o-mini)`
          });
        } catch (error: any) {
          console.error('[AI] ⚠️ Refactored pipeline failed:', error.message);
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

        const preProcessResult = await preProcessTranscript(finalTranscription, { speakerContext });
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

      let roster: Array<{ name: string; aliases: string[] }>;

      if (hasPresetRoster) {
        // Use preset speakers (user-provided roster takes priority)
        roster = existingProject!.preset_speakers!.map((speaker: any) => ({
          name: speaker.name || speaker,
          aliases: speaker.aliases || [],
        }));
        console.log(`[DEBATE] Using PRESET roster: ${roster.map(r => r.name).join(', ')}`);
      } else if (llmExtractedRoster.length > 0) {
        // Use LLM-extracted roster
        roster = llmExtractedRoster;
        console.log(`[DEBATE] Using LLM-EXTRACTED roster: ${roster.map(r => r.name).join(', ')}`);
      } else {
        // No roster available - skip debate correction
        console.log(`[DEBATE] ⚠️ No roster available (preset or LLM-extracted)`);
        console.log(`[DEBATE] Skipping debate correction - keeping LLM assignments`);
        roster = [];
      }

      if (roster.length > 0) {
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
      }
    } else {
      console.log(`[CLASSIFY] ℹ️ ${projectType} detected - no debate post-processing needed`);
    }

      // Generate summary (still inside the features.nameExtraction || features.aiSummary block)
      if (features.aiSummary) {
        try {
          await updateProcessingProgress(projectId, {
            stage: 'summary' as ProcessingStage,
            progress: 0,
            message: 'Generating AI-powered podcast summary...'
          });

          console.log('[AI] 📄 Generating podcast summary...');
          const speakerContext = Object.fromEntries(
            Object.entries(speakersWithNames).map(([id, speaker]: [string, any]) => [
              id,
              { name: speaker.finalName || speaker.fallbackName || id }
            ])
          );

          const summary = await generatePodcastSummary(finalTranscription, {
            speakerContext,
            // narrativeMetadata may be undefined if pre-processing was skipped
            userId: existingProject?.user_id,
            projectId
          });
          summaryData = summary;
          aiTokenUsage.summary = summary.tokensUsed;
          console.log(`[AI] ✅ Generated ${summary.wordCount} word summary`);

          await updateProcessingProgress(projectId, {
            stage: 'summary' as ProcessingStage,
            progress: 100,
            message: `Generated ${summary.wordCount}-word summary`
          });
        } catch (error: any) {
          console.error('[AI] ⚠️  Summary generation failed:', error.message);
        }
      }
    } // End of: if (features.nameExtraction || features.aiSummary)

    // PREMIUM tier processing
    if (tier === 'premium') {
      console.log(`\n[PREMIUM] 💎 Premium AI Processing...`);

      const speakerContext = Object.fromEntries(
        Object.entries(speakersWithNames).map(([id, speaker]: [string, any]) => [
          id,
          { name: speaker.finalName || speaker.fallbackName || id }
        ])
      );

      // Classify roles
      if (features.roleClassification) {
        try {
          await updateProcessingProgress(projectId, {
            stage: 'role_classification' as ProcessingStage,
            progress: 0,
            message: 'Classifying speaker roles...'
          });

          console.log('[PREMIUM] 👥 Classifying speaker roles...');
          roleAssignments = await classifySpeakerRoles(
            Object.fromEntries(
              Object.entries(speakersWithNames).map(([id, speaker]: [string, any]) => [
                id,
                {
                  id,
                  fallbackName: speaker.finalName || speaker.fallbackName,
                  totalDuration: speaker.totalDuration,
                  segments: speaker.segments || speakerSegments.filter(s => s.speakerId === id)
                }
              ])
            ),
            {
              transcriptContext: finalTranscription,
              userId: existingProject?.user_id,
              projectId,
            }
          );

          for (const [speakerId, assignment] of Object.entries(roleAssignments)) {
            if (!speakersWithNames[speakerId]) continue;
            (speakersWithNames[speakerId] as any).role = assignment.role;
            (speakersWithNames[speakerId] as any).roleConfidence = assignment.confidence;
            (speakersWithNames[speakerId] as any).roleSummary = assignment.summary;
            (speakersWithNames[speakerId] as any).roleEvidence = assignment.evidence;
            (speakersWithNames[speakerId] as any).autoRoleAssigned = true;
            (speakersWithNames[speakerId] as any).finalName = assignment.displayName || (speakersWithNames[speakerId] as any).finalName;
          }

          await updateProcessingProgress(projectId, {
            stage: 'role_classification' as ProcessingStage,
            progress: 100,
            message: `Assigned roles to ${Object.keys(roleAssignments).length} speakers`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Role classification failed:', error.message);
        }
      }

      // Chapters
      if (features.chapterDetection) {
        try {
          await updateProcessingProgress(projectId, {
            stage: 'chapters' as ProcessingStage,
            progress: 0,
            message: 'Detecting chapter markers...'
          });

          console.log('[PREMIUM] 📚 Detecting chapter markers...');
          const chapters = await detectPodcastChapters(finalTranscription, transcriptionSegments, {
            speakerContext,
            userId: existingProject?.user_id,
            projectId
          });
          chaptersData = chapters;
          aiTokenUsage.chapters = chapters.tokensUsed;

          await updateProcessingProgress(projectId, {
            stage: 'chapters' as ProcessingStage,
            progress: 100,
            message: `Identified ${chapters.chapters.length} chapters`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Chapter detection failed:', error.message);
        }
      }

      // Takeaways
      if (features.keyTakeaways) {
        try {
          await updateProcessingProgress(projectId, {
            stage: 'takeaways' as ProcessingStage,
            progress: 0,
            message: 'Extracting key takeaways...'
          });

          console.log('[PREMIUM] 💎 Extracting key takeaways...');
          const takeaways = await extractKeyTakeaways(finalTranscription, {
            speakerContext,
            userId: existingProject?.user_id,
            projectId
          });
          takeawaysData = takeaways;
          aiTokenUsage.takeaways = takeaways.tokensUsed;

          await updateProcessingProgress(projectId, {
            stage: 'takeaways' as ProcessingStage,
            progress: 100,
            message: `Extracted ${takeaways.takeaways.length} takeaways`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Takeaway extraction failed:', error.message);
        }
      }

      // Quotes
      if (features.quotesExtraction) {
        try {
          await updateProcessingProgress(projectId, {
            stage: 'quotes' as ProcessingStage,
            progress: 0,
            message: 'Finding shareable quotes...'
          });

          console.log('[PREMIUM] 💬 Extracting social quotes...');
          const quotes = await extractSocialQuotes(finalTranscription, {
            speakerContext,
            userId: existingProject?.user_id,
            projectId
          });
          quotesData = quotes;
          aiTokenUsage.quotes = quotes.tokensUsed;

          await updateProcessingProgress(projectId, {
            stage: 'quotes' as ProcessingStage,
            progress: 100,
            message: `Found ${quotes.quotes.length} quotes`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Quote extraction failed:', error.message);
        }
      }
    }

    // Cost calculation
    // Note: AI processing costs are now billed directly by the generator functions
    // via trackOpenAIUsage using the centralized COST_MAP.
    
    // We only track the base transcription cost here as that's handled by this route
    let totalCost = baseCost;
    const tierPricing = calculateTierCost(tier, totalDuration, false);

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
        const roster = existingProject!.preset_speakers!.map((speaker: any) => ({
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
    const mergeResult = mergeDuplicateSpeakersByName(reassignedSegments, speakersWithNames);
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

    // ============================================================
    // STEP 5: BUILD UNIFIED SPEAKER DATA (Both branches feed here)
    // ============================================================
    const finalSegments = enforceFinalSpeakerIdContract(
      reassignedSegments,
      '[FINAL] post-corrections'
    );
    logSpeakerAssignmentCounts(finalSegments, '[FINAL] post-corrections');

    const speakersFromSegments = buildSpeakerDataFromSegments(finalSegments, speakersWithNames);

    const speakerData: any = {
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
          summary: features.aiSummary,
          roles: features.roleClassification,
          chapters: features.chapterDetection,
          takeaways: features.keyTakeaways,
          quotes: features.quotesExtraction,
          debateCorrectionApplied: projectType === 'DEBATE' && debateCorrectionResult !== null,
        }
      }
    };

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

    if (summaryData) updateData.ai_summary = summaryData.summary;
    if (chaptersData) updateData.chapters = chaptersData.chapters;
    if (takeawaysData) updateData.key_takeaways = takeawaysData.takeaways;
    if (quotesData) updateData.social_quotes = quotesData.quotes;

    await updateProcessingProgress(projectId, {
      stage: 'finalizing' as ProcessingStage,
      progress: 50,
      message: 'Saving your results to the database...'
    });

    console.log(`\n[DATABASE] 💾 Saving results to project ${projectId}...`);
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue
      .update(updateData)
      .eq('id', projectId);

    if (updateError) {
      console.error('[DATABASE] ❌ Failed to save results:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    await updateProcessingProgress(projectId, {
      stage: 'completed' as ProcessingStage,
      progress: 100,
      message: 'Processing complete! Your content is ready.'
    });

    // Background insights processing
    if (finalTranscription && speakerData) {
      console.log('[INSIGHTS] 🔍 Starting insight extraction in background...');
      const { processInsightsForProject } = await import('@/lib/insight-extraction');
      processInsightsForProject(projectId)
        .then((result) => {
          if (result.success) {
            console.log(`[INSIGHTS] ✅ Extracted ${result.insightCount} insights.`);
          } else {
            console.warn(`[INSIGHTS] ⚠️ Failed:`, result.error);
          }
        })
        .catch((error) => console.error('[INSIGHTS] ❌ Error:', error));
    }

    // Cleanup
    try {
      if (tempAudioFilePath) await fs.unlink(tempAudioFilePath);
      purgeInMemoryAudio(fileName);
    } catch (e) {}

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n========================================`);
    console.log(`[TRANSCRIPTION] ✅ Completed in ${totalTime.toFixed(1)}s`);
    console.log(`========================================\n`);

    return NextResponse.json({
      success: true,
      tier,
      transcription: finalTranscription,
      speakers: Object.keys(speakersWithNames).length,
      duration: totalDuration,
      cost: totalCost,
      costBreakdown,
      features: {
        summary: summaryData !== null,
        chapters: chaptersData !== null,
        takeaways: takeawaysData !== null,
        quotes: quotesData !== null,
        roles: Object.keys(roleAssignments).length > 0
      }
    });

  } catch (error: any) {
    console.error('[TRANSCRIPTION] ❌ Error:', error);

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
      try { await fs.unlink(tempAudioFilePath); } catch {}
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

function mergeDuplicateSpeakersByName(
  segments: SpeakerSegment[],
  speakers: Record<string, any>
): { segments: SpeakerSegment[]; speakers: Record<string, any>; mergedCount: number } {
  const nameMap = new Map<string, string[]>();
  const segmentCounts = new Map<string, number>();

  for (const seg of segments) {
    const id = (seg as any).finalSpeakerId || seg.speakerId;
    segmentCounts.set(id, (segmentCounts.get(id) || 0) + 1);
  }

  for (const [id, speaker] of Object.entries(speakers)) {
    const name = getSpeakerNameForMerge(speaker);
    if (!name) continue;
    const normalized = normalizeSpeakerName(name);
    if (!nameMap.has(normalized)) nameMap.set(normalized, []);
    nameMap.get(normalized)!.push(id);
  }

  const remap = new Map<string, string>();
  let mergedCount = 0;

  for (const [name, ids] of nameMap.entries()) {
    if (ids.length <= 1) continue;

    const sorted = ids.sort((a, b) => {
      const aCount = segmentCounts.get(a) || 0;
      const bCount = segmentCounts.get(b) || 0;
      if (aCount !== bCount) return bCount - aCount;
      const aRole = speakers[a]?.role || 'unknown';
      const bRole = speakers[b]?.role || 'unknown';
      if (aRole === 'unknown' && bRole !== 'unknown') return 1;
      if (bRole === 'unknown' && aRole !== 'unknown') return -1;
      const aConf = speakers[a]?.roleConfidence || speakers[a]?.confidence || 0;
      const bConf = speakers[b]?.roleConfidence || speakers[b]?.confidence || 0;
      return bConf - aConf;
    });

    const primary = sorted[0];
    for (const dup of sorted.slice(1)) {
      remap.set(dup, primary);
      mergedCount++;
      console.log(`[MERGE] Duplicate name "${name}" → ${dup} merged into ${primary}`);
    }
  }

  if (remap.size === 0) {
    return { segments, speakers, mergedCount: 0 };
  }

  const updatedSegments = segments.map(seg => {
    const currentId = (seg as any).finalSpeakerId || seg.speakerId;
    const target = remap.get(currentId);
    if (!target) return seg;
    return {
      ...seg,
      speakerId: target,
      finalSpeakerId: target,
      confidence: Math.min((seg as any).confidence ?? 1, 0.5),
      status: 'uncertain',
    };
  });

  const updatedSpeakers: Record<string, any> = { ...speakers };
  for (const dup of remap.keys()) {
    delete updatedSpeakers[dup];
  }

  return { segments: updatedSegments, speakers: updatedSpeakers, mergedCount };
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
        confidence: 0.6,
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
    return {
      ...seg,
      speakerId: target,
      finalSpeakerId: target,
      confidence: Math.min((seg as any).confidence ?? 1, 0.6),
      status: 'tentative',
    };
  });

  return { segments: updatedSegments, speakers };
}

function enforceFinalSpeakerIdContract(
  segments: SpeakerSegment[],
  label: string
): SpeakerSegment[] {
  let mismatches = 0;
  const updated = segments.map(seg => {
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;
    const initialId = (seg as any).initialSpeakerId || seg.speakerId;
    const current = seg.speakerId;

    if (current !== finalId) {
      mismatches++;
      return {
        ...seg,
        speakerId: finalId,
        finalSpeakerId: finalId,
        initialSpeakerId: initialId,
      };
    }

    return {
      ...seg,
      finalSpeakerId: finalId,
      initialSpeakerId: initialId,
    };
  });

  if (mismatches > 0) {
    console.error(`[FINAL SPEAKER ID] ${label}: ${mismatches} segments had speakerId != finalSpeakerId. Enforced finalSpeakerId.`);
  } else {
    console.log(`[FINAL SPEAKER ID] ${label}: all segments aligned`);
  }

  return updated;
}

function logSpeakerAssignmentCounts(segments: SpeakerSegment[], label: string) {
  const initialCounts = new Map<string, number>();
  const finalCounts = new Map<string, number>();

  for (const seg of segments) {
    const initialId = (seg as any).initialSpeakerId || seg.speakerId;
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;
    initialCounts.set(initialId, (initialCounts.get(initialId) || 0) + 1);
    finalCounts.set(finalId, (finalCounts.get(finalId) || 0) + 1);
  }

  const formatCounts = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${id}:${count}`)
      .join(', ');

  console.log(`[SPEAKER COUNT] ${label} | initial: ${formatCounts(initialCounts)}`);
  console.log(`[SPEAKER COUNT] ${label} | final:   ${formatCounts(finalCounts)}`);
}

function buildSpeakerDataFromSegments(
  segments: SpeakerSegment[],
  speakersWithNames: Record<string, any>
): Record<string, any> {
  const grouped = new Map<string, SpeakerSegment[]>();

  for (const seg of segments) {
    const id = (seg as any).finalSpeakerId || seg.speakerId;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(seg);
  }

  const speakers: Record<string, any> = {};

  for (const [id, segs] of grouped.entries()) {
    const rosterEntry = speakersWithNames?.[id] || {};
    const fallbackName = rosterEntry.finalName || rosterEntry.fallbackName || rosterEntry.name || id;
    const totalDuration = segs.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);

    speakers[id] = {
      id,
      finalName: fallbackName,
      role: rosterEntry.role || rosterEntry.displayRole || 'unknown',
      roleConfidence: rosterEntry.roleConfidence,
      extractedName: rosterEntry.extractedName,
      segments: segs.map(s => ({
        speakerId: s.speakerId,
        finalSpeakerId: (s as any).finalSpeakerId || s.speakerId,
        initialSpeakerId: (s as any).initialSpeakerId,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        confidence: s.confidence,
        status: (s as any).status,
      })),
      totalDuration,
      segmentCount: segs.length,
      gptAttribution: true,
    };
  }

  // Include seeded speakers with zero segments (intro_handoff) so UI can show them
  if (speakersWithNames) {
    for (const [id, speaker] of Object.entries(speakersWithNames)) {
      if (speakers[id]) continue;
      if (speaker?.source !== 'intro_handoff') continue;

      speakers[id] = {
        id,
        finalName: speaker.finalName || speaker.fallbackName || speaker.name || id,
        role: speaker.role || speaker.displayRole || 'unknown',
        roleConfidence: speaker.roleConfidence,
        extractedName: speaker.extractedName,
        segments: [],
        totalDuration: 0,
        segmentCount: 0,
        gptAttribution: true,
        seededOnly: true,
        source: speaker.source,
      };
    }
  }

  return speakers;
}
