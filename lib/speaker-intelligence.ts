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

export type ProjectType = 'DEBATE' | 'INTERVIEW' | 'PODCAST' | 'MONOLOGUE' | 'MEETING' | 'OTHER';
export type SanitizeMode = 'strict' | 'lenient';

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
    projectType?: ProjectType;
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

    // Normalize speakers first
    const normalizedSpeakers = speakers.map(normalizeSpeaker);

    // Determine sanitize mode based on project type
    // DEBATE mode: Strict deduplication (Highlander rules - aggressive merging)
    // Other modes: Lenient deduplication (only exact matches)
    const sanitizeMode: SanitizeMode = options.projectType === 'DEBATE' ? 'strict' : 'lenient';
    console.log(`[SPEAKER INTELLIGENCE] Using ${sanitizeMode} sanitization mode for project type: ${options.projectType || 'unknown'}`);

    // Sanitize roster: remove duplicates, merge substrings, handle typos
    const sanitizedSpeakers = sanitizeRoster(normalizedSpeakers, { mode: sanitizeMode });

    return {
      speakers: sanitizedSpeakers,
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

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if two names are fuzzy matches (typos, minor differences)
 * Returns true if Levenshtein distance is small relative to string length
 */
function isFuzzyMatch(name1: string, name2: string, threshold: number = 0.2): boolean {
  const a = name1.toLowerCase().trim();
  const b = name2.toLowerCase().trim();

  if (a === b) return true;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return true;

  const distance = levenshteinDistance(a, b);
  const similarity = 1 - (distance / maxLen);

  // Consider fuzzy match if similarity > 80% (threshold 0.2)
  return similarity >= (1 - threshold);
}

/**
 * Check if one name is a substring of another (partial name match)
 * "Christopher" is a substring of "Christopher Xenos"
 */
function isSubstringMatch(shorter: string, longer: string): boolean {
  const a = shorter.toLowerCase().trim();
  const b = longer.toLowerCase().trim();

  // The shorter one must be contained in the longer one
  if (b.includes(a)) return true;

  // Also check if it matches any word in the longer name
  const longerWords = b.split(/\s+/);
  return longerWords.some(word => word === a);
}

export interface SanitizeRosterOptions {
  /**
   * Sanitization mode:
   * - 'strict': Aggressive deduplication for debates (Highlander mode)
   *   Applies: exact match, substring merge, fuzzy/typo merge
   * - 'lenient': Basic cleanup for interviews/meetings
   *   Applies: exact match only (preserves "John S." vs "John D.")
   */
  mode: SanitizeMode;
  
  /**
   * Target speaker count (optional)
   * If provided, aggressively merges most similar speakers until this count is reached.
   */
  targetCount?: number;
}

/**
 * Sanitize speaker roster with robust deduplication and force-merge capability.
 * 
 * FEATURES:
 * 1. Deep Cleaning: Trims and lowercases names for all comparisons.
 * 2. Standard Deduplication: Removes exact duplicates and handles substrings/fuzzy matches based on mode.
 * 3. Force-Merge Loop: If targetCount is provided, iteratively merges the most similar pairs until the count is met.
 */
export function sanitizeRoster(
  speakers: IntelligentSpeaker[],
  options: SanitizeRosterOptions = { mode: 'lenient' }
): IntelligentSpeaker[] {
  if (speakers.length <= 1) return speakers;

  const { mode, targetCount } = options;
  console.log(`[ROSTER SANITIZE] Mode: ${mode.toUpperCase()}${targetCount ? `, Target: ${targetCount}` : ''}`);
  console.log(`[ROSTER SANITIZE] Input: ${speakers.length} speakers`);
  speakers.forEach(s => console.log(`[ROSTER SANITIZE]   - "${s.name}" (${s.role})`));

  // --- PHASE 1: Initial Cleaning & Standard Deduplication ---
  
  let currentRoster = [...speakers];
  
  // Helper to merge two speakers
  const mergeSpeakers = (keeper: IntelligentSpeaker, discard: IntelligentSpeaker): IntelligentSpeaker => {
    return {
      ...keeper,
      // Merge aliases
      aliases: [...new Set([
        ...(keeper.aliases || []), 
        ...(discard.aliases || []), 
        discard.name
      ])].filter(a => a.toLowerCase() !== keeper.name.toLowerCase()),
      // Merge evidence
      evidence: [...(keeper.evidence || []), ...(discard.evidence || [])],
      // Keep higher confidence
      confidence: Math.max(keeper.confidence, discard.confidence)
    };
  };

  // Iterative pass for standard duplicates (Exact, Substring, Fuzzy)
  // We restart the loop after any merge to ensure cleanliness
  let changed = true;
  while (changed) {
    changed = false;
    
    // Sort by name length descending to prioritize keeping longer names
    currentRoster.sort((a, b) => b.name.length - a.name.length);

    outerLoop:
    for (let i = 0; i < currentRoster.length; i++) {
      for (let j = i + 1; j < currentRoster.length; j++) {
        const s1 = currentRoster[i];
        const s2 = currentRoster[j];
        const n1 = s1.name.toLowerCase().trim();
        const n2 = s2.name.toLowerCase().trim();

        let shouldMerge = false;
        let reason = '';

        // 1. Exact Match (Always)
        if (n1 === n2) {
          shouldMerge = true;
          reason = 'Exact match';
        }
        // 2. Substring Match (Strict Mode)
        else if (mode === 'strict' && (n1.includes(n2) || n2.includes(n1))) {
          shouldMerge = true;
          reason = 'Substring match';
        }
        // 3. Fuzzy Match (Strict Mode)
        else if (mode === 'strict' && isFuzzyMatch(n1, n2, 0.15)) { // Tight threshold for initial pass
          shouldMerge = true;
          reason = 'Fuzzy match';
        }

        if (shouldMerge) {
          console.log(`[ROSTER SANITIZE] Merging "${s2.name}" into "${s1.name}" (${reason})`);
          currentRoster[i] = mergeSpeakers(s1, s2);
          currentRoster.splice(j, 1);
          changed = true;
          break outerLoop; // Restart loop
        }
      }
    }
  }

  console.log(`[ROSTER SANITIZE] Post-cleaning count: ${currentRoster.length}`);

  // --- PHASE 2: Force-Merge Loop (Target Cap) ---
  
  if (targetCount && currentRoster.length > targetCount) {
    console.log(`[ROSTER SANITIZE] ⚠️ Force-merging to reach target count of ${targetCount}`);

    while (currentRoster.length > targetCount) {
      let bestPair = { i: -1, j: -1, similarity: -1 };

      // Find the most similar pair in the entire list
      for (let i = 0; i < currentRoster.length; i++) {
        for (let j = i + 1; j < currentRoster.length; j++) {
          const s1 = currentRoster[i];
          const s2 = currentRoster[j];
          
          const n1 = s1.name.toLowerCase().trim();
          const n2 = s2.name.toLowerCase().trim();
          
          const maxLen = Math.max(n1.length, n2.length);
          const distance = levenshteinDistance(n1, n2);
          const similarity = 1 - (distance / maxLen);

          if (similarity > bestPair.similarity) {
            bestPair = { i, j, similarity };
          }
        }
      }

      if (bestPair.i !== -1) {
        const keeperIdx = bestPair.i; // Usually longer name due to sort
        const discardIdx = bestPair.j;
        const keeper = currentRoster[keeperIdx];
        const discard = currentRoster[discardIdx];

        console.log(`[ROSTER SANITIZE] 🔽 Force-merge: "${discard.name}" into "${keeper.name}" (Similarity: ${(bestPair.similarity * 100).toFixed(1)}%)`);
        
        currentRoster[keeperIdx] = mergeSpeakers(keeper, discard);
        currentRoster.splice(discardIdx, 1);
      } else {
        console.warn(`[ROSTER SANITIZE] Could not find any pairs to merge. Stopping at ${currentRoster.length} speakers.`);
        break;
      }
    }
  }

  // Final cleanup of aliases
  currentRoster.forEach(s => {
    if (s.aliases) {
      s.aliases = [...new Set(s.aliases)].filter(a => a.toLowerCase() !== s.name.toLowerCase());
    }
  });

  console.log(`[ROSTER SANITIZE] Final Output: ${currentRoster.length} speakers`);
  currentRoster.forEach(s => {
    const aliasStr = s.aliases?.length ? ` (aliases: ${s.aliases.join(', ')})` : '';
    console.log(`[ROSTER SANITIZE]   - "${s.name}"${aliasStr}`);
  });

  return currentRoster;
}
