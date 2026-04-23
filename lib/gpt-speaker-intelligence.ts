// PASS 1: GPT Speaker Intelligence
// SINGLE SOURCE OF TRUTH for speaker identification
// This service is AUTHORITATIVE - its output defines all valid speakers

import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { SpeakerSegment, SpeakerRole, SpeakerIdentityProfile } from './types';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export interface GPTSpeaker {
  id: string;
  name: string | null;
  role: SpeakerRole;
  confidence: number;
  source?: string;
  profile?: SpeakerIdentityProfile;
  finalNameLocked?: boolean;
  nameProvenance?: string[];
  assignmentContradictions?: string[];
}

export interface GPTSpeakerIntelligenceResult {
  speakers: GPTSpeaker[];
  segments?: SpeakerSegment[]; // Added for pipeline compatibility
  rawResponse: string;
  validationErrors: string[];
}

const GPT_SYSTEM_PROMPT = `You are a forensic transcript analyst identifying WHO IS SPEAKING in audio recordings.

CRITICAL DISTINCTION:
- SPEAKER = someone whose voice we HEAR in the recording
- MENTIONED PERSON = someone talked ABOUT but not present

Example:
  "As Warren Buffett once said, 'Be fearful when others are greedy.'"
  → Warren Buffett is MENTIONED, not a speaker. The person reading this quote IS the speaker.

EVIDENCE HIERARCHY (strongest to weakest):
1. EXPLICIT SELF-ID: "I'm Jessica Tarlov" or "My name is Jessica" → Jessica is a speaker (confidence: 0.95)
2. DIRECT INTRODUCTION: "Joining us today is Dr. Patel" → Dr. Patel is likely a speaker (0.85)
3. CONVERSATIONAL CONTEXT: Two alternating voices in Q&A format → two speakers (0.75)
4. FILENAME HINT: File named "Interview_with_Sam_Harris.mp3" → Sam may be a speaker (0.60)

NEVER EXTRACT AS SPEAKERS:
- Locations: "New York", "Washington D.C."
- Organizations: "The White House", "NBC News", "The New York Times", "Nvidia", "Salesforce"
- Show names: "Pod Save America", "The Daily Show"
- Transition Phrases: "Nvidia here", "the market today", "this week"
- Historical figures quoted but not present
- People mentioned in third person only ("John said last week...")
- Names from ad reads unless they also appear in main content

AD/SPONSOR DETECTION:
The first 1-2 minutes often contain sponsor reads. Signs:
- "This episode is brought to you by..."
- "Use code [X] for discount..."
- Website URLs, promotional language
If a voice ONLY appears in promotional content, classify as role=advertiser.

TRANSITION RULE:
Hosts often end an introduction with a topic or company name:
  "Joining us is Gil Luria... I want to start with Nvidia here."
In this case, Gil Luria is the speaker. "Nvidia here" is the TOPIC.
ALWAYS prioritize a human name mentioned earlier in the introduction over a proper noun at the very end of the introduction.

OUTRO/CLOSING BIO RULE:
Many podcast hosts read a biographical summary of the guest near the END of the episode, in third person:
  "[speaker_2]: John Smith is a bestselling author, former CEO of Acme Corp..."
The READER of this bio is the HOST — NOT the bio's subject. A person cannot narrate their own third-person biography.
When you see a long biographical passage about a speaker who also speaks in first person elsewhere, the passage is being READ BY SOMEONE ELSE (the host). Do not assign the bio's subject as the speaker reading it.

FILENAME / SHOW NAME HINTS:
Filename or show-name context is only a weak hint about format or likely roles.
Do NOT assign a real speaker name from filename/show knowledge alone.
If the transcript does not explicitly support a speaker name, set name to null.

DIARIZATION NOISE:
Speaker diarization software occasionally misattributes 1-2 segments to the wrong speaker. Judge each speaker's identity from the OVERALL PATTERN across all their segments — not from isolated outliers that seem inconsistent with the rest.

NAME VALIDATION:
- A valid name is 1-3 words (max 4 for rare cases like "Mary Jane Watson Parker")
- NEVER extract phrases, clauses, or sentence fragments as names
- Invalid: "in full support of", "so happy to share the stage", "speaking now is", "Nvidia here"
- If you cannot isolate a clean name, set name to null
- For debate/panel MODERATORS: if no personal name is explicitly stated, use null.
  Do NOT use institutional titles (e.g. "MSU president", "dean of students",
  "university president", "chair") as a speaker name — these are roles, not names.

ID FORMAT: Speaker IDs MUST be "speaker_1", "speaker_2", etc. Never use names as IDs.

Output valid JSON only.`;

const GPT_USER_PROMPT_TEMPLATE = `Analyze this transcript to identify WHO IS SPEAKING (not who is mentioned).

FILENAME: "{{FILENAME}}"
(Filenames may contain guest names or show names. Treat this as weak context only. Do NOT assign a real speaker name unless the transcript itself supports it.)

TASK: Identify the unique HUMAN speakers whose voices appear in this recording.

KEY RULES:
1. SPEAKERS vs MENTIONED: Only extract people whose voice we HEAR. If someone is talked ABOUT but never speaks, they are NOT a speaker.
   - "As John said last week..." → John is mentioned, not speaking
   - "I'm John, thanks for having me" → John IS speaking

2. AD READS: The first 1-2 minutes often contain sponsor reads. Only use role=advertiser when a voice appears exclusively in ads/promotional content and does NOT participate in the main conversation.

3. CONSOLIDATION: One person = one speaker ID. If "Jessica" and "Jess" are the same person, merge them.

4. NAME EXTRACTION: Only extract FULL PROPER NAMES of HUMANS:
   - Valid: "Olami Olaleri", "Sam Harris", "Dr. Jane Smith", "JJ"
   - INVALID: Company names ("Nvidia", "Salesforce"), Adjectives ("Nigerian", "American"), possessives ("your second"), phrases ("the one"), descriptors ("student", "candidate")
   - If you see "My name is Olami" but also "I'm Nigerian" → extract "Olami", NOT "Nigerian"
   - If a host says "Joining us is Gil Luria... let's start with Nvidia here", the speaker's name is "Gil Luria", NOT "Nvidia".
   - If you cannot extract a clean proper name, set name to null

5. SPEAKER COUNT: The audio diarization detected {{CLUSTER_COUNT}} distinct voice clusters.
   - Aim to identify all {{CLUSTER_COUNT}} speakers if transcript evidence supports it.
   - If you cannot determine a name, list the speaker as name: null — do NOT merge distinct voices just to reduce the count.
   - Only collapse two clusters into one speaker if you have clear evidence they are the same person (e.g. same self-ID appears in both clusters).
{{#if EXPECTED_SPEAKER_COUNT}}
   - IMPORTANT: The user expects exactly {{EXPECTED_SPEAKER_COUNT}} distinct speakers. If you can only identify fewer, still list all {{EXPECTED_SPEAKER_COUNT}} — use name: null for any you cannot identify from the text.
{{/if}}

6. LATE INTRODUCTIONS: Segments marked [LATE-N] are from later in the audio - still include any new speakers found there.

6. NAME FORMAT:
   - Valid: "Sam Harris", "Dr. Jane Smith", "JJ" (1-3 words)
   - Invalid: "in full support of", "so happy to be here", "speaking now is"
   - If you can't extract a clean name, set name to null

ROLES (strict enum):
- host: Main presenter/interviewer
- co_host: Secondary presenter
- guest: Interview subject or panel member
- narrator: Voice-over that isn't a conversation participant
- advertiser: Only appears in ad reads
- quoted_audio: Audio clips/montages from other sources
- unknown: Cannot determine role

CONFIDENCE CALIBRATION:
- 0.95: Explicit self-ID ("I'm Jessica Tarlov")
- 0.85: Introduced by another speaker ("Joining us is Dr. Patel")
- 0.75: Clear from conversational context
- 0.60: Inferred from filename or weak evidence

OUTPUT (JSON ONLY):
{
  "speakers": [
    {
      "id": "speaker_1",
      "name": "Full Name or null",
      "role": "host|co_host|guest|narrator|advertiser|quoted_audio|unknown",
      "confidence": 0.60-0.95
    }
  ]
}

TRANSCRIPT:
{{UTTERANCES}}

Return ONLY the JSON object.`;

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
    reservationId?: string;
    filename?: string;
    speakerCount?: number;
    presetRoster?: Array<{ name: string; role?: string | null }>;
  } = {}
): Promise<GPTSpeakerIntelligenceResult> {
  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured for speaker intelligence');
  }

  const openai = new OpenAI({ apiKey, timeout: 120000 });
  const model = options.model || 'gpt-5';
  const maxUtterances = options.maxUtterances || 150;
  const filename = options.filename || 'unknown_file';

  console.log('[GPT SPEAKER INTELLIGENCE] Starting Pass 1');
  console.log(`[GPT SPEAKER INTELLIGENCE] Model: ${model}, Temperature: 0.0`);
  console.log(`[GPT SPEAKER INTELLIGENCE] Filename context: "${filename}"`);

  // Build utterance context
  const { context: utteranceContext, clusterCount } = buildUtteranceContext(segments, maxUtterances);
  console.log(`[GPT SPEAKER INTELLIGENCE] Raw diarization clusters detected: ${clusterCount}`);
  let userPrompt = GPT_USER_PROMPT_TEMPLATE.replace('{{UTTERANCES}}', utteranceContext);
  userPrompt = userPrompt.replace(/\{\{CLUSTER_COUNT\}\}/g, String(clusterCount));
  userPrompt = userPrompt.replace('{{FILENAME}}', filename);

  // Inject KNOWN SPEAKERS block if a preset roster was provided
  if (options.presetRoster && options.presetRoster.length > 0) {
    const rosterLines = options.presetRoster.map((s, i) => {
      const roleStr = s.role ? ` [${s.role}]` : '';
      return `${i + 1}. ${s.name}${roleStr}`;
    });
    const knownSpeakersBlock = [
      'KNOWN SPEAKERS (pre-identified by the uploader — use these names in your output):',
      ...rosterLines,
      '',
      'For each detected speaker cluster, check whether the transcript contains evidence',
      '(self-introduction, introduction by another speaker, or name mentions in their own',
      'segments) that links them to one of the above names. If so, use that exact name.',
      'Remaining speakers not covered by the roster should still be identified normally.',
      '',
    ].join('\n');
    userPrompt = userPrompt.replace('\nTRANSCRIPT:\n', '\n' + knownSpeakersBlock + '\nTRANSCRIPT:\n');
    const rosterNames = options.presetRoster.map(s => s.name).join(', ');
    console.log(`[GPT INTELLIGENCE] Injecting preset roster: ${rosterNames}`);
  }

  // Handle EXPECTED_SPEAKER_COUNT conditional block
  if (options.speakerCount) {
    userPrompt = userPrompt.replace(/\{\{EXPECTED_SPEAKER_COUNT\}\}/g, String(options.speakerCount));
    userPrompt = userPrompt.replace(/\{\{#if EXPECTED_SPEAKER_COUNT\}\}/g, '');
    userPrompt = userPrompt.replace(/\{\{\/if\}\}/g, '');
    console.log(`[GPT SPEAKER INTELLIGENCE] User-specified speakerCount hint: ${options.speakerCount}`);
  } else {
    userPrompt = userPrompt.replace(/\{\{#if EXPECTED_SPEAKER_COUNT\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      max_completion_tokens: 6000,
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
        reservationId: options.reservationId,
        response,
        modelName: model,
        purpose: 'Speaker Intelligence (Pass 1)',
        shouldDebit: options.reservationId ? false : true
      });
    }

    const rawResponse = response.choices[0]?.message?.content || '{}';
    console.log('[GPT SPEAKER INTELLIGENCE] Raw response received');

    // Parse and validate
    const parsed = JSON.parse(rawResponse);
    let speakers: GPTSpeaker[] = Array.isArray(parsed.speakers) ? parsed.speakers : [];

    console.log(`[GPT SPEAKER INTELLIGENCE] GPT identified ${speakers.length} speakers`);

    // Warn on empty roster (GPT returned no speakers)
    if (speakers.length === 0) {
      console.warn('[GPT SPEAKER INTELLIGENCE] WARNING: GPT returned 0 speakers — downstream passes will use fallback roster');
    }

    // Strip speakers without an id field before validation
    const preSanitizeCount = speakers.length;
    speakers = speakers.filter(s => typeof s.id === 'string' && s.id.trim().length > 0);
    if (speakers.length < preSanitizeCount) {
      console.warn(`[GPT SPEAKER INTELLIGENCE] Stripped ${preSanitizeCount - speakers.length} speaker(s) missing 'id' field`);
    }

    // Validate speakers
    const validationErrors = validateGPTSpeakers(speakers);

    if (validationErrors.length > 0) {
      console.warn('[GPT SPEAKER INTELLIGENCE] Validation errors:', validationErrors);
    }

    // Sanitize invalid or brand-like names
    const sanitizedErrors: string[] = [];
    speakers = speakers.map(speaker => {
      if (!speaker.name) return speaker;
      if (
        isValidSpeakerName(speaker.name) &&
        !looksLikeBrandOrSponsorName(speaker.name) &&
        hasStrongSingleTokenNameEvidence(speaker.name, segments, options.presetRoster)
      ) {
        return speaker;
      }
      sanitizedErrors.push(`Sanitized invalid name "${speaker.name}" for ${speaker.id}`);
      return { ...speaker, name: null };
    });

    if (sanitizedErrors.length > 0) {
      console.warn('[GPT SPEAKER INTELLIGENCE] Sanitized names:', sanitizedErrors);
      validationErrors.push(...sanitizedErrors);
    }

    speakers = speakers.map((speaker) => {
      if (speaker.role !== 'advertiser') return speaker;

      const clusterSegments = segments.filter((segment) => segment.speakerId === speaker.id);
      if (!clusterSegments.length) return speaker;

      const hasConversationalTurn = clusterSegments.some((segment) =>
        !/\b(?:support for (?:this|the) (?:show|podcast|episode)|this (?:show|episode) is brought to you by|we'?ll be right back|use code\b|promo code\b|visit\s+\S+\.(?:com|org|net|io|co)\b)\b/i.test(segment.text || '')
      );

      if (!hasConversationalTurn) return speaker;

      console.log(
        `[GPT SPEAKER INTELLIGENCE] Conservative role correction: demoting ${speaker.id} from advertiser to unknown because it has conversational turns`
      );

      return {
        ...speaker,
        role: 'unknown' as SpeakerRole,
      };
    });

    // ── Post-process fallback: ensure at least one host is identified ──
    // If GPT returned `role=unknown` for a speaker and no host exists, promote the
    // unknown speaker to host. This prevents the anchor system from producing zero
    // host-affinity anchors (which cascades into all-acoustic_only attribution).
    const hasHost = speakers.some(s => s.role === 'host' || s.role === 'co_host');
    if (!hasHost && speakers.length >= 2) {
      const unknowns = speakers.filter(s => s.role === 'unknown');
      if (unknowns.length === 1) {
        // Exactly one unknown + no host → the unknown is almost certainly the host
        const promoted = unknowns[0];
        speakers = speakers.map(s =>
          s.id === promoted.id ? { ...s, role: 'host' as SpeakerRole } : s
        );
        console.log(`[GPT SPEAKER INTELLIGENCE] Post-process: promoted sole unknown "${promoted.name || '(unnamed)'}" to host (no host found in GPT output)`);
      } else if (unknowns.length === 0) {
        // All roles assigned but no host — find the most question-asking speaker as host
        // Proxy: count question marks per raw cluster, map to roster speaker
        const questionCounts = new Map<string, number>();
        for (const seg of segments) {
          const qCount = (seg.text.match(/\?/g) || []).length;
          if (qCount > 0) {
            const id = seg.speakerId;
            questionCounts.set(id, (questionCounts.get(id) || 0) + qCount);
          }
        }
        if (questionCounts.size > 0) {
          // Find the speaker ID with the most questions
          let maxQ = 0;
          let hostCandidate: string | null = null;
          for (const [id, count] of questionCounts) {
            if (count > maxQ) { maxQ = count; hostCandidate = id; }
          }
          if (hostCandidate) {
            const speaker = speakers.find(s => s.id === hostCandidate);
            if (speaker && speaker.role === 'guest') {
              // Only promote guest→host if it clearly dominates
              speakers = speakers.map(s =>
                s.id === hostCandidate ? { ...s, role: 'host' as SpeakerRole } : s
              );
              console.log(`[GPT SPEAKER INTELLIGENCE] Post-process: promoted "${speaker.name || '(unnamed)'}" from guest to host (most questions: ${maxQ})`);
            }
          }
        }
      }
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
  // Panel handoffs: "Tony, let's bring you in..." / "Alex, at Ocado..."
  /\b[A-Z][a-z]{1,},\s+(?:let'?s bring you|let me bring you|can you take us|what'?s your)/i,
  /\b[A-Z][a-z]{1,},\s+at [A-Z][a-zA-Z]+/i,
  // Moderator hand-off: "Tony, you've mentioned..." / "Alex, how do you..."
  /\b[A-Z][a-z]{1,},\s+(?:you(?:'ve| have| were| are)|how do you|what do you|I want to)/i,
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
): { context: string; clusterCount: number } {
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

  // Compute raw cluster counts from initialSpeakerId (pre-pass-2 voice clusters)
  const clusterCounts = new Map<string, number>();
  for (const seg of segments) {
    const rawId = (seg as any).initialSpeakerId || seg.speakerId;
    if (rawId) clusterCounts.set(rawId, (clusterCounts.get(rawId) || 0) + 1);
  }

  if (clusterCounts.size > 1) {
    context += '\n\n--- RAW DIARIZATION CLUSTERS ---\n';
    context += `Audio diarization detected ${clusterCounts.size} distinct speaker voice clusters:\n`;
    for (const [id, count] of clusterCounts) {
      context += `  ${id}: ${count} segments\n`;
    }
    context += 'Each cluster is an acoustically distinct voice. Only merge two clusters if you have strong evidence they are the same person.\n';
  }

  return { context, clusterCount: clusterCounts.size };
}

/**
 * Build compact utterance context for GPT
 * @deprecated Use extractRosterContext instead for Smart Introduction Scanning
 */
function buildUtteranceContext(
  segments: SpeakerSegment[],
  maxUtterances: number
): { context: string; clusterCount: number } {
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
    { pattern: /\b(leicester square|madison square|comedy store|theatre|theater)\b/i, type: 'venue' },
    { pattern: /\b(nvidia|microsoft|apple|google|amazon|meta|tesla|salesforce)\b/i, type: 'company' }
  ];

  for (const speaker of speakers) {
    // Check required fields
    if (!speaker.id || typeof speaker.id !== 'string') {
      errors.push(`Speaker missing required 'id' field`);
    }
    if (!speaker.role || typeof speaker.role !== 'string') {
      errors.push(`Speaker ${speaker.id || '(unknown)'} missing required 'role' field`);
    }
    if (typeof speaker.confidence !== 'number') {
      errors.push(`Speaker ${speaker.id || '(unknown)'} missing required 'confidence' field`);
    }

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

    if (speaker.name && !isValidSpeakerName(speaker.name)) {
      errors.push(`Speaker name "${speaker.name}" fails validation (not a human name)`);
    }
  }

  return errors;
}

// Common short English words that should NEVER be speaker names.
// Checked before the initials check to prevent "in", "so", "not" etc.
// from being treated as valid initials/nicknames.
const COMMON_NON_NAME_WORDS = new Set([
  // Prepositions and conjunctions
  'in', 'on', 'at', 'to', 'by', 'of', 'or', 'an', 'as', 'if', 'so', 'no', 'up', 'here',
  // Pronouns
  'me', 'we', 'he', 'us', 'it', 'my',
  // Short verbs
  'am', 'is', 'be', 'do', 'go',
  // Negation and other function words
  'not', 'but', 'yet', 'nor', 'for', 'and', 'the',
  // Common fillers and interjections
  'oh', 'ok', 'ah', 'um', 'uh',
  // Other common short words
  'all', 'too', 'now', 'out', 'off', 'own', 'its', 'has', 'had', 'was', 'are',
  'her', 'his', 'our', 'who', 'how', 'why', 'can', 'did', 'got', 'get', 'let',
  'say', 'see', 'may', 'way', 'day', 'old', 'new', 'big', 'few', 'far', 'ago',
  'run', 'put', 'set', 'try', 'ask', 'use', 'lot', 'bit', 'per', 'via', 'yes',
]);

function isValidSpeakerName(name: string): boolean {
  const cleaned = name.trim();
  if (!cleaned) return false;

  const words = cleaned.split(/\s+/);
  if (words.length === 0 || words.length > 3) return false;

  // CRITICAL: Check common English words BEFORE the initials check.
  // This prevents "in", "so", "not" from being treated as initials.
  if (words.length === 1 && COMMON_NON_NAME_WORDS.has(cleaned.toLowerCase())) {
    return false;
  }

  // Allow initials/nicknames: single word, 2-3 chars, all same case (JJ, DJ, jj, etc.)
  const isInitials = words.length === 1 && (/^[A-Z]{2,3}$/.test(cleaned) || /^[a-z]{2,3}$/.test(cleaned));
  if (isInitials) {
    return true; // Initials are valid (common words already filtered above)
  }

  const hasUppercase = /[A-Z]/.test(cleaned);
  if (!hasUppercase) return false;

  const stopwords = new Set([
    // Articles and conjunctions
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'with', 'on', 'in', 'at',
    'by', 'from', 'this', 'that', 'these', 'those', 'here',
    // Possessives
    'my', 'your', 'his', 'her', 'their', 'our',
    // Modals and verbs
    'could', 'would', 'should', 'expecting', 'hammering', 'spreading',
    // Greetings
    'welcome', 'thanks', 'hello', 'hi', 'please',
    // Ordinals and sequence words
    'first', 'second', 'third', 'last', 'next', 'final',
    // Nationalities (adjectives, not names)
    'nigerian', 'american', 'canadian', 'british', 'indian', 'chinese', 'japanese',
    'african', 'european', 'asian', 'mexican', 'brazilian', 'australian',
    // Role descriptors
    'student', 'candidate', 'host', 'moderator', 'speaker', 'guest', 'interviewer',
    'person', 'guy', 'man', 'woman', 'people',
  ]);

  for (const word of words) {
    const normalized = word.replace(/[^\w'.-]/g, '').toLowerCase();
    if (!normalized) return false;
    if (stopwords.has(normalized)) return false;
    if (!/^[A-Za-z.'-]+$/.test(word)) return false;
    if (word.length > 24) return false;
  }

  return true;
}

function looksLikeBrandOrSponsorName(name: string): boolean {
  const cleaned = name.trim();
  if (!cleaned) return false;

  if (/[./]/.test(cleaned)) return true;

  const lowered = cleaned.toLowerCase();
  const brandTerms = [
    'analytics',
    'markets',
    'capital',
    'ventures',
    'fund',
    'bank',
    'labs',
    'biotics',
    'vanta',
    'delete.me',
    'sofi',
    'vcx',
    'zbiotics',
  ];

  return brandTerms.some((term) => lowered === term || lowered.includes(term));
}

function hasStrongSingleTokenNameEvidence(
  name: string,
  segments: SpeakerSegment[],
  presetRoster?: Array<{ name: string; role?: string | null }>
): boolean {
  const cleaned = name.trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length !== 1) return true;
  if (/^[A-Z]{2,3}$/.test(cleaned)) return true;

  const normalized = cleaned.toLowerCase();
  if (presetRoster?.some((speaker) => speaker.name?.trim().toLowerCase() === normalized)) {
    return true;
  }

  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selfIdPattern = new RegExp(`\\b(?:i'm|i am|my name is|this is)\\s+${escaped}\\b`, 'i');
  const introPattern = new RegExp(`\\b(?:welcome|joined by|here with|good to have you|our guest is|speaking with)\\s+${escaped}\\b`, 'i');
  const directAddressPattern = new RegExp(`\\b${escaped},\\b`, 'i');
  let directAddressCount = 0;

  for (const segment of segments) {
    const text = segment.text || '';
    if (!text) continue;
    if (selfIdPattern.test(text) || introPattern.test(text)) {
      return true;
    }
    if (directAddressPattern.test(text)) {
      directAddressCount++;
    }
  }

  return directAddressCount >= 2;
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
