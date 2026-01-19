// PASS 2: GPT-4o-mini Segment Reassignment
// GPT-4o-mini is ONLY responsible for mapping AssemblyAI speaker IDs to GPT speakers
// GPT-4o-mini CANNOT infer new speakers, rename speakers, or create speakers

import OpenAI from 'openai';
import { SpeakerSegment } from './types';
import { GPTSpeaker, isValidGPTSpeakerId } from './gpt-speaker-intelligence';

export interface SegmentReassignment {
  originalSpeakerId: string;
  assignedGPTSpeakerId: string;
  confidence: number;
}

export interface GPTReassignmentResult {
  mappings: Record<string, string>; // AssemblyAI speaker ID -> GPT speaker ID
  segments: Array<{
    speakerId: string;
    text: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
  validationErrors: string[];
  ambiguousAssignments: number;
}

const GPT_SYSTEM_PROMPT = `You are a transcript segment reassignment system.

YOUR ONLY JOB:
Map AssemblyAI speaker IDs to the correct GPT speaker IDs.

CRITICAL - YOU MUST USE SPEAKER IDS, NOT NAMES:
- ✓ CORRECT: "speaker_1", "speaker_2", "speaker_3", etc.
- ✗ WRONG: "Jessica Tarlov", "Jake Sullivan", "quoted_audio", etc.
- ALWAYS use the ID format "speaker_N" from the GPT speaker list
- NEVER use the person's name or role as the ID

STRICT RULES:
1. You MAY ONLY use speaker IDs from the provided GPT speaker list
2. Speaker IDs follow the format: speaker_1, speaker_2, speaker_3, etc.
3. You MAY NOT use speaker names (like "Jessica Tarlov") as IDs
4. You MAY NOT use role names (like "advertiser" or "quoted_audio") as IDs
5. Every AssemblyAI speaker MUST map to exactly ONE GPT speaker ID

DECISION CRITERIA:
- Conversational continuity (who logically speaks next?)
- Question/answer flow (questions usually followed by answers)
- Introduction patterns ("joined by X" → next speaker is X)
- Content type (ads → advertiser role, clips → quoted_audio role)

OUTPUT FORMAT (JSON ONLY):
{
  "mappings": {
    "Speaker_A": "speaker_1",
    "Speaker_B": "speaker_2",
    "Speaker_C": "speaker_3"
  }
}

REMEMBER: Use "speaker_1", "speaker_2", etc. - NOT the person's name!`;

/**
 * PASS 2: GPT-4o-mini Segment Reassignment
 *
 * Maps AssemblyAI speaker IDs to GPT speaker IDs.
 * GPT-4o-mini CANNOT create new speakers - only map to GPT's authoritative list.
 *
 * @param segments - Original segments from AssemblyAI
 * @param gptSpeakers - Authoritative speaker list from GPT (Pass 1)
 * @param options - Configuration options
 * @returns Mapping from AssemblyAI IDs to GPT IDs
 */
export async function reassignSegmentsWithGPT(
  segments: SpeakerSegment[],
  gptSpeakers: GPTSpeaker[],
  options: {
    apiKey?: string;
    model?: string;
  } = {}
): Promise<GPTReassignmentResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for segment reassignment');
  }

  const openai = new OpenAI({ apiKey });
  const model = options.model || 'gpt-4o-mini';

  console.log('[GPT REASSIGNMENT] Starting Pass 2');
  console.log(`[GPT REASSIGNMENT] Model: ${model}`);
  console.log(`[GPT REASSIGNMENT] GPT provided ${gptSpeakers.length} authoritative speakers`);

  // Build context
  const gptSpeakerContext = buildGPTSpeakerContext(gptSpeakers);
  const transcriptContext = buildTranscriptContext(segments);

  const userPrompt = `Map each AssemblyAI speaker ID to the correct GPT speaker ID.

GPT SPEAKER LIST (use the IDs on the left, NOT the names):
${gptSpeakerContext}

IMPORTANT EXAMPLES:
✓ If Jessica Tarlov is speaker_2, use "speaker_2" (NOT "Jessica Tarlov")
✓ If advertiser is speaker_1, use "speaker_1" (NOT "advertiser")
✓ If quoted_audio is speaker_6, use "speaker_6" (NOT "quoted_audio")

TRANSCRIPT:
${transcriptContext}

Return ONLY the JSON mapping object using speaker IDs (speaker_1, speaker_2, etc.).`;

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: GPT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT');
    }

    const parsed = JSON.parse(content);
    const mappings: Record<string, string> = parsed.mappings || {};

    console.log('[GPT REASSIGNMENT] Received mappings:', mappings);

    // VALIDATION: Enforce that GPT only used GPT speaker IDs
    const validationErrors = validateGPTMappings(mappings, gptSpeakers);

    if (validationErrors.length > 0) {
      console.error('[GPT REASSIGNMENT] VALIDATION FAILED:', validationErrors);
      throw new Error(`GPT violated GPT authority: ${validationErrors.join('; ')}`);
    }

    // Apply mappings to segments
    const reassignedSegments = applyMappings(segments, mappings, gptSpeakers);

    // Count ambiguous assignments (confidence < 0.8)
    const ambiguousCount = reassignedSegments.filter(s => s.confidence < 0.8).length;

    console.log(`[GPT REASSIGNMENT] Successfully reassigned ${segments.length} segments`);
    console.log(`[GPT REASSIGNMENT] Ambiguous assignments: ${ambiguousCount}`);

    return {
      mappings,
      segments: reassignedSegments,
      validationErrors,
      ambiguousAssignments: ambiguousCount
    };

  } catch (error: any) {
    console.error('[GPT REASSIGNMENT] Failed:', error);
    throw new Error(`GPT segment reassignment failed: ${error.message}`);
  }
}

/**
 * Build GPT speaker context for GPT-4o-mini
 */
function buildGPTSpeakerContext(speakers: GPTSpeaker[]): string {
  return speakers.map(speaker => {
    return `${speaker.id}: ${speaker.name || '(unnamed)'} [${speaker.role}]`;
  }).join('\n');
}

/**
 * Build transcript context showing AssemblyAI speaker IDs
 */
function buildTranscriptContext(
  segments: SpeakerSegment[],
  maxSegments: number = 100
): string {
  // Group consecutive same-speaker segments
  const grouped: Array<{ speakerId: string; text: string; start: number }> = [];

  for (const segment of segments) {
    const last = grouped[grouped.length - 1];
    if (last && last.speakerId === segment.speakerId) {
      last.text += ' ' + segment.text;
    } else {
      grouped.push({
        speakerId: segment.speakerId,
        text: segment.text,
        start: segment.startTime
      });
    }
  }

  // Take first N
  const selected = grouped.slice(0, maxSegments);

  return selected.map((utt, index) => {
    const timestamp = formatTimestamp(utt.start);
    return `[${index + 1}] ${utt.speakerId} (${timestamp}): ${utt.text}`;
  }).join('\n');
}

/**
 * Format timestamp as MM:SS
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * VALIDATION: Ensure GPT only used GPT speaker IDs
 * This is CRITICAL - GPT must not invent speakers
 */
function validateGPTMappings(
  mappings: Record<string, string>,
  gptSpeakers: GPTSpeaker[]
): string[] {
  const errors: string[] = [];
  const validGPTIds = new Set(gptSpeakers.map(s => s.id));

  for (const [assemblyAIId, gptId] of Object.entries(mappings)) {
    // Check if GPT ID exists
    if (!validGPTIds.has(gptId)) {
      errors.push(`GPT assigned invalid speaker ID "${gptId}" (not in GPT speaker list)`);
    }

    // Check if GPT ID looks like it might be a location/network
    const invalidPatterns = [
      /new.?york/i,
      /new.?jersey/i,
      /los.?angeles/i,
      /nbc|cnn|fox/i
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(gptId)) {
        errors.push(`GPT assigned suspicious speaker ID "${gptId}" (looks like location/network)`);
      }
    }
  }

  return errors;
}

/**
 * Apply GPT's mappings to segments
 */
function applyMappings(
  segments: SpeakerSegment[],
  mappings: Record<string, string>,
  gptSpeakers: GPTSpeaker[]
): Array<{
  speakerId: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}> {
  return segments.map(segment => {
    const gptSpeakerId = mappings[segment.speakerId] || segment.speakerId;

    // Check if mapping is valid
    const isValid = isValidGPTSpeakerId(gptSpeakers, gptSpeakerId);

    return {
      speakerId: gptSpeakerId,
      text: segment.text,
      startTime: segment.startTime,
      endTime: segment.endTime,
      confidence: isValid ? 0.9 : 0.5 // Low confidence if invalid mapping
    };
  });
}
