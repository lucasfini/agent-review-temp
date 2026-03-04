// PASS 2: GPT-4o-mini Segment Reassignment
// GPT-4o-mini is ONLY responsible for mapping AssemblyAI speaker IDs to GPT speakers
// GPT-4o-mini CANNOT infer new speakers, rename speakers, or create speakers

import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
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

DIRECT ADDRESS RULE (applies before all other rules):
If a segment text addresses someone by name or title at the start — e.g., "Prime Minister, ...",
"Senator, what do you...", "Professor, can you...", "Thank you, Scott" — the speaker of that
segment is the INTERVIEWER/HOST, NOT the titled or named person. Do NOT map that cluster to the
titled/named person. Examples:
  "Prime Minister, where does this podcast find you?" → cluster belongs to the HOST (not the PM)
  "I'm in Montreal right now, Professor." → cluster belongs to the GUEST (not the Professor)
  "Thank you, Scott." → cluster belongs to someone OTHER than Scott

=== DECISION HIERARCHY (in strict priority order) ===

When deciding which GPT speaker ID an AssemblyAI speaker maps to, apply these
rules TOP-DOWN. A higher-priority rule ALWAYS overrides a lower one.

PRIORITY 1 - EXPLICIT SELF-IDENTIFICATION (HIGHEST):
If the segment text contains an explicit self-identification such as
"My name is X", "I'm X", "I am X", "This is X speaking", the speaker
MUST be mapped to the GPT roster entry whose name matches X.
Self-identification is GROUND TRUTH and overrides all other signals.

PRIORITY 2 - MODERATOR / HOST HANDOFF (CRITICAL):
If the PREVIOUS utterance (typically from the Host or Moderator) contains
a handoff phrase such as:
  "Next is [Name]", "Next we have [Name]", "We will start with [Name]",
  "Moving to [Name]", "Over to [Name]", "Let's hear from [Name]",
  "Joined by [Name]", "Please welcome [Name]", "Speaking now is [Name]"
then the CURRENT speaker (the very next utterance) MUST be mapped to the
GPT roster entry whose name matches [Name].
This rule overrides voice similarity, conversational flow, and all lower
priorities. The Host's handoff is an explicit label — trust it absolutely.

PRIORITY 3 - CONTENT TYPE SIGNAL:
Segments that are clearly ad reads or sponsor messages should map to the
speaker with the "advertiser" role. Audio clips or montages should map to
the "quoted_audio" role.

PRIORITY 4 - CONVERSATIONAL FLOW (LOWEST):
Only if none of the above rules apply, use conversational continuity
(who logically speaks next, question/answer patterns, topic consistency).

=== UNKNOWN HANDLING ===
If a segment contains a self-identification name that does NOT match ANY
speaker in the GPT roster, map that AssemblyAI speaker to the CLOSEST
roster match. Do NOT invent new speaker IDs.

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
    userId?: string;
  } = {}
): Promise<GPTReassignmentResult> {
  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured for segment reassignment');
  }

  const openai = new OpenAI({ apiKey, timeout: 45000 });
  const model = options.model || 'gpt-5-nano';

  console.log('[GPT REASSIGNMENT] Starting Pass 2');
  console.log(`[GPT REASSIGNMENT] Model: ${model}`);
  console.log(`[GPT REASSIGNMENT] GPT provided ${gptSpeakers.length} authoritative speakers`);

  // Build context with host-anchoring overlap
  const gptSpeakerContext = buildGPTSpeakerContext(gptSpeakers);
  const { context: transcriptContext, handoffHints } = buildTranscriptContextWithOverlap(segments);

  let userPrompt = `Map each AssemblyAI speaker ID to the correct GPT speaker ID.

GPT SPEAKER LIST (use the IDs on the left, NOT the names):
${gptSpeakerContext}

IMPORTANT EXAMPLES:
✓ If Jessica Tarlov is speaker_2, use "speaker_2" (NOT "Jessica Tarlov")
✓ If advertiser is speaker_1, use "speaker_1" (NOT "advertiser")
✓ If quoted_audio is speaker_6, use "speaker_6" (NOT "quoted_audio")

TRANSCRIPT:
${transcriptContext}`;

  // Append detected handoff hints so the model can't miss them
  if (handoffHints.length > 0) {
    userPrompt += `

HOST HANDOFF ANCHORS (these are explicit speaker introductions detected in the transcript — apply Priority 2 rule):
${handoffHints.map(h => `• After utterance [${h.afterIndex}], the next speaker MUST be "${h.expectedName}"`).join('\n')}`;
  }

  userPrompt += `

Return ONLY the JSON mapping object using speaker IDs (speaker_1, speaker_2, etc.).`;

  try {
    const response = await openai.chat.completions.create({
      model,
      max_completion_tokens: 4000,
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
 * Handoff patterns — a host/moderator explicitly names the next speaker.
 */
const HANDOFF_PATTERNS = [
  /\bnext (?:is|we have|up is)\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\bwe will start with\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\bmoving (?:on )?to\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\bover to\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\blet'?s hear from\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\bjoined by\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\bplease welcome\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
  /\bspeaking now is\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*){0,2})/i,
];

interface HandoffHint {
  /** 1-based index in the transcript context where the handoff occurs */
  afterIndex: number;
  /** The name the host mentioned */
  expectedName: string;
}

/**
 * Build transcript context with:
 *  - Overlap from the tail of a previous chunk (host anchoring)
 *  - Detected handoff hints so GPT-4o-mini can't miss moderator introductions
 */
function buildTranscriptContextWithOverlap(
  segments: SpeakerSegment[],
  maxSegments: number = 100,
  overlapCount: number = 2
): { context: string; handoffHints: HandoffHint[] } {
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

  // For transcripts that exceed maxSegments, include 2 overlap utterances
  // from beyond the window so the model can see host handoffs at the boundary.
  const mainWindow = grouped.slice(0, maxSegments);
  const overlapWindow = grouped.slice(maxSegments, maxSegments + overlapCount);

  // Build the context lines
  const lines: string[] = [];
  const allUtterances = [...mainWindow, ...overlapWindow];

  for (let i = 0; i < allUtterances.length; i++) {
    const utt = allUtterances[i];
    const timestamp = formatTimestamp(utt.start);
    const index = i + 1;
    // Mark overlap utterances so the model knows they exist for context
    const prefix = i >= mainWindow.length ? '[OVERLAP] ' : '';
    lines.push(`${prefix}[${index}] ${utt.speakerId} (${timestamp}): ${utt.text}`);
  }

  // Scan ALL utterances for handoff patterns and build hints
  const handoffHints: HandoffHint[] = [];

  for (let i = 0; i < allUtterances.length; i++) {
    const utt = allUtterances[i];
    for (const pattern of HANDOFF_PATTERNS) {
      const match = utt.text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Basic sanity: skip if it's a single char or a stopword
        if (name.length >= 2) {
          handoffHints.push({
            afterIndex: i + 1, // 1-based
            expectedName: name
          });
        }
        break; // one handoff per utterance is enough
      }
    }
  }

  if (handoffHints.length > 0) {
    console.log(`[GPT REASSIGNMENT] Detected ${handoffHints.length} host handoff(s) in transcript context`);
  }
  if (overlapWindow.length > 0) {
    console.log(`[GPT REASSIGNMENT] Included ${overlapWindow.length} overlap utterance(s) for host anchoring`);
  }

  return { context: lines.join('\n'), handoffHints };
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
