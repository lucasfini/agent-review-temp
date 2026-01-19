// PASS 1: GPT Speaker Intelligence
// SINGLE SOURCE OF TRUTH for speaker identification
// This service is AUTHORITATIVE - its output defines all valid speakers

import OpenAI from 'openai';
import { SpeakerSegment } from './types';

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
}

export interface GPTSpeakerIntelligenceResult {
  speakers: GPTSpeaker[];
  rawResponse: string;
  validationErrors: string[];
}

const GPT_SYSTEM_PROMPT = `You are a strict information extraction system.
You must not guess, infer, or use outside knowledge.
If something is not explicitly supported, return 'unknown'.
Output valid JSON only.`;

const GPT_USER_PROMPT_TEMPLATE = `You are given a podcast transcript.

TASK:
Identify the unique HUMAN speakers in the transcript.

RULES:
- Only humans may be speakers
- Locations, shows, networks, states are NEVER speakers (e.g., "New York", "NBC", "Pod Save America" are NOT speakers)
- Ads → advertiser
- Clips/montages → quoted_audio
- One human = one speaker ID (consolidate if same person mentioned differently)
- If uncertain, prefer fewer speakers over more
- If you cannot identify a name, set name to null

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
  } = {}
): Promise<GPTSpeakerIntelligenceResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for speaker intelligence');
  }

  const openai = new OpenAI({ apiKey });
  const model = options.model || 'gpt-4o';
  const maxUtterances = options.maxUtterances || 150;

  console.log('[GPT SPEAKER INTELLIGENCE] Starting Pass 1');
  console.log(`[GPT SPEAKER INTELLIGENCE] Model: ${model}, Temperature: 0.0`);

  // Build utterance context
  const utteranceContext = buildUtteranceContext(segments, maxUtterances);
  const userPrompt = GPT_USER_PROMPT_TEMPLATE.replace('{{UTTERANCES}}', utteranceContext);

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
 * Build compact utterance context for GPT
 */
function buildUtteranceContext(
  segments: SpeakerSegment[],
  maxUtterances: number
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

  // Take first N utterances
  const selected = grouped.slice(0, maxUtterances);

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
