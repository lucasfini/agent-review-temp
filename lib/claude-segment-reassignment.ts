// PASS 2: Claude Segment Reassignment
// Claude is ONLY responsible for mapping AssemblyAI speaker IDs to GPT speakers
// Claude CANNOT infer new speakers, rename speakers, or create speakers

import Anthropic from '@anthropic-ai/sdk';
import { SpeakerSegment } from './types';
import { GPTSpeaker, isValidGPTSpeakerId } from './gpt-speaker-intelligence';

export interface SegmentReassignment {
  originalSpeakerId: string;
  assignedGPTSpeakerId: string;
  confidence: number;
}

export interface ClaudeReassignmentResult {
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

const CLAUDE_SYSTEM_PROMPT = `You are a transcript segment reassignment system.

YOUR ONLY JOB:
Map AssemblyAI speaker IDs to the correct GPT speaker IDs.

STRICT RULES:
1. You MAY ONLY use speaker IDs from the provided GPT speaker list
2. You MAY NOT invent new speakers
3. You MAY NOT rename speakers
4. You MAY NOT assign locations, networks, or entities as speakers
5. Every AssemblyAI speaker MUST map to exactly ONE GPT speaker

DECISION CRITERIA:
- Conversational continuity (who logically speaks next?)
- Question/answer flow (questions usually followed by answers)
- Introduction patterns ("joined by X" → next speaker is X)
- Content type (ads → advertiser, clips → quoted_audio)

If uncertain:
- Prefer conversational flow over guessing
- Ads/promos → map to "advertiser" speaker
- News clips/quotes → map to "quoted_audio" speaker

OUTPUT FORMAT (JSON ONLY):
{
  "mappings": {
    "Speaker_A": "speaker_1",
    "Speaker_B": "speaker_2",
    "Speaker_C": "advertiser_id"
  }
}`;

/**
 * PASS 2: Claude Segment Reassignment
 *
 * Maps AssemblyAI speaker IDs to GPT speaker IDs.
 * Claude CANNOT create new speakers - only map to GPT's authoritative list.
 *
 * @param segments - Original segments from AssemblyAI
 * @param gptSpeakers - Authoritative speaker list from GPT (Pass 1)
 * @param options - Configuration options
 * @returns Mapping from AssemblyAI IDs to GPT IDs
 */
export async function reassignSegmentsWithClaude(
  segments: SpeakerSegment[],
  gptSpeakers: GPTSpeaker[],
  options: {
    apiKey?: string;
    model?: string;
  } = {}
): Promise<ClaudeReassignmentResult> {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY required for segment reassignment');
  }

  const anthropic = new Anthropic({ apiKey });
  const model = options.model || 'claude-sonnet-4-5-20250929';

  console.log('[CLAUDE REASSIGNMENT] Starting Pass 2');
  console.log(`[CLAUDE REASSIGNMENT] Model: ${model}`);
  console.log(`[CLAUDE REASSIGNMENT] GPT provided ${gptSpeakers.length} authoritative speakers`);

  // Build context
  const gptSpeakerContext = buildGPTSpeakerContext(gptSpeakers);
  const transcriptContext = buildTranscriptContext(segments);

  const userPrompt = `Map each AssemblyAI speaker ID to the correct GPT speaker ID.

GPT SPEAKER LIST (ONLY valid speaker IDs):
${gptSpeakerContext}

TRANSCRIPT:
${transcriptContext}

Return ONLY the JSON mapping object.`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      temperature: 0.2,
      system: CLAUDE_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    // Parse JSON (remove markdown fences if present)
    const jsonText = content.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonText);

    const mappings: Record<string, string> = parsed.mappings || {};

    console.log('[CLAUDE REASSIGNMENT] Received mappings:', mappings);

    // VALIDATION: Enforce that Claude only used GPT speaker IDs
    const validationErrors = validateClaudeMappings(mappings, gptSpeakers);

    if (validationErrors.length > 0) {
      console.error('[CLAUDE REASSIGNMENT] VALIDATION FAILED:', validationErrors);
      throw new Error(`Claude violated GPT authority: ${validationErrors.join('; ')}`);
    }

    // Apply mappings to segments
    const reassignedSegments = applyMappings(segments, mappings, gptSpeakers);

    // Count ambiguous assignments (confidence < 0.8)
    const ambiguousCount = reassignedSegments.filter(s => s.confidence < 0.8).length;

    console.log(`[CLAUDE REASSIGNMENT] Successfully reassigned ${segments.length} segments`);
    console.log(`[CLAUDE REASSIGNMENT] Ambiguous assignments: ${ambiguousCount}`);

    return {
      mappings,
      segments: reassignedSegments,
      validationErrors,
      ambiguousAssignments: ambiguousCount
    };

  } catch (error: any) {
    console.error('[CLAUDE REASSIGNMENT] Failed:', error);
    throw new Error(`Claude segment reassignment failed: ${error.message}`);
  }
}

/**
 * Build GPT speaker context for Claude
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
 * VALIDATION: Ensure Claude only used GPT speaker IDs
 * This is CRITICAL - Claude must not invent speakers
 */
function validateClaudeMappings(
  mappings: Record<string, string>,
  gptSpeakers: GPTSpeaker[]
): string[] {
  const errors: string[] = [];
  const validGPTIds = new Set(gptSpeakers.map(s => s.id));

  for (const [assemblyAIId, gptId] of Object.entries(mappings)) {
    // Check if GPT ID exists
    if (!validGPTIds.has(gptId)) {
      errors.push(`Claude assigned invalid speaker ID "${gptId}" (not in GPT speaker list)`);
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
        errors.push(`Claude assigned suspicious speaker ID "${gptId}" (looks like location/network)`);
      }
    }
  }

  return errors;
}

/**
 * Apply Claude's mappings to segments
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
