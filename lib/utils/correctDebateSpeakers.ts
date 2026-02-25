/**
 * Debate-Specific Speaker Correction Utility (Hardened v2)
 *
 * This module implements an AGGRESSIVE "Moderator Flow" algorithm for correcting
 * speaker labels in debate/panel formats where:
 * - A moderator introduces speakers (rather than self-introduction)
 * - Speakers take turns in a structured order (often alphabetical)
 * - The regex-based self-ID approach fails because speakers don't say "I'm..."
 *
 * Algorithm (v2 - Hardened):
 * 1. Find Host: Multiple fallback strategies (patterns → segment count → existing label)
 * 2. Fuzzy Alias Matching: Auto-generate first/last name aliases, case-insensitive
 * 3. Lookahead Assignment: Pre-assign speakers immediately when host mentions them
 * 4. Comprehensive Debug Logging: Every decision is logged
 */

import type { SpeakerSegment } from '@/lib/types';

export interface RosterEntry {
  id?: string;
  name: string;
  role?: string;
  aliases?: string[];
  priority?: number;
}

export interface DebateCorrectionResult {
  segments: SpeakerSegment[];
  corrections: SpeakerCorrection[];
  hostId: string | null;
  hostConfidence: number;
  rosterMatches: RosterMatch[];
  unassignedSpeakers: string[];
  algorithmMetadata: {
    alphabeticalOrderDetected: boolean;
    nameIntroductionsFound: number;
    autoAdvanceCount: number;
    lookaheadAssignments: number;
    hostDetectionMethod: string;
  };
  debugLog: string[];
}

interface SpeakerCorrection {
  speakerId: string;
  assignedName: string;
  assignmentReason: 'name_introduction' | 'auto_advance' | 'host_detection' | 'lookahead';
  confidence: number;
  introducedAtSegment?: number;
  introducedByPhrase?: string;
}

interface RosterMatch {
  speakerId: string;
  rosterName: string;
  matchType: 'exact' | 'fuzzy' | 'alias' | 'partial';
  confidence: number;
}

// Procedural language patterns that identify a host/moderator
const HOST_PATTERNS = [
  { pattern: /\b(?:next (?:we have|up is|is)|let's (?:hear from|welcome|turn to))\b/gi, weight: 2.0 },
  { pattern: /\b(?:moving on to|thank you|thanks for (?:that|joining))\b/gi, weight: 1.5 },
  { pattern: /\b(?:our next (?:speaker|panelist|guest)|now (?:turning to|we'll hear from))\b/gi, weight: 2.0 },
  { pattern: /\b(?:in alphabetical order|going (?:around the table|in order))\b/gi, weight: 2.5 },
  { pattern: /\b(?:please welcome|introducing|our (?:first|second|third|final))\b/gi, weight: 1.8 },
  { pattern: /\b(?:let's start with|we'll begin with|beginning with)\b/gi, weight: 1.5 },
  { pattern: /\b(?:time for (?:our|the)|that concludes|wrapping up)\b/gi, weight: 1.2 },
  { pattern: /\b(?:welcome to|good (?:morning|afternoon|evening))\b/gi, weight: 1.0 },
  { pattern: /\b(?:ladies and gentlemen|thank you all)\b/gi, weight: 1.5 },
];

// Patterns indicating a name introduction - EXPANDED for better coverage
const NAME_INTRODUCTION_PATTERNS = [
  // Standard introductions
  /\b(?:next (?:we have|up is|is))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  /\b(?:let's (?:hear from|welcome|turn to))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  /\b(?:now (?:turning to|we'll hear from))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  /\b(?:please welcome|introducing)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  /\b(?:over to you),?\s+([A-Z][a-zA-Z'-]+)/gi,
  /\b(?:starting with|beginning with)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  // More casual patterns
  /\b(?:we have|we've got)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  /\b(?:here's|here is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  /\b(?:from|representing)\s+[^,]+,\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/gi,
  // Direct handoffs
  /([A-Z][a-zA-Z'-]+),?\s+(?:go ahead|you're up|your turn|take it away)/gi,
  /\b(?:thank you)[,.]?\s+([A-Z][a-zA-Z'-]+)/gi,
];

// Generic "next" patterns without explicit name
const AUTO_ADVANCE_PATTERNS = [
  /\b(?:and next|next up|our next|the next)\b/gi,
  /\b(?:moving on|let's continue|continuing)\b/gi,
  /\b(?:now (?:let's|we'll))\b/gi,
];

// Debug logger
class DebugLogger {
  private logs: string[] = [];

  log(category: string, message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    const logEntry = `[${timestamp}] [${category}] ${message}${dataStr}`;
    this.logs.push(logEntry);
    console.log(`[DEBATE-CORRECTION] ${logEntry}`);
  }

  getLogs(): string[] {
    return this.logs;
  }
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

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
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalizes a name for comparison (lowercase, trim, single spaces)
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

const NAME_STOPWORDS = new Set([
  'you','your','our','and','the','to','for','with','from','this','that','these','those','we','us','they','them',
  'a','an','in','on','at','by','of','is','are','will','can','go','ahead','move','next','first','last'
]);

function isValidNameCandidate(raw: string): boolean {
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 3) return false;
  const hasLongToken = tokens.some(t => t.length >= 3);
  if (!hasLongToken) return false;
  if (tokens.some(t => NAME_STOPWORDS.has(t.toLowerCase()))) return false;
  return tokens.every(t => /^[A-Za-z'-.]+$/.test(t));
}

/**
 * Generates all possible aliases from a full name
 * "Emily Donjong" -> ["emily donjong", "emily", "donjong", "e. donjong", "emily d."]
 */
function generateAliases(fullName: string): string[] {
  const normalized = normalizeName(fullName);
  const parts = normalized.split(' ').filter(p => p.length > 0);
  const aliases: string[] = [normalized];

  if (parts.length >= 1) {
    // First name only
    aliases.push(parts[0]);

    if (parts.length >= 2) {
      // Last name only
      aliases.push(parts[parts.length - 1]);

      // First initial + last name
      aliases.push(`${parts[0][0]}. ${parts[parts.length - 1]}`);

      // First name + last initial
      aliases.push(`${parts[0]} ${parts[parts.length - 1][0]}.`);

      // If middle names exist, add first + last
      if (parts.length > 2) {
        aliases.push(`${parts[0]} ${parts[parts.length - 1]}`);
      }
    }
  }

  return aliases;
}

function buildAliases(entry: RosterEntry): string[] {
  const aliases = new Set<string>();
  for (const alias of generateAliases(entry.name)) aliases.add(alias);
  for (const alias of entry.aliases || []) aliases.add(normalizeName(alias));
  return [...aliases];
}

/**
 * Checks if a text contains any alias of a roster entry (case-insensitive)
 */
function textContainsAlias(text: string, roster: RosterEntry[], logger: DebugLogger): { entry: RosterEntry; matchedAlias: string; matchType: 'exact' | 'partial' } | null {
  const normalizedText = text.toLowerCase();

  for (const entry of roster) {
    const allAliases = buildAliases(entry);

    for (const alias of allAliases) {
      // Word boundary check - the alias should be a complete word/phrase
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordBoundaryRegex = new RegExp(`\\b${escapedAlias}\\b`, 'i');

      if (wordBoundaryRegex.test(normalizedText)) {
        logger.log('ALIAS-MATCH', `Found "${alias}" in text for roster entry "${entry.name}"`, { matchedAlias: alias });
        return {
          entry,
          matchedAlias: alias,
          matchType: alias === normalizeName(entry.name) ? 'exact' : 'partial'
        };
      }
    }
  }

  return null;
}

/**
 * Finds a roster match for a detected name with FUZZY matching
 */
function findRosterMatch(
  detectedName: string,
  roster: RosterEntry[],
  logger: DebugLogger
): { entry: RosterEntry; matchType: 'exact' | 'fuzzy' | 'alias' | 'partial' } | null {
  const normalizedInput = normalizeName(detectedName);
  logger.log('ROSTER-MATCH', `Attempting to match "${detectedName}" (normalized: "${normalizedInput}")`);
  if (!isValidNameCandidate(detectedName)) {
    logger.log('FILTER', `Rejected candidate "${detectedName}" as invalid name`);
    return null;
  }

  // 1. Exact full name match
  for (const entry of roster) {
    if (normalizeName(entry.name) === normalizedInput) {
      logger.log('MATCH', `Exact full name match: "${detectedName}" → "${entry.name}"`, { matchType: 'exact' });
      return { entry, matchType: 'exact' };
    }
  }

  // 2. First name only match (input is just first name, roster has full name)
  for (const entry of roster) {
    const entryAliases = buildAliases(entry);
    for (const alias of entryAliases) {
      if (alias === normalizedInput) {
        logger.log('MATCH', `Alias match: "${detectedName}" → "${entry.name}" via alias "${alias}"`, { matchType: 'alias' });
        return { entry, matchType: 'alias' };
      }
    }
  }

  // 3. Explicit aliases from roster
  for (const entry of roster) {
    const entryAliases = buildAliases(entry);
    for (const alias of entryAliases) {
      if (normalizeName(alias) === normalizedInput) {
        logger.log('MATCH', `Explicit alias match: "${detectedName}" → "${entry.name}" via alias "${alias}"`, { matchType: 'alias' });
        return { entry, matchType: 'alias' };
      }
    }
  }

  // 4. Fuzzy match with Levenshtein distance
  for (const entry of roster) {
    const candidates = [
      entry.name,
      ...buildAliases(entry),
    ];

    for (const candidate of candidates) {
      const dist = levenshtein(normalizedInput, normalizeName(candidate));
      // Allow more tolerance for longer names
      const allowedDist = Math.max(1, Math.floor(candidate.length / 4));
      if (dist <= allowedDist && dist > 0) {
        logger.log('MATCH', `Fuzzy match: "${detectedName}" → "${entry.name}" (distance: ${dist}, allowed: ${allowedDist})`, { matchType: 'fuzzy' });
        return { entry, matchType: 'fuzzy' };
      }
    }
  }

  logger.log('FAIL', `No roster match found for "${detectedName}"`);
  return null;
}

/**
 * Detects the host/moderator speaker ID with MULTIPLE FALLBACK STRATEGIES
 */
function detectHost(
  segments: SpeakerSegment[],
  logger: DebugLogger
): { hostId: string | null; confidence: number; evidence: string[]; method: string } {

  logger.log('HOST-DETECT', 'Starting host detection with multiple strategies');

  // Strategy 1: Procedural language patterns
  const speakerScores: Record<string, { score: number; examples: string[] }> = {};

  for (const segment of segments) {
    const text = segment.text;

    for (const { pattern, weight } of HOST_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = text.match(regex);
      if (matches) {
        if (!speakerScores[segment.speakerId]) {
          speakerScores[segment.speakerId] = { score: 0, examples: [] };
        }
        speakerScores[segment.speakerId].score += matches.length * weight;
        speakerScores[segment.speakerId].examples.push(...matches.slice(0, 2));
      }
    }
  }

  let hostId: string | null = null;
  let maxScore = 0;

  for (const [speakerId, data] of Object.entries(speakerScores)) {
    logger.log('HOST-SCORE', `Speaker ${speakerId} pattern score: ${data.score.toFixed(2)}`, { examples: data.examples.slice(0, 3) });
    if (data.score > maxScore) {
      maxScore = data.score;
      hostId = speakerId;
    }
  }

  // If pattern score is sufficient (>= 2, reduced from 4)
  if (maxScore >= 2 && hostId) {
    const confidence = Math.min(maxScore / 6, 1);
    logger.log('HOST-DETECT', `✓ Host detected via patterns: ${hostId}`, { score: maxScore, confidence });
    return {
      hostId,
      confidence,
      evidence: speakerScores[hostId].examples.slice(0, 5),
      method: 'pattern_matching',
    };
  }

  logger.log('HOST-DETECT', 'Pattern matching inconclusive, trying fallbacks...');

  // Strategy 2: Check for existing "Host" label in segment speaker names
  const speakerLabels = new Set<string>();
  const speakerLabelMap: Record<string, string> = {};

  for (const segment of segments) {
    // Check if segment has a speaker property with a name-like value
    const segmentAny = segment as any;
    const possibleLabels = [
      segmentAny.speaker,
      segmentAny.speakerName,
      segmentAny._correctedName,
      segmentAny.name,
    ].filter(Boolean) as string[];

    for (const label of possibleLabels) {
      if (typeof label === 'string') {
        speakerLabels.add(label);
        speakerLabelMap[segment.speakerId] = label;

        if (label.toLowerCase().includes('host') || label.toLowerCase().includes('moderator')) {
          logger.log('HOST-DETECT', `✓ Host detected via existing label: ${segment.speakerId} = "${label}"`, { method: 'existing_label' });
          return {
            hostId: segment.speakerId,
            confidence: 0.9,
            evidence: [`Existing label: ${label}`],
            method: 'existing_label',
          };
        }
      }
    }
  }

  // Strategy 3: Fallback to speaker with highest segment count
  const segmentCounts: Record<string, number> = {};
  for (const segment of segments) {
    segmentCounts[segment.speakerId] = (segmentCounts[segment.speakerId] || 0) + 1;
  }

  let mostFrequentSpeaker: string | null = null;
  let maxCount = 0;

  for (const [speakerId, count] of Object.entries(segmentCounts)) {
    logger.log('HOST-COUNT', `Speaker ${speakerId} segment count: ${count}`);
    if (count > maxCount) {
      maxCount = count;
      mostFrequentSpeaker = speakerId;
    }
  }

  // Only use segment count fallback if there's a clear leader (20% more than second)
  const sortedCounts = Object.entries(segmentCounts).sort((a, b) => b[1] - a[1]);
  if (sortedCounts.length >= 2) {
    const [first, second] = sortedCounts;
    const ratio = first[1] / second[1];

    if (ratio >= 1.2 && mostFrequentSpeaker) {
      logger.log('HOST-DETECT', `✓ Host detected via segment count: ${mostFrequentSpeaker}`, { count: maxCount, ratio: ratio.toFixed(2) });
      return {
        hostId: mostFrequentSpeaker,
        confidence: Math.min(0.5 + (ratio - 1.2) * 0.3, 0.7),
        evidence: [`Highest segment count: ${maxCount} (ratio: ${ratio.toFixed(2)})`],
        method: 'segment_count_fallback',
      };
    }
  } else if (sortedCounts.length === 1 && mostFrequentSpeaker) {
    // Only one speaker type - likely not useful but log it
    logger.log('HOST-DETECT', 'Only one speaker type found, cannot determine host');
  }

  // Strategy 4: If we still have a top scorer from patterns (even below threshold)
  if (hostId && maxScore > 0) {
    logger.log('HOST-DETECT', `⚠ Using low-confidence pattern match: ${hostId}`, { score: maxScore });
    return {
      hostId,
      confidence: Math.min(maxScore / 8, 0.5),
      evidence: speakerScores[hostId].examples.slice(0, 5),
      method: 'low_confidence_pattern',
    };
  }

  logger.log('HOST-DETECT', '✗ No host detected with any strategy');
  return {
    hostId: null,
    confidence: 0,
    evidence: [],
    method: 'none',
  };
}

/**
 * Checks if alphabetical order was mentioned in the transcript
 */
function detectAlphabeticalOrder(segments: SpeakerSegment[], logger: DebugLogger): boolean {
  const fullText = segments.map(s => s.text).join(' ');
  const patterns = [
    /alphabetical(?:ly| order)/i,
    /going in order/i,
    /a to z/i,
  ];
  const detected = patterns.some(p => p.test(fullText));
  logger.log('ALPHA-ORDER', `Alphabetical order detection: ${detected}`);
  return detected;
}

/**
 * Sorts roster alphabetically by first name
 */
function sortRosterAlphabetically(roster: RosterEntry[]): RosterEntry[] {
  return [...roster].sort((a, b) => {
    const aFirst = a.name.split(' ')[0].toLowerCase();
    const bFirst = b.name.split(' ')[0].toLowerCase();
    return aFirst.localeCompare(bFirst);
  });
}

/**
 * LOOKAHEAD: Find the next non-host speaker segment after a given index
 */
function findNextNonHostSegment(
  segments: SpeakerSegment[],
  startIndex: number,
  hostId: string | null,
  logger: DebugLogger
): { segment: SpeakerSegment; index: number } | null {
  for (let i = startIndex + 1; i < segments.length; i++) {
    if (segments[i].speakerId !== hostId) {
      logger.log('LOOKAHEAD', `Found next non-host segment at index ${i}`, { speakerId: segments[i].speakerId });
      return { segment: segments[i], index: i };
    }
  }
  logger.log('LOOKAHEAD', 'No non-host segment found after index ' + startIndex);
  return null;
}

/**
 * Scans host text for ANY name mention from the roster
 */
function scanForRosterNameMention(
  text: string,
  roster: RosterEntry[],
  usedNames: Set<string>,
  logger: DebugLogger
): { entry: RosterEntry; phrase: string } | null {

  // First try the structured introduction patterns
  for (const pattern of NAME_INTRODUCTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const mentionedName = match[1];
      if (!isValidNameCandidate(mentionedName)) continue;
      logger.log('SCAN', `Pattern matched name: "${mentionedName}" from phrase: "${match[0]}"`);

      const rosterMatch = findRosterMatch(mentionedName, roster, logger);
      if (rosterMatch && !usedNames.has(rosterMatch.entry.name)) {
        return { entry: rosterMatch.entry, phrase: match[0] };
      }
    }
  }

  // Then do a broader scan for any roster name alias in the text
  const aliasMatch = textContainsAlias(text, roster.filter(r => !usedNames.has(r.name)), logger);
  if (aliasMatch) {
    logger.log('SCAN', `Broad alias scan found: "${aliasMatch.matchedAlias}" → "${aliasMatch.entry.name}"`);
    return { entry: aliasMatch.entry, phrase: `contains "${aliasMatch.matchedAlias}"` };
  }

  return null;
}

/**
 * Main function: Corrects speaker assignments for debate/panel format
 *
 * HARDENED v2: Aggressive matching with lookahead assignment
 *
 * @param segments - Speaker segments from transcription
 * @param roster - List of expected speaker names
 * @returns Corrected segments and correction metadata
 */
export function correctDebateSpeakers(
  segments: SpeakerSegment[],
  roster: RosterEntry[]
): DebateCorrectionResult {
  const logger = new DebugLogger();

  logger.log('START', `correctDebateSpeakers called with ${segments.length} segments and ${roster.length} roster entries`);
  logger.log('ROSTER', 'Input roster:', { names: roster.map(r => r.name) });

  if (!segments.length || !roster.length) {
    logger.log('BAIL', 'Empty segments or roster, returning unchanged');
    return {
      segments,
      corrections: [],
      hostId: null,
      hostConfidence: 0,
      rosterMatches: [],
      unassignedSpeakers: [],
      algorithmMetadata: {
        alphabeticalOrderDetected: false,
        nameIntroductionsFound: 0,
        autoAdvanceCount: 0,
        lookaheadAssignments: 0,
        hostDetectionMethod: 'none',
      },
      debugLog: logger.getLogs(),
    };
  }

  // Step 1: Detect the host/moderator with multiple fallback strategies
  const hostDetection = detectHost(segments, logger);
  const hostId = hostDetection.hostId;

  // Step 2: Check for alphabetical order
  const alphabeticalOrderDetected = detectAlphabeticalOrder(segments, logger);
  let workingRoster = roster;
  if (alphabeticalOrderDetected) {
    workingRoster = sortRosterAlphabetically(roster);
    logger.log('ROSTER', 'Sorted roster alphabetically:', { names: workingRoster.map(r => r.name) });
  }

  // State tracking
  const speakerAssignments = new Map<string, { name: string; correction: SpeakerCorrection }>();
  const usedRosterNames = new Set<string>();
  let rosterIndex = 0;
  let nameIntroductionsFound = 0;
  let autoAdvanceCount = 0;
  let lookaheadAssignments = 0;

  // Mark host first
  if (hostId) {
    const hostInRoster = workingRoster.find(r =>
      r.name.toLowerCase().includes('host') ||
      r.name.toLowerCase().includes('moderator')
    );

    const hostName = hostInRoster?.name || 'Host';
    speakerAssignments.set(hostId, {
      name: hostName,
      correction: {
        speakerId: hostId,
        assignedName: hostName,
        assignmentReason: 'host_detection',
        confidence: hostDetection.confidence,
      },
    });

    if (hostInRoster) {
      usedRosterNames.add(hostInRoster.name);
    }

    logger.log('HOST-ASSIGN', `Assigned host: ${hostId} → "${hostName}"`, { confidence: hostDetection.confidence, method: hostDetection.method });
  }

  // Step 3: Iterate through segments with LOOKAHEAD assignment
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isHostSegment = segment.speakerId === hostId;

    if (isHostSegment) {
      const text = segment.text;
      logger.log('HOST-SPEECH', `Processing host segment ${i}: "${text.substring(0, 100)}..."`);

      // Scan for any roster name mention
      const nameMention = scanForRosterNameMention(text, workingRoster, usedRosterNames, logger);

      if (nameMention) {
        logger.log('NAME-FOUND', `Host mentioned "${nameMention.entry.name}" via: "${nameMention.phrase}"`);
        nameIntroductionsFound++;

        // LOOKAHEAD: Find the NEXT non-host segment and PRE-ASSIGN it
        const nextNonHost = findNextNonHostSegment(segments, i, hostId, logger);

        if (nextNonHost && !speakerAssignments.has(nextNonHost.segment.speakerId)) {
          // Force assign this speaker ID to the mentioned name
          speakerAssignments.set(nextNonHost.segment.speakerId, {
            name: nameMention.entry.name,
            correction: {
              speakerId: nextNonHost.segment.speakerId,
              assignedName: nameMention.entry.name,
              assignmentReason: 'lookahead',
              confidence: 0.9,
              introducedAtSegment: i,
              introducedByPhrase: nameMention.phrase,
            },
          });

          usedRosterNames.add(nameMention.entry.name);
          lookaheadAssignments++;

          logger.log('LOOKAHEAD-ASSIGN', `✓ Pre-assigned ${nextNonHost.segment.speakerId} → "${nameMention.entry.name}"`, {
            introducedAt: i,
            assignedAt: nextNonHost.index,
            phrase: nameMention.phrase,
          });
        } else if (nextNonHost) {
          logger.log('LOOKAHEAD-SKIP', `Speaker ${nextNonHost.segment.speakerId} already assigned, skipping lookahead`);
        }
      } else {
        // Check for auto-advance patterns (no explicit name)
        let autoAdvanceTriggered = false;
        for (const pattern of AUTO_ADVANCE_PATTERNS) {
          if (pattern.test(text)) {
            autoAdvanceTriggered = true;
            break;
          }
        }

        if (autoAdvanceTriggered) {
          // Find next unassigned roster entry
          while (rosterIndex < workingRoster.length && usedRosterNames.has(workingRoster[rosterIndex].name)) {
            rosterIndex++;
          }

          if (rosterIndex < workingRoster.length) {
            const nextEntry = workingRoster[rosterIndex];

            // LOOKAHEAD for auto-advance too
            const nextNonHost = findNextNonHostSegment(segments, i, hostId, logger);

            if (nextNonHost && !speakerAssignments.has(nextNonHost.segment.speakerId)) {
              speakerAssignments.set(nextNonHost.segment.speakerId, {
                name: nextEntry.name,
                correction: {
                  speakerId: nextNonHost.segment.speakerId,
                  assignedName: nextEntry.name,
                  assignmentReason: 'auto_advance',
                  confidence: 0.7,
                  introducedAtSegment: i,
                  introducedByPhrase: 'auto-advance',
                },
              });

              usedRosterNames.add(nextEntry.name);
              rosterIndex++;
              autoAdvanceCount++;

              logger.log('AUTO-ADVANCE', `✓ Auto-advanced ${nextNonHost.segment.speakerId} → "${nextEntry.name}"`, {
                introducedAt: i,
                assignedAt: nextNonHost.index,
              });
            }
          } else {
            logger.log('AUTO-ADVANCE-FAIL', 'No more unassigned roster entries for auto-advance');
          }
        }
      }
    } else {
      // Non-host speaker segment
      if (!speakerAssignments.has(segment.speakerId)) {
        logger.log('UNASSIGNED', `Non-host segment ${i} from ${segment.speakerId} is not yet assigned`);
      }
    }
  }

  // Build corrections list
  const corrections: SpeakerCorrection[] = [];
  for (const [, data] of speakerAssignments) {
    corrections.push(data.correction);
  }

  // Build roster matches
  const rosterMatches: RosterMatch[] = [];
  for (const [speakerId, data] of speakerAssignments) {
    if (data.name !== 'Host') {
      rosterMatches.push({
        speakerId,
        rosterName: data.name,
        matchType: 'exact',
        confidence: data.correction.confidence,
      });
    }
  }

  // Find unassigned speakers
  const allSpeakerIds = new Set(segments.map(s => s.speakerId));
  const unassignedSpeakers = Array.from(allSpeakerIds).filter(id => !speakerAssignments.has(id));

  if (unassignedSpeakers.length > 0) {
    logger.log('UNASSIGNED-FINAL', `${unassignedSpeakers.length} speakers remain unassigned`, { ids: unassignedSpeakers });
  }

  // Apply corrections to segments
  const correctedSegments = segments.map(segment => {
    const assignment = speakerAssignments.get(segment.speakerId);
    if (assignment) {
      return {
        ...segment,
        speaker: assignment.name,
        _correctedName: assignment.name,
        _debateCorrected: true,
        _correctionConfidence: assignment.correction.confidence,
        _correctionReason: assignment.correction.assignmentReason,
      } as SpeakerSegment;
    }
    return segment;
  });

  // Count how many segments were actually corrected
  const correctedCount = correctedSegments.filter(s => (s as any)._debateCorrected).length;
  logger.log('COMPLETE', `Correction complete: ${correctedCount}/${segments.length} segments corrected`, {
    corrections: corrections.length,
    nameIntroductions: nameIntroductionsFound,
    autoAdvances: autoAdvanceCount,
    lookaheads: lookaheadAssignments,
  });

  return {
    segments: correctedSegments,
    corrections,
    hostId,
    hostConfidence: hostDetection.confidence,
    rosterMatches,
    unassignedSpeakers,
    algorithmMetadata: {
      alphabeticalOrderDetected,
      nameIntroductionsFound,
      autoAdvanceCount,
      lookaheadAssignments,
      hostDetectionMethod: hostDetection.method,
    },
    debugLog: logger.getLogs(),
  };
}

/**
 * Applies debate corrections to speaker data object
 */
export function applyDebateCorrectionToSpeakerData(
  speakerData: {
    segments: SpeakerSegment[];
    speakers: Record<string, unknown>;
  },
  result: DebateCorrectionResult
): typeof speakerData {
  const updatedSpeakers = { ...speakerData.speakers };

  for (const correction of result.corrections) {
    if (updatedSpeakers[correction.speakerId]) {
      updatedSpeakers[correction.speakerId] = {
        ...(updatedSpeakers[correction.speakerId] as Record<string, unknown>),
        finalName: correction.assignedName,
        debateCorrected: true,
        debateCorrectionReason: correction.assignmentReason,
        debateCorrectionConfidence: correction.confidence,
      };
    }
  }

  return {
    ...speakerData,
    speakers: updatedSpeakers,
    segments: result.segments,
  };
}

/**
 * Utility: Summarize correction results for logging
 */
export function summarizeDebateCorrections(result: DebateCorrectionResult): string {
  const lines = [
    `[DEBATE CORRECTION SUMMARY]`,
    `Host: ${result.hostId || 'Not detected'} (confidence: ${(result.hostConfidence * 100).toFixed(0)}%, method: ${result.algorithmMetadata.hostDetectionMethod})`,
    `Corrections made: ${result.corrections.length}`,
    `  - Name introductions: ${result.algorithmMetadata.nameIntroductionsFound}`,
    `  - Auto-advances: ${result.algorithmMetadata.autoAdvanceCount}`,
    `  - Lookahead assignments: ${result.algorithmMetadata.lookaheadAssignments}`,
    `Alphabetical order detected: ${result.algorithmMetadata.alphabeticalOrderDetected}`,
    `Unassigned speakers: ${result.unassignedSpeakers.length > 0 ? result.unassignedSpeakers.join(', ') : 'None'}`,
  ];

  if (result.corrections.length > 0) {
    lines.push(`\nAssignments:`);
    for (const c of result.corrections) {
      lines.push(`  ${c.speakerId} → "${c.assignedName}" (${c.assignmentReason}, confidence: ${(c.confidence * 100).toFixed(0)}%)`);
    }
  }

  return lines.join('\n');
}
