// Pass 1: Speaker Intelligence (GPT)
// Analyzes transcript to identify true speakers, consolidate identities, assign roles
// RULES:
// - Locations, networks, shows, cities are NEVER speakers
// - Ad reads labeled as "Advertiser" not host (unless clearly host)
// - Quoted clips grouped as "Quoted Audio"
// - One human = one speaker ID (consolidate aliases)

import OpenAI from 'openai';
import { SpeakerSegment } from './types';

export type SpeakerRole =
  | 'Host'
  | 'Co-host'
  | 'Guest'
  | 'Narrator'
  | 'Advertiser'
  | 'Quoted Audio';

export interface IntelligentSpeaker {
  id: string;
  name: string;
  role: SpeakerRole;
  confidence: number;
  aliases?: string[];
  evidence: string[];
}

export interface SpeakerIntelligenceResult {
  speakers: IntelligentSpeaker[];
  diagnostics: string[];
  qualityChecks: {
    passed: boolean;
    issues: string[];
  };
}

const SYSTEM_PROMPT = `You are a strict speaker identification system for podcast transcripts.

Your job is to identify ONLY real human speakers who are actually speaking in this podcast.

CRITICAL RULES:

1. NEVER identify these as speakers:
   ❌ Locations (New York, Los Angeles, New Jersey, Boston, etc.)
   ❌ Networks (NBC, Fox News, CNN, BBC, NPR, etc.)
   ❌ Show titles (Pod Save America, The Daily Show, Raging Moderates, etc.)
   ❌ Cities, states, countries
   ❌ Venues (Leicester Square Theatre, Madison Square Garden, etc.)
   ❌ Companies or organizations

2. Ad reads:
   - Label as "Advertiser" role
   - ONLY label as host/co-host if you have clear evidence they're speaking as themselves
   - Default to "Advertiser" for promotional content

3. Quoted audio/clips:
   - Group all quoted clips, montages, archival audio as ONE speaker
   - Role: "Quoted Audio"
   - Name: "Quoted Audio"
   - DO NOT create individual speakers for each quoted person unless they speak extensively

4. Consolidate speakers:
   - If one person is called by multiple names (Alice, Alice Fraser, Fraser), consolidate to ONE speaker
   - Use the most complete name as the primary name
   - List other names as aliases

5. Allowed roles (ONLY these):
   - Host
   - Co-host
   - Guest
   - Narrator
   - Advertiser
   - Quoted Audio

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown, no explanations.

{
  "speakers": [
    {
      "id": "speaker_1",
      "name": "Full Name",
      "role": "Host",
      "confidence": 0.0-1.0,
      "aliases": ["other names this person is called"],
      "evidence": ["quotes showing this is the same person"]
    }
  ],
  "diagnostics": ["short notes about ambiguous decisions"]
}

ACCURACY > COMPLETENESS. Do not guess. Fewer correct speakers is better than many incorrect ones.`;

/**
 * Pass 1: Analyze transcript and identify true speakers
 * Uses GPT to consolidate speaker identities and assign accurate roles
 */
export async function identifySpeakers(
  utterances: Array<{ speaker_id: string; text: string; start: number; end: number }>,
  options: {
    apiKey?: string;
    model?: string;
    projectTitle?: string;
  } = {}
): Promise<SpeakerIntelligenceResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key required for speaker intelligence');
  }

  const openai = new OpenAI({ apiKey });
  const model = options.model || 'gpt-4o';

  console.log('[SPEAKER INTELLIGENCE] Starting Pass 1 - GPT analysis');
  console.log(`[SPEAKER INTELLIGENCE] Analyzing ${utterances.length} utterances`);

  // Build context for GPT
  const transcriptContext = buildTranscriptContext(utterances);

  const userPrompt = `Analyze this podcast transcript and identify all REAL HUMAN SPEAKERS.

${options.projectTitle ? `Podcast: ${options.projectTitle}\n\n` : ''}TRANSCRIPT:
${transcriptContext}

Remember:
- DO NOT identify locations, networks, or show titles as speakers
- Consolidate multiple names for the same person
- Label ad reads as "Advertiser"
- Group quoted clips as "Quoted Audio"
- Return ONLY JSON`;

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.0,
      top_p: 1,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    // Validate output
    const speakers = Array.isArray(parsed.speakers) ? parsed.speakers : [];
    const diagnostics = Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [];

    // Run quality checks
    const qualityChecks = validateSpeakers(speakers);

    console.log(`[SPEAKER INTELLIGENCE] Identified ${speakers.length} speakers`);
    console.log(`[SPEAKER INTELLIGENCE] Quality checks: ${qualityChecks.passed ? 'PASSED' : 'FAILED'}`);

    if (!qualityChecks.passed) {
      console.warn('[SPEAKER INTELLIGENCE] Quality issues:', qualityChecks.issues);
    }

    speakers.forEach((speaker: any) => {
      console.log(`[SPEAKER INTELLIGENCE] ${speaker.id}: ${speaker.name} (${speaker.role}, conf: ${speaker.confidence})`);
      if (speaker.aliases && speaker.aliases.length > 0) {
        console.log(`[SPEAKER INTELLIGENCE]   Aliases: ${speaker.aliases.join(', ')}`);
      }
    });

    return {
      speakers: speakers.map(normalizeSpeaker),
      diagnostics,
      qualityChecks
    };

  } catch (error: any) {
    console.error('[SPEAKER INTELLIGENCE] GPT analysis failed:', error);
    throw new Error(`Speaker intelligence failed: ${error.message}`);
  }
}

/**
 * Build compact transcript context for GPT analysis
 * Includes speaker IDs, timestamps, and text
 */
function buildTranscriptContext(
  utterances: Array<{ speaker_id: string; text: string; start: number; end: number }>,
  maxChars: number = 30000
): string {
  const lines: string[] = [];
  let totalChars = 0;

  // Group consecutive utterances by same speaker for readability
  const grouped: Array<{ speaker_id: string; text: string; start: number; end: number }> = [];

  for (const utterance of utterances) {
    const last = grouped[grouped.length - 1];
    if (last && last.speaker_id === utterance.speaker_id) {
      // Merge consecutive same-speaker utterances
      last.text += ' ' + utterance.text;
      last.end = utterance.end;
    } else {
      grouped.push({ ...utterance });
    }
  }

  for (const utterance of grouped) {
    const timestamp = formatTimestamp(utterance.start);
    const line = `[${utterance.speaker_id}] ${timestamp}: ${utterance.text}\n`;

    if (totalChars + line.length > maxChars) break;

    lines.push(line);
    totalChars += line.length;
  }

  return lines.join('');
}

/**
 * Format seconds to MM:SS
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate speaker list against quality rules
 */
function validateSpeakers(speakers: any[]): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // Rule 1: Check for location/network/show names
  const invalidPatterns = [
    /\b(new york|new jersey|los angeles|boston|chicago|london|paris)\b/i,
    /\b(nbc|cnn|fox news|bbc|npr|msnbc|abc)\b/i,
    /\b(pod save america|the daily show|the bugle|raging moderates)\b/i,
    /\b(leicester square|madison square|comedy store)\b/i,
    /\b(theatre|theater|stadium|arena)\b/i
  ];

  for (const speaker of speakers) {
    const name = speaker.name || '';
    for (const pattern of invalidPatterns) {
      if (pattern.test(name)) {
        issues.push(`Invalid speaker name detected: "${name}" (appears to be location/network/show)`);
      }
    }
  }

  // Rule 2: Check for duplicate human speakers (same person, different IDs)
  const names = speakers.map(s => s.name?.toLowerCase()).filter(Boolean);
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    issues.push('Duplicate speaker names detected - same human appears multiple times');
  }

  // Rule 3: Check role validity
  const validRoles: SpeakerRole[] = ['Host', 'Co-host', 'Guest', 'Narrator', 'Advertiser', 'Quoted Audio'];
  for (const speaker of speakers) {
    if (!validRoles.includes(speaker.role)) {
      issues.push(`Invalid role "${speaker.role}" for speaker "${speaker.name}"`);
    }
  }

  // Rule 4: Warn if ads are labeled as Host/Guest
  const adPatterns = [
    /\b(sponsored by|brought to you by|promo code|discount|visit our website)\b/i,
    /\b(product|service|offer|deal|limited time)\b/i
  ];

  for (const speaker of speakers) {
    if (speaker.role === 'Host' || speaker.role === 'Guest') {
      const evidence = (speaker.evidence || []).join(' ');
      for (const pattern of adPatterns) {
        if (pattern.test(evidence)) {
          issues.push(`Possible ad read labeled as "${speaker.role}" for "${speaker.name}"`);
        }
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

/**
 * Normalize speaker object to ensure consistent format
 */
function normalizeSpeaker(speaker: any): IntelligentSpeaker {
  return {
    id: speaker.id || `speaker_${Math.random().toString(36).substr(2, 9)}`,
    name: speaker.name || 'Unknown',
    role: speaker.role || 'Guest',
    confidence: typeof speaker.confidence === 'number' ? speaker.confidence : 0.5,
    aliases: Array.isArray(speaker.aliases) ? speaker.aliases : [],
    evidence: Array.isArray(speaker.evidence) ? speaker.evidence : []
  };
}
