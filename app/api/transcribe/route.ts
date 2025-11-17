import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { supabaseAdmin } from '@/lib/supabase/server';
import { transcribeWithAssemblyAI, checkAssemblyAIAvailability } from '@/lib/assemblyai-integration';
import { groupSegmentsBySpeaker } from '@/lib/speaker-utils';
import { extractSpeakerNames } from '@/lib/name-extraction';
import { classifySpeakerRoles } from '@/lib/speaker-role-classifier';
import { generatePodcastSummary } from '@/lib/content-generators/summary';
import { detectPodcastChapters } from '@/lib/content-generators/chapters';
import { extractKeyTakeaways, type KeyTakeaway } from '@/lib/content-generators/takeaways';
import { extractSocialQuotes } from '@/lib/content-generators/quotes';
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

type InlineInsightCardPayload = {
  entityId: string;
  label: string;
  category: 'person' | 'org' | 'concept' | 'product' | 'social';
  matchText: string;
  matchVariants?: string[];
  transcriptExcerpt: string;
  summary: string;
  confidence: number;
  sources?: Array<{ title: string; url?: string; type?: string }>;
  updatedAt: string;
  status?: 'auto_detected' | 'user_highlight' | 'refreshing';
  origin: 'takeaway';
};

const INLINE_STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'that',
  'this',
  'from',
  'have',
  'about',
  'there',
  'their',
  'would',
  'could',
  'should',
  'because',
  'while',
  'where',
  'which',
  'into',
  'after',
  'before',
  'thing',
  'things',
  'people',
  'really'
]);

function buildInlineInsightsFromSources({
  takeaways,
  speakerSegments,
  transcriptionSegments,
  speakersWithNames,
  transcriptionText
}: {
  takeaways?: KeyTakeaway[];
  speakerSegments: SpeakerSegment[];
  transcriptionSegments: TranscriptionSegment[];
  speakersWithNames: Record<string, any>;
  transcriptionText: string;
}): InlineInsightCardPayload[] {
  if (!takeaways || !takeaways.length) {
    return [];
  }

  const safeSpeakerSegments = Array.isArray(speakerSegments) ? speakerSegments : [];
  const safeTranscriptionSegments = Array.isArray(transcriptionSegments) ? transcriptionSegments : [];
  const usedSegmentIndexes = new Set<number>();
  const generatedAt = new Date().toISOString();

  const insights: InlineInsightCardPayload[] = [];

  takeaways.forEach((takeaway, index) => {
    const keywords = extractInsightKeywords(`${takeaway.takeaway} ${takeaway.context || ''}`);
    const segmentMatch = findBestSegmentForTakeaway({
      takeaway,
      keywords,
      speakerSegments: safeSpeakerSegments,
      transcriptionSegments: safeTranscriptionSegments,
      speakersWithNames,
      transcriptionText,
      usedSegmentIndexes
    });

    if (!segmentMatch || !segmentMatch.text) {
      return;
    }

    const excerpt = trimInlineExcerpt(segmentMatch.text);

    if (!excerpt) {
      return;
    }

    const matchVariants = Array.from(
      new Set([
        ...(segmentMatch.matchVariants || []),
        speakersWithNames?.[segmentMatch.speakerId || '']?.finalName,
        speakersWithNames?.[segmentMatch.speakerId || '']?.fallbackName
      ].filter(Boolean) as string[])
    );

    insights.push({
      entityId: `takeaway-${index}`,
      label: truncateInlineLabel(takeaway.takeaway),
      category: mapTakeawayCategory(takeaway.category),
      matchText: excerpt,
      matchVariants,
      transcriptExcerpt: excerpt,
      summary: takeaway.takeaway,
      confidence: 0.75,
      sources: takeaway.context ? [{ title: takeaway.context, type: 'context' }] : undefined,
      updatedAt: generatedAt,
      status: 'auto_detected',
      origin: 'takeaway'
    });
  });

  return insights;
}

function findBestSegmentForTakeaway({
  takeaway,
  keywords,
  speakerSegments,
  transcriptionSegments,
  speakersWithNames,
  transcriptionText,
  usedSegmentIndexes
}: {
  takeaway: KeyTakeaway;
  keywords: string[];
  speakerSegments: SpeakerSegment[];
  transcriptionSegments: TranscriptionSegment[];
  speakersWithNames: Record<string, any>;
  transcriptionText: string;
  usedSegmentIndexes: Set<number>;
}): { text: string; matchVariants?: string[]; speakerId?: string } | null {
  const timestampMatch = locateSegmentByTimestamp(speakerSegments, takeaway.timestamp, usedSegmentIndexes);
  if (timestampMatch) {
    return timestampMatch;
  }

  const overlapMatch = locateSegmentByOverlap(speakerSegments, keywords, usedSegmentIndexes);
  if (overlapMatch) {
    return overlapMatch;
  }

  const transcriptMatch = locateTranscriptionSentence(transcriptionSegments, transcriptionText, keywords);
  if (transcriptMatch) {
    return transcriptMatch;
  }

  const speakerId = findSpeakerIdFromContext(takeaway.context, speakersWithNames);
  if (speakerId) {
    const speakerMatch = locateSegmentBySpeaker(
      speakerSegments,
      speakerId,
      speakersWithNames,
      keywords,
      usedSegmentIndexes
    );
    if (speakerMatch) {
      return speakerMatch;
    }
  }

  return null;
}

function locateSegmentByTimestamp(
  segments: SpeakerSegment[],
  timestamp: number | undefined,
  usedSegmentIndexes: Set<number>
): { text: string; matchVariants?: string[]; speakerId?: string } | null {
  if (typeof timestamp !== 'number' || !segments.length) {
    return null;
  }

  let candidateIndex = -1;
  let candidateDistance = Number.POSITIVE_INFINITY;

  segments.forEach((segment, index) => {
    if (usedSegmentIndexes.has(index) || typeof segment.startTime !== 'number' || typeof segment.endTime !== 'number') {
      return;
    }

    const withinRange = timestamp >= segment.startTime && timestamp <= segment.endTime;
    const distance = withinRange
      ? 0
      : Math.min(Math.abs(segment.startTime - timestamp), Math.abs(segment.endTime - timestamp));

    if (distance < candidateDistance) {
      candidateDistance = distance;
      candidateIndex = index;
    }
  });

  if (candidateIndex === -1 || candidateDistance > 60) {
    return null;
  }

  usedSegmentIndexes.add(candidateIndex);
  return {
    text: segments[candidateIndex].text || '',
    speakerId: segments[candidateIndex].speakerId
  };
}

function locateSegmentBySpeaker(
  segments: SpeakerSegment[],
  speakerId: string,
  speakersWithNames: Record<string, any>,
  keywords: string[],
  usedSegmentIndexes: Set<number>
): { text: string; matchVariants?: string[]; speakerId?: string } | null {
  if (!speakerId) {
    return null;
  }

  const displayName = speakersWithNames?.[speakerId]?.finalName || speakersWithNames?.[speakerId]?.fallbackName;
  const candidates = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment, index }) => !usedSegmentIndexes.has(index) && segment.speakerId === speakerId && segment.text?.trim());

  if (!candidates.length) {
    return null;
  }

  if (keywords.length) {
    let best = candidates[0];
    let bestScore = 0;
    candidates.forEach(candidate => {
      const lower = candidate.segment.text.toLowerCase();
      const score = keywords.reduce((acc, keyword) => (lower.includes(keyword) ? acc + 1 : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    if (bestScore > 0) {
      usedSegmentIndexes.add(best.index);
      return {
        text: best.segment.text,
        matchVariants: displayName ? [displayName] : undefined,
        speakerId
      };
    }
  }

  const fallback =
    candidates
      .filter(candidate => (candidate.segment.text || '').length > 60)
      .sort((a, b) => (b.segment.text.length || 0) - (a.segment.text.length || 0))[0] || candidates[0];

  usedSegmentIndexes.add(fallback.index);
  return {
    text: fallback.segment.text,
    matchVariants: displayName ? [displayName] : undefined,
    speakerId
  };
}

function locateSegmentByOverlap(
  segments: SpeakerSegment[],
  keywords: string[],
  usedSegmentIndexes: Set<number>
): { text: string; speakerId?: string } | null {
  if (!keywords.length) {
    return null;
  }

  let bestIndex = -1;
  let bestScore = 0;

  segments.forEach((segment, index) => {
    if (usedSegmentIndexes.has(index) || !segment.text) return;
    const lower = segment.text.toLowerCase();
    const score = keywords.reduce((acc, keyword) => (lower.includes(keyword) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex === -1 || bestScore === 0) {
    return null;
  }

  usedSegmentIndexes.add(bestIndex);
  return { text: segments[bestIndex].text || '', speakerId: segments[bestIndex].speakerId };
}

function locateTranscriptionSentence(
  segments: TranscriptionSegment[],
  transcriptionText: string,
  keywords: string[]
): { text: string } | null {
  if (Array.isArray(segments) && segments.length) {
    let bestIndex = -1;
    let bestScore = 0;
    segments.forEach((segment, index) => {
      if (!segment.text) return;
      const lower = segment.text.toLowerCase();
      const score = keywords.reduce((acc, keyword) => (lower.includes(keyword) ? acc + 1 : acc), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex !== -1 && bestScore > 0) {
      return { text: segments[bestIndex].text || '' };
    }
  }

  if (!transcriptionText || !keywords.length) {
    return null;
  }

  const lowerTranscript = transcriptionText.toLowerCase();
  for (const keyword of keywords) {
    const position = lowerTranscript.indexOf(keyword);
    if (position !== -1) {
      return { text: extractSentenceAt(transcriptionText, position) };
    }
  }

  return null;
}

function findSpeakerIdFromContext(context: string | undefined, speakersWithNames: Record<string, any>): string | null {
  if (!context) return null;
  const normalized = context.toLowerCase();
  for (const [speakerId, info] of Object.entries(speakersWithNames || {})) {
    const possibleNames = [
      info?.finalName,
      info?.fallbackName,
      info?.customName,
      info?.extractedName?.name
    ]
      .filter(Boolean)
      .map((value: string) => value.toLowerCase());

    if (possibleNames.some(name => name && normalized.includes(name))) {
      return speakerId;
    }
  }
  return null;
}

function extractInsightKeywords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 4 && !INLINE_STOPWORDS.has(word));
}

function trimInlineExcerpt(text: string, maxLength = 320): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const truncated = normalized.slice(0, maxLength);
  const sentenceBreak = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );
  if (sentenceBreak > maxLength * 0.5) {
    return truncated.slice(0, sentenceBreak + 1).trim();
  }
  const spaceBreak = truncated.lastIndexOf(' ');
  if (spaceBreak > maxLength * 0.5) {
    return `${truncated.slice(0, spaceBreak).trim()}…`;
  }
  return `${truncated.trim()}…`;
}

function truncateInlineLabel(text: string, maxLength = 80): string {
  if (!text) return 'Key Insight';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function mapTakeawayCategory(category?: string): InlineInsightCardPayload['category'] {
  if (!category) return 'concept';
  const normalized = category.toLowerCase();
  if (normalized.includes('person') || normalized.includes('host') || normalized.includes('guest')) {
    return 'person';
  }
  if (normalized.includes('brand') || normalized.includes('company') || normalized.includes('org')) {
    return 'org';
  }
  if (normalized.includes('product')) {
    return 'product';
  }
  if (normalized.includes('social')) {
    return 'social';
  }
  return 'concept';
}

function extractSentenceAt(text: string, index: number): string {
  if (!text) return '';
  let start = index;
  while (start > 0 && !'.!?'.includes(text[start - 1])) {
    start -= 1;
  }
  let end = index;
  while (end < text.length && !'.!?'.includes(text[end])) {
    end += 1;
  }
  return text.slice(start, Math.min(end + 1, text.length)).trim();
}

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

    const { projectId, fileName, performanceLevel } = payload as {
      projectId?: string;
      fileName?: string;
      performanceLevel?: TierLevel;
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
    console.log(`[TRANSCRIPTION] Project ID: ${projectId}`);
    console.log(`[TRANSCRIPTION] File: ${fileName}`);
    console.log(`========================================\n`);

    // Check if project already has cached transcription
    const { data: existingProject, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription_text, transcription_segments, speaker_data, audio_duration, user_id, title')
      .eq('id', projectId)
      .single();

    const hasCache = existingProject && existingProject.transcription_text;

    if (hasCache) {
      console.log('[TRANSCRIPTION] ♻️ Cache detected - skipping AssemblyAI, will apply tier features only');
    }

    // Check AssemblyAI availability (skip if cache exists)
    if (!hasCache) {
      const assemblyAIAvailable = await checkAssemblyAIAvailability();
      if (!assemblyAIAvailable) {
        console.error('[TRANSCRIPTION] ❌ AssemblyAI not available');
        return NextResponse.json(
          { error: 'AssemblyAI not configured. Please set ASSEMBLYAI_API_KEY in your .env file.' },
          { status: 500 }
        );
      }
    }

    // Initialize transcription data variables
    let finalTranscription = '';
    let totalDuration = 0;
    let transcriptionSegments: any[] = [];
    let speakerSegments: any[] = [];
    let baseCost = 0;
    let assemblyMetadata: { processing_time?: number; audio_duration?: number; confidence?: number } | null = null;

    // Step 1: Get base transcription (from AssemblyAI or cache)
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

      // Save audio file to temp location for AssemblyAI
      const tempDir = os.tmpdir();
      const tempFileName = `assemblyai_${Date.now()}_${fileName.split('/').pop()}`;
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
          // For other errors, log but continue (don't block on billing system failures)
          console.error('[BILLING] ⚠️ Credit check failed, continuing anyway:', error);
        }
      } else {
        console.warn('[BILLING] ⚠️ No user_id found, skipping credit check');
      }

      // Update progress: Starting transcription
      await updateProcessingProgress(projectId, {
        stage: 'transcribing' as ProcessingStage,
        progress: 0,
        message: 'Starting transcription with AssemblyAI...'
      });

      // Call AssemblyAI for transcription + diarization
      console.log('[TRANSCRIPTION] 📡 Starting AssemblyAI transcription + diarization...');
      const assemblyResult = await transcribeWithAssemblyAI(tempAudioFilePath);

      if (!assemblyResult.success) {
        throw new Error(assemblyResult.error || 'AssemblyAI transcription failed');
      }

      console.log(`[TRANSCRIPTION] ✅ AssemblyAI completed in ${assemblyResult.metadata?.processing_time.toFixed(1)}s`);
      console.log(`[TRANSCRIPTION] 📊 Duration: ${assemblyResult.metadata?.audio_duration.toFixed(1)}s`);
      console.log(`[TRANSCRIPTION] 📊 Detected ${assemblyResult.metadata?.total_speakers} speakers`);

      finalTranscription = assemblyResult.text || '';
      totalDuration = assemblyResult.metadata?.audio_duration || 0;
      transcriptionSegments = assemblyResult.transcription_segments || [];
      speakerSegments = assemblyResult.speaker_segments || [];
      baseCost = assemblyResult.metadata?.cost_usd || 0;
      assemblyMetadata = assemblyResult.metadata || null;

      // Track usage and debit credits
      if (userId && totalDuration > 0) {
        try {
          const billingResult = await trackAssemblyAIUsage({
            userId,
            projectId,
            durationSeconds: totalDuration,
            metadata: {
              processingTime: assemblyResult.metadata?.processing_time,
              speakerCount: assemblyResult.metadata?.total_speakers,
              confidence: assemblyResult.metadata?.confidence,
            },
            shouldDebit: true, // Debit credits immediately
          });

          console.log(`[BILLING] ✅ Tracked AssemblyAI usage: $${billingResult.billedCost.toFixed(4)} (${(totalDuration / 60).toFixed(1)} minutes)`);
        } catch (error) {
          // Log billing errors but don't fail the transcription
          console.error('[BILLING] ⚠️ Failed to track AssemblyAI usage:', error);
        }
      }

      // Update progress: Transcription completed
      await updateProcessingProgress(projectId, {
        stage: 'transcribing' as ProcessingStage,
        progress: 100,
        message: 'Transcription completed successfully!'
      });

      // Cache the base transcription for future reuse
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
              method: 'assemblyai',
              processedAt: new Date().toISOString()
            }
          },
          duration: totalDuration
        });
        console.log('[TRANSCRIPTION] 💾 Cached base transcription for future reuse');

        // Increment reference count for the new cache entry
        const { incrementReferenceCount } = await import('@/lib/transcription-cache');
        await incrementReferenceCount(fingerprint);
      }
    }

    // Calculate base transcription cost
    let aiProcessingCost = 0;
    const aiTokenUsage: Record<string, { input: number; output: number }> = {};

    // Group segments by speaker
    const detectedSpeakers = groupSegmentsBySpeaker(speakerSegments);
    console.log(`[TRANSCRIPTION] 📊 Grouped into ${Object.keys(detectedSpeakers).length} unique speakers`);

    // Assign numbered speaker names for Basic tier (before AI processing)
    // Sort speaker IDs to ensure consistent numbering
    const sortedSpeakerIds = Object.keys(detectedSpeakers).sort();
    for (let i = 0; i < sortedSpeakerIds.length; i++) {
      const speakerId = sortedSpeakerIds[i];
      const speaker = detectedSpeakers[speakerId] as any;
      // Set fallbackName to numbered speaker name
      speaker.fallbackName = `Speaker ${i + 1}`;
      // Set finalName for Basic tier (will be overwritten by name extraction in higher tiers)
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

    // PRO tier: Name extraction + Summary
    if (features.nameExtraction || features.aiSummary) {
      console.log(`\n[${tier.toUpperCase()}] 🤖 AI Processing enabled...`);

      // Extract speaker names
      if (features.nameExtraction) {
        try {
          // Update progress: Starting name extraction
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 0,
            message: 'Extracting speaker names from conversation...'
          });

          console.log('[AI] 📝 Extracting speaker names...');
          const namedSpeakers = await extractSpeakerNames(
            finalTranscription,
            detectedSpeakers,
            speakerSegments,  // Pass speaker segments for accurate mapping
            {
              userId: existingProject?.user_id,
              projectId,
            }
          );
          speakersWithNames = namedSpeakers as any;
          console.log(`[AI] ✅ Named ${Object.keys(namedSpeakers).length} speakers`);

          // Update progress: Name extraction completed
          await updateProcessingProgress(projectId, {
            stage: 'name_extraction' as ProcessingStage,
            progress: 100,
            message: `Successfully identified ${Object.keys(namedSpeakers).length} speaker names`
          });
        } catch (error: any) {
          console.error('[AI] ⚠️  Name extraction failed:', error.message);
        }
      }

      // Generate summary
      if (features.aiSummary) {
        try {
          // Update progress: Starting summary generation
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

          const summary = await generatePodcastSummary(finalTranscription, { speakerContext });
          summaryData = summary;
          aiTokenUsage.summary = summary.tokensUsed;
          console.log(`[AI] ✅ Generated ${summary.wordCount} word summary`);

          // Update progress: Summary generation completed
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

    // PREMIUM tier: + Roles + Chapters + Takeaways + Quotes
    if (tier === 'premium') {
      console.log(`\n[PREMIUM] 💎 Premium AI Processing...`);

      const speakerContext = Object.fromEntries(
        Object.entries(speakersWithNames).map(([id, speaker]: [string, any]) => [
          id,
          { name: speaker.finalName || speaker.fallbackName || id }
        ])
      );

      // Classify speaker roles
      if (features.roleClassification) {
        try {
          // Update progress: Starting role classification
          await updateProcessingProgress(projectId, {
            stage: 'role_classification' as ProcessingStage,
            progress: 0,
            message: 'Classifying speaker roles (host, guest, etc.)...'
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

          // Apply role assignments to speakers
          for (const [speakerId, assignment] of Object.entries(roleAssignments)) {
            if (!speakersWithNames[speakerId]) continue;
            (speakersWithNames[speakerId] as any).role = assignment.role;
            (speakersWithNames[speakerId] as any).roleConfidence = assignment.confidence;
            (speakersWithNames[speakerId] as any).roleSummary = assignment.summary;
            (speakersWithNames[speakerId] as any).roleEvidence = assignment.evidence;
            (speakersWithNames[speakerId] as any).autoRoleAssigned = true;
            (speakersWithNames[speakerId] as any).finalName = assignment.displayName || (speakersWithNames[speakerId] as any).finalName;
          }

          console.log(`[PREMIUM] ✅ Classified ${Object.keys(roleAssignments).length} speaker roles`);

          // Update progress: Role classification completed
          await updateProcessingProgress(projectId, {
            stage: 'role_classification' as ProcessingStage,
            progress: 100,
            message: `Assigned roles to ${Object.keys(roleAssignments).length} speakers`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Role classification failed:', error.message);
        }
      }

      // Detect chapters
      if (features.chapterDetection) {
        try {
          // Update progress: Starting chapter detection
          await updateProcessingProgress(projectId, {
            stage: 'chapters' as ProcessingStage,
            progress: 0,
            message: 'Detecting chapter markers and topics...'
          });

          console.log('[PREMIUM] 📚 Detecting chapter markers...');
          const chapters = await detectPodcastChapters(finalTranscription, transcriptionSegments, { speakerContext });
          chaptersData = chapters;
          aiTokenUsage.chapters = chapters.tokensUsed;
          console.log(`[PREMIUM] ✅ Detected ${chapters.chapters.length} chapters`);

          // Update progress: Chapter detection completed
          await updateProcessingProgress(projectId, {
            stage: 'chapters' as ProcessingStage,
            progress: 100,
            message: `Identified ${chapters.chapters.length} chapters`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Chapter detection failed:', error.message);
        }
      }

      // Extract takeaways
      if (features.keyTakeaways) {
        try {
          // Update progress: Starting takeaways extraction
          await updateProcessingProgress(projectId, {
            stage: 'takeaways' as ProcessingStage,
            progress: 0,
            message: 'Extracting key insights and takeaways...'
          });

          console.log('[PREMIUM] 💎 Extracting key takeaways...');
          const takeaways = await extractKeyTakeaways(finalTranscription, { speakerContext });
          takeawaysData = takeaways;
          aiTokenUsage.takeaways = takeaways.tokensUsed;
          console.log(`[PREMIUM] ✅ Extracted ${takeaways.takeaways.length} takeaways`);

          // Update progress: Takeaways extraction completed
          await updateProcessingProgress(projectId, {
            stage: 'takeaways' as ProcessingStage,
            progress: 100,
            message: `Extracted ${takeaways.takeaways.length} key takeaways`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Takeaway extraction failed:', error.message);
        }
      }

      // Extract social quotes
      if (features.quotesExtraction) {
        try {
          // Update progress: Starting quotes extraction
          await updateProcessingProgress(projectId, {
            stage: 'quotes' as ProcessingStage,
            progress: 0,
            message: 'Finding shareable quotes for social media...'
          });

          console.log('[PREMIUM] 💬 Extracting social quotes...');
          const quotes = await extractSocialQuotes(finalTranscription, { speakerContext });
          quotesData = quotes;
          aiTokenUsage.quotes = quotes.tokensUsed;
          console.log(`[PREMIUM] ✅ Extracted ${quotes.quotes.length} social quotes`);

          // Update progress: Quotes extraction completed
          await updateProcessingProgress(projectId, {
            stage: 'quotes' as ProcessingStage,
            progress: 100,
            message: `Found ${quotes.quotes.length} shareable quotes`
          });
        } catch (error: any) {
          console.error('[PREMIUM] ⚠️  Quote extraction failed:', error.message);
        }
      }
    }

    // Inline insights are now generated client-side for better entity detection
    // const inlineInsights = buildInlineInsightsFromSources({
    //   takeaways: takeawaysData?.takeaways,
    //   speakerSegments,
    //   transcriptionSegments,
    //   speakersWithNames,
    //   transcriptionText: finalTranscription
    // });

    // Calculate AI processing costs from actual token usage
    const CLAUDE_INPUT_COST = 3 / 1_000_000; // $3 per million tokens
    const CLAUDE_OUTPUT_COST = 15 / 1_000_000; // $15 per million tokens
    const GPT4O_MINI_INPUT_COST = 0.15 / 1_000_000; // $0.15 per million tokens
    const GPT4O_MINI_OUTPUT_COST = 0.60 / 1_000_000; // $0.60 per million tokens

    // Calculate actual AI costs
    for (const [task, usage] of Object.entries(aiTokenUsage)) {
      const inputCost = usage.input * CLAUDE_INPUT_COST;
      const outputCost = usage.output * CLAUDE_OUTPUT_COST;
      aiProcessingCost += inputCost + outputCost;
      console.log(`[COST] ${task}: $${(inputCost + outputCost).toFixed(6)} (${usage.input} in, ${usage.output} out)`);
    }

    let totalCost = baseCost + aiProcessingCost;
    const tierPricing = calculateTierCost(tier, totalDuration, false);

    console.log(`\n[COST] 💰 Cost Summary:`);
    console.log(`[COST]   Transcription: $${baseCost.toFixed(4)} (AssemblyAI)`);
    console.log(`[COST]   AI Processing: $${aiProcessingCost.toFixed(4)} (Claude Sonnet 4.5)`);
    console.log(`[COST]   Total Cost: $${totalCost.toFixed(4)}`);
    console.log(`[COST]   Expected ${tier} cost: $${tierPricing.totalCost.toFixed(4)}`);

    // Build speaker data
    const speakerData: any = {
      segments: speakerSegments,
      speakers: speakersWithNames,
      detectionMetadata: {
        totalSpeakers: Object.keys(speakersWithNames).length,
        totalSegments: speakerSegments.length,
        processedAt: new Date().toISOString(),
        processingTimeMs: (assemblyMetadata?.processing_time || 0) * 1000,
        method: hasCache ? 'cache' : 'assemblyai',
        confidence: assemblyMetadata?.confidence || 0,
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
    // Inline insights now generated client-side
    // if (inlineInsights.length) {
    //   speakerData.inlineInsights = inlineInsights;
    // }

    // Build cost breakdown
    const costBreakdown = {
      transcription: baseCost,
      diarization: 0, // Included in AssemblyAI
      aiProcessing: aiProcessingCost,
      generation: 0,
      total: totalCost,
      provider: 'assemblyai',
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

    // Add AI-generated content fields
    if (summaryData) {
      updateData.ai_summary = summaryData.summary;
    }
    if (chaptersData) {
      updateData.chapters = chaptersData.chapters;
    }
    if (takeawaysData) {
      updateData.key_takeaways = takeawaysData.takeaways;
    }
    if (quotesData) {
      updateData.social_quotes = quotesData.quotes;
    }

    // Update progress: Finalizing
    await updateProcessingProgress(projectId, {
      stage: 'finalizing' as ProcessingStage,
      progress: 50,
      message: 'Saving your results to the database...'
    });

    // Save to database
    console.log(`\n[DATABASE] 💾 Saving results to project ${projectId}...`);
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    if (updateError) {
      console.error('[DATABASE] ❌ Failed to save results:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log('[DATABASE] ✅ Results saved successfully');

    // Update progress: Completed
    await updateProcessingProgress(projectId, {
      stage: 'completed' as ProcessingStage,
      progress: 100,
      message: 'Processing complete! Your content is ready.'
    });

    // Step: Process insights asynchronously (don't block response)
    if (finalTranscription && speakerData) {
      console.log('[INSIGHTS] 🔍 Starting insight extraction in background...');
      const { processInsightsForProject } = await import('@/lib/insight-extraction');

      // Run asynchronously - don't await
      processInsightsForProject(projectId)
        .then((result) => {
          if (result.success) {
            console.log(
              `[INSIGHTS] ✅ Extracted ${result.insightCount} insights. Cost: $${result.totalCost.toFixed(4)}`
            );
          } else {
            console.warn(`[INSIGHTS] ⚠️ Failed:`, result.error);
          }
        })
        .catch((error) => {
          console.error('[INSIGHTS] ❌ Background processing error:', error);
        });
    }

    // Clean up temp file and memory
    try {
      if (tempAudioFilePath) {
        await fs.unlink(tempAudioFilePath);
        console.log(`[CLEANUP] 🧹 Removed temp file: ${tempAudioFilePath}`);
      }
      purgeInMemoryAudio(fileName);
      console.log(`[CLEANUP] 🧹 Cleared file from memory`);
    } catch (cleanupError) {
      console.warn('[CLEANUP] ⚠️  Cleanup failed:', cleanupError);
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n========================================`);
    console.log(`[TRANSCRIPTION] ✅ ${tier.toUpperCase()} tier processing completed in ${totalTime.toFixed(1)}s`);
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

    // Clean up temp file on error
    if (tempAudioFilePath) {
      try {
        await fs.unlink(tempAudioFilePath);
      } catch {}
    }

    return NextResponse.json(
      { error: error.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}
