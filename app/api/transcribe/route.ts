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
import { updateProcessingProgress } from '@/lib/progress-tracker';
import { ProcessingStage } from '@/lib/tier-progress-config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SpeakerSegment, TranscriptionSegment } from '@/lib/types';
import { estimateTranscriptionCost } from '@/lib/billing/cost-map';
import { trackAssemblyAIUsage, requireSufficientCredit } from '@/lib/billing/track-usage';
import { InsufficientCreditError } from '@/lib/billing/credit';

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

  try {
    // Parse request
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const {projectId, fileName, performanceLevel, diarizationProvider = 'assemblyai'} = payload as {
      projectId?: string;
      fileName?: string;
      performanceLevel?: TierLevel;
      diarizationProvider?: 'assemblyai' | 'deepgram';
    };

    if (!projectId || !fileName) {
      return NextResponse.json(
        { error: 'Missing projectId or fileName' },
        { status: 400 }
      );
    }

    const tier: TierLevel = performanceLevel || 'basic';
    const features = getTierFeatures(tier);

    console.log(`\n========================================`);
    console.log(`[TRANSCRIPTION] 🚀 Starting ${tier.toUpperCase()} tier processing`);
    console.log(`[TRANSCRIPTION] Provider: ${diarizationProvider}`);
    console.log(`[TRANSCRIPTION] Project ID: ${projectId}`);
    console.log(`[TRANSCRIPTION] File: ${fileName}`);
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
        result = await transcribeWithAssemblyAI(tempAudioFilePath);
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

    // Step 2: Apply tier-specific AI processing
    let speakersWithNames = detectedSpeakers;
    let summaryData: any = null;
    let chaptersData: any = null;
    let takeawaysData: any = null;
    let quotesData: any = null;
    let roleAssignments: Record<string, any> = {};
    let reassignedSegments = speakerSegments; // Will be updated if refactored pipeline runs

    // PRO tier: Name extraction + Summary
    if (features.nameExtraction || features.aiSummary) {
      console.log(`\n[${tier.toUpperCase()}] 🤖 AI Processing enabled...`);

      // REFACTORED: Use GPT-Claude speaker attribution pipeline
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
            projectId
          });

          // Use GPT's authoritative speaker data
          speakersWithNames = pipelineResult.speakerData.speakers;
          reassignedSegments = pipelineResult.segments; // Use GPT-4o-mini reassigned segments

          // Log pipeline results
          console.log(`[AI] ✅ Pipeline complete:`);
          console.log(`  - GPT-4o identified ${pipelineResult.speakers.length} authoritative speakers`);
          console.log(`  - GPT-4o-mini reassigned: ${pipelineResult.segments.length} segments`);
          console.log(`  - Cost: ~$0.015-0.03 (GPT-4o + GPT-4o-mini)`);
          console.log(`  - Validation: PASSED`);

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

      // Generate summary
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
            narrativeMetadata
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
    }

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
          const chapters = await detectPodcastChapters(finalTranscription, transcriptionSegments, { speakerContext });
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
          const takeaways = await extractKeyTakeaways(finalTranscription, { speakerContext });
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
          const quotes = await extractSocialQuotes(finalTranscription, { speakerContext });
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
    const CLAUDE_INPUT_COST = 3 / 1_000_000;
    const CLAUDE_OUTPUT_COST = 15 / 1_000_000;

    for (const [task, usage] of Object.entries(aiTokenUsage)) {
      const inputCost = usage.input * CLAUDE_INPUT_COST;
      const outputCost = usage.output * CLAUDE_OUTPUT_COST;
      aiProcessingCost += inputCost + outputCost;
    }

    let totalCost = baseCost + aiProcessingCost;
    const tierPricing = calculateTierCost(tier, totalDuration, false);

    console.log(`\n[COST] 💰 Cost Summary:`);
    console.log(`[COST]   Transcription: $${baseCost.toFixed(4)} (${diarizationProvider})`);
    console.log(`[COST]   AI Processing: $${aiProcessingCost.toFixed(4)}`);
    console.log(`[COST]   Total Cost: $${totalCost.toFixed(4)}`);

    // Build speaker data (use reassigned segments if refactored pipeline was used)
    const speakerData: any = {
      segments: reassignedSegments, // Use reassigned segments from Claude
      speakers: speakersWithNames,
      detectionMetadata: {
        totalSpeakers: Object.keys(speakersWithNames).length,
        totalSegments: reassignedSegments.length,
        processedAt: new Date().toISOString(),
        processingTimeMs: (metadata?.processing_time || 0) * 1000,
        method: hasCache ? 'cache' : (features.nameExtraction ? 'gpt-pipeline' : diarizationProvider),
        confidence: metadata?.confidence || 0,
        tier,
        aiProcessing: {
          nameExtraction: features.nameExtraction,
          summary: features.aiSummary,
          roles: features.roleClassification,
          chapters: features.chapterDetection,
          takeaways: features.keyTakeaways,
          quotes: features.quotesExtraction
        }
      }
    };

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
      performance_level: tier
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
    if (tempAudioFilePath) {
      try { await fs.unlink(tempAudioFilePath); } catch {}
    }
    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}