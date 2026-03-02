// Intelligent speaker roster matching using 5-pass strategy
// Matches AssemblyAI-detected speakers to user-provided roster entries

import { SpeakerSegment, DetectedSpeaker } from './types';

export interface PresetSpeaker {
  id: string;
  name: string;
  role: 'host' | 'guest' | 'cohost' | 'moderator' | 'other' | null;
  description?: string;
  priority: number;
}

export interface RosterMatchResult {
  detectedSpeakerId: string;
  rosterSpeaker: PresetSpeaker;
  confidence: number;
  matchMethod: 'self_intro' | 'speaking_time' | 'introduced_by_other' | 'keyword_freq' | 'speaker_order' | 'force_assigned';
  evidence: string[];
}

/**
 * 5-Pass Matching Strategy
 *
 * Pass 1: Self-introduction patterns (confidence: 0.95)
 * Pass 2: Speaking time + role heuristics (confidence: 0.85)
 * Pass 3: Introduction by others (confidence: 0.80)
 * Pass 4: Keyword frequency (confidence: 0.70)
 * Pass 5: Speaker order fallback (confidence: 0.60)
 */
export async function matchSpeakersToRoster(
  detectedSpeakers: Record<string, DetectedSpeaker>,
  speakerSegments: SpeakerSegment[],
  transcriptionText: string,
  roster: PresetSpeaker[]
): Promise<RosterMatchResult[]> {
  console.log(`[ROSTER MATCH] Starting 5-pass matching: ${Object.keys(detectedSpeakers).length} detected, ${roster.length} roster`);

  const matches: RosterMatchResult[] = [];
  const matchedDetectedIds = new Set<string>();
  const matchedRosterIds = new Set<string>();

  // PASS 1: Self-introduction matching (95% confidence)
  console.log('[ROSTER MATCH] Pass 1: Self-introduction detection');
  for (const segment of speakerSegments) {
    if (matchedDetectedIds.has(segment.speakerId)) continue;

    for (const rosterSpeaker of roster) {
      if (matchedRosterIds.has(rosterSpeaker.id)) continue;

      if (detectSelfIntroduction(segment, rosterSpeaker)) {
        matches.push({
          detectedSpeakerId: segment.speakerId,
          rosterSpeaker,
          confidence: 0.95,
          matchMethod: 'self_intro',
          evidence: [segment.text.substring(0, 150)]
        });
        matchedDetectedIds.add(segment.speakerId);
        matchedRosterIds.add(rosterSpeaker.id);
        console.log(`[ROSTER MATCH] ✓ Self-intro: "${segment.speakerId}" → "${rosterSpeaker.name}"`);
        break;
      }
    }
  }

  // PASS 2: Speaking time + role heuristic (85% confidence)
  console.log('[ROSTER MATCH] Pass 2: Speaking time + role heuristic');
  const sortedByDuration = Object.entries(detectedSpeakers)
    .filter(([id]) => !matchedDetectedIds.has(id))
    .sort(([, a], [, b]) => b.totalDuration - a.totalDuration);

  const hostRoster = roster.find(r => r.role === 'host' && !matchedRosterIds.has(r.id));
  if (hostRoster && sortedByDuration.length > 0) {
    const [longestSpeakerId, longestSpeaker] = sortedByDuration[0];
    matches.push({
      detectedSpeakerId: longestSpeakerId,
      rosterSpeaker: hostRoster,
      confidence: 0.85,
      matchMethod: 'speaking_time',
      evidence: [`Longest speaking time: ${longestSpeaker.totalDuration.toFixed(1)}s (typical host behavior)`]
    });
    matchedDetectedIds.add(longestSpeakerId);
    matchedRosterIds.add(hostRoster.id);
    console.log(`[ROSTER MATCH] ✓ Host by duration: "${longestSpeakerId}" → "${hostRoster.name}"`);
  }

  // PASS 3: Introduction by others (80% confidence)
  console.log('[ROSTER MATCH] Pass 3: Introduction by others');
  const introductions = detectIntroductionsByOthers(speakerSegments, roster);
  for (const intro of introductions) {
    if (matchedDetectedIds.has(intro.introducedId) || matchedRosterIds.has(intro.rosterSpeaker.id)) {
      continue;
    }
    matches.push({
      detectedSpeakerId: intro.introducedId,
      rosterSpeaker: intro.rosterSpeaker,
      confidence: 0.80,
      matchMethod: 'introduced_by_other',
      evidence: [intro.evidence]
    });
    matchedDetectedIds.add(intro.introducedId);
    matchedRosterIds.add(intro.rosterSpeaker.id);
    console.log(`[ROSTER MATCH] ✓ Introduced: "${intro.introducedId}" → "${intro.rosterSpeaker.name}"`);
  }

  // PASS 4: Keyword frequency (70% confidence)
  console.log('[ROSTER MATCH] Pass 4: Keyword frequency analysis');
  const unmatchedDetected = Object.entries(detectedSpeakers)
    .filter(([id]) => !matchedDetectedIds.has(id));
  const unmatchedRoster = roster.filter(r => !matchedRosterIds.has(r.id));

  for (const [detectedId, detectedSpeaker] of unmatchedDetected) {
    let bestMatch: { roster: PresetSpeaker; score: number; keywords: string[] } | null = null;

    for (const rosterSpeaker of unmatchedRoster) {
      const keywords = generateKeywordsFromName(rosterSpeaker.name);
      const speakerText = detectedSpeaker.segments.map(s => s.text).join(' ').toLowerCase();

      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
        const matches = speakerText.match(regex);
        if (matches) {
          matchCount += matches.length;
          matchedKeywords.push(keyword);
        }
      }

      if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.score)) {
        bestMatch = { roster: rosterSpeaker, score: matchCount, keywords: matchedKeywords };
      }
    }

    if (bestMatch && bestMatch.score >= 1) {
      matches.push({
        detectedSpeakerId: detectedId,
        rosterSpeaker: bestMatch.roster,
        confidence: 0.70,
        matchMethod: 'keyword_freq',
        evidence: [`Name mentioned ${bestMatch.score} times: ${bestMatch.keywords.join(', ')}`]
      });
      matchedDetectedIds.add(detectedId);
      matchedRosterIds.add(bestMatch.roster.id);
      console.log(`[ROSTER MATCH] ✓ Keyword freq: "${detectedId}" → "${bestMatch.roster.name}" (${bestMatch.score} mentions)`);
    }
  }

  // PASS 5: Speaker order fallback (60% confidence)
  console.log('[ROSTER MATCH] Pass 5: Speaker order fallback');
  const finalUnmatchedDetected = Object.keys(detectedSpeakers)
    .filter(id => !matchedDetectedIds.has(id))
    .sort();
  const finalUnmatchedRoster = roster
    .filter(r => !matchedRosterIds.has(r.id))
    .sort((a, b) => a.priority - b.priority);

  for (let i = 0; i < Math.min(finalUnmatchedDetected.length, finalUnmatchedRoster.length); i++) {
    matches.push({
      detectedSpeakerId: finalUnmatchedDetected[i],
      rosterSpeaker: finalUnmatchedRoster[i],
      confidence: 0.60,
      matchMethod: 'speaker_order',
      evidence: [`Matched by priority order (priority: ${finalUnmatchedRoster[i].priority})`]
    });
    matchedDetectedIds.add(finalUnmatchedDetected[i]);
    matchedRosterIds.add(finalUnmatchedRoster[i].id);
    console.log(`[ROSTER MATCH] ✓ Order fallback: "${finalUnmatchedDetected[i]}" → "${finalUnmatchedRoster[i].name}"`);
  }

  // FORCE-ASSIGN PASS: guarantee every roster speaker appears in the output
  // Any roster name still unmatched after Pass 5 is assigned to the highest-speaking-time
  // unmatched detected speaker. This ensures the user's explicitly provided names always appear.
  const forceUnmatchedRoster = roster.filter(r => !matchedRosterIds.has(r.id));
  if (forceUnmatchedRoster.length > 0) {
    console.log(`[ROSTER MATCH] Force-assign: ${forceUnmatchedRoster.length} roster speaker(s) still unmatched`);
    const forceUnmatchedDetected = Object.entries(detectedSpeakers)
      .filter(([id]) => !matchedDetectedIds.has(id))
      .sort(([, a], [, b]) => b.totalDuration - a.totalDuration);

    for (let i = 0; i < Math.min(forceUnmatchedDetected.length, forceUnmatchedRoster.length); i++) {
      const [detectedId] = forceUnmatchedDetected[i];
      const rosterSpeaker = forceUnmatchedRoster[i];
      matches.push({
        detectedSpeakerId: detectedId,
        rosterSpeaker,
        confidence: 0.50,
        matchMethod: 'force_assigned',
        evidence: [`Force-assigned: no transcript evidence found, matched by speaking duration`]
      });
      matchedDetectedIds.add(detectedId);
      matchedRosterIds.add(rosterSpeaker.id);
      console.log(`[ROSTER MATCH] Force-assigning unmatched roster speaker: ${rosterSpeaker.name} → ${detectedId}`);
    }
  }

  console.log(`[ROSTER MATCH] Complete: ${matches.length} matches from ${Object.keys(detectedSpeakers).length} detected speakers`);
  return matches;
}

// Helper: Detect self-introduction patterns
function detectSelfIntroduction(
  segment: SpeakerSegment,
  rosterSpeaker: PresetSpeaker
): boolean {
  const text = segment.text.toLowerCase();
  const name = rosterSpeaker.name.toLowerCase();
  const nameParts = name.split(/\s+/).filter(p => p.length > 1);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  // Anti-patterns (reject these)
  const antiPatterns = [
    /\b(?:i'm|i am)\s+not\b/i,
    /\b(?:i'm|i am)\s+very\b/i,
    /\b(?:i'm|i am)\s+so\b/i,
    /\b(?:i'm|i am)\s+really\b/i,
    /\bmy name\s+isn't\b/i
  ];

  if (antiPatterns.some(pattern => pattern.test(text))) {
    return false;
  }

  const patterns = [
    new RegExp(`\\b(?:i'm|i am)\\s+${escapeRegex(firstName)}\\b`, 'i'),
    new RegExp(`\\b(?:i'm|i am)\\s+${escapeRegex(name)}\\b`, 'i'),
    new RegExp(`\\bmy name (?:is|'s)\\s+${escapeRegex(name)}\\b`, 'i'),
    new RegExp(`\\bmy name (?:is|'s)\\s+${escapeRegex(firstName)}\\b`, 'i'),
    new RegExp(`\\bthis is\\s+${escapeRegex(firstName)}\\s+(?:here|speaking|from)\\b`, 'i'),
    new RegExp(`\\byou'?re listening to\\s+${escapeRegex(firstName)}\\b`, 'i'),
    new RegExp(`\\b(?:hey|hi|hello),?\\s+(?:i'm|i am)\\s+${escapeRegex(firstName)}\\b`, 'i')
  ];

  // If last name exists, add patterns for it
  if (lastName) {
    patterns.push(
      new RegExp(`\\b(?:i'm|i am)\\s+${escapeRegex(firstName)}\\s+${escapeRegex(lastName)}\\b`, 'i'),
      new RegExp(`\\bmy name (?:is|'s)\\s+${escapeRegex(firstName)}\\s+${escapeRegex(lastName)}\\b`, 'i')
    );
  }

  return patterns.some(pattern => pattern.test(text));
}

// Helper: Detect introductions by others
function detectIntroductionsByOthers(
  segments: SpeakerSegment[],
  roster: PresetSpeaker[]
): Array<{ introducedId: string; rosterSpeaker: PresetSpeaker; evidence: string }> {
  const results: Array<{ introducedId: string; rosterSpeaker: PresetSpeaker; evidence: string }> = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    // Only consider if different speakers
    if (segment.speakerId === nextSegment.speakerId) continue;

    for (const rosterSpeaker of roster) {
      const nameParts = rosterSpeaker.name.toLowerCase().split(/\s+/).filter(p => p.length > 1);
      const firstName = nameParts[0];
      const fullName = rosterSpeaker.name.toLowerCase();

      const patterns = [
        new RegExp(`\\b(?:joined?|joining)\\s+(?:by|us with|us is)\\s+${escapeRegex(firstName)}\\b`, 'i'),
        new RegExp(`\\b(?:joined?|joining)\\s+(?:by|us with|us is)\\s+${escapeRegex(fullName)}\\b`, 'i'),
        new RegExp(`\\bwith (?:me|us)\\s+(?:is|today|tonight)\\s+${escapeRegex(firstName)}\\b`, 'i'),
        new RegExp(`\\bwith (?:me|us)\\s+(?:is|today|tonight)\\s+${escapeRegex(fullName)}\\b`, 'i'),
        new RegExp(`\\bwelcome\\s+${escapeRegex(firstName)}\\b`, 'i'),
        new RegExp(`\\bwelcome\\s+${escapeRegex(fullName)}\\b`, 'i'),
        new RegExp(`\\bhere'?s\\s+${escapeRegex(firstName)}\\b`, 'i'),
        new RegExp(`\\bplease welcome\\s+${escapeRegex(firstName)}\\b`, 'i')
      ];

      if (patterns.some(p => p.test(segment.text))) {
        results.push({
          introducedId: nextSegment.speakerId,
          rosterSpeaker,
          evidence: segment.text.substring(0, 150)
        });
        break; // Only match once per segment
      }
    }
  }

  return results;
}

// Helper: Generate keywords from name for matching
export function generateKeywordsFromName(name: string): string[] {
  const parts = name.toLowerCase().split(/\s+/).filter(p => p.length > 1);
  const keywords = [...parts, name.toLowerCase()];

  // Add "first last-initial" pattern (e.g., "john s")
  if (parts.length >= 2) {
    keywords.push(`${parts[0]} ${parts[parts.length - 1][0]}`);
  }

  // Add first name variations
  if (parts.length > 0) {
    keywords.push(parts[0]); // First name alone
  }

  return [...new Set(keywords)];
}

// Helper: Escape regex special characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
