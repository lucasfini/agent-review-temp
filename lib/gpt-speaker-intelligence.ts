// PASS 1: GPT Speaker Intelligence
// SINGLE SOURCE OF TRUTH for speaker identification
// This service is AUTHORITATIVE - its output defines all valid speakers

import OpenAI from 'openai';
import { SpeakerSegment } from './types';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export type SpeakerRole =
  | 'host'
  | 'co_host'
  | 'guest'
  | 'narrator'
  | 'advertiser'
  | 'quoted_audio'
  | 'unknown';

export interface GPTSpeaker {
  id: string;
  name: string | null;
  role: SpeakerRole;
  confidence: number;
  source?: string;
}

export interface GPTSpeakerIntelligenceResult {
  speakers: GPTSpeaker[];
  segments?: SpeakerSegment[]; // Added for pipeline compatibility
  rawResponse: string;
  validationErrors: string[];
}

const GPT_SYSTEM_PROMPT = `You are a strict information extraction system.
You must not guess, infer, or use outside knowledge.
If something is not explicitly supported, return 'unknown'.

MAX_NAME_LENGTH: A speaker name is a human name — typically 1 to 3 words (e.g. "Sam Harris", "Jessica Tarlov", "Dr. Jane Smith"). A name is NEVER a phrase, sentence fragment, or clause. If you see text like "in full support of pressuring the university" or "so happy to share the stage", that is NOT a name — reject it immediately. Any candidate longer than 4 words MUST be discarded.

STRICT_ID_FORMAT: Speaker IDs MUST follow the format "speaker_1", "speaker_2", etc. NEVER use a person's name, a role label, or any other string as the ID.

Output valid JSON only.`;

const GPT_USER_PROMPT_TEMPLATE = `You are given a podcast transcript.

CONTEXT METADATA:
- Filename: "{{FILENAME}}"
- Hint: The filename often contains the names of the Guest or Host (e.g. "with Sam Harris"). Use this to identify speakers if they are not explicitly introduced in the text.

TASK:
Identify the unique HUMAN speakers in the transcript.

CRITICAL RULES:
1. IGNORE AD READS: Many audio files start with 1-2 minutes of Advertisements or Sponsor Reads. Do NOT include speakers who ONLY appear in the first 2 minutes reading an ad (unless they are the main host). Focus on identifying the Main Participants.
2. Only humans may be speakers
3. Locations, shows, networks, states are NEVER speakers (e.g., "New York", "NBC", "Pod Save America" are NOT speakers)
4. Ads → advertiser
5. Clips/montages → quoted_audio
6. One human = one speaker ID (consolidate if same person mentioned differently)
7. If uncertain, prefer fewer speakers over more
8. If you cannot identify a name, set name to null
9. LATE INTRODUCTIONS: The transcript may include segments marked [LATE-N] from later in the audio. These are high-probability introductions. You MUST include any new speakers identified from these segments in your roster. Do NOT ignore them just because they appear later.
10. NAME VALIDATION: A valid human name is 1–3 words (maximum 4 in rare cases like "Mary Jane Watson Parker"). NEVER extract a phrase, clause, or sentence fragment as a name. Examples of INVALID names: "in full support of pressuring", "so happy to share the stage", "speaking now is the next". If you cannot isolate a clean 1–3 word name, set name to null.
11. ID FORMAT: Every speaker ID MUST be "speaker_1", "speaker_2", etc. Do NOT use the person's name or role as the ID field.

ALLOWED ROLES (strict enum):
- host
- co_host
- guest
- narrator
- advertiser
- quoted_audio
- unknown

OUTPUT (JSON ONLY):
{
  "speakers": [
    {
      "id": "speaker_1",
      "name": "Full Name or null",
      "role": "host|co_host|guest|narrator|advertiser|quoted_audio|unknown",
      "confidence": 0.0-1.0
    }
  ]
}

TRANSCRIPT:
{{UTTERANCES}}

Return ONLY the JSON object. No explanations.`;

/**
 * PASS 1: GPT Speaker Intelligence
 *
 * This is the AUTHORITATIVE speaker identification pass.
 * GPT's output defines ALL valid speakers in the system.
 *
 * @param segments - Raw speaker segments from AssemblyAI
 * @param options - Configuration options
 * @returns Authoritative list of speakers
 */
export async function identifySpeakersWithGPT(
  segments: SpeakerSegment[],
  options: {
    apiKey?: string;
    model?: string;
    maxUtterances?: number;
    userId?: string;
    projectId?: string;
    filename?: string;
  } = {}
): Promise<GPTSpeakerIntelligenceResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for speaker intelligence');
  }

  const openai = new OpenAI({ apiKey });
  const model = options.model || 'gpt-4o';
  const maxUtterances = options.maxUtterances || 150;
  const filename = options.filename || 'unknown_file';

  console.log('[GPT SPEAKER INTELLIGENCE] Starting Pass 1');
  console.log(`[GPT SPEAKER INTELLIGENCE] Model: ${model}, Temperature: 0.0`);
  console.log(`[GPT SPEAKER INTELLIGENCE] Filename context: "${filename}"`);

  // Build utterance context
  const utteranceContext = buildUtteranceContext(segments, maxUtterances);
  let userPrompt = GPT_USER_PROMPT_TEMPLATE.replace('{{UTTERANCES}}', utteranceContext);
  userPrompt = userPrompt.replace('{{FILENAME}}', filename);

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.0,
      top_p: 1,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: GPT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    if (options.userId) {
      await trackOpenAIUsage({
        userId: options.userId,
        projectId: options.projectId,
        response,
        modelName: model,
        purpose: 'Speaker Intelligence (Pass 1)',
        shouldDebit: true
      });
    }

    const rawResponse = response.choices[0]?.message?.content || '{}';
    console.log('[GPT SPEAKER INTELLIGENCE] Raw response received');

    // Parse and validate
    const parsed = JSON.parse(rawResponse);
    const speakers: GPTSpeaker[] = Array.isArray(parsed.speakers) ? parsed.speakers : [];

    console.log(`[GPT SPEAKER INTELLIGENCE] GPT identified ${speakers.length} speakers`);

    // Validate speakers
    const validationErrors = validateGPTSpeakers(speakers);

    if (validationErrors.length > 0) {
      console.warn('[GPT SPEAKER INTELLIGENCE] Validation errors:', validationErrors);
    }

    // Log identified speakers
    speakers.forEach(speaker => {
      console.log(`[GPT SPEAKER INTELLIGENCE] ${speaker.id}: ${speaker.name || '(unnamed)'} (${speaker.role}, conf: ${speaker.confidence})`);
    });

    return {
      speakers,
      rawResponse,
      validationErrors
    };

  } catch (error: any) {
    console.error('[GPT SPEAKER INTELLIGENCE] Failed:', error);
    throw new Error(`GPT speaker intelligence failed: ${error.message}`);
  }
}

/**
 * Introduction patterns that indicate a new speaker is being identified.
 * Used to scan the full transcript beyond the initial context window.
 */
const INTRODUCTION_PATTERNS = [
  /my name is/i,
  /I'm ([A-Z][a-z]+)/i,
  /I am ([A-Z][a-z]+)/i,
  /next we have/i,
  /speaking now is/i,
  /joined by/i,
  /welcome,?\s+[A-Z]/i,
  /let me introduce/i,
  /our next (?:guest|speaker|panelist)/i,
  /please welcome/i,
  /thanks for (?:being|joining|coming)/i,
];

/**
 * Extract roster context using Smart Introduction Scanning.
 *
 * Always includes the first `maxUtterances` grouped utterances,
 * then scans the ENTIRE transcript for high-probability introduction
 * patterns and appends those segments so the authoritative roster
 * captures speakers who appear later in the audio.
 */
export function extractRosterContext(
  segments: SpeakerSegment[],
  maxUtterances: number = 150
): string {
  // Group consecutive same-speaker segments
  const grouped: Array<{ speakerId: string; text: string; start: number; end: number }> = [];

  for (const segment of segments) {
    const last = grouped[grouped.length - 1];
    if (last && last.speakerId === segment.speakerId) {
      last.text += ' ' + segment.text;
      last.end = segment.endTime;
    } else {
      grouped.push({
        speakerId: segment.speakerId,
        text: segment.text,
        start: segment.startTime,
        end: segment.endTime
      });
    }
  }

  // Always include the first N utterances
  const baseWindow = grouped.slice(0, maxUtterances);
  const baseIndexSet = new Set<number>();
  for (let i = 0; i < Math.min(maxUtterances, grouped.length); i++) {
    baseIndexSet.add(i);
  }

  // Scan the REMAINING utterances for introduction patterns
  const introSegments: Array<{ index: number; utt: typeof grouped[0] }> = [];

  for (let i = maxUtterances; i < grouped.length; i++) {
    const utt = grouped[i];
    const matchesIntro = INTRODUCTION_PATTERNS.some(pattern => pattern.test(utt.text));

    if (matchesIntro) {
      introSegments.push({ index: i, utt });

      // Also grab the next utterance for context (the person responding/speaking after the intro)
      if (i + 1 < grouped.length && !baseIndexSet.has(i + 1)) {
        introSegments.push({ index: i + 1, utt: grouped[i + 1] });
      }
    }
  }

  // Deduplicate intro segments
  const seenIndices = new Set(baseIndexSet);
  const uniqueIntros = introSegments.filter(({ index }) => {
    if (seenIndices.has(index)) return false;
    seenIndices.add(index);
    return true;
  });

  // Cap intro segments to avoid token bloat (max 30 additional utterances)
  const cappedIntros = uniqueIntros.slice(0, 30);

  if (cappedIntros.length > 0) {
    console.log(`[GPT SPEAKER INTELLIGENCE] Smart Intro Scan: found ${cappedIntros.length} introduction segments beyond first ${maxUtterances} utterances`);
  }

  // Build the context string
  let context = baseWindow.map((utt, index) => {
    const timestamp = formatTimestamp(utt.start);
    return `[${index + 1}] ${utt.speakerId} (${timestamp}): ${utt.text}`;
  }).join('\n');

  if (cappedIntros.length > 0) {
    context += '\n\n--- ADDITIONAL INTRODUCTIONS DETECTED LATER IN TRANSCRIPT ---\n';
    context += cappedIntros.map(({ index, utt }) => {
      const timestamp = formatTimestamp(utt.start);
      return `[LATE-${index + 1}] ${utt.speakerId} (${timestamp}): ${utt.text}`;
    }).join('\n');
  }

  return context;
}

/**
 * Build compact utterance context for GPT
 * @deprecated Use extractRosterContext instead for Smart Introduction Scanning
 */
function buildUtteranceContext(
  segments: SpeakerSegment[],
  maxUtterances: number
): string {
  return extractRosterContext(segments, maxUtterances);
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
 * Validate GPT speaker output against hard rules
 */
function validateGPTSpeakers(speakers: GPTSpeaker[]): string[] {
  const errors: string[] = [];
  const validRoles: SpeakerRole[] = ['host', 'co_host', 'guest', 'narrator', 'advertiser', 'quoted_audio', 'unknown'];

  // Invalid name patterns (locations, networks, shows)
  const invalidPatterns = [
    { pattern: /\b(new york|new jersey|los angeles|boston|chicago|london|paris|washington)\b/i, type: 'location' },
    { pattern: /\b(nbc|cnn|fox news|bbc|npr|msnbc|abc|cbs)\b/i, type: 'network' },
    { pattern: /\b(pod save america|the daily show|the bugle|raging moderates)\b/i, type: 'show' },
    { pattern: /\b(leicester square|madison square|comedy store|theatre|theater)\b/i, type: 'venue' }
  ];

  for (const speaker of speakers) {
    // Check role validity
    if (!validRoles.includes(speaker.role)) {
      errors.push(`Invalid role "${speaker.role}" for speaker ${speaker.id}`);
    }

    // Check name for invalid patterns
    if (speaker.name) {
      for (const { pattern, type } of invalidPatterns) {
        if (pattern.test(speaker.name)) {
          errors.push(`Speaker name "${speaker.name}" appears to be a ${type}, not a person`);
        }
      }
    }

    // Check for duplicate names
    const duplicates = speakers.filter(s => s.name && s.name === speaker.name && s.id !== speaker.id);
    if (duplicates.length > 0) {
      errors.push(`Duplicate name "${speaker.name}" assigned to multiple speaker IDs`);
    }
  }

  return errors;
}

/**
 * Get speaker by ID from GPT result
 */
export function getGPTSpeakerById(
  speakers: GPTSpeaker[],
  speakerId: string
): GPTSpeaker | null {
  return speakers.find(s => s.id === speakerId) || null;
}

/**
 * Check if speaker ID exists in GPT result
 */
export function isValidGPTSpeakerId(
  speakers: GPTSpeaker[],
  speakerId: string
): boolean {
  return speakers.some(s => s.id === speakerId);
}
