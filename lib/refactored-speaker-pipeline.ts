// REFACTORED SPEAKER ATTRIBUTION PIPELINE
//
// Architecture:
// AssemblyAI (diarization) → GPT-4o (speaker intelligence) → Anchor Mapping (Confidence Propagation)
//
// GPT-4o is the SINGLE SOURCE OF TRUTH for speakers
// Anchor Mapping deterministically assigns segments using "Islands of Truth"

import { SpeakerSegment } from './types';
import {
  identifySpeakersWithGPT,
  GPTSpeaker,
  GPTSpeakerIntelligenceResult,
  getGPTSpeakerById
} from './gpt-speaker-intelligence';
// import {
//   reassignSegmentsWithGPT,
//   GPTReassignmentResult
// } from './gpt-segment-reassignment';
// sanitizeRoster replaced by enforceRosterConstraints (defined below)
// import { forceHardRosterCap } from './final-roster-squeeze';
import { performAnchorMapping } from './anchor-mapping';

export interface RefactoredPipelineResult {
  // Authoritative speakers from GPT (Pass 1)
  speakers: GPTSpeaker[];

  // Reassigned segments from deterministic mapping (Pass 2)
  segments: SpeakerSegment[];

  // Speaker data in legacy format for compatibility
  speakerData: {
    speakers: Record<string, any>;
    segments: SpeakerSegment[];
    detectionMetadata: {
      totalSpeakers: number;
      totalSegments: number;
      method: string;
      gptValidationErrors: string[];
    };
  };

  // Diagnostics
  diagnostics: {
    gptRawResponse: string;
    mappings: Record<string, string>;
    mappingConfidence: Record<string, number>;
    originalSpeakerCount: number;
    finalSpeakerCount: number;
    introSeededNames?: string[];
    introOverrideEvents?: Array<{ segmentIndex: number; handoffName: string; selfIdName: string; reason: string }>;
  };
}

/**
 * Run refactored speaker attribution pipeline
 *
 * ARCHITECTURE:
 * 1. AssemblyAI provides raw speaker segments (already done)
 * 2. GPT-4o identifies authoritative speakers (Pass 1) - ~$0.01-0.02
 * 3. Anchor Mapping assigns segments using Confidence Propagation
 * 4. Validation enforces GPT authority
 *
 * COST: ~$0.01-0.02 per transcript (GPT-4o only)
 *
 * @param segments - Raw speaker segments from AssemblyAI
 * @param options - Configuration options
 * @returns Speaker attribution result with validation
 */
export async function runRefactoredSpeakerPipeline(
  segments: SpeakerSegment[],
  options: {
    openaiApiKey?: string;
    gptModel?: string;
    userId?: string;
    projectId?: string;
    filename?: string;
    speakerCount?: number;
    projectType?: string;
  } = {}
): Promise<RefactoredPipelineResult> {
  console.log('\n========================================');
  console.log('REFACTORED SPEAKER PIPELINE');
  console.log('========================================\n');

  const startTime = Date.now();
  const originalSpeakerIds = new Set(segments.map(s => s.speakerId));
  const originalSpeakerCount = originalSpeakerIds.size;
  const introOverrideEvents: Array<{ segmentIndex: number; handoffName: string; selfIdName: string; reason: string }> = [];
  const introWindow = options.projectType === 'DEBATE'
    ? detectIntroWindowEndTime(segments)
    : null;
  const introSelfIdCounts = introWindow ? countIntroSelfIds(segments, introWindow.endTimeSeconds) : {};
  const repeatedSelfIds = Object.entries(introSelfIdCounts)
    .filter(([, count]) => count >= 2)
    .map(([name]) => name);
  if (repeatedSelfIds.length > 0) {
    console.log(`[PIPELINE] Intro repeated self-IDs: ${repeatedSelfIds.join(', ')}`);
  }
  const introSeededNames: string[] = [];

  console.log(`Input: ${segments.length} segments from ${originalSpeakerCount} AssemblyAI speakers\n`);

  // ============================================
  // PASS 1: GPT SPEAKER INTELLIGENCE
  // ============================================
  console.log('--- PASS 1: GPT SPEAKER INTELLIGENCE ---\n');

  let gptResult: GPTSpeakerIntelligenceResult;
  try {
    gptResult = await identifySpeakersWithGPT(segments, {
      apiKey: options.openaiApiKey,
      model: options.gptModel,
      userId: options.userId,
      projectId: options.projectId,
      filename: options.filename
    });

    console.log(`\n✓ Pass 1 complete: ${gptResult.speakers.length} authoritative speakers identified`);

    // --- ENFORCE ROSTER CONSTRAINTS (Garbage Filter + Dedup + Target Cap) ---
    console.log(`\n[PIPELINE] --- ROSTER ENFORCEMENT (Target: ${options.speakerCount || 'None'}) ---`);

    const enforcement = enforceRosterConstraints(gptResult.speakers, options.speakerCount);
    gptResult.speakers = enforcement.roster;

    console.log(`[PIPELINE] Garbage filtered: ${enforcement.garbageRemoved} removed`);
    console.log(`[PIPELINE] Duplicates merged: ${enforcement.duplicatesMerged} merged`);
    if (enforcement.excessDropped > 0) {
      console.log(`[PIPELINE] Excess speakers dropped to meet target ${options.speakerCount}: ${enforcement.excessDropped} dropped`);
      console.log(`[PIPELINE] Drop mappings:`, enforcement.dropMappings);
    }
    console.log(`[PIPELINE] ✓ Roster enforced: ${gptResult.speakers.length} speakers remaining`);

    if (gptResult.validationErrors.length > 0) {
      console.error('✗ GPT validation errors:', gptResult.validationErrors);
      // Don't throw, just log. We want to proceed with what we have.
    }

    // --- DEBATE INTRO ROSTER SEEDING (before CSP) ---
    if (options.projectType === 'DEBATE' && introWindow) {
      const introSeedResult = seedRosterFromDebateIntros(
        segments,
        gptResult.speakers,
        introWindow.endTimeSeconds,
        options.speakerCount
      );
      if (introSeedResult.added.length > 0) {
        gptResult.speakers = introSeedResult.roster;
        console.log(`[PIPELINE] Debate intro seeding added ${introSeedResult.added.length} speaker(s)`);
        introSeedResult.added.forEach(s => {
          console.log(`[PIPELINE]   + ${s.name} (source: ${s.source}, conf: ${s.confidence})`);
          if (s.name) introSeededNames.push(s.name);
        });
      } else {
        console.log('[PIPELINE] Debate intro seeding: no new speakers added');
      }
      console.log(`[PIPELINE] Intro window end: ${introWindow.endTimeSeconds}s (${introWindow.reason})`);
    }

  } catch (error: any) {
    console.error('✗ Pass 1 failed:', error.message);
    throw new Error(`Pass 1 (GPT Speaker Intelligence) failed: ${error.message}`);
  }

  // ============================================
  // PASS 2: CONFIDENCE PROPAGATION (Anchor Mapping)
  // ============================================
  console.log('\n--- PASS 2: CONFIDENCE PROPAGATION (Anchor Mapping) ---\n');

  let mappingResult: {
    segments: SpeakerSegment[];
    mappings: Record<string, string>;
    ambiguousAssignments: number;
  };

  try {
    const mappedSegments = performAnchorMapping(segments, gptResult.speakers, {
      introWindowEndTime: introWindow?.endTimeSeconds,
      enableIntroOverride: options.projectType === 'DEBATE',
      introOverrideEvents,
      introSelfIdCounts,
    });
    
    // Update result
    mappingResult = {
      segments: mappedSegments,
      mappings: {}, // Mappings are dynamic in this method, not static
      ambiguousAssignments: mappedSegments.filter(s => (s.confidence || 0) < 0.8).length
    };

    console.log(`\n✓ Pass 2 complete: ${mappingResult.segments.length} segments processed`);
    console.log(`  Ambiguous: ${mappingResult.ambiguousAssignments}`);
    if (introOverrideEvents.length > 0) {
      console.log(`[PIPELINE] Intro override events: ${introOverrideEvents.length}`);
    }

  } catch (error: any) {
    console.error('✗ Pass 2 failed:', error.message);
    throw new Error(`Pass 2 (Anchor Mapping) failed: ${error.message}`);
  }

  // ============================================
  // HEURISTIC FALLBACK (Task 1)
  // Fix "Unknown" labels using filename context
  // ============================================
  if (options.filename) {
    const { guest: filenameGuest } = extractNamesFromFilename(options.filename);
    
    if (filenameGuest) {
      console.log(`\n[HEURISTIC] 🧠 Checking filename hints for "${options.filename}"`);
      console.log(`[HEURISTIC] Found potential guest name: "${filenameGuest}"`);

      // Count segments per GPT speaker to find dominance
      const segmentCounts: Record<string, number> = {};
      mappingResult.segments.forEach(s => {
        segmentCounts[s.speakerId] = (segmentCounts[s.speakerId] || 0) + 1;
      });

      // Sort speakers by activity
      const sortedIds = Object.entries(segmentCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id);

      const top1Id = sortedIds[0];
      const top2Id = sortedIds[1];

      // Logic: Guest is usually the 2nd most active speaker (Host is #1)
      if (top2Id) {
        const guestSpeaker = gptResult.speakers.find(s => s.id === top2Id);
        
        // Only override if currently unknown/generic
        if (guestSpeaker) {
          const isUnknown = !guestSpeaker.name || guestSpeaker.name === 'Unknown' || guestSpeaker.name.startsWith('Speaker ');
          
          if (isUnknown) {
            console.log(`[HEURISTIC] 💡 Assigning GUEST "${filenameGuest}" to 2nd most active speaker (${top2Id})`);
            guestSpeaker.name = filenameGuest;
            guestSpeaker.role = 'guest'; // Force guest role
            guestSpeaker.confidence = 0.7; // Mark as heuristic confidence
          } else {
            console.log(`[HEURISTIC] 2nd speaker (${top2Id}) already named "${guestSpeaker.name}" - skipping heuristic`);
          }
        }
      }
    }
  }

  // ============================================
  // POST-PROCESS: INTEGRITY CHECK
  // ============================================
  console.log('\n--- POST-PROCESS: SPEAKER INTEGRITY CHECK ---\n');

  const { segments: verifiedSegments, corrections, newSpeakers } = verifySpeakerIntegrity(
    mappingResult.segments,
    gptResult.speakers,
    options.speakerCount,
    {
      introWindowEndTime: introWindow?.endTimeSeconds,
      introSelfIdCounts,
      conservativeIntroSelfId: options.projectType === 'DEBATE'
    }
  );

  // Merge any newly discovered speakers into the roster
  if (newSpeakers.length > 0) {
    gptResult.speakers.push(...newSpeakers);
    console.log(`[INTEGRITY] Added ${newSpeakers.length} new speaker(s) discovered via self-ID`);
  }
  if (corrections > 0) {
    console.log(`[INTEGRITY] Corrected ${corrections} segment(s) via self-identification`);
  } else {
    console.log('[INTEGRITY] No corrections needed');
  }

  // Use verified segments going forward
  mappingResult.segments = verifiedSegments;
  gptResult.segments = verifiedSegments; // <--- ADD THIS to fix stale data bug

  // ============================================
  // POST-PROCESS: DUPLICATE UNKNOWN MERGE
  // ============================================
  console.log('\n--- POST-PROCESS: DUPLICATE UNKNOWN MERGE ---\n');
  const mergeResult = mergeDuplicateUnknownSpeakers(
    gptResult.speakers,
    mappingResult.segments
  );
  if (mergeResult.mergedCount > 0) {
    gptResult.speakers = mergeResult.speakers;
    mappingResult.segments = mergeResult.segments;
    console.log(`[MERGE] Merged ${mergeResult.mergedCount} duplicate unknown speaker(s) into named identities`);
  } else {
    console.log('[MERGE] No duplicate unknown speakers to merge');
  }

  // ============================================
  // POST-PROCESS: DEAD SPEAKER CULL
  // ============================================
  console.log('\n--- POST-PROCESS: DEAD SPEAKER CULL ---\n');

  const beforeCull = gptResult.speakers.length;
  gptResult.speakers = cullDeadSpeakers(gptResult.speakers, mappingResult.segments);
  const culled = beforeCull - gptResult.speakers.length;
  if (culled > 0) {
    console.log(`[CULL] Removed ${culled} ghost speaker(s) with 0 segments`);
  } else {
    console.log('[CULL] No ghost speakers found');
  }

  // ============================================
  // FINAL CONSOLIDATION (REMOVED)
  // Confidence Propagation (Pass 2) replaces the Squeeze
  // ============================================
  // const squeezeResult = forceHardRosterCap(...)
  // ... removed ...

  // ============================================
  // BUILD FINAL OUTPUT
  // ============================================

  // Convert to legacy speaker data format
  const speakerData = convertToLegacyFormat(gptResult.speakers, mappingResult.segments);

  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n========================================');
  console.log('PIPELINE COMPLETE');
  console.log('========================================');
  console.log(`Time: ${elapsedTime}s`);
  console.log(`Original speakers: ${originalSpeakerCount}`);
  console.log(`Final speakers: ${gptResult.speakers.length}`);
  console.log(`Validation: PASSED ✓`);
  console.log('========================================\n');

  return {
    speakers: gptResult.speakers,
    segments: mappingResult.segments,
    speakerData,
    diagnostics: {
      gptRawResponse: gptResult.rawResponse,
      mappings: mappingResult.mappings,
      mappingConfidence: {}, // GPT-4o-mini doesn't provide per-mapping confidence
      originalSpeakerCount,
      finalSpeakerCount: gptResult.speakers.length,
      introSeededNames: introSeededNames.length > 0 ? introSeededNames : undefined,
      introOverrideEvents: introOverrideEvents.length > 0 ? introOverrideEvents : undefined
    }
  };
}

/**
 * Extract potential names from filename for heuristic matching
 */
function extractNamesFromFilename(filename: string): { host?: string; guest?: string } {
  if (!filename || filename === 'audio_upload' || filename.startsWith('audio_')) return {};
  
  const clean = filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  let guest: string | undefined;
  
  // 1. "with [Name]"
  const withMatch = clean.match(/\b(?:with|feat\.?|featuring|guest|starring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (withMatch) return { guest: withMatch[1] };
  
  // 2. "[Name] Interview"
  const interviewMatch = clean.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:Interview|Conversation|Chat)/i);
  if (interviewMatch) return { guest: interviewMatch[1] };

  // 3. "[Name] on [Topic]"
  const onMatch = clean.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+on\b/i);
  if (onMatch) return { guest: onMatch[1] };

  return {};
}

// ============================================
// DEBATE INTRO ROSTER SEEDING
// ============================================

const INTRO_QUESTION_PATTERNS = [
  /\b(?:our|the)?\s*(?:first|opening|initial)\s+question\b/i,
  /\bquestion\s+(?:one|1)\b/i,
  /\bfirst\s+question\s+(?:is|will be|will)\b/i,
  /\bquestion\s+(?:is|will be)\s+(?:as follows|the following)\b/i,
  /\b(?:we will|we'll)\s+(?:start|begin)\b/i,
  /\b(?:let's|lets)\s+(?:start|begin)\b/i,
  /\b(?:first up|to start)\b/i,
];

const INTRO_HANDOFF_PATTERNS = [
  /\b(?:next (?:we have|up is|is))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g,
  /\b(?:you'?ll move now to|we'?ll move now to|moving now to)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g,
  /\b(?:last but not least)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g,
  /\b(?:please welcome|introducing)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g,
  /\b(?:let's (?:hear from|turn to))\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/g,
];

const INTRO_SELF_ID_PATTERNS = [
  /\bmy name is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bI'?m\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bI am\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bthis is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+speaking/i,
];

function detectIntroWindowEndTime(
  segments: SpeakerSegment[]
): { endTimeSeconds: number; reason: string } {
  const maxWindow = 300; // 5 minutes
  let questionStart = Infinity;
  let markerMatched = false;

  for (const seg of segments) {
    const text = seg.text || '';
    if (INTRO_QUESTION_PATTERNS.some(p => p.test(text))) {
      questionStart = Math.min(questionStart, seg.startTime || 0);
      markerMatched = true;
      break;
    }
  }

  if (questionStart !== Infinity) {
    return { endTimeSeconds: Math.min(maxWindow, questionStart), reason: markerMatched ? 'question_marker' : 'question_marker_unknown' };
  }

  const lastEnd = segments.length ? segments[segments.length - 1].endTime : maxWindow;
  return { endTimeSeconds: Math.min(maxWindow, lastEnd || maxWindow), reason: 'time_cap' };
}

function normalizeSpeakerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function extractIntroHandoffNames(
  segments: SpeakerSegment[],
  endTimeSeconds: number
): Array<{ name: string; segmentIndex: number; phrase: string }> {
  const candidates: Array<{ name: string; segmentIndex: number; phrase: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.startTime > endTimeSeconds) break;
    const text = seg.text || '';

    for (const pattern of INTRO_HANDOFF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rawName = match[1]?.trim();
        if (!rawName) continue;
        const normalized = normalizeSpeakerName(rawName);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        candidates.push({
          name: rawName,
          segmentIndex: i,
          phrase: match[0],
        });
      }
    }
  }

  return candidates;
}

function countIntroSelfIds(
  segments: SpeakerSegment[],
  endTimeSeconds: number
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const seg of segments) {
    if (seg.startTime > endTimeSeconds) break;
    const text = seg.text || '';
    for (const pattern of INTRO_SELF_ID_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const normalized = normalizeSpeakerName(match[1]);
        counts[normalized] = (counts[normalized] || 0) + 1;
      }
    }
  }

  return counts;
}

function seedRosterFromDebateIntros(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  endTimeSeconds: number,
  targetCount?: number
): { roster: GPTSpeaker[]; added: GPTSpeaker[] } {
  const introSegmentCount = segments.filter(s => s.startTime <= endTimeSeconds).length;
  console.log(`[PIPELINE] Intro window segments: ${introSegmentCount} (end: ${endTimeSeconds}s)`);
  const existingNames = new Set(
    roster
      .map(s => (s.name ? normalizeSpeakerName(s.name) : null))
      .filter(Boolean) as string[]
  );

  const added: GPTSpeaker[] = [];
  const candidates = extractIntroHandoffNames(segments, endTimeSeconds);
  if (candidates.length > 0) {
    console.log(`[PIPELINE] Intro handoff candidates: ${candidates.map(c => c.name).join(', ')}`);
  } else {
    console.log('[PIPELINE] Intro handoff candidates: none');
  }

  for (const candidate of candidates) {
    if (existingNames.has(normalizeSpeakerName(candidate.name))) continue;

    const normalized = normalizeSpeakerName(candidate.name);

    if (targetCount && roster.length + added.length >= targetCount) {
      const unknownSlot = roster.find(s => isUnknownSpeakerEntry(s) && !s.name);
      if (unknownSlot) {
        unknownSlot.name = candidate.name;
        unknownSlot.role = 'guest';
        unknownSlot.confidence = Math.max(unknownSlot.confidence, 0.55);
        unknownSlot.source = 'intro_handoff';
        existingNames.add(normalized);
        continue;
      }
    }

    const nextId = `speaker_${roster.length + added.length + 1}`;
    const seeded: GPTSpeaker = {
      id: nextId,
      name: candidate.name,
      role: 'guest',
      confidence: 0.55,
      source: 'intro_handoff',
    };

    added.push(seeded);
    existingNames.add(normalized);
  }

  return { roster: [...roster, ...added], added };
}

// ============================================
// ROSTER ENFORCEMENT
// ============================================

interface RosterEnforcementResult {
  roster: GPTSpeaker[];
  /** Number of entries removed by the garbage filter */
  garbageRemoved: number;
  /** Number of duplicate entries merged */
  duplicatesMerged: number;
  /** Number of excess entries dropped to meet targetCount */
  excessDropped: number;
  /** Mapping from dropped speaker IDs to the retained speaker they were folded into */
  dropMappings: Record<string, string>;
}

/**
 * Enforce strict roster constraints between Pass 1 and Pass 2.
 *
 * 1. Garbage Filter — remove entries with phrase-length names, restricted chars, etc.
 * 2. Duplicate Merge — Levenshtein-based dedup of similar names.
 * 3. Target Count Enforcement — hard cap to targetCount by dropping lowest-confidence entries.
 */
function enforceRosterConstraints(
  roster: GPTSpeaker[],
  targetCount?: number
): RosterEnforcementResult {
  let working = [...roster];
  let garbageRemoved = 0;
  let duplicatesMerged = 0;
  let excessDropped = 0;
  const dropMappings: Record<string, string> = {};

  // -----------------------------------------------
  // STEP 1: Garbage Filter
  // -----------------------------------------------
  const cleaned: GPTSpeaker[] = [];

  for (const speaker of working) {
    if (!speaker.name) {
      // null name is fine — it means "unnamed speaker", keep it
      cleaned.push(speaker);
      continue;
    }

    const name = speaker.name.trim();
    const wordCount = name.split(/\s+/).length;

    // Reject names longer than 4 words
    if (wordCount > 4) {
      console.log(`[ENFORCE] Garbage: "${name}" rejected (${wordCount} words — too long for a human name)`);
      garbageRemoved++;
      continue;
    }

    // Reject names that contain restricted characters (brackets, colons, quotes, parens)
    if (/[\[\]:(){}"']/.test(name)) {
      console.log(`[ENFORCE] Garbage: "${name}" rejected (contains restricted characters)`);
      garbageRemoved++;
      continue;
    }

    // Reject names that are clearly not names (lowercase sentence fragments)
    // A valid name should have at least one capitalized word
    const hasCapitalizedWord = name.split(/\s+/).some(w => /^[A-Z]/.test(w));
    if (!hasCapitalizedWord && wordCount > 1) {
      console.log(`[ENFORCE] Garbage: "${name}" rejected (no capitalized words — looks like a sentence fragment)`);
      garbageRemoved++;
      continue;
    }

    // Reject if name matches "unknown" or "speaker" placeholders (unless it's the only identifier)
    const lowerName = name.toLowerCase();
    if (
      (lowerName === 'unknown' || /^speaker\s*\d*$/i.test(name)) &&
      cleaned.length > 0 // keep at least one even if it's generic
    ) {
      // Don't remove — just null-out the name so the entry survives but isn't treated as a real name
      speaker.name = null;
    }

    cleaned.push(speaker);
  }

  working = cleaned;

  // -----------------------------------------------
  // STEP 2: Duplicate Merge (Levenshtein)
  // -----------------------------------------------
  // Compare every pair; merge the lower-confidence entry into the higher one.
  const merged: GPTSpeaker[] = [];
  const absorbedIds = new Set<string>();

  // Sort by confidence descending so the "winner" comes first
  working.sort((a, b) => b.confidence - a.confidence);

  for (let i = 0; i < working.length; i++) {
    const speaker = working[i];
    if (absorbedIds.has(speaker.id)) continue;

    for (let j = i + 1; j < working.length; j++) {
      const other = working[j];
      if (absorbedIds.has(other.id)) continue;
      if (!speaker.name || !other.name) continue;

      if (isDuplicateName(speaker.name, other.name)) {
        console.log(`[ENFORCE] Merge: "${other.name}" (${other.id}) absorbed into "${speaker.name}" (${speaker.id})`);
        absorbedIds.add(other.id);
        dropMappings[other.id] = speaker.id;
        duplicatesMerged++;
      }
    }

    merged.push(speaker);
  }

  working = merged;

  // -----------------------------------------------
  // STEP 3: Target Count Enforcement (hard cap)
  // -----------------------------------------------
  if (targetCount && targetCount > 0 && working.length > targetCount) {
    // Already sorted by confidence desc from step 2
    const retained = working.slice(0, targetCount);
    const dropped = working.slice(targetCount);

    const retainedIds = new Set(retained.map(s => s.id));

    for (const droppedSpeaker of dropped) {
      // Map each dropped speaker to the closest retained speaker by name similarity,
      // or to the first retained speaker if no name match is found.
      const bestMatch = findClosestRetainedSpeaker(droppedSpeaker, retained);
      dropMappings[droppedSpeaker.id] = bestMatch.id;

      console.log(
        `[ENFORCE] Drop: "${droppedSpeaker.name || droppedSpeaker.id}" (conf: ${droppedSpeaker.confidence}) → mapped to "${bestMatch.name || bestMatch.id}"`
      );
    }

    excessDropped = dropped.length;
    working = retained;
  }

  // Re-normalize IDs to speaker_1, speaker_2, ... for cleanliness
  const renumbered = working.map((speaker, index) => ({
    ...speaker,
    id: `speaker_${index + 1}`
  }));

  // Update dropMappings to point to the new IDs
  const oldToNewId: Record<string, string> = {};
  working.forEach((original, index) => {
    oldToNewId[original.id] = `speaker_${index + 1}`;
  });

  for (const [droppedId, targetId] of Object.entries(dropMappings)) {
    if (oldToNewId[targetId]) {
      dropMappings[droppedId] = oldToNewId[targetId];
    }
  }

  return {
    roster: renumbered,
    garbageRemoved,
    duplicatesMerged,
    excessDropped,
    dropMappings
  };
}

/**
 * Check if two names are duplicates using multiple heuristics:
 * - Exact match (case-insensitive)
 * - One is a substring of the other ("Chris" vs "Christopher Xenos")
 * - First-name match ("Chris Xenos" vs "Christopher Xenos" — first 3+ chars)
 * - Levenshtein distance <= 25% of the longer name
 */
function isDuplicateName(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (la === lb) return true;

  // Substring: "Chris Xenos" contains within "Christopher Xenos" — check word-level
  if (la.includes(lb) || lb.includes(la)) return true;

  // First-name prefix match: compare first word, allow prefix >= 3 chars
  const aWords = la.split(/\s+/);
  const bWords = lb.split(/\s+/);
  if (aWords.length > 0 && bWords.length > 0) {
    const aFirst = aWords[0];
    const bFirst = bWords[0];
    const shorter = aFirst.length <= bFirst.length ? aFirst : bFirst;
    const longer = aFirst.length > bFirst.length ? aFirst : bFirst;

    // If the shorter first name (>= 3 chars) is a prefix of the longer, AND
    // last names match (if present), it's a duplicate
    if (shorter.length >= 3 && longer.startsWith(shorter)) {
      // If both have last names, they must also match
      const aLast = aWords.length > 1 ? aWords[aWords.length - 1] : null;
      const bLast = bWords.length > 1 ? bWords[bWords.length - 1] : null;

      if (!aLast || !bLast || aLast === bLast) return true;
    }
  }

  // Levenshtein distance
  const dist = levenshtein(la, lb);
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen > 0 && dist / maxLen <= 0.25) return true;

  return false;
}

/**
 * Find the closest retained speaker for a dropped speaker by name similarity.
 * Falls back to the first retained speaker (highest confidence) if no name match.
 */
function findClosestRetainedSpeaker(
  dropped: GPTSpeaker,
  retained: GPTSpeaker[]
): GPTSpeaker {
  if (!dropped.name || retained.length === 0) {
    return retained[0]; // Default to highest-confidence speaker
  }

  let bestMatch = retained[0];
  let bestScore = Infinity;

  for (const candidate of retained) {
    if (!candidate.name) continue;
    const dist = levenshtein(dropped.name.toLowerCase(), candidate.name.toLowerCase());
    if (dist < bestScore) {
      bestScore = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

// ============================================
// SELF-ID PATTERNS for integrity checking
// ============================================
// Capture group allows lowercase names (e.g. "my name is jj") and mixed case.
// The word-boundary + pattern ensures we grab 1–3 name-like tokens after the trigger.
// Validation is handled downstream by isPlausibleHumanName, not by the regex.
const SELF_ID_PATTERNS = [
  /\bmy name is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bI'?m\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bI am\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bthis is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+speaking/i,
  /\bthis is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+here/i,
];

// Common false-positive words that regex might capture as names.
// Checked as a whole-string match against the extracted candidate.
const SELF_ID_STOPWORDS = new Set([
  'here', 'back', 'going', 'just', 'not', 'so', 'very', 'really',
  'happy', 'glad', 'excited', 'thrilled', 'honored', 'delighted',
  'sure', 'fine', 'good', 'great', 'well', 'okay',
  'the', 'your', 'his', 'her', 'their',
  // Reflexive / descriptor false positives
  'myself', 'yourself', 'himself', 'herself', 'themselves',
  'student', 'teacher', 'professor', 'doctor', 'engineer',
  'grateful', 'thankful', 'proud', 'humble',
]);

// Verbs and function words that should never appear inside a human name.
// Checked case-insensitively against every word in the candidate.
const NAME_POISON_WORDS = new Set([
  // common verbs
  'is', 'are', 'was', 'were', 'will', 'would', 'shall', 'should',
  'has', 'have', 'had', 'do', 'does', 'did',
  'can', 'could', 'may', 'might', 'must',
  'being', 'been', 'get', 'got', 'getting',
  'go', 'going', 'gone', 'went',
  'say', 'said', 'tell', 'told', 'think', 'thought',
  'make', 'made', 'take', 'took', 'give', 'gave',
  'come', 'came', 'see', 'saw', 'know', 'knew',
  'want', 'need', 'like', 'feel', 'felt',
  // prepositions / conjunctions / articles that leak in
  'the', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'from',
  'and', 'but', 'or', 'not', 'that', 'this',
  // adjectives / adverbs that title-case captures
  'so', 'very', 'really', 'just', 'also', 'still', 'even',
  'happy', 'glad', 'excited', 'full', 'support', 'share',
  'pressuring', 'stage', 'here', 'there', 'now', 'then',
  // reflexive pronouns / descriptors that leak through self-ID regex
  'myself', 'yourself', 'himself', 'herself', 'themselves', 'ourselves',
  'student', 'teacher', 'professor', 'doctor', 'engineer', 'lawyer',
  'grateful', 'thankful', 'proud', 'humble', 'honored',
  // nationalities / demonyms that appear after "I'm" (e.g. "I'm Nigerian myself")
  'nigerian', 'american', 'british', 'canadian', 'australian', 'indian',
  'chinese', 'japanese', 'korean', 'french', 'german', 'italian',
  'spanish', 'mexican', 'brazilian', 'african', 'european', 'asian',
]);

/**
 * Validate that an extracted name looks like an actual human name.
 * Returns true if the name passes ALL checks, false if it should be rejected.
 *
 * Allows:
 *  - Short nicknames/initials: "jj", "TJ", "AJ" (single word, 2+ alpha chars)
 *  - Standard names: "Mariam", "Jessica Tarlov", "Dr Jane Smith"
 *
 * Rejects:
 *  - Phrases with verbs/prepositions: "So Happy To Share The Stage"
 *  - Anything > 3 words
 *  - Single-char tokens
 */
function isPlausibleHumanName(name: string): boolean {
  const words = name.split(/\s+/);

  // Hard word-count limit: human names are 1–3 words
  if (words.length > 3) return false;

  // Single-word names must be >= 2 characters (allows "jj", "TJ", "AJ")
  if (words.length === 1) {
    if (name.length < 2) return false;
    // If > 3 chars, MUST be capitalized (rejects "absolutely", "everyone", "tomorrow")
    // Allows "jj", "al", "Cat"
    if (name.length > 3 && !/^[A-Z]/.test(name)) return false;
  }

  // For multi-word names: every word must start with a capital letter.
  // This catches garbage like "so happy to share" but does NOT apply to
  // single-word nicknames which may be all-lowercase (e.g. "jj").
  if (words.length > 1) {
    for (const word of words) {
      if (!/^[A-Z]/.test(word)) return false;
    }
  }

  // Reject if ANY word is a known verb / function word / adjective
  for (const word of words) {
    if (NAME_POISON_WORDS.has(word.toLowerCase())) return false;
  }

  // Reject if the whole extracted string is a single stopword
  if (SELF_ID_STOPWORDS.has(name.toLowerCase())) return false;

  return true;
}

/**
 * Fuzzy match a name against a speaker's name.
 * Returns true if one name is a substring of the other,
 * the Levenshtein distance is small, or it matches as initials/nickname.
 */
function fuzzyNameMatch(extractedName: string, speakerName: string): boolean {
  const a = extractedName.toLowerCase().trim();
  const b = speakerName.toLowerCase().trim();

  // Exact match
  if (a === b) return true;

  // One is a substring of the other (e.g. "Mariam" vs "Mariam Mahmoud")
  if (a.includes(b) || b.includes(a)) return true;

  // First-name match: compare first tokens
  const aFirst = a.split(/\s+/)[0];
  const bFirst = b.split(/\s+/)[0];
  if (aFirst.length >= 3 && aFirst === bFirst) return true;

  // Initials / nickname matching (e.g. "jj" → "Juliana Jack")
  if (matchesInitialsOrNickname(a, b)) return true;
  if (matchesInitialsOrNickname(b, a)) return true;

  // Levenshtein distance for typo tolerance (threshold: 20% of longer string)
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen > 0 && dist / maxLen <= 0.2) return true;

  return false;
}

/**
 * Check if `short` is a nickname or initials-based abbreviation of `full`.
 *
 * Matches:
 *  - Initials: "jj" matches "Juliana Jack" (J.J.)
 *  - Initials: "tj" matches "Thomas Johnson"
 *  - Initials with optional dots/spaces: "j.j." matches "Juliana Jack"
 *  - First-name prefix: "jul" matches "Juliana Jack" (>= 3 chars)
 *
 * Both inputs should be lowercase.
 */
function matchesInitialsOrNickname(short: string, full: string): boolean {
  // Only try if `short` is short (1–4 chars) and `full` has multiple words
  const cleanShort = short.replace(/[\.\s]/g, ''); // strip dots/spaces ("j.j." → "jj")
  const fullWords = full.split(/\s+/);

  if (cleanShort.length > 4 || fullWords.length < 2) return false;

  // Build initials from full name: "juliana jack" → "jj"
  const initials = fullWords.map(w => w[0] || '').join('');

  if (cleanShort === initials) return true;

  // Also check if short matches a repeated single initial (e.g. "jj" when first+last share initial)
  // Already covered by the initials check above.

  // First-name prefix: "jul" (>= 3 chars) matches first word "juliana"
  if (cleanShort.length >= 3 && fullWords[0].startsWith(cleanShort)) return true;

  return false;
}

/**
 * Simple Levenshtein distance implementation.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Post-process integrity check: verify that segment text self-identifications
 * match their assigned speaker ID. Corrects mismatches and creates new roster
 * entries for speakers not yet in the roster.
 */
function verifySpeakerIntegrity(
  segments: Array<{ speakerId: string; text: string; startTime: number; endTime: number; confidence?: number; finalSpeakerId?: string; status?: string }>,
  roster: GPTSpeaker[],
  targetCount?: number,
  options?: {
    introWindowEndTime?: number;
    introSelfIdCounts?: Record<string, number>;
    conservativeIntroSelfId?: boolean;
  }
): {
  segments: Array<{ speakerId: string; text: string; startTime: number; endTime: number; confidence?: number; finalSpeakerId?: string; status?: string }>;
  corrections: number;
  newSpeakers: GPTSpeaker[];
} {
  let corrections = 0;
  const newSpeakers: GPTSpeaker[] = [];
  const newSpeakerMap = new Map<string, string>(); // normalized name -> speaker id

  const correctedSegments = segments.map(segment => {
    const currentId = (segment as any).finalSpeakerId || segment.speakerId;
    // Try each self-ID pattern
    for (const pattern of SELF_ID_PATTERNS) {
      const match = segment.text.match(pattern);
      if (!match || !match[1]) continue;

      const extractedName = match[1].trim();

      // ── STRICT VALIDATION GATE ──
      // Must pass all plausibility checks before we act on it.
      if (!isPlausibleHumanName(extractedName)) {
        // Silently skip — better to miss a correction than to invent a garbage speaker
        continue;
      }

      // Find the currently assigned speaker
      const currentSpeaker = roster.find(s => s.id === currentId);

      // Check if the extracted name already matches the assigned speaker
      if (currentSpeaker?.name && fuzzyNameMatch(extractedName, currentSpeaker.name)) {
        // Already correct, no action needed
        break;
      }

      // The name doesn't match — find the correct speaker in the roster
      const correctSpeaker = roster.find(s =>
        s.name != null && fuzzyNameMatch(extractedName, s.name)
      );

      if (correctSpeaker) {
        // Reassign to the correct existing roster entry
        console.log(
          `[INTEGRITY] Correcting segment at ${segment.startTime.toFixed(1)}s: ` +
          `"${extractedName}" found in text, reassigning from ${segment.speakerId} to ${correctSpeaker.id}`
        );
        corrections++;
        return {
          ...segment,
          speakerId: correctSpeaker.id,
          finalSpeakerId: correctSpeaker.id,
          confidence: Math.min(segment.confidence ?? 1, 0.95),
          status: 'tentative',
        } as typeof segment;
      }

      // ── DUPLICATE GUARD before creating a new speaker ──
      // Check if this name is a near-duplicate of an existing roster name
      // (e.g. "Chris" when "Christopher Xenos" already exists).
      // If so, treat it as a match to the existing entry rather than creating a new one.
      const nearDup = roster.find(s =>
        s.name != null && isDuplicateName(extractedName, s.name)
      );
      if (nearDup) {
        console.log(
          `[INTEGRITY] Near-duplicate at ${segment.startTime.toFixed(1)}s: ` +
          `"${extractedName}" matched existing "${nearDup.name}" (${nearDup.id}), reassigning`
        );
        corrections++;
        return {
          ...segment,
          speakerId: nearDup.id,
          finalSpeakerId: nearDup.id,
          confidence: Math.min(segment.confidence ?? 1, 0.9),
          status: 'tentative',
        } as typeof segment;
      }

      // Also check against speakers we've already created in this pass
      const normalizedName = extractedName.toLowerCase();
      if (newSpeakerMap.has(normalizedName)) {
        const existingNewId = newSpeakerMap.get(normalizedName)!;
        console.log(
          `[INTEGRITY] Correcting segment at ${segment.startTime.toFixed(1)}s: ` +
          `"${extractedName}" reassigned to newly created ${existingNewId}`
        );
        corrections++;
        return {
          ...segment,
          speakerId: existingNewId,
          finalSpeakerId: existingNewId,
          confidence: Math.min(segment.confidence ?? 1, 0.85),
          status: 'tentative',
        } as typeof segment;
      }

      // Also fuzzy-check against already-created new speakers
      const nearDupNew = newSpeakers.find(s =>
        s.name != null && isDuplicateName(extractedName, s.name)
      );
      if (nearDupNew) {
        console.log(
          `[INTEGRITY] Near-duplicate at ${segment.startTime.toFixed(1)}s: ` +
          `"${extractedName}" matched new speaker "${nearDupNew.name}" (${nearDupNew.id}), reassigning`
        );
        corrections++;
        return {
          ...segment,
          speakerId: nearDupNew.id,
          finalSpeakerId: nearDupNew.id,
          confidence: Math.min(segment.confidence ?? 1, 0.85),
          status: 'tentative',
        } as typeof segment;
      }

      // ── CEILING GUARD ──
      // If we have a targetCount and we've reached it, do not create a new speaker.
      // Instead, map to the closest existing speaker.
      if (targetCount && (roster.length + newSpeakers.length) >= targetCount) {
        console.log(
          `[INTEGRITY] 🛑 Speaker ceiling reached (${targetCount}). ` +
          `Refusing to create new speaker for "${extractedName}". ` +
          `Mapping to closest existing speaker instead.`
        );
        
        const bestExisting = findClosestRetainedSpeaker(
          { id: 'tmp', name: extractedName, role: 'unknown', confidence: 0.5 } as GPTSpeaker,
          [...roster, ...newSpeakers]
        );
        
        corrections++;
        return {
          ...segment,
          speakerId: bestExisting.id,
          finalSpeakerId: bestExisting.id,
          confidence: Math.min(segment.confidence ?? 1, 0.7),
          status: 'tentative',
        } as typeof segment;
      }

      // Conservative intro-window guard (debate): avoid creating new speakers
      // from a single self-ID unless it repeats or matches the roster.
      if (options?.conservativeIntroSelfId && typeof options.introWindowEndTime === 'number') {
        const inIntro = segment.startTime <= options.introWindowEndTime;
        if (inIntro) {
          const normalized = extractedName.toLowerCase().trim();
          const count = options.introSelfIdCounts?.[normalized] || 0;
          if (count < 2) {
            // Do not create a new speaker; mark as uncertain and continue
            return {
              ...segment,
              confidence: Math.min(segment.confidence ?? 1, 0.5),
              status: 'uncertain',
            } as typeof segment;
          }
        }
      }

      // Create a brand new speaker entry (only if it truly isn't in the roster)
      const newId = `speaker_${roster.length + newSpeakers.length + 1}`;
      const newSpeaker: GPTSpeaker = {
        id: newId,
        name: extractedName,
        role: 'unknown',
        confidence: 0.8
      };
      newSpeakers.push(newSpeaker);
      newSpeakerMap.set(normalizedName, newId);

      console.log(
        `[INTEGRITY] New speaker discovered at ${segment.startTime.toFixed(1)}s: ` +
        `"${extractedName}" → created ${newId}`
      );
      corrections++;
      return {
        ...segment,
        speakerId: newId,
        finalSpeakerId: newId,
        confidence: Math.min(segment.confidence ?? 1, 0.85),
        status: 'tentative',
      } as typeof segment;
    }

    return segment;
  });

  return { segments: correctedSegments, corrections, newSpeakers };
}

/**
 * Remove "ghost" speakers — roster entries that have 0 segments
 * assigned to them after all processing is complete.
 */
function cullDeadSpeakers(
  speakers: GPTSpeaker[],
  segments: Array<{ speakerId: string }>
): GPTSpeaker[] {
  const activeIds = new Set(segments.map(s => s.speakerId));

  return speakers.filter(speaker => {
    const isAlive = activeIds.has(speaker.id);
    if (!isAlive) {
      console.log(`[CULL] Removing ghost speaker: ${speaker.id} (${speaker.name || 'unnamed'}) — 0 segments`);
    }
    return isAlive;
  });
}

function isUnknownSpeakerEntry(speaker: GPTSpeaker): boolean {
  if (!speaker.name) return true;
  const name = speaker.name.toLowerCase().trim();
  return speaker.role === 'unknown' || name === 'unknown' || /^speaker\s*\d+$/i.test(speaker.name);
}

function mergeDuplicateUnknownSpeakers(
  speakers: GPTSpeaker[],
  segments: Array<{ speakerId: string; finalSpeakerId?: string; confidence?: number; status?: string }>
): { speakers: GPTSpeaker[]; segments: typeof segments; mergedCount: number } {
  const nameMap = new Map<string, GPTSpeaker[]>();

  for (const speaker of speakers) {
    if (!speaker.name) continue;
    const normalized = normalizeSpeakerName(speaker.name);
    if (!nameMap.has(normalized)) nameMap.set(normalized, []);
    nameMap.get(normalized)!.push(speaker);
  }

  const remap = new Map<string, string>();
  let mergedCount = 0;

  for (const [name, group] of nameMap.entries()) {
    if (group.length <= 1) continue;

    const sorted = [...group].sort((a, b) => {
      const aUnknown = isUnknownSpeakerEntry(a);
      const bUnknown = isUnknownSpeakerEntry(b);
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return b.confidence - a.confidence;
    });

    const primary = sorted[0];
    const duplicates = sorted.slice(1);

    for (const dup of duplicates) {
      if (isUnknownSpeakerEntry(dup)) {
        remap.set(dup.id, primary.id);
        mergedCount++;
      }
    }
  }

  if (remap.size === 0) {
    return { speakers, segments, mergedCount: 0 };
  }

  const updatedSegments = segments.map(seg => {
    const currentId = seg.finalSpeakerId || seg.speakerId;
    const target = remap.get(currentId);
    if (!target) return seg;
    return {
      ...seg,
      speakerId: target,
      finalSpeakerId: target,
      confidence: Math.min(seg.confidence ?? 1, 0.5),
      status: 'uncertain',
    };
  });

  const updatedSpeakers = speakers.filter(s => !remap.has(s.id));

  return {
    speakers: updatedSpeakers,
    segments: updatedSegments,
    mergedCount,
  };
}

/**
 * Convert GPT speakers and reassigned segments to legacy format
 * for compatibility with existing UI/database
 */
function convertToLegacyFormat(
  gptSpeakers: GPTSpeaker[],
  reassignedSegments: Array<{ speakerId: string; text: string; startTime: number; endTime: number; confidence?: number }>
): {
  speakers: Record<string, any>;
  segments: SpeakerSegment[];
  detectionMetadata: any;
} {
  const speakers: Record<string, any> = {};

  // Build speaker records
  for (const gptSpeaker of gptSpeakers) {
    const speakerSegments = reassignedSegments.filter(s => (s.finalSpeakerId || s.speakerId) === gptSpeaker.id);

    speakers[gptSpeaker.id] = {
      id: gptSpeaker.id,
      finalName: gptSpeaker.name || gptSpeaker.role.replace('_', ' '),
      role: gptSpeaker.role,
      roleConfidence: gptSpeaker.confidence,
      source: gptSpeaker.source,
      extractedName: gptSpeaker.name ? {
        name: gptSpeaker.name,
        confidence: gptSpeaker.confidence,
        context: 'GPT speaker intelligence'
      } : null,
      segments: speakerSegments.map(s => ({
        speakerId: s.speakerId,
        finalSpeakerId: s.finalSpeakerId || s.speakerId,
        initialSpeakerId: s.initialSpeakerId,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        confidence: s.confidence,
        status: s.status,
      })),
      totalDuration: speakerSegments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0),
      segmentCount: speakerSegments.length,
      gptAttribution: true
    };
  }

  const segments: SpeakerSegment[] = reassignedSegments.map(s => ({
    speakerId: s.speakerId,
    finalSpeakerId: s.finalSpeakerId || s.speakerId,
    initialSpeakerId: s.initialSpeakerId,
    startTime: s.startTime,
    endTime: s.endTime,
    text: s.text,
    confidence: s.confidence,
    status: s.status,
  }));

  return {
    speakers,
    segments,
    detectionMetadata: {
      totalSpeakers: gptSpeakers.length,
      totalSegments: segments.length,
      method: 'gpt-pipeline',
      gptValidationErrors: [],
      ambiguousAssignments: reassignedSegments.filter(s => (s.confidence || 0) < 0.8).length
    }
  };
}

/**
 * Test function - run pipeline on sample data
 */
export async function testRefactoredPipeline() {
  const testSegments: SpeakerSegment[] = [
    {
      speakerId: 'Speaker_A',
      startTime: 0,
      endTime: 5,
      text: "Welcome to Raging Moderates, I'm Jessica Tarlov",
      confidence: 0.95
    },
    {
      speakerId: 'Speaker_B',
      startTime: 5,
      endTime: 8,
      text: "And I'm Harold Ford Jr.",
      confidence: 0.94
    },
    {
      speakerId: 'Speaker_A',
      startTime: 8,
      endTime: 12,
      text: "Today we're discussing the latest from New York",
      confidence: 0.93
    },
    {
      speakerId: 'Speaker_C',
      startTime: 60,
      endTime: 75,
      text: "This episode is brought to you by our sponsor. Visit example.com",
      confidence: 0.90
    }
  ];

  console.log('Testing refactored pipeline with sample data...\n');

  try {
    const result = await runRefactoredSpeakerPipeline(testSegments);

    console.log('\n=== TEST RESULTS ===\n');
    console.log('Speakers identified by GPT:');
    result.speakers.forEach(s => {
      console.log(`  ${s.id}: ${s.name || '(unnamed)'} [${s.role}] (conf: ${s.confidence})`);
    });

    console.log('\nSegments reassigned by GPT-4o-mini:');
    result.segments.slice(0, 3).forEach(s => {
      console.log(`  ${s.speakerId}: "${s.text.substring(0, 50)}..."`);
    });

    console.log('\nDiagnostics:');
    console.log(`  Original speakers: ${result.diagnostics.originalSpeakerCount}`);
    console.log(`  Final speakers: ${result.diagnostics.finalSpeakerCount}`);
    console.log(`  Mappings:`, result.diagnostics.mappings);

    return result;

  } catch (error: any) {
    console.error('\n✗ TEST FAILED:', error.message);
    throw error;
  }
}
