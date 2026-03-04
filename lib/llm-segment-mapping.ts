// ═══════════════════════════════════════════════════════════════
// Pass 2: LLM-Based Segment Mapping (GPT-4o-mini)
// ═══════════════════════════════════════════════════════════════
//
// Maps raw diarization labels (Speaker_A, Speaker_B) to roster
// speaker IDs using GPT-4o-mini for cost efficiency.
//
// GPT-4o-mini: ~$0.0003/call (20x cheaper than Claude Sonnet)

import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { SpeakerSegment } from './types';
import { GPTSpeaker } from './gpt-speaker-intelligence';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';
import { summarizeProfileForPrompt } from './speaker-profiles';

export interface LLMMappingResult {
  mappings: Record<string, string>;  // AssemblyAI ID → roster ID
  segments: SpeakerSegment[];
  diagnostics: {
    dirtyCluster?: string;
    dirtyClusterDetails?: string;
    reasoning: string;
    rawResponse: string;
  };
}

const SYSTEM_PROMPT = `You are a speaker attribution specialist. Your task is to map raw diarization labels (Speaker_A, Speaker_B, etc.) to identified speakers from a roster.

CRITICAL RULES:
1. You can ONLY use speaker IDs from the provided roster. Never invent new IDs.
2. One raw label usually maps to one roster speaker.
3. Every raw label in the transcript MUST be mapped to a roster speaker.

DIRTY CLUSTER DETECTION:
Sometimes diarization fails and one label (e.g., Speaker_A) contains audio from multiple people. Signs:
- Self-identification changes: "I'm Sarah" ... later ... "I'm Mike" (same label)
- Conversation with itself: Question followed by answer in same label
- Dramatic tone/topic shifts suggesting different people

If you detect a dirty cluster:
1. Map the label to the DOMINANT speaker (who talks most under that label)
2. Flag it in dirtyCluster field

MAPPING STRATEGY:
1. Look for explicit self-identifications ("I'm Jessica", "My name is John")
2. Follow conversational flow (Q&A patterns, who responds to whom)
3. Use role hints (hosts ask questions, guests give long answers)
4. Consider speaker count: if roster has 2 speakers and transcript has 2 labels, it's usually 1:1

OUTPUT FORMAT (JSON only):
{
  "mappings": {
    "Speaker_A": "speaker_1",
    "Speaker_B": "speaker_2"
  },
  "dirtyCluster": null,
  "dirtyClusterDetails": null,
  "reasoning": "Brief explanation of mapping logic"
}`;

/**
 * Map raw diarization labels to roster speakers using GPT-4o-mini
 */
export async function mapSegmentsWithLLM(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  options: {
    apiKey?: string;
    model?: string;
    userId?: string;
    projectId?: string;
  } = {}
): Promise<LLMMappingResult> {
  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  const model = options.model || 'gpt-5-nano';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for segment mapping');
  }

  console.log('[LLM MAPPING] Starting Pass 2');
  console.log(`[LLM MAPPING] Model: ${model}`);
  console.log(`[LLM MAPPING] Roster: ${roster.length} speakers`);

  const openai = new OpenAI({ apiKey, timeout: 45000 });

  // Build roster context
  const rosterContext = roster.map(s => {
    const profileHint = summarizeProfileForPrompt(s.profile);
    return `${s.id}: ${s.name || '(unnamed)'} [${s.role}] (confidence: ${s.confidence.toFixed(2)})${profileHint ? ` ${profileHint}` : ''}`;
  }).join('\n');

  // Build transcript with raw labels
  const transcriptContext = buildGroupedTranscript(segments, 150);

  // Calculate label statistics
  const labelCounts: Record<string, number> = {};
  segments.forEach(s => {
    labelCounts[s.speakerId] = (labelCounts[s.speakerId] || 0) + 1;
  });
  const labelStats = Object.entries(labelCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([id, count]) => `${id}: ${count} segments`)
    .join(', ');

  const rawLabels = Object.keys(labelCounts);
  console.log(`[LLM MAPPING] Raw labels: ${rawLabels.join(', ')}`);

  const userPrompt = `Map the raw diarization labels to roster speakers.

ROSTER (the ONLY valid speaker IDs - you MUST use these):
${rosterContext}

RAW LABELS TO MAP: ${rawLabels.join(', ')}

LABEL STATISTICS (segment counts):
${labelStats}

TRANSCRIPT (showing raw labels):
${transcriptContext}

Analyze the conversation and determine which raw label belongs to which roster speaker.
Return ONLY valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model,
      max_completion_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    // Track usage if userId provided
    if (options.userId) {
      await trackOpenAIUsage({
        userId: options.userId,
        projectId: options.projectId,
        response,
        modelName: model,
        purpose: 'Segment Mapping (Pass 2)',
        shouldDebit: true
      });
    }

    const rawResponse = response.choices[0]?.message?.content || '{}';
    console.log('[LLM MAPPING] Raw response received');

    // Parse JSON
    const parsed = JSON.parse(rawResponse);

    const mappings: Record<string, string> = parsed.mappings || {};

    // Validate all mappings point to valid roster IDs
    const validIds = new Set(roster.map(s => s.id));
    const correctedMappings: Record<string, string> = {};

    for (const [rawId, mappedId] of Object.entries(mappings)) {
      if (validIds.has(mappedId as string)) {
        correctedMappings[rawId] = mappedId as string;
      } else {
        console.warn(`[LLM MAPPING] Invalid mapping: ${rawId} → ${mappedId} (not in roster)`);
        // Fallback to first roster speaker
        correctedMappings[rawId] = roster[0].id;
      }
    }

    // Ensure all raw labels are mapped
    for (const rawId of rawLabels) {
      if (!correctedMappings[rawId]) {
        console.warn(`[LLM MAPPING] Missing mapping for ${rawId}, defaulting to first roster speaker`);
        correctedMappings[rawId] = roster[0].id;
      }
    }

    console.log('[LLM MAPPING] Final mappings:');
    for (const [rawId, mappedId] of Object.entries(correctedMappings)) {
      const speaker = roster.find(s => s.id === mappedId);
      console.log(`  ${rawId} → ${mappedId} (${speaker?.name || 'unnamed'})`);
    }

    if (parsed.dirtyCluster) {
      console.log(`[LLM MAPPING] Dirty cluster detected: ${parsed.dirtyCluster}`);
      console.log(`[LLM MAPPING] Details: ${parsed.dirtyClusterDetails || 'none'}`);
    }

    // Apply mappings to segments
    const mappedSegments = applyMappings(segments, correctedMappings, roster);

    return {
      mappings: correctedMappings,
      segments: mappedSegments,
      diagnostics: {
        dirtyCluster: parsed.dirtyCluster || undefined,
        dirtyClusterDetails: parsed.dirtyClusterDetails || undefined,
        reasoning: parsed.reasoning || '',
        rawResponse,
      }
    };

  } catch (error: any) {
    console.error('[LLM MAPPING] Failed:', error);
    throw new Error(`LLM segment mapping failed: ${error.message}`);
  }
}

/**
 * Build grouped transcript showing raw speaker labels
 */
function buildGroupedTranscript(
  segments: SpeakerSegment[],
  maxUtterances: number
): string {
  const grouped: Array<{ speakerId: string; text: string; start: number }> = [];

  for (const seg of segments) {
    const last = grouped[grouped.length - 1];
    if (last && last.speakerId === seg.speakerId) {
      last.text += ' ' + seg.text;
    } else {
      grouped.push({
        speakerId: seg.speakerId,
        text: seg.text,
        start: seg.startTime
      });
    }
  }

  // Take first N utterances
  const selected = grouped.slice(0, maxUtterances);

  return selected.map((utt, i) => {
    const mins = Math.floor(utt.start / 60);
    const secs = Math.floor(utt.start % 60);
    const ts = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    // Truncate very long utterances
    const text = utt.text.length > 300 ? utt.text.substring(0, 300) + '...' : utt.text;
    return `[${i + 1}] ${utt.speakerId} (${ts}): ${text}`;
  }).join('\n');
}

/**
 * Apply mappings to create final segments
 */
function applyMappings(
  segments: SpeakerSegment[],
  mappings: Record<string, string>,
  roster: GPTSpeaker[]
): SpeakerSegment[] {
  return segments.map(seg => {
    const mappedId = mappings[seg.speakerId] || seg.speakerId;
    const speaker = roster.find(s => s.id === mappedId);

    return {
      ...seg,
      speakerId: mappedId,
      finalSpeakerId: mappedId,
      initialSpeakerId: seg.speakerId,
      confidence: 0.85,  // LLM-assigned base confidence
      status: 'confirmed' as const,
    };
  });
}

/**
 * Fallback: Simple heuristic mapping when LLM fails
 * Maps labels by segment count (most active label → host, etc.)
 */
export function fallbackMapping(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): LLMMappingResult {
  console.log('[LLM MAPPING] Using fallback heuristic mapping');

  // Count segments per label
  const labelCounts: Record<string, number> = {};
  segments.forEach(s => {
    labelCounts[s.speakerId] = (labelCounts[s.speakerId] || 0) + 1;
  });

  // Sort labels by activity (most segments first)
  const sortedLabels = Object.entries(labelCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);

  // Sort roster: hosts first, then by confidence
  const sortedRoster = [...roster].sort((a, b) => {
    const aHost = a.role === 'host' || a.role === 'co_host' ? 1 : 0;
    const bHost = b.role === 'host' || b.role === 'co_host' ? 1 : 0;
    if (aHost !== bHost) return bHost - aHost;
    return b.confidence - a.confidence;
  });

  // Map 1:1 by position
  const mappings: Record<string, string> = {};
  sortedLabels.forEach((label, i) => {
    const rosterEntry = sortedRoster[i] || sortedRoster[0];
    mappings[label] = rosterEntry.id;
  });

  const mappedSegments = applyMappings(segments, mappings, roster);

  return {
    mappings,
    segments: mappedSegments,
    diagnostics: {
      reasoning: 'Fallback heuristic: mapped by segment count (most active → host)',
      rawResponse: '',
    }
  };
}
