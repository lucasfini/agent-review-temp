import type { SpeakerSegment } from '@/lib/types';

interface RosterEntry {
  name: string;
  aliases?: string[];
}

interface AnchorMatch {
  segmentIndex: number;
  speakerId: string;
  matchedName: string;
  rosterName: string;
  pattern: string;
  confidence: number;
  type: 'self-id' | 'handoff';
}

interface AutoCorrectResult {
  segments: SpeakerSegment[];
  corrections: Array<{
    speakerId: string;
    originalName?: string;
    correctedName: string;
    anchor: AnchorMatch;
  }>;
  anchorsFound: AnchorMatch[];
}

// Regex patterns for self-identification phrases
const SELF_ID_PATTERNS = [
  // Direct self-identification
  { pattern: /\b(?:i'm|i am|my name is|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi, confidence: 0.95 },
  // "It's [Name] here"
  { pattern: /\b(?:it's|its)\s+([A-Z][a-z]+)\s+here/gi, confidence: 0.9 },
  // "You're listening to [Name]"
  { pattern: /\b(?:you're|you are)\s+(?:listening to|with)\s+([A-Z][a-z]+)/gi, confidence: 0.85 },
];

// Patterns for host handoffs (identifies the NEXT speaker, not current)
const HANDOFF_PATTERNS = [
  { pattern: /\b(?:next (?:we have|up is|is)|let's (?:hear from|welcome)|over to you|please welcome),?\s+([A-Z][a-z]+)/gi, confidence: 0.85 },
  { pattern: /\b(?:thanks?|thank you),?\s+([A-Z][a-z]+)/gi, confidence: 0.6 }, // Lower confidence
];

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // increment along the first column of each row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // increment along the first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,   // insertion
            matrix[i - 1][j] + 1    // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalizes a name for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Checks if a detected name matches a roster entry (including aliases) using Fuzzy Matching
 */
function findRosterMatch(
  detectedName: string,
  roster: RosterEntry[]
): RosterEntry | null {
  const normalizedInput = normalizeName(detectedName);

  // 1. Exact Match Strategy (Priority)
  for (const entry of roster) {
    if (normalizeName(entry.name) === normalizedInput) return entry;
    // Check first name only
    if (normalizeName(entry.name.split(' ')[0]) === normalizedInput) return entry;
    // Check aliases
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        if (normalizeName(alias) === normalizedInput) return entry;
      }
    }
  }

  // 2. Fuzzy Match Strategy
  let bestMatch: RosterEntry | null = null;
  let minDist = Infinity;

  for (const entry of roster) {
    // Check main name
    const candidates = [entry.name, ... (entry.aliases || [])];
    
    // Also add first name if main name is multi-word
    if (entry.name.includes(' ')) {
        candidates.push(entry.name.split(' ')[0]);
    }

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeName(candidate);
      const dist = levenshtein(normalizedInput, normalizedCandidate);
      
      // Dynamic tolerance: 1 for short names (<5 chars), 2 for longer
      const allowedDist = normalizedCandidate.length < 5 ? 1 : 2;

      if (dist <= allowedDist && dist < minDist) {
        minDist = dist;
        bestMatch = entry;
      }
    }
  }

  return bestMatch;
}

/**
 * Auto-corrects speaker assignments based on self-identification and handoff anchors.
 *
 * This function scans the transcript for patterns like "I'm Emily" (Self-ID)
 * or "Next we have John" (Handoff) and locks in the speaker names.
 *
 * @param segments - Array of transcript segments with speaker IDs
 * @param roster - Array of expected speaker names (with optional aliases)
 * @returns Corrected segments and a list of corrections made
 */
export function autoCorrectSpeakers(
  segments: SpeakerSegment[],
  roster: RosterEntry[]
): AutoCorrectResult {
  if (!segments.length || !roster.length) {
    return { segments, corrections: [], anchorsFound: [] };
  }

  const anchorsFound: AnchorMatch[] = [];
  // Map to store the "Hard Lock": speakerId -> { name, anchor }
  // We use a Map to ensure we only have one lock per speakerId, 
  // keeping the one with the highest confidence/earliest occurrence priority logic can vary
  const speakerLocks = new Map<string, { name: string; anchor: AnchorMatch }>();

  // Iterate through segments to find anchors
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const text = segment.text;

    // --- Strategy 1: Self-Identification (Current Speaker) ---
    for (const { pattern, confidence } of SELF_ID_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const detectedName = match[1];
        const rosterMatch = findRosterMatch(detectedName, roster);

        if (rosterMatch) {
            const anchor: AnchorMatch = {
                segmentIndex: i,
                speakerId: segment.speakerId,
                matchedName: detectedName,
                rosterName: rosterMatch.name,
                pattern: match[0],
                confidence,
                type: 'self-id'
            };
            anchorsFound.push(anchor);

            // Apply Lock Logic: High confidence overwrites low confidence
            const existingLock = speakerLocks.get(segment.speakerId);
            if (!existingLock || confidence > existingLock.anchor.confidence) {
                speakerLocks.set(segment.speakerId, { name: rosterMatch.name, anchor });
            }
        }
      }
    }

    // --- Strategy 2: Moderator Handoff (Next Speaker) ---
    for (const { pattern, confidence } of HANDOFF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const detectedName = match[1];
        const rosterMatch = findRosterMatch(detectedName, roster);

        if (rosterMatch) {
            // Find the NEXT speaker segment that has a DIFFERENT speakerId
            let nextSpeakerId: string | null = null;
            let nextSegmentIndex = -1;

            for (let j = i + 1; j < segments.length; j++) {
                if (segments[j].speakerId !== segment.speakerId) {
                    nextSpeakerId = segments[j].speakerId;
                    nextSegmentIndex = j;
                    break;
                }
            }

            if (nextSpeakerId) {
                const anchor: AnchorMatch = {
                    segmentIndex: i, // The anchor phrase is in the current segment
                    speakerId: nextSpeakerId, // But it identifies the NEXT speaker
                    matchedName: detectedName,
                    rosterName: rosterMatch.name,
                    pattern: match[0],
                    confidence, // Handoffs usually have slightly lower confidence than self-id
                    type: 'handoff'
                };
                anchorsFound.push(anchor);

                 // Apply Lock Logic:
                 const existingLock = speakerLocks.get(nextSpeakerId);
                 if (!existingLock || confidence > existingLock.anchor.confidence) {
                     speakerLocks.set(nextSpeakerId, { name: rosterMatch.name, anchor });
                 }
            }
        }
      }
    }
  }

  // Apply corrections to all segments based on the Locks
  const corrections: AutoCorrectResult['corrections'] = [];
  const correctedSegments = segments.map(segment => {
    const lock = speakerLocks.get(segment.speakerId);
    if (!lock) {
      return segment;
    }

    return {
      ...segment,
      // Add corrected name metadata
      _correctedName: lock.name,
      _anchorConfidence: lock.anchor.confidence,
    } as SpeakerSegment;
  });

  // Generate unique corrections list
  for (const [speakerId, { name, anchor }] of speakerLocks) {
    corrections.push({
      speakerId,
      correctedName: name,
      anchor,
    });
  }

  return {
    segments: correctedSegments,
    corrections,
    anchorsFound,
  };
}

/**
 * Enhanced version - retained for backward compatibility if needed, 
 * but main logic is now in autoCorrectSpeakers.
 */
export function autoCorrectSpeakersWithHandoffs(
  segments: SpeakerSegment[],
  roster: RosterEntry[]
): AutoCorrectResult {
    return autoCorrectSpeakers(segments, roster);
}

/**
 * Applies the speaker name corrections to the speaker data object
 */
export function applySpeakerCorrections(
  speakerData: {
    segments: SpeakerSegment[];
    speakers: Record<string, any>;
  },
  corrections: AutoCorrectResult['corrections']
): typeof speakerData {
  if (!corrections.length) {
    return speakerData;
  }

  const updatedSpeakers = { ...speakerData.speakers };

  for (const correction of corrections) {
    if (updatedSpeakers[correction.speakerId]) {
      updatedSpeakers[correction.speakerId] = {
        ...updatedSpeakers[correction.speakerId],
        finalName: correction.correctedName,
        anchorCorrected: true,
        anchorConfidence: correction.anchor.confidence,
        anchorPattern: correction.anchor.pattern,
      };
    }
  }

  return {
    ...speakerData,
    speakers: updatedSpeakers,
  };
}
