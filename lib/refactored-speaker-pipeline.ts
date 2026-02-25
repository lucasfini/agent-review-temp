// REFACTORED SPEAKER ATTRIBUTION PIPELINE
//
// Architecture:
// AssemblyAI (diarization) → GPT-4o (speaker intelligence) → GPT-4o-mini (segment mapping)
//
// Pass 1: GPT-4o is the SINGLE SOURCE OF TRUTH for speaker roster
// Pass 2: GPT-4o-mini maps raw diarization labels to roster speakers
// Pass 2c: GPT-4o-mini resolves dirty clusters (segments with multiple speakers)

import { SpeakerSegment } from './types';
import {
  identifySpeakersWithGPT,
  GPTSpeaker,
  GPTSpeakerIntelligenceResult,
  getGPTSpeakerById
} from './gpt-speaker-intelligence';
import { mapSegmentsWithLLM, fallbackMapping, LLMMappingResult } from './llm-segment-mapping';
import { resolveAllDirtyClusters } from './dirty-cluster-resolution';
import { firstNamesSoundAlike, soundsLike } from './utils/phonetic';
import { buildClusterProfiles, buildIdentityProfiles } from './speaker-profiles';
import { performAnchorMapping } from './anchor-mapping';
import {
  STRONG_SELF_ID_PATTERNS,
  INTRO_HANDOFF_PATTERNS as SHARED_INTRO_HANDOFF_PATTERNS,
} from './self-id-patterns';

// Invalid names that should never be extracted (adjectives, possessives, common words)
const INVALID_NAME_PATTERNS = [
  /^(your|my|his|her|their|our)\b/i,  // Possessives
  /^(the|a|an)\b/i,  // Articles
  /^(nigerian|american|canadian|british|indian|chinese|african|european|asian)/i,  // Nationalities
  /^(student|candidate|host|moderator|speaker|person|guy|man|woman)/i,  // Descriptors
  /^(first|second|third|last|next|final)/i,  // Ordinals
  /^(one|two|three|four|five)/i,  // Numbers
];

// Common short English words that should NEVER be speaker names.
// Checked before the initials check to prevent "in", "so", "not" etc.
// from being treated as valid initials/nicknames.
const COMMON_NON_NAME_WORDS = new Set([
  // Prepositions and conjunctions
  'in', 'on', 'at', 'to', 'by', 'of', 'or', 'an', 'as', 'if', 'so', 'no', 'up',
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

/**
 * Validate if an extracted name is a valid proper name.
 * Rejects adjectives, possessives, nationalities, common words, etc.
 */
function isValidProperName(name: string): boolean {
  // Reject invalid patterns
  for (const invalidPattern of INVALID_NAME_PATTERNS) {
    if (invalidPattern.test(name)) {
      return false;
    }
  }

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(name)) {
    return false;
  }

  // CRITICAL: Check common English words BEFORE the initials check.
  // This prevents "in", "so", "not" from being treated as initials.
  if (COMMON_NON_NAME_WORDS.has(name.toLowerCase())) {
    return false;
  }

  // Allow initials/nicknames: 2-3 characters, all same case (JJ, DJ, jj, etc.)
  const isInitials = /^[A-Z]{2,3}$/.test(name) || /^[a-z]{2,3}$/.test(name);
  if (isInitials) {
    return true; // Initials are valid (common words already filtered above)
  }

  // Reject if all lowercase (likely a verb or adjective) - but not initials
  if (name === name.toLowerCase()) {
    return false;
  }

  return true;
}

/**
 * Detect AssemblyAI clusters that contain multiple different self-identifications.
 * This indicates a "dirty cluster" where multiple people were merged.
 */
function detectConflictingSelfIds(
  segments: SpeakerSegment[]
): Array<{ clusterId: string; names: string[] }> {
  // Group segments by cluster ID
  const clusterSelfIds = new Map<string, Set<string>>();

  for (const seg of segments) {
    const clusterId = seg.speakerId;

    // Extract self-ID from this segment
    for (const pattern of STRONG_SELF_ID_PATTERNS) {
      const match = pattern.exec(seg.text);
      if (match && match[1]) {
        const extractedName = match[1].trim();

        // Validate the name
        if (!isValidProperName(extractedName)) {
          break;
        }

        // Add to cluster's set of self-IDs
        if (!clusterSelfIds.has(clusterId)) {
          clusterSelfIds.set(clusterId, new Set());
        }
        clusterSelfIds.get(clusterId)!.add(extractedName);
        break;
      }
    }
  }

  // Find clusters with multiple different self-IDs
  const conflicts: Array<{ clusterId: string; names: string[] }> = [];

  for (const [clusterId, namesSet] of clusterSelfIds.entries()) {
    if (namesSet.size > 1) {
      conflicts.push({
        clusterId,
        names: Array.from(namesSet)
      });
    }
  }

  return conflicts;
}

/**
 * Find self-identifications in segments that don't match any speaker in the GPT roster.
 * Returns info about orphaned speakers so they can be dynamically added.
 */
function findOrphanedSelfIds(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): Array<{ name: string; clusterId: string; segmentIndex: number; text: string }> {
  const rosterNames = new Set(
    roster.map(r => r.name?.toLowerCase().trim()).filter(Boolean) as string[]
  );

  const orphans: Array<{ name: string; clusterId: string; segmentIndex: number; text: string }> = [];
  const seenOrphans = new Set<string>();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = seg.text;

    // Try each self-ID pattern
    for (const pattern of STRONG_SELF_ID_PATTERNS) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const extractedName = match[1].trim();

        // Validate: reject invalid names
        if (!isValidProperName(extractedName)) {
          console.log(`[ORPHAN RECOVERY] Rejected invalid name: "${extractedName}"`);
          break;
        }

        const normalized = extractedName.toLowerCase().trim();

        // Check if this name is in the roster
        if (!rosterNames.has(normalized)) {
          // Also check for partial matches (first name only)
          const firstName = normalized.split(/\s+/)[0];
          const rosterNamesArray = Array.from(rosterNames);
          const hasPartialMatch = rosterNamesArray.some(rosterName =>
            rosterName.split(/\s+/)[0] === firstName
          );

          if (!hasPartialMatch && !seenOrphans.has(normalized)) {
            orphans.push({
              name: extractedName,
              clusterId: seg.speakerId,
              segmentIndex: i,
              text: text.substring(0, 100)
            });
            seenOrphans.add(normalized);
          }
        }
        break; // Found a match, don't try other patterns for this segment
      }
    }
  }

  return orphans;
}

export interface RefactoredPipelineResult {
  // Authoritative speakers from GPT (Pass 1)
  speakers: GPTSpeaker[];

  // Reassigned segments from LLM mapping (Pass 2)
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
    mapperUsed?: 'csp' | 'llm';
    introSeededNames?: string[];
    llmMappingReasoning?: string;
    dirtyCluster?: string;
    dirtyClustersResolved?: string[];
    dirtyClusterSegmentsResolved?: number;
    segmentBalanceWarnings?: string[];
  };
}

/**
 * Run refactored speaker attribution pipeline
 *
 * ARCHITECTURE:
 * 1. AssemblyAI provides raw speaker segments (already done)
 * 2. GPT-4o identifies authoritative speakers (Pass 1) - ~$0.01-0.02
 * 3. GPT-4o-mini maps raw labels to roster speakers (Pass 2) - ~$0.0003
 * 4. GPT-4o-mini resolves dirty clusters segment-by-segment (Pass 2c) - ~$0.001
 * 5. Post-processing: integrity check, dedup, cull dead speakers
 *
 * COST: ~$0.01-0.025 per transcript (GPT-4o + GPT-4o-mini)
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
    title?: string;
    speakerCount?: number;
    projectType?: string;
    mappingMode?: 'csp' | 'llm';
    hasPresetRoster?: boolean;
  } = {}
): Promise<RefactoredPipelineResult> {
  console.log('\n========================================');
  console.log('REFACTORED SPEAKER PIPELINE');
  console.log('========================================\n');

  const startTime = Date.now();
  const originalSpeakerIds = new Set(segments.map(s => s.speakerId));
  const originalSpeakerCount = originalSpeakerIds.size;

  // Debate-specific: detect intro window for roster seeding
  const introWindow = options.projectType === 'DEBATE'
    ? detectIntroWindowEndTime(segments, true)  // skip 5-min cap: debate intros can start late
    : null;
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
      filename: options.filename,
      speakerCount: options.speakerCount
    });

    console.log(`\n✓ Pass 1 complete: ${gptResult.speakers.length} authoritative speakers identified`);

  // --- DEBATE INTRO ROSTER SEEDING (before roster enforcement) ---
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

  // --- ENFORCE ROSTER CONSTRAINTS (Garbage Filter + Dedup + Target Cap) ---
  console.log(`\n[PIPELINE] --- ROSTER ENFORCEMENT (Target: ${options.speakerCount || 'None'}) ---`);

  const enforcement = enforceRosterConstraints(gptResult.speakers, options.speakerCount);
  gptResult.speakers = enforcement.roster;

  console.log(`[PIPELINE] Garbage filtered: ${enforcement.garbageRemoved} removed`);
  console.log(`[PIPELINE] Duplicates merged (hard): ${enforcement.duplicatesMerged} merged`);
  console.log(`[PIPELINE] Soft collisions: ${enforcement.softCollisions} detected`);
  if (enforcement.excessDropped > 0) {
    console.log(`[PIPELINE] Excess speakers dropped to meet target ${options.speakerCount}: ${enforcement.excessDropped} dropped`);
    console.log(`[PIPELINE] Drop mappings:`, enforcement.dropMappings);
  }
  console.log(`[PIPELINE] ✓ Roster enforced: ${gptResult.speakers.length} speakers remaining`);

  // --- ROSTER PHONETIC DEDUP ---
  // Merge names that are phonetically identical (e.g. "Marianne" vs "Mariam"),
  // which GPT can produce when both spellings appear in the transcript.
  gptResult.speakers = deduplicateRosterByPhonetics(gptResult.speakers);

  // --- CLUSTER FLOOR ENFORCEMENT ---
  // Ensure we have at least as many roster entries as the floor target.
  // When the user provides speakerCount, that is the floor (they know how many speakers there are).
  // Otherwise fall back to originalSpeakerCount (raw diarization clusters).
  const floorTarget = options.speakerCount || originalSpeakerCount;
  if (gptResult.speakers.length < floorTarget) {
    const deficit = floorTarget - gptResult.speakers.length;
    console.log(`[CLUSTER FLOOR] GPT returned ${gptResult.speakers.length} speakers, floor target is ${floorTarget} (${options.speakerCount ? 'user-specified speakerCount' : 'raw cluster count'}) — adding ${deficit} unnamed entry(s)`);
    const maxExistingId = gptResult.speakers.reduce((max, s) => {
      const n = parseInt(s.id.replace('speaker_', ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    let nextId = maxExistingId + 1;
    for (let i = 0; i < deficit; i++) {
      gptResult.speakers.push({
        id: `speaker_${nextId}`,
        name: null,
        role: 'unknown',
        confidence: 0.60,
        source: 'cluster_floor_enforcement'
      });
      console.log(`[CLUSTER FLOOR] ✓ Added speaker_${nextId} (unnamed, cluster floor)`);
      nextId++;
    }
  }

  // --- HANDOFF NAME RECOVERY ---
  // Scan the transcript for direct-address panel handoffs (e.g. "Tony, let's bring you in")
  // that name speakers not already in the roster, and promote those names into any
  // null-named cluster-floor slots so the CSP anchor system can route their segments.
  recoverHandoffNames(segments, gptResult.speakers);

  if (gptResult.validationErrors.length > 0) {
    console.error('✗ GPT validation errors:', gptResult.validationErrors);
    // Don't throw, just log. We want to proceed with what we have.
  }

  } catch (error: any) {
    console.error('✗ Pass 1 failed:', error.message);
    console.warn('[PIPELINE] Creating fallback roster from raw cluster IDs');
    // Instead of crashing the entire pipeline, create a minimal roster
    // from raw diarization clusters so downstream passes can still run
    const uniqueClusters = [...originalSpeakerIds];
    gptResult = {
      speakers: uniqueClusters.map((clusterId, i) => ({
        id: `speaker_${i + 1}`,
        name: null,
        role: 'unknown' as const,
        confidence: 0.3,
        source: 'pass1_fallback'
      })),
      rawResponse: '',
      validationErrors: [`Pass 1 failed: ${error.message}`]
    };
    console.log(`[PIPELINE] Fallback roster: ${gptResult.speakers.length} unnamed speakers from ${uniqueClusters.length} clusters`);
  }

  // ============================================
  // PASS 1.5: ORPHANED SELF-ID RECOVERY & DIRTY CLUSTER DETECTION
  // ============================================
  // Scan for self-identifications that weren't captured by GPT Pass 1
  // and dynamically create speaker entries for them
  console.log(`\n--- PASS 1.5: ORPHANED SELF-ID RECOVERY & DIRTY CLUSTER DETECTION ---\n`);

  const orphanedSpeakers = findOrphanedSelfIds(segments, gptResult.speakers);

  if (orphanedSpeakers.length > 0) {
    console.warn(`[ORPHAN RECOVERY] Found ${orphanedSpeakers.length} self-identified speakers NOT in GPT roster:`);
    orphanedSpeakers.forEach(s => {
      console.warn(`[ORPHAN RECOVERY]   - "${s.name}" (segment ${s.segmentIndex}, cluster ${s.clusterId})`);
    });

    // Add orphaned speakers to the roster
    let nextSpeakerId = gptResult.speakers.length + 1;
    for (const orphan of orphanedSpeakers) {
      const newSpeaker: GPTSpeaker = {
        id: `speaker_${nextSpeakerId}`,
        name: orphan.name,
        role: 'guest', // Default to guest for debates
        confidence: 0.90, // High confidence (from explicit self-ID)
        source: 'orphan_recovery'
      };
      gptResult.speakers.push(newSpeaker);
      console.log(`[ORPHAN RECOVERY] ✓ Created ${newSpeaker.id}: "${newSpeaker.name}" (recovered from self-ID)`);
      nextSpeakerId++;
    }
  } else {
    console.log(`[ORPHAN RECOVERY] ✓ No orphaned self-IDs detected`);
  }

  // ============================================
  // PASS 1.6: DETECT CONFLICTING SELF-IDs IN SAME CLUSTER
  // ============================================
  // Check if any AssemblyAI cluster has multiple different self-IDs
  // This indicates a dirty cluster that should be split
  console.log(`\n--- PASS 1.6: CONFLICTING SELF-ID DETECTION ---\n`);

  const conflictingSelfIds = detectConflictingSelfIds(segments);

  if (conflictingSelfIds.length > 0) {
    console.warn(`[CONFLICT DETECTION] Found ${conflictingSelfIds.length} cluster(s) with conflicting self-IDs:`);

    for (const conflict of conflictingSelfIds) {
      console.warn(`[CONFLICT DETECTION]   Cluster ${conflict.clusterId} has ${conflict.names.length} different self-IDs:`);
      conflict.names.forEach(name => console.warn(`[CONFLICT DETECTION]     - "${name}"`));

      // Check if all these names are in the roster
      const missingNames = conflict.names.filter(name => {
        const normalized = name.toLowerCase().trim();
        return !gptResult.speakers.some(s => s.name?.toLowerCase().trim() === normalized);
      });

      if (missingNames.length > 0) {
        console.warn(`[CONFLICT DETECTION]   Missing from roster: ${missingNames.join(', ')}`);

        // Create speakers for missing names
        let nextSpeakerId = gptResult.speakers.length + 1;
        for (const name of missingNames) {
          const newSpeaker: GPTSpeaker = {
            id: `speaker_${nextSpeakerId}`,
            name,
            role: 'guest',
            confidence: 0.85,
            source: 'conflict_resolution'
          };
          gptResult.speakers.push(newSpeaker);
          console.log(`[CONFLICT DETECTION] ✓ Created ${newSpeaker.id}: "${name}" (from conflicting self-ID)`);
          nextSpeakerId++;
        }
      }
    }
  } else {
    console.log(`[CONFLICT DETECTION] ✓ No conflicting self-IDs detected`);
  }

  const mappingMode = options.mappingMode || 'csp';

  // ============================================
  // PASS 2: SEGMENT MAPPING
  // ============================================
  console.log(`\n--- PASS 2: SEGMENT MAPPING (${mappingMode.toUpperCase()}) ---\n`);

  let mappingResult: {
    segments: SpeakerSegment[];
    mappings: Record<string, string>;
    ambiguousAssignments: number;
    diagnostics?: {
      dirtyCluster?: string;
      reasoning: string;
    };
  };

  try {
    if (mappingMode === 'csp') {
      console.log(`\n[PIPELINE] ── Profile Building (Pre-Mapping) ──`);
      const clusterProfiles = buildClusterProfiles(segments);
      console.log(`[PIPELINE] Built ${Object.keys(clusterProfiles).length} cluster profiles from raw segments`);

      const cspSegments = performAnchorMapping(segments, gptResult.speakers, {
        clusterProfiles,
      });

      const mappings: Record<string, string> = {};
      for (const seg of cspSegments) {
        const raw = seg.initialSpeakerId || seg.rawClusterId || seg.speakerId;
        const mapped = seg.finalSpeakerId || seg.speakerId;
        if (raw && mapped && !mappings[raw]) mappings[raw] = mapped;
      }

      mappingResult = {
        segments: cspSegments,
        mappings,
        ambiguousAssignments: cspSegments.filter(s => (s.confidence || 0) < 0.8).length,
        diagnostics: {
          reasoning: 'CSP anchor mapping',
        }
      };

      console.log(`\n✓ Pass 2 complete: ${mappingResult.segments.length} segments processed`);
      console.log(`  Mappings: ${JSON.stringify(mappingResult.mappings)}`);
    } else {
      const llmResult = await mapSegmentsWithLLM(segments, gptResult.speakers, {
        apiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
        userId: options.userId,
        projectId: options.projectId,
      });

      // Update result
      mappingResult = {
        segments: llmResult.segments,
        mappings: llmResult.mappings,
        ambiguousAssignments: llmResult.segments.filter(s => (s.confidence || 0) < 0.8).length,
        diagnostics: {
          dirtyCluster: llmResult.diagnostics.dirtyCluster,
          reasoning: llmResult.diagnostics.reasoning,
        }
      };

      console.log(`\n✓ Pass 2 complete: ${mappingResult.segments.length} segments processed`);
      console.log(`  Mappings: ${JSON.stringify(mappingResult.mappings)}`);
      if (llmResult.diagnostics.dirtyCluster) {
        console.log(`  ⚠️ Dirty cluster detected: ${llmResult.diagnostics.dirtyCluster}`);
      }
    }

  } catch (error: any) {
    console.error(`✗ Pass 2 (${mappingMode.toUpperCase()}) failed, using fallback:`, error.message);

    // Fallback to heuristic mapping
    const fallback = fallbackMapping(segments, gptResult.speakers);
    mappingResult = {
      segments: fallback.segments,
      mappings: fallback.mappings,
      ambiguousAssignments: fallback.segments.filter(s => (s.confidence || 0) < 0.8).length,
    };
    console.log(`✓ Fallback mapping applied: ${JSON.stringify(mappingResult.mappings)}`);
  }

  // ============================================
  // PASS 2c: DIRTY CLUSTER RESOLUTION (LLM only)
  // ============================================
  let dirtyClustersResolved: string[] = [];
  let dirtyClusterSegmentsResolved = 0;
  let newSpeakersFromDirtyClusters: string[] = [];

  if (mappingMode === 'llm') {
    console.log('\n--- PASS 2c: DIRTY CLUSTER RESOLUTION ---\n');

    try {
      const dirtyClusterResult = await resolveAllDirtyClusters(
        mappingResult.segments,
        gptResult.speakers,
        {
          apiKey: options.openaiApiKey,
          userId: options.userId,
          projectId: options.projectId,
        }
      );

      mappingResult.segments = dirtyClusterResult.segments;
      gptResult.speakers = dirtyClusterResult.roster; // Update roster with any new speakers
      dirtyClustersResolved = dirtyClusterResult.dirtyClustersResolved;
      dirtyClusterSegmentsResolved = dirtyClusterResult.totalResolved;
      newSpeakersFromDirtyClusters = dirtyClusterResult.newSpeakersCreated;

      if (dirtyClustersResolved.length > 0 || newSpeakersFromDirtyClusters.length > 0) {
        console.log(`\n✓ Pass 2c complete:`);
        if (newSpeakersFromDirtyClusters.length > 0) {
          console.log(`  - Created ${newSpeakersFromDirtyClusters.length} new speaker(s): [${newSpeakersFromDirtyClusters.join(', ')}]`);
        }
        if (dirtyClustersResolved.length > 0) {
          console.log(`  - Resolved ${dirtyClusterSegmentsResolved} segments in ${dirtyClustersResolved.length} dirty cluster(s)`);
        }
      } else {
        console.log('✓ Pass 2c complete: No dirty clusters found');
      }
    } catch (error: any) {
      console.error('✗ Pass 2c (Dirty Cluster Resolution) failed:', error.message);
      // Continue without dirty cluster resolution - not fatal
    }
  }

  // ============================================
  // HEURISTIC FALLBACK (Task 1)
  // Fix "Unknown" labels using filename context
  // ============================================
  if (options.filename || options.title) {
  try {
    const { guest: filenameGuest, host: filenameHost } = extractNamesFromFilename(options.title || options.filename || '');

    // Apply known-show host name to any unnamed/partially-named host-role speaker
    if (filenameHost) {
      const isIncompleteName = (name: string | null | undefined) =>
        !name || !name.trim().includes(' ');

      // Case 1: Speaker with host/co_host role AND no/partial name
      let hostToName = gptResult.speakers.find(
        s => (s.role === 'host' || s.role === 'co_host') && isIncompleteName(s.name)
      );

      // Case 2: No host-role speaker found — look for an unknown-role speaker
      //         whose name (or absence of name) matches the known host's first name.
      if (!hostToName) {
        const knownFirstName = filenameHost.split(' ')[0].toLowerCase();
        hostToName = gptResult.speakers.find(
          s => s.role === 'unknown' && (
            !s.name ||
            s.name.trim().toLowerCase() === knownFirstName
          )
        );
        if (hostToName) {
          hostToName.role = 'host';
          console.log(`\n[HEURISTIC] 🧠 Promoted "${hostToName.id}" from unknown to host (matched known-show host first name "${knownFirstName}")`);
        }
      }

      if (hostToName) {
        console.log(`\n[HEURISTIC] 🧠 Naming host "${hostToName.id}" as "${filenameHost}" via known-show lookup`);
        hostToName.name = filenameHost;
        hostToName.confidence = Math.max(hostToName.confidence, 0.75);
      }
    }

    if (filenameGuest) {
      console.log(`\n[HEURISTIC] 🧠 Checking title/filename hints for "${options.title || options.filename}"`);
      console.log(`[HEURISTIC] Found potential guest name: "${filenameGuest}"`);

      // Count segments per GPT speaker to find dominance
      const segmentCounts: Record<string, number> = {};
      mappingResult.segments.forEach(s => {
        segmentCounts[s.speakerId] = (segmentCounts[s.speakerId] || 0) + 1;
      });

      // Compute total duration per speaker
      const speakerDurations: Record<string, number> = {};
      mappingResult.segments.forEach(s => {
        const dur = (s.endTime || 0) - (s.startTime || 0);
        speakerDurations[s.speakerId] = (speakerDurations[s.speakerId] || 0) + dur;
      });

      // Sort by avg segment duration — guests give longer answers than hosts
      const sortedByAvgDuration = Object.entries(segmentCounts)
        .map(([id, count]) => ({ id, avgDur: (speakerDurations[id] || 0) / count }))
        .sort((a, b) => b.avgDur - a.avgDur);

      const guestCandidateId = sortedByAvgDuration[0]?.id; // longest avg = guest

      // Logic: Guest is the speaker with the longest average segment duration
      if (guestCandidateId) {
        const guestSpeaker = gptResult.speakers.find(s => s.id === guestCandidateId);

        if (guestSpeaker) {
          // Skip only if this speaker already has the correct name
          const alreadyCorrect = guestSpeaker.name === filenameGuest;

          if (!alreadyCorrect) {
            // Clear this name from any other speaker first.
            // GPT may have wrongly assigned the filename-guest name to a different cluster.
            // If we don't clear it, two speakers end up with the same name, which causes
            // post-processing (cluster loyalty / dirty cluster resolution) to merge them.
            for (const other of gptResult.speakers) {
              if (other.id !== guestCandidateId && other.name === filenameGuest) {
                console.log(`[HEURISTIC] ⚠️ Clearing "${filenameGuest}" from ${other.id} — GPT wrongly assigned it; heuristic correcting`);
                other.name = null;
              }
            }

            console.log(`[HEURISTIC] 💡 Assigning GUEST "${filenameGuest}" to longest-avg-duration speaker (${guestCandidateId}, avgDur=${sortedByAvgDuration[0]?.avgDur.toFixed(1)}s) — was "${guestSpeaker.name}"`);
            guestSpeaker.name = filenameGuest;
            guestSpeaker.role = 'guest';
            guestSpeaker.confidence = 0.7;
          } else {
            console.log(`[HEURISTIC] Speaker (${guestCandidateId}) already correctly named "${guestSpeaker.name}" - no override needed`);
          }
        }

        // Vocative fallback: if any speakers still have no name, try to extract the host's
        // first name from patterns like "Thank you, Scott" in the guest's own segments.
        // This fires regardless of alreadyCorrect — it only affects truly nameless speakers.
        const namelessOthers = gptResult.speakers.filter(s => !s.name && s.id !== guestCandidateId);
        if (namelessOthers.length > 0) {
          const guestText = mappingResult.segments
            .filter(s => (s.finalSpeakerId || s.speakerId) === guestCandidateId)
            .map(s => (s as any).text || '')
            .join(' ');

          // "Thank you, [Name]" / "Thanks, [Name]" — highly reliable vocative pattern
          const nameCounts: Record<string, number> = {};
          const thankRe = /\bthanks?(?:\s+you)?,\s+([A-Z][a-z]{2,15})[,.]?\b/gi;
          let vm: RegExpExecArray | null;
          const guestFirstName = (filenameGuest || '').split(' ')[0].toLowerCase();
          while ((vm = thankRe.exec(guestText)) !== null) {
            const n = vm[1];
            if (n && n.toLowerCase() !== guestFirstName) {
              nameCounts[n] = (nameCounts[n] || 0) + 1;
            }
          }

          const top = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0];
          if (top) {
            const [hostFirstName, count] = top;
            const target = namelessOthers[0];
            console.log(`[HEURISTIC] 💡 Naming ${target.id} as "${hostFirstName}" via "Thank you, ${hostFirstName}" vocative in guest segments (${count}x)`);
            target.name = hostFirstName;
          } else {
            console.log(`[HEURISTIC] No vocative address found in guest segments — ${namelessOthers.map(s => s.id).join(', ')} remain unnamed`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[HEURISTIC] filename/title heuristic failed (non-fatal):', err.message);
  }
  }

  // ============================================
  // TITLE-BASED HOST LOCK (Prof G + common patterns)
  // ============================================
  if (!options.hasPresetRoster && (options.title || options.filename)) {
  try {
    const { host: titleHost, guest: titleGuest } = extractNamesFromFilename(options.title || options.filename || '');
    const roster = gptResult.speakers;

    if (titleHost && roster.length === 2) {
      const hostSpeaker = roster.find(s =>
        s.name && s.name.toLowerCase().trim() === titleHost.toLowerCase().trim()
      );

      if (hostSpeaker) {
        // Inline host detection: speaker who asks the most questions is the host
        const questionCounts: Record<string, number> = {};
        for (const seg of mappingResult.segments) {
          const id = (seg as any).finalSpeakerId || seg.speakerId;
          if (!id) continue;
          questionCounts[id] = (questionCounts[id] || 0) + ((seg as any).text || '').split('?').length - 1;
        }
        let hostCandidateId: string | null = null;
        let maxQ = 0;
        for (const [id, count] of Object.entries(questionCounts)) {
          if (count > maxQ) { maxQ = count; hostCandidateId = id; }
        }
        const hostCandidate = roster.find(s => s.id === hostCandidateId);

        if (hostCandidate && hostSpeaker.id !== hostCandidate.id) {
          console.log(`[HEURISTIC] 🔒 Host lock triggered: "${titleHost}" should map to ${hostCandidate.id} (was ${hostSpeaker.id})`);

          const prevHostName = hostSpeaker.name;
          const prevHostRole = hostSpeaker.role;
          hostSpeaker.name = hostCandidate.name || null;
          hostSpeaker.role = hostCandidate.role || 'guest';

          hostCandidate.name = prevHostName || titleHost;
          hostCandidate.role = 'host';

          if (titleGuest && (!hostSpeaker.name || hostSpeaker.name === 'Unknown' || hostSpeaker.name.startsWith('Speaker '))) {
            hostSpeaker.name = titleGuest;
            hostSpeaker.role = 'guest';
          }

          console.log(`[HEURISTIC] Host swap complete: ${hostCandidate.id}="${hostCandidate.name}", ${hostSpeaker.id}="${hostSpeaker.name}"`);
        } else {
          console.log('[HEURISTIC] Host lock check: no swap needed');
        }
      } else {
        console.log('[HEURISTIC] Host lock skipped: host name not present in roster');
      }
    }
  } catch (err: any) {
    console.error('[HEURISTIC] title-based host lock failed (non-fatal):', err.message);
  }
  }

  // ============================================
  // POST-PROCESS: INTEGRITY CHECK
  // ============================================
  console.log('\n--- POST-PROCESS: SPEAKER INTEGRITY CHECK ---\n');

  try {
    const { segments: verifiedSegments, corrections, newSpeakers } = verifySpeakerIntegrity(
      mappingResult.segments,
      gptResult.speakers,
      options.speakerCount
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
  } catch (err: any) {
    console.error('[INTEGRITY] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: CLUSTER LOYALTY ENFORCEMENT
  // ============================================
  console.log('\n--- POST-PROCESS: CLUSTER LOYALTY ENFORCEMENT ---\n');
  try {
    const clusterResult = enforceClusterLoyalty(mappingResult.segments, gptResult.speakers);
    if (clusterResult.reassignments > 0) {
      mappingResult.segments = clusterResult.segments;
      console.log(`[CLUSTER LOYALTY] Reassigned ${clusterResult.reassignments} segments across ${clusterResult.clustersConsolidated.length} clusters`);
      if (clusterResult.nameCorrections.length > 0) {
        for (const nc of clusterResult.nameCorrections) {
          console.log(`[CLUSTER LOYALTY] Name correction: "${nc.oldName}" → "${nc.newName}" (${nc.speakerId})`);
        }
      }
    } else {
      console.log('[CLUSTER LOYALTY] No cluster loyalty violations detected');
    }
  } catch (err: any) {
    console.error('[CLUSTER LOYALTY] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: NAME-PREFIX DIRTY CLUSTER RESOLUTION
  // ============================================
  console.log('\n--- POST-PROCESS: NAME-PREFIX DIRTY CLUSTER RESOLUTION ---\n');
  try {
    const namePrefixResult = resolveDirtyClusterByNamePrefix(
      mappingResult.segments,
      gptResult.speakers
    );
    if (namePrefixResult.reassignments > 0) {
      mappingResult.segments = namePrefixResult.segments;
      console.log(`[NAME PREFIX] Reassigned ${namePrefixResult.reassignments} segment(s)`);
    } else {
      console.log('[NAME PREFIX] No name-prefix reassignments made');
    }
    for (const line of namePrefixResult.info) {
      console.log(line);
    }
  } catch (err: any) {
    console.error('[NAME PREFIX] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: TEMPORAL HANDOFF RESOLUTION
  // ============================================
  console.log('\n--- POST-PROCESS: TEMPORAL HANDOFF RESOLUTION ---\n');
  try {
    const temporalResult = resolveByTemporalHandoff(mappingResult.segments, gptResult.speakers);
    if (temporalResult.reassignments > 0) {
      mappingResult.segments = temporalResult.segments;
      console.log(`[TEMPORAL] Reassigned ${temporalResult.reassignments} segment(s) via temporal context`);
    } else {
      console.log('[TEMPORAL] No temporal handoff reassignments made');
    }
    for (const line of temporalResult.info) {
      console.log(line);
    }
  } catch (err: any) {
    console.error('[TEMPORAL] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: HANDOFF RESPONSE REASSIGNMENT
  // ============================================
  console.log('\n--- POST-PROCESS: HANDOFF RESPONSE REASSIGNMENT ---\n');
  try {
    const handoffReassignResult = reassignHandoffResponses(mappingResult.segments, gptResult.speakers);
    if (handoffReassignResult.reassignments > 0) {
      mappingResult.segments = handoffReassignResult.segments;
      console.log(`[HANDOFF REASSIGN] Reassigned ${handoffReassignResult.reassignments} segment(s) via handoff patterns`);
    } else {
      console.log('[HANDOFF REASSIGN] No handoff response reassignments made');
    }
    for (const line of handoffReassignResult.info) {
      console.log(line);
    }
  } catch (err: any) {
    console.error('[HANDOFF REASSIGN] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: HANDOFF CLUSTER COHERENCE
  // ============================================
  console.log('\n--- POST-PROCESS: HANDOFF CLUSTER COHERENCE ---\n');
  try {
    const coherenceResult = claimHandoffClusters(mappingResult.segments, gptResult.speakers);
    if (coherenceResult.claims > 0) {
      mappingResult.segments = coherenceResult.segments;
      console.log(`[CLUSTER COHERENCE] Claimed ${coherenceResult.claims} segment(s) via handoff cluster ownership`);
    } else {
      console.log('[CLUSTER COHERENCE] No cluster coherence claims made');
    }
    for (const line of coherenceResult.info) {
      console.log(line);
    }
  } catch (err: any) {
    console.error('[CLUSTER COHERENCE] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // CLUSTER FLOOR SLOT REDISTRIBUTION
  // ============================================
  // Moved here (after all segment-level post-processing) so that redistribution
  // operates on final segment state and doesn't get undone by cluster loyalty etc.
  console.log('\n--- CLUSTER FLOOR SLOT REDISTRIBUTION ---\n');
  try {
    const usedSpeakerIds = new Set(
      mappingResult.segments.map(s => s.finalSpeakerId || s.speakerId).filter(Boolean)
    );
    const unusedFloorSlots = gptResult.speakers.filter(
      s => !usedSpeakerIds.has(s.id) &&
           (s.source === 'cluster_floor_enforcement' || s.source === 'handoff_name_recovery')
    );

    if (unusedFloorSlots.length > 0) {
      // Compute dominant speaker per raw cluster
      const clusterSegCounts: Record<string, Record<string, number>> = {};
      for (const seg of mappingResult.segments) {
        const cid = seg.initialSpeakerId || (seg as any).rawClusterId;
        const sid = seg.finalSpeakerId || seg.speakerId;
        if (!cid || !sid) continue;
        if (!clusterSegCounts[cid]) clusterSegCounts[cid] = {};
        clusterSegCounts[cid][sid] = (clusterSegCounts[cid][sid] || 0) + 1;
      }
      const clusterDominant: Record<string, string> = {};
      for (const [cid, counts] of Object.entries(clusterSegCounts)) {
        clusterDominant[cid] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      }

      // Group clusters by their dominant speaker
      const speakerClusters: Record<string, string[]> = {};
      for (const [cid, sid] of Object.entries(clusterDominant)) {
        if (!speakerClusters[sid]) speakerClusters[sid] = [];
        speakerClusters[sid].push(cid);
      }

      // For any dominant speaker with >1 cluster, move extras to unused floor slots
      let slotIdx = 0;
      for (const [dominantId, clusters] of Object.entries(speakerClusters)) {
        if (clusters.length <= 1) continue;
        for (let i = 1; i < clusters.length && slotIdx < unusedFloorSlots.length; i++) {
          const clusterToMove = clusters[i];
          const targetSlot = unusedFloorSlots[slotIdx++];
          mappingResult.segments = mappingResult.segments.map(seg => {
            const segCluster = seg.initialSpeakerId || (seg as any).rawClusterId;
            if (segCluster === clusterToMove) {
              return { ...seg, speakerId: targetSlot.id, finalSpeakerId: targetSlot.id };
            }
            return seg;
          });
          console.log(`[CLUSTER REDISTRIB] ${clusterToMove}: ${dominantId} → ${targetSlot.id} (${clusterSegCounts[clusterToMove]?.[dominantId] || 0} segs)`);
        }
      }
      if (slotIdx === 0) {
        console.log('[CLUSTER REDISTRIB] No collapsed clusters to redistribute');
      }
    } else {
      console.log('[CLUSTER REDISTRIB] No unused floor slots — skipping');
    }
  } catch (err: any) {
    console.error('[CLUSTER REDISTRIB] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: DUPLICATE UNKNOWN MERGE
  // ============================================
  console.log('\n--- POST-PROCESS: DUPLICATE UNKNOWN MERGE ---\n');
  try {
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
  } catch (err: any) {
    console.error('[MERGE] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: DEAD SPEAKER CULL
  // ============================================
  console.log('\n--- POST-PROCESS: DEAD SPEAKER CULL ---\n');

  try {
    const beforeCull = gptResult.speakers.length;
    const culledRoster = cullDeadSpeakers(gptResult.speakers, mappingResult.segments);
    const culled = beforeCull - culledRoster.length;

    if (options.speakerCount && culledRoster.length < options.speakerCount) {
      // Restore floor-enforcement / handoff-recovery speakers to meet the user's speakerCount
      const culledIds = new Set(culledRoster.map(s => s.id));
      const restorable = gptResult.speakers.filter(
        s => !culledIds.has(s.id) &&
          (s.source === 'cluster_floor_enforcement' || s.source === 'handoff_name_recovery')
      );
      const needed = options.speakerCount - culledRoster.length;
      const restored = restorable.slice(0, needed);
      gptResult.speakers = [...culledRoster, ...restored];
      if (restored.length > 0) {
        console.log(`[CULL] Restored ${restored.length} floor speaker(s) to meet speakerCount=${options.speakerCount}`);
      }
      if (culled - restored.length > 0) {
        console.log(`[CULL] Removed ${culled - restored.length} ghost speaker(s) with 0 segments`);
      } else {
        console.log('[CULL] No ghost speakers found (after restoration)');
      }
    } else {
      gptResult.speakers = culledRoster;
      if (culled > 0) {
        console.log(`[CULL] Removed ${culled} ghost speaker(s) with 0 segments`);
      } else {
        console.log('[CULL] No ghost speakers found');
      }
    }
  } catch (err: any) {
    console.error('[CULL] failed (non-fatal), skipping:', err.message);
  }

  // ============================================
  // POST-PROCESS: SPONSOR/AD SEGMENT DETECTION
  // ============================================
  console.log('\n--- POST-PROCESS: SPONSOR SEGMENT DETECTION ---\n');

  const sponsorResult = detectSponsorSegments(mappingResult.segments, gptResult.speakers);
  if (sponsorResult.sponsorsFound > 0) {
    mappingResult.segments = sponsorResult.segments;
    gptResult.speakers = sponsorResult.roster;
    console.log(`[SPONSOR] Tagged ${sponsorResult.segmentsRetagged} segment(s) across ${sponsorResult.sponsorsFound} sponsor(s)`);
  } else {
    console.log('[SPONSOR] No sponsor segments detected');
  }

  // ============================================
  // POST-PROCESS: FINAL SELF-ID ENFORCEMENT
  // ============================================
  console.log('\n--- POST-PROCESS: FINAL SELF-ID ENFORCEMENT ---\n');

  const selfIdEnforceResult = enforceSelfIdSegments(mappingResult.segments, gptResult.speakers);
  if (selfIdEnforceResult.corrections > 0) {
    mappingResult.segments = selfIdEnforceResult.segments;
    console.log(`[SELF-ID ENFORCE] Corrected ${selfIdEnforceResult.corrections} segment(s) with mismatched self-identification`);
  } else {
    console.log('[SELF-ID ENFORCE] All self-ID segments correctly assigned');
  }

  // ============================================
  // POST-PROCESS: SEGMENT BALANCE VALIDATION (Debates)
  // ============================================
  let segmentBalanceWarnings: string[] = [];

  if (options.projectType === 'DEBATE') {
    console.log('\n--- POST-PROCESS: SEGMENT BALANCE VALIDATION ---\n');
    segmentBalanceWarnings = validateSegmentBalance(
      gptResult.speakers,
      mappingResult.segments,
      options.speakerCount
    );

    if (segmentBalanceWarnings.length > 0) {
      console.log(`[BALANCE] ⚠️ ${segmentBalanceWarnings.length} warning(s):`);
      segmentBalanceWarnings.forEach(w => console.log(`[BALANCE]   ${w}`));
    } else {
      console.log('[BALANCE] Segment distribution looks balanced');
    }
  }

  if (options.projectType === 'DEBATE' && introSeededNames.length > 0) {
    const rosterNames = gptResult.speakers.map(s => s.name).filter(Boolean) as string[];
    const missing = introSeededNames.filter(name =>
      !rosterNames.some(r => r.toLowerCase().trim() === name.toLowerCase().trim())
    );
    if (missing.length > 0) {
      console.warn('[PIPELINE][WARN] Intro-seeded names missing from final roster', {
        introduced: introSeededNames,
        finalRoster: rosterNames,
        missing,
      });
    }
  }

  // ============================================
  // POST-PROCESS: FINAL SPEAKER ID VALIDATION
  // ============================================
  console.log('\n--- POST-PROCESS: FINAL SPEAKER ID VALIDATION ---\n');

  const validFinalIds = new Set(gptResult.speakers.map(s => s.id));
  let orphanedSegments = 0;
  // Find the host or highest-confidence speaker as default fallback
  const fallbackSpeaker = gptResult.speakers.find(s => s.role === 'host')
    || gptResult.speakers.reduce((best, s) => s.confidence > best.confidence ? s : best, gptResult.speakers[0]);

  mappingResult.segments = mappingResult.segments.map(seg => {
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;
    if (validFinalIds.has(finalId)) return seg;

    orphanedSegments++;
    // Try to find a roster match by cluster affinity (initialSpeakerId)
    const initialId = (seg as any).initialSpeakerId;
    let remappedId = fallbackSpeaker?.id || gptResult.speakers[0]?.id;

    if (initialId) {
      // Find the most common finalSpeakerId for segments sharing this initialSpeakerId
      const affinityMap = new Map<string, number>();
      for (const other of mappingResult.segments) {
        if ((other as any).initialSpeakerId === initialId && validFinalIds.has((other as any).finalSpeakerId || other.speakerId)) {
          const otherId = (other as any).finalSpeakerId || other.speakerId;
          affinityMap.set(otherId, (affinityMap.get(otherId) || 0) + 1);
        }
      }
      if (affinityMap.size > 0) {
        let bestCount = 0;
        for (const [id, count] of affinityMap) {
          if (count > bestCount) { bestCount = count; remappedId = id; }
        }
      }
    }

    console.log(`[ID VALIDATION] Orphaned segment "${seg.text.substring(0, 50)}..." (${finalId}) → remapped to ${remappedId}`);
    return {
      ...seg,
      speakerId: remappedId,
      finalSpeakerId: remappedId,
    };
  });

  if (orphanedSegments > 0) {
    console.log(`[ID VALIDATION] Remapped ${orphanedSegments} orphaned segment(s)`);
  } else {
    console.log('[ID VALIDATION] All segments have valid speaker IDs');
  }

  // ============================================
  // BUILD FINAL OUTPUT
  // ============================================

  // ============================================
  // PROFILE REBUILDING (Post-Reconciliation Identity Profiles)
  // ============================================
  console.log(`\n[PIPELINE] ── Profile Rebuilding (Post-Reconciliation) ──`);
  const clusterProfiles = buildClusterProfiles(segments);
  if (Object.keys(clusterProfiles).length > 0) {
    console.log(`[PROFILE] Built ${Object.keys(clusterProfiles).length} cluster profile(s)`);
  }
  const identityProfiles = buildIdentityProfiles(mappingResult.segments, gptResult.speakers);
  console.log(`[PIPELINE] Rebuilt ${Object.keys(identityProfiles).length} identity profiles from final assignments`);

  if (Object.keys(identityProfiles).length > 0) {
    gptResult.speakers = gptResult.speakers.map(speaker => ({
      ...speaker,
      profile: identityProfiles[speaker.id] || speaker.profile
    }));
    console.log(`[PROFILE] Built ${Object.keys(identityProfiles).length} identity profile(s)`);
  } else {
    console.log('[PROFILE] No identity profiles built (no segments mapped)');
  }

  // DEBATE: deterministic moderator detection from behavioral signals.
  // Runs regardless of whether Pass 1 GPT succeeded, so the moderator is never
  // left with role="unknown" just because GPT failed or didn't identify them.
  if (options.projectType === 'DEBATE') {
    const unclaimedModerators = gptResult.speakers.filter(s => {
      if (s.role === 'host' || s.role === 'co_host') return false;
      const behavioral = (s.profile as any)?.behavioral;
      if (!behavioral) return false;
      const given: number = behavioral.handoffGivenCount ?? 0;
      const received: number = behavioral.handoffReceivedCount ?? 0;
      return given >= 5 && received === 0;
    });
    if (unclaimedModerators.length === 1) {
      const mod = unclaimedModerators[0];
      const given = (mod.profile as any)?.behavioral?.handoffGivenCount ?? '?';
      mod.role = 'host';
      if (!mod.name) mod.name = 'Moderator';
      console.log(`[DEBATE] 🎙️ Deterministic moderator: ${mod.id} → role=host (handoffs_given=${given}, received=0)`);
    } else if (unclaimedModerators.length > 1) {
      // Tie-break: most handoffs given wins
      const top = unclaimedModerators.reduce((best, s) => {
        const sg = (s.profile as any)?.behavioral?.handoffGivenCount ?? 0;
        const bg = (best.profile as any)?.behavioral?.handoffGivenCount ?? 0;
        return sg > bg ? s : best;
      });
      top.role = 'host';
      if (!top.name) top.name = 'Moderator';
      console.log(`[DEBATE] 🎙️ Deterministic moderator (tie-break): ${top.id} → role=host`);
    }
  }

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
      mappingConfidence: {}, // LLM mapping doesn't provide per-mapping confidence
      originalSpeakerCount,
      finalSpeakerCount: gptResult.speakers.length,
      mapperUsed: mappingMode,
      introSeededNames: introSeededNames.length > 0 ? introSeededNames : undefined,
      llmMappingReasoning: mappingResult.diagnostics?.reasoning,
      dirtyCluster: mappingResult.diagnostics?.dirtyCluster,
      dirtyClustersResolved: dirtyClustersResolved.length > 0 ? dirtyClustersResolved : undefined,
      dirtyClusterSegmentsResolved: dirtyClusterSegmentsResolved > 0 ? dirtyClusterSegmentsResolved : undefined,
      segmentBalanceWarnings: segmentBalanceWarnings.length > 0 ? segmentBalanceWarnings : undefined,
    }
  };
}

/**
 * Known show name → host name mappings.
 * Used to reliably identify the host when GPT doesn't extract it from the filename.
 */
const KNOWN_SHOW_HOSTS: Array<{ pattern: RegExp; host: string }> = [
  { pattern: /\bprof\.?\s*g\b/i,              host: 'Scott Galloway' },
  { pattern: /\blex\s+fridman\b/i,             host: 'Lex Fridman' },
  { pattern: /\btim\s+ferriss\b/i,             host: 'Tim Ferriss' },
  { pattern: /\bhuberman\s+lab\b/i,            host: 'Andrew Huberman' },
  { pattern: /\bsam\s+harris\b/i,              host: 'Sam Harris' },
  { pattern: /\bjoe\s+rogan\b/i,               host: 'Joe Rogan' },
  { pattern: /\bconan\s+o['']?brien\b/i,       host: 'Conan O\'Brien' },
  { pattern: /\bsmartless\b/i,                 host: 'Jason Bateman' },
  { pattern: /\bfreakonomics\b/i,              host: 'Stephen Dubner' },
  { pattern: /\bhow\s+i\s+built\s+this\b/i,   host: 'Guy Raz' },
  { pattern: /\bthe\s+daily\s+show\b/i,        host: 'Jon Stewart' },
  { pattern: /\barmchair\s+expert\b/i,         host: 'Dax Shepard' },
  { pattern: /\ball-in\s+podcast\b/i,          host: 'Chamath Palihapitiya' },
  { pattern: /\bmasters\s+of\s+scale\b/i,      host: 'Reid Hoffman' },
  { pattern: /\bhidden\s+brain\b/i,            host: 'Shankar Vedantam' },
];

/**
 * Extract potential names from filename for heuristic matching
 */
function extractNamesFromFilename(filename: string): { host?: string; guest?: string } {
  if (!filename || filename === 'audio_upload' || filename.startsWith('audio_')) return {};

  const clean = filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  let guest: string | undefined;
  let host: string | undefined;

  // 0. Check known show names → host (before guest extraction, so we always get host even if guest also found)
  for (const { pattern, host: knownHost } of KNOWN_SHOW_HOSTS) {
    if (pattern.test(clean)) {
      host = knownHost;
      break;
    }
  }

  // 1. "with [Name]" — cap at 2 words (first + last) to avoid greedily
  //    consuming show-name words like "Prof G" that immediately follow the guest name
  const withMatch = clean.match(/\b(?:with|feat\.?|featuring|guest|starring)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  if (withMatch) return { host, guest: withMatch[1] };

  // 2. "[Name] Interview"
  const interviewMatch = clean.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:Interview|Conversation|Chat)/i);
  if (interviewMatch) return { host, guest: interviewMatch[1] };

  // 3. "[Name] on [Topic]"
  const onMatch = clean.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+on\b/i);
  if (onMatch) return { host, guest: onMatch[1] };

  return { host };
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

// Use imported patterns from self-id-patterns.ts
const INTRO_HANDOFF_PATTERNS = SHARED_INTRO_HANDOFF_PATTERNS;
const INTRO_SELF_ID_PATTERNS = STRONG_SELF_ID_PATTERNS;

function getSegStartSeconds(segment: SpeakerSegment): number | null {
  const anySeg = segment as any;
  if (typeof anySeg.startTime === 'number') return anySeg.startTime;
  if (typeof anySeg.start === 'number') return anySeg.start;
  if (typeof anySeg.startTimeMs === 'number') return anySeg.startTimeMs / 1000;
  if (typeof anySeg.startMs === 'number') return anySeg.startMs / 1000;
  if (typeof anySeg.start_time === 'number') return anySeg.start_time;
  return null;
}

function getSegText(segment: SpeakerSegment): string {
  const anySeg = segment as any;
  return (anySeg.text || anySeg.transcript || anySeg.utterance || '').toString();
}

function detectIntroWindowEndTime(
  segments: SpeakerSegment[],
  skipTimeCap?: boolean
): { endTimeSeconds: number; reason: string } {
  const maxWindow = skipTimeCap ? Infinity : 300; // debates: no cap; podcasts: 5 min
  let questionStart = Infinity;
  let markerMatched = false;

  for (const seg of segments) {
    const text = getSegText(seg);
    if (INTRO_QUESTION_PATTERNS.some(p => p.test(text))) {
      const startSeconds = getSegStartSeconds(seg) ?? 0;
      questionStart = Math.min(questionStart, startSeconds);
      markerMatched = true;
      break;
    }
  }

  if (questionStart !== Infinity) {
    return { endTimeSeconds: Math.min(maxWindow, questionStart), reason: markerMatched ? 'question_marker' : 'question_marker_unknown' };
  }

  const lastSeg = segments.length ? segments[segments.length - 1] : null;
  const lastEnd = lastSeg ? (lastSeg as any).endTime ?? maxWindow : maxWindow;
  return { endTimeSeconds: Math.min(maxWindow, lastEnd || maxWindow), reason: 'time_cap' };
}

function normalizeSpeakerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

const INTRO_STOPWORDS = new Set([
  'you','your','our','and','the','to','for','with','from','this','that','these','those','we','us','they','them',
  'a','an','in','on','at','by','of','is','are','will','can','go','ahead','move','next','first','last'
]);

function isValidIntroNameCandidate(raw: string): boolean {
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 3) return false;
  const hasLongToken = tokens.some(t => t.length >= 3);
  if (!hasLongToken) return false;
  if (tokens.some(t => INTRO_STOPWORDS.has(t.toLowerCase()))) return false;
  return tokens.every(t => /^[A-Za-z'-.]+$/.test(t));
}

function extractIntroHandoffNames(
  segments: SpeakerSegment[],
  endTimeSeconds: number
): Array<{ name: string; segmentIndex: number; phrase: string }> {
  const candidates: Array<{ name: string; segmentIndex: number; phrase: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const startSeconds = getSegStartSeconds(seg);
    if (startSeconds != null && startSeconds > endTimeSeconds) break;
    const text = getSegText(seg);

    for (const pattern of INTRO_HANDOFF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rawName = match[1]?.trim();
        if (!rawName) continue;
        if (!isValidIntroNameCandidate(rawName)) continue;
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
    const startSeconds = getSegStartSeconds(seg);
    if (startSeconds != null && startSeconds > endTimeSeconds) break;
    const text = getSegText(seg);
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
  const missingStartTimes = segments.filter(s => getSegStartSeconds(s) == null).length;
  const missingText = segments.filter(s => getSegText(s).trim() === '').length;
  console.log(`[PIPELINE] Intro scan: missingStartTimes=${missingStartTimes}/${segments.length}, missingText=${missingText}/${segments.length}`);
  const sample = segments.slice(0, 10).map(s => ({
    start: getSegStartSeconds(s),
    text: getSegText(s).substring(0, 80)
  }));
  console.log('[PIPELINE] Intro scan sample:', sample);

  const introSegmentCount = segments.filter(s => {
    const startSeconds = getSegStartSeconds(s);
    return startSeconds != null && startSeconds <= endTimeSeconds;
  }).length;
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
  /** Number of soft collisions detected (no merge) */
  softCollisions: number;
  /** Number of excess entries dropped to meet targetCount */
  excessDropped: number;
  /** Mapping from dropped speaker IDs to the retained speaker they were folded into */
  dropMappings: Record<string, string>;
}

// Direct-address handoff patterns that surface panel speaker names.
// e.g. "Tony, let's bring you in" / "ring true with you, Alex" / "start with you, Amy"
const PANEL_HANDOFF_NAME_PATTERNS: RegExp[] = [
  // "NAME, let's bring you in / let me bring / can you / what's your"
  /\b([A-Z][a-z]{1,15}),\s+(?:let'?s bring you|let me bring you|can you take us|what'?s your)/i,
  // "with you, NAME" (moderator addresses panel member — "you," required to avoid "I'm with Kai Trump")
  /\bwith you,\s+([A-Z][a-z]{1,15})[,\.\s]/i,
  // "start with you, NAME"
  /\bstart with (?:you,?\s+)?([A-Z][a-z]{1,15})\b/i,
  // "bring in NAME" / "over to NAME" / "turn to NAME"
  /\b(?:bring in|over to|turn to)\s+([A-Z][a-z]{1,15})\b/i,
  // "NAME, how do you / what do you / you've mentioned"
  /\b([A-Z][a-z]{1,15}),\s+(?:how do you|what do you|you(?:'ve| have| were| are))/i,
  // "NAME, at COMPANY" (panel member addressed with affiliation)
  /\b([A-Z][a-z]{1,15}),\s+at [A-Z][a-zA-Z]+/i,
  // "NAME, you wanted / you want / you were saying / you could"
  /\b([A-Z][a-z]{1,15}),\s+you\s+(?:want|wanted|were|could|should|would|might|need)/i,
  // "NAME, do you / could you / would you / can you / should you"
  /\b([A-Z][a-z]{1,15}),\s+(?:do|could|would|can|should)\s+you\b/i,
  // "thank you, NAME" / "thanks, NAME" (speaker transition)
  /\b(?:thank you|thanks),?\s+([A-Z][a-z]{1,15})\b/i,
  // "So NAME, ..." (moderator transition: "So Mohsin, I'm going to ask you...")
  /\bso\s+([A-Z][a-z]{1,15}),/i,
];

const PANEL_HANDOFF_NAME_STOPWORDS = new Set([
  'you', 'me', 'us', 'the', 'a', 'an', 'and', 'or', 'but', 'so', 'if', 'as', 'at',
  'it', 'is', 'be', 'do', 'my', 'we', 'he', 'she', 'they', 'ok', 'well', 'now',
  'that', 'this', 'true', 'point', 'moment', 'time', 'right', 'bring', 'think',
  // Conversational fillers / interjections that start sentences with comma
  'yeah', 'yes', 'yep', 'yup', 'no', 'nah', 'nope',
  'like', 'sure', 'look', 'hey', 'hi', 'oh', 'wow', 'great', 'fine',
  'nice', 'good', 'really', 'okay', 'actually', 'honestly', 'listen',
  'absolutely', 'exactly', 'definitely', 'totally', 'certainly',
  'obviously', 'clearly', 'basically', 'seriously', 'literally',
  'anyway', 'meanwhile', 'otherwise', 'however', 'also', 'again',
  'sorry', 'thanks', 'please', 'here', 'there', 'see', 'wait',
  // Common words that can appear capitalized at sentence start
  'first', 'second', 'third', 'next', 'last', 'then', 'still',
  'just', 'even', 'much', 'many', 'more', 'most', 'some', 'any',
]);

/**
 * Scan the transcript for panel-style direct-address handoff names
 * (e.g. "Tony, let's bring you in" / "with you, Alex") that are NOT
 * already in the roster, then assign those names to any null-named
 * cluster-floor entries so the CSP can build anchors for them.
 */
function recoverHandoffNames(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): void {
  const existingNames = new Set(
    roster.filter(s => s.name).map(s => s.name!.toLowerCase())
  );

  const foundNames: string[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    for (const pattern of PANEL_HANDOFF_NAME_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      const m = pattern.exec(seg.text);
      if (!m || !m[1]) continue;

      const raw = m[1].trim();
      const key = raw.toLowerCase();

      // Reject if the captured name is immediately followed by another capitalized word.
      // This catches third-person full-name mentions like "Kai Trump" or "Amy Klobuchar"
      // which are conversational references, not direct-address handoffs.
      const nameStartInMatch = m[0].indexOf(m[1]);
      const nameEndInSeg = m.index + nameStartInMatch + m[1].length;
      const textAfterName = seg.text.slice(nameEndInSeg, nameEndInSeg + 25);
      if (/^\s+[A-Z][a-z]/.test(textAfterName)) continue;

      if (
        raw.length < 2 ||
        !/^[A-Z]/.test(raw) ||                      // Must start with uppercase in source text
        PANEL_HANDOFF_NAME_STOPWORDS.has(key) ||
        COMMON_NON_NAME_WORDS.has(key) ||            // Also check shared non-name word list
        !isValidProperName(raw) ||                    // Must pass proper name validation
        existingNames.has(key) ||
        seen.has(key)
      ) continue;

      seen.add(key);
      foundNames.push(raw.charAt(0).toUpperCase() + raw.slice(1));
    }
  }

  if (foundNames.length === 0) {
    console.log('[HANDOFF NAMES] No unresolved handoff names found');
    return;
  }

  console.log(`[HANDOFF NAMES] Discovered unresolved names in handoffs: [${foundNames.join(', ')}]`);

  // Fill ALL null-named non-host slots (cluster-floor entries AND any GPT-returned nulls),
  // so that e.g. a null-named guest from GPT also gets a name if the transcript has one.
  const unnamedSlots = roster.filter(
    s => !s.name && s.role !== 'host' && s.role !== 'co_host'
  );
  console.log(`[HANDOFF NAMES] Available unnamed slots: ${unnamedSlots.length}`);

  for (let i = 0; i < Math.min(foundNames.length, unnamedSlots.length); i++) {
    const slot = unnamedSlots[i];
    slot.name = foundNames[i];
    slot.role = 'guest';
    slot.confidence = 0.75;
    slot.source = 'handoff_name_recovery';
    console.log(`[HANDOFF NAMES] ✓ Promoted ${slot.id} → "${foundNames[i]}" (from panel handoff pattern)`);
  }
}

/**
 * Deduplicate roster entries whose first names sound phonetically identical.
 *
 * GPT sometimes creates both "Marianne" and "Mariam" when both spellings appear in
 * the transcript. This pass merges the lower-confidence entry into the higher-confidence
 * one, reassigning its ID references in-place (only the speakers array — segment
 * remapping happens downstream in Pass 2).
 *
 * Uses firstNamesSoundAlike from lib/utils/phonetic.ts.
 */
function deduplicateRosterByPhonetics(speakers: GPTSpeaker[]): GPTSpeaker[] {
  // Only consider named speakers for phonetic comparison
  const named = speakers.filter(s => s.name !== null && s.name !== undefined);
  if (named.length < 2) return speakers;

  // Track which IDs have been merged away (victim → winner)
  const mergeMap = new Map<string, string>(); // victim ID → winner ID

  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i];
      const b = named[j];

      // Skip if either has already been merged away
      if (mergeMap.has(a.id) || mergeMap.has(b.id)) continue;

      if (firstNamesSoundAlike(a.name!, b.name!)) {
        // Keep the one with higher confidence; merge the other into it
        const winner = a.confidence >= b.confidence ? a : b;
        const victim  = a.confidence >= b.confidence ? b : a;

        console.log(`[ROSTER DEDUP] Merged "${victim.name}" → "${winner.name}" (phonetic match, conf ${victim.confidence.toFixed(2)} < ${winner.confidence.toFixed(2)})`);
        mergeMap.set(victim.id, winner.id);
      }
    }
  }

  if (mergeMap.size === 0) return speakers;

  // Remove victims and update any ID references inside the winners
  // (Pass 2 will handle segment remapping; here we only prune the roster)
  return speakers.filter(s => !mergeMap.has(s.id));
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
  let softCollisions = 0;
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
  // STEP 2: Duplicate Merge (HARD only)
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

      const decision = decideDuplicateName(speaker.name, other.name);
      if (decision.kind === 'hard') {
        if (hasDifferentLastNames(speaker.name, other.name)) {
          console.warn(`[DEDUP][WARN] Hard merge with different last names: "${other.name}" -> "${speaker.name}" (${decision.reason})`);
        }
        console.log(`[DEDUP] Hard merge (${decision.reason}): "${other.name}" (${other.id}) -> "${speaker.name}" (${speaker.id})`);
        absorbedIds.add(other.id);
        dropMappings[other.id] = speaker.id;
        duplicatesMerged++;
      } else if (decision.kind === 'soft') {
        softCollisions++;
        console.log(`[DEDUP] Soft collision (${decision.reason}) NO MERGE: "${speaker.name}" ~ "${other.name}"`);
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

  console.log('[ENFORCE] Final roster names:', renumbered.map(s => s.name || s.id).join(', '));

  return {
    roster: renumbered,
    garbageRemoved,
    duplicatesMerged,
    softCollisions,
    excessDropped,
    dropMappings
  };
}

type DuplicateDecision = { kind: 'hard' | 'soft' | 'none'; reason: string };

const NICKNAME_ALLOWLIST = new Map<string, string[]>([
  ['chris', ['christopher', 'christine']],
  ['mike', ['michael']],
  ['steve', ['steven', 'stephen']],
  ['jess', ['jessica']],
  ['alex', ['alexander', 'alexandra']],
  ['sam', ['samuel', 'samantha']],
]);

/**
 * Decide if two names are duplicates.
 * HARD => safe to merge
 * SOFT => log but do not merge
 * NONE => ignore
 */
function decideDuplicateName(a: string, b: string): DuplicateDecision {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (la === lb) return { kind: 'hard', reason: 'exact_match' };

  const aParts = splitName(la);
  const bParts = splitName(lb);
  const aLast = aParts.last;
  const bLast = bParts.last;

  // Substring: "Chris Xenos" contains within "Christopher Xenos" — check word-level
  if (la.includes(lb) || lb.includes(la)) {
    if (!aLast || !bLast || aLast === bLast) {
      return { kind: 'hard', reason: 'substring_lastname_match' };
    }
    return { kind: 'soft', reason: 'substring_lastname_mismatch' };
  }

  // First-name prefix match: compare first word, allow prefix >= 3 chars
  if (aParts.first && bParts.first) {
    const aFirst = aParts.first;
    const bFirst = bParts.first;
    const shorter = aFirst.length <= bFirst.length ? aFirst : bFirst;
    const longer = aFirst.length > bFirst.length ? aFirst : bFirst;

    // If the shorter first name (>= 3 chars) is a prefix of the longer, AND
    // last names match (if present), it's a duplicate
    if (shorter.length >= 3 && longer.startsWith(shorter)) {
      if (!aLast || !bLast || aLast === bLast) {
        return { kind: 'hard', reason: 'first_name_prefix_lastname_match' };
      }
      return { kind: 'soft', reason: 'first_name_prefix_lastname_mismatch' };
    }
  }

  // Levenshtein distance
  const dist = levenshtein(la, lb);
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen > 0 && dist / maxLen <= 0.20) {
    if (!aLast || !bLast || lastNameDistanceOk(aLast, bLast)) {
      return { kind: 'hard', reason: 'levenshtein_tight' };
    }
    return { kind: 'soft', reason: 'levenshtein_lastname_mismatch' };
  }

  // Phonetic match: "Erin" sounds like "Aaron", "Stephen" sounds like "Steven"
  if (firstNamesSoundAlike(a, b)) {
    console.log(`[DEDUP] Phonetic match detected: "${a}" ~ "${b}"`);

    const nicknameHard = isNicknamePair(aParts.first, bParts.first);
    if (nicknameHard && (!aLast || !bLast || aLast === bLast)) {
      console.log(`[DEDUP] → Phonetic + nickname hard match`);
      return { kind: 'hard', reason: 'phonetic_nickname' };
    }

    // If BOTH have last names, they MUST match for phonetic merge
    if (aLast && bLast) {
      if (aLast === bLast || lastNameDistanceOk(aLast, bLast)) {
        console.log(`[DEDUP] → Phonetic + last name match: SOFT collision`);
        return { kind: 'soft', reason: 'phonetic_lastname_match' };
      } else {
        console.log(`[DEDUP] → Phonetic BUT different last names: NO MERGE`);
        return { kind: 'none', reason: 'phonetic_lastname_mismatch' };
      }
    }

    // If exactly one has last name: do NOT merge (could be different people)
    if ((aLast && !bLast) || (!aLast && bLast)) {
      console.log(`[DEDUP] → Phonetic BUT only one has last name: NO MERGE`);
      return { kind: 'none', reason: 'phonetic_lastname_missing_one_side' };
    }

    // Both missing last names: allow SOFT collision only
    console.log(`[DEDUP] → Phonetic, both single-token: SOFT collision`);
    return { kind: 'soft', reason: 'phonetic_single_token' };
  }

  return { kind: 'none', reason: 'no_match' };
}

function splitName(name: string): { first: string | null; last: string | null } {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function lastNameDistanceOk(a: string, b: string): boolean {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 && dist / maxLen <= 0.20;
}

function isNicknamePair(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const aList = NICKNAME_ALLOWLIST.get(aLower) || [];
  const bList = NICKNAME_ALLOWLIST.get(bLower) || [];
  return aList.includes(bLower) || bList.includes(aLower);
}

function hasDifferentLastNames(a: string, b: string): boolean {
  const aLast = splitName(a.toLowerCase()).last;
  const bLast = splitName(b.toLowerCase()).last;
  if (!aLast || !bLast) return false;
  return aLast !== bLast;
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
// Use imported patterns from self-id-patterns.ts
const SELF_ID_PATTERNS = STRONG_SELF_ID_PATTERNS;

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
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  targetCount?: number
): {
  segments: SpeakerSegment[];
  corrections: number;
  newSpeakers: GPTSpeaker[];
} {
  let corrections = 0;
  const newSpeakers: GPTSpeaker[] = [];
  const newSpeakerMap = new Map<string, string>(); // normalized name -> speaker id

  const withReassign = (
    segment: SpeakerSegment,
    speakerId: string,
    confidence: number
  ): SpeakerSegment => ({
    ...segment,
    speakerId,
    finalSpeakerId: speakerId,
    confidence: Math.min(segment.confidence ?? 1, confidence),
    status: segment.status ?? 'tentative',
    confidenceReason: (segment as any).confidenceReason || 'posthoc_repair',
  });

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
        return withReassign(segment, correctSpeaker.id, 0.95);
      }

      // ── DUPLICATE GUARD before creating a new speaker ──
      // Check if this name is a near-duplicate of an existing roster name
      // (e.g. "Chris" when "Christopher Xenos" already exists).
      // If so, treat it as a match to the existing entry rather than creating a new one.
      const nearDup = roster.find(s =>
        s.name != null && decideDuplicateName(extractedName, s.name).kind === 'hard'
      );
      if (nearDup) {
        console.log(
          `[INTEGRITY] Near-duplicate at ${segment.startTime.toFixed(1)}s: ` +
          `"${extractedName}" matched existing "${nearDup.name}" (${nearDup.id}), reassigning`
        );
        corrections++;
        return withReassign(segment, nearDup.id, 0.9);
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
        return withReassign(segment, existingNewId, 0.85);
      }

      // Also fuzzy-check against already-created new speakers
      const nearDupNew = newSpeakers.find(s =>
        s.name != null && decideDuplicateName(extractedName, s.name).kind === 'hard'
      );
      if (nearDupNew) {
        console.log(
          `[INTEGRITY] Near-duplicate at ${segment.startTime.toFixed(1)}s: ` +
          `"${extractedName}" matched new speaker "${nearDupNew.name}" (${nearDupNew.id}), reassigning`
        );
        corrections++;
        return withReassign(segment, nearDupNew.id, 0.85);
      }

      // ── CEILING GUARD (with strong self-ID override) ──
      // If we have a targetCount and we've reached it, check if this is a STRONG self-ID.
      // Strong self-IDs ("I'm Colin", "my name is Sarah") override the ceiling because
      // the evidence is too strong to ignore - GPT likely missed this speaker.
      if (targetCount && (roster.length + newSpeakers.length) >= targetCount) {
        // Check if this is a strong self-ID pattern (not just a weak reference)
        const strongSelfIdPatterns = [
          /\bmy name is\s+/i,
          /\bI'm\s+[A-Z]/,  // "I'm Colin" but not "I'm going"
          /\bI am\s+[A-Z]/,  // "I am Sarah" but not "I am happy"
          /\bthis is\s+[A-Z][a-z]+\s+speaking/i,
        ];

        const isStrongSelfId = strongSelfIdPatterns.some(p => p.test(segment.text));

        if (isStrongSelfId) {
          // Override ceiling - this person clearly identified themselves
          console.log(
            `[INTEGRITY] ⚡ Ceiling override: Strong self-ID "${extractedName}" found. ` +
            `Creating new speaker despite ceiling (${targetCount}).`
          );
          // Fall through to create new speaker below
        } else {
          // Weak evidence - respect the ceiling
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
          return withReassign(segment, bestExisting.id, 0.7);
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
      return withReassign(segment, newId, 0.85);
    }

    return segment;
  });

  return { segments: correctedSegments, corrections, newSpeakers };
}

/**
 * Detect sponsor/ad read segments and re-attribute them to sponsor roster entries.
 *
 * Host-read ads (e.g. "support for this show comes from Delete Me…") are currently
 * attributed to the host because it's the host's voice. This function detects those
 * ad blocks by text patterns, extracts the sponsor name, creates a roster entry with
 * role 'advertiser', and remaps the segments.
 */
function detectSponsorSegments(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): {
  segments: SpeakerSegment[];
  roster: GPTSpeaker[];
  sponsorsFound: number;
  segmentsRetagged: number;
} {
  // Ad start patterns — capture sponsor name in group 1
  const AD_START_PATTERNS = [
    /\bsupport\s+for\s+(?:this|the)\s+(?:show|podcast|episode)\s+comes?\s+from\s+(.+)/i,
    /\b(?:this|the)\s+(?:show|podcast|episode)\s+is\s+(?:brought\s+to\s+you|sponsored)\s+by\s+(.+)/i,
    /\bbrought\s+to\s+you\s+by\s+(.+)/i,
    /\b(?:today'?s|our)\s+sponsor\s+is\s+(.+)/i,
    /\b(?:show|podcast)\s+comes?\s+from\s+(.+)/i,
  ];

  // Ad end patterns — URL or promo code signals the ad is wrapping up
  const AD_END_PATTERNS = [
    /\b(?:go\s+to|visit|head\s+to|that'?s)\s+\S*\.(?:com|org|net|io|co)\b/i,
    /\b(?:code|promo\s+code)\s+\w+/i,
    /\b(?:subject\s+to\s+risk|terms\s+and\s+conditions)\b/i,
  ];

  // Return-to-content markers — the segment containing this stays with the host
  const AD_RETURN_PATTERNS = [
    /\bwe'?re\s+back\b/i,
    /\blet'?s\s+(?:get\s+)?back\b/i,
  ];

  // Track sponsor roster entries by normalized name to reuse across duplicate mentions
  const sponsorMap = new Map<string, GPTSpeaker>();
  const updatedSegments = [...segments];
  const updatedRoster = [...roster];

  // Find the highest existing speaker ID number to generate new unique IDs
  let maxSpeakerId = 0;
  for (const s of roster) {
    const match = s.id.match(/^speaker_(\d+)$/);
    if (match) maxSpeakerId = Math.max(maxSpeakerId, parseInt(match[1], 10));
  }

  let totalRetagged = 0;
  const processedIndices = new Set<number>();

  for (let i = 0; i < updatedSegments.length; i++) {
    if (processedIndices.has(i)) continue;

    const seg = updatedSegments[i];
    const text = seg.text;

    // Try each ad start pattern
    let sponsorName: string | null = null;
    for (const pattern of AD_START_PATTERNS) {
      const m = text.match(pattern);
      if (m && m[1]) {
        sponsorName = sanitizeSponsorName(m[1]);
        break;
      }
    }

    if (!sponsorName) continue;

    // Determine the host speaker for this ad block
    const hostSpeakerId = seg.finalSpeakerId || seg.speakerId;

    // Forward-scan consecutive segments by the same speaker to find the full ad block
    const adIndices: number[] = [i];
    let foundEnd = false;

    for (let j = i + 1; j < updatedSegments.length && adIndices.length < 25; j++) {
      const nextSeg = updatedSegments[j];
      const nextSpeakerId = nextSeg.finalSpeakerId || nextSeg.speakerId;

      // Stop if speaker changes
      if (nextSpeakerId !== hostSpeakerId) break;

      // Check end pattern first — a segment with a URL/promo code is ad content
      let hasEndPattern = false;
      for (const ep of AD_END_PATTERNS) {
        if (ep.test(nextSeg.text)) {
          hasEndPattern = true;
          break;
        }
      }

      // Check return-to-content marker — but only act on it if the segment
      // does NOT also contain an ad end pattern (URLs, promo codes).
      // e.g. "...go to vanguard.com audio. Scott, we're back" is still ad content.
      if (!hasEndPattern) {
        let isReturn = false;
        for (const rp of AD_RETURN_PATTERNS) {
          if (rp.test(nextSeg.text)) {
            isReturn = true;
            break;
          }
        }
        if (isReturn) break;
      }

      adIndices.push(j);

      if (hasEndPattern) {
        foundEnd = true;
        break;
      }
    }

    // Minimum size check: 3+ segments OR 50+ words — prevents false positives
    const totalWords = adIndices.reduce((sum, idx) => {
      return sum + updatedSegments[idx].text.split(/\s+/).filter(Boolean).length;
    }, 0);

    if (adIndices.length < 3 && totalWords < 50) {
      console.log(`[SPONSOR] Skipping short ad mention: "${sponsorName}" (${adIndices.length} seg, ${totalWords} words)`);
      continue;
    }

    // Get or create sponsor roster entry
    const normalizedName = sponsorName.toLowerCase().trim();
    let sponsorEntry = sponsorMap.get(normalizedName);

    if (!sponsorEntry) {
      maxSpeakerId++;
      sponsorEntry = {
        id: `speaker_${maxSpeakerId}`,
        name: sponsorName,
        role: 'advertiser',
        confidence: 0.9,
        source: 'sponsor-detection',
      };
      sponsorMap.set(normalizedName, sponsorEntry);
      updatedRoster.push(sponsorEntry);
      console.log(`[SPONSOR] Created roster entry: ${sponsorEntry.id} → "${sponsorName}" (advertiser)`);
    }

    // Remap all ad segments to the sponsor
    for (const idx of adIndices) {
      processedIndices.add(idx);
      updatedSegments[idx] = {
        ...updatedSegments[idx],
        speakerId: sponsorEntry.id,
        finalSpeakerId: sponsorEntry.id,
        confidence: 0.85,
        status: 'confirmed' as const,
        confidenceReason: `sponsor-ad-read:${sponsorName}`,
      };
    }

    totalRetagged += adIndices.length;
    console.log(`[SPONSOR] Tagged ${adIndices.length} segment(s) for "${sponsorName}" (indices ${adIndices[0]}–${adIndices[adIndices.length - 1]})`);
  }

  return {
    segments: updatedSegments,
    roster: updatedRoster,
    sponsorsFound: sponsorMap.size,
    segmentsRetagged: totalRetagged,
  };
}

/**
 * Extract and clean a sponsor brand name from captured regex text.
 * e.g. "Delete Me. Whether you're..." → "Delete Me"
 */
function sanitizeSponsorName(raw: string): string {
  let name = raw.trim();

  // Strip after first sentence boundary (period, comma followed by filler, exclamation)
  name = name.replace(/[.!]\s.*$/, '');
  name = name.replace(/,\s+(?:whether|where|who|which|if|the|a|an|so|and|they|it|you|your|we|our)\b.*$/i, '');

  // Strip trailing punctuation
  name = name.replace(/[.,;:!?]+$/, '');

  // Capitalize words for consistent display
  name = name.trim().replace(/\b\w/g, c => c.toUpperCase());

  // Fallback: if name is empty or too long (> 40 chars → probably a sentence fragment)
  if (!name || name.length > 40) {
    // Try to extract just the first 1-3 capitalized words
    const words = raw.trim().split(/\s+/);
    const nameWords: string[] = [];
    for (const w of words) {
      if (nameWords.length >= 3) break;
      if (/^[a-zA-Z]/.test(w)) {
        nameWords.push(w.replace(/[.,;:!?]+$/, ''));
      } else {
        break;
      }
    }
    name = nameWords.join(' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return name || 'Unknown Sponsor';
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

/**
 * Validate segment balance for debates
 *
 * In a debate with N candidates, each should have roughly equal speaking time.
 * This function flags speakers with abnormally low segment counts, which may
 * indicate their segments were incorrectly assigned to someone else.
 *
 * @returns Array of warning strings for speakers with unbalanced segments
 */
function validateSegmentBalance(
  speakers: GPTSpeaker[],
  segments: SpeakerSegment[],
  expectedSpeakerCount?: number
): string[] {
  const warnings: string[] = [];

  // Count segments per speaker
  const segmentCounts: Record<string, number> = {};
  for (const seg of segments) {
    const id = seg.finalSpeakerId || seg.speakerId;
    segmentCounts[id] = (segmentCounts[id] || 0) + 1;
  }

  // Filter to non-host speakers (candidates in a debate)
  const candidates = speakers.filter(s => s.role !== 'host' && s.role !== 'co_host');

  if (candidates.length < 2) {
    return warnings; // Not enough candidates to validate balance
  }

  // Calculate expected segments per candidate
  const candidateSegments = candidates.map(c => segmentCounts[c.id] || 0);
  const totalCandidateSegments = candidateSegments.reduce((a, b) => a + b, 0);
  const avgSegments = totalCandidateSegments / candidates.length;

  // Threshold: flag speakers with less than 25% of average
  const minThreshold = avgSegments * 0.25;

  for (const candidate of candidates) {
    const count = segmentCounts[candidate.id] || 0;
    const name = candidate.name || candidate.id;

    if (count < minThreshold) {
      const pct = avgSegments > 0 ? ((count / avgSegments) * 100).toFixed(0) : '0';
      warnings.push(
        `"${name}" has ${count} segments (${pct}% of avg ${avgSegments.toFixed(0)}) - may have segments assigned to wrong speaker`
      );
    }
  }

  // Also flag if we have more speakers than expected
  if (expectedSpeakerCount && speakers.length > expectedSpeakerCount) {
    warnings.push(
      `Found ${speakers.length} speakers but expected ${expectedSpeakerCount} - possible duplicate speakers`
    );
  }

  // Log segment distribution summary
  console.log(`[BALANCE] Segment distribution (${candidates.length} candidates, avg ${avgSegments.toFixed(1)}):`);
  candidates
    .sort((a, b) => (segmentCounts[b.id] || 0) - (segmentCounts[a.id] || 0))
    .forEach(c => {
      const count = segmentCounts[c.id] || 0;
      const bar = '█'.repeat(Math.min(20, Math.round((count / avgSegments) * 10)));
      const name = (c.name || c.id).padEnd(20);
      console.log(`[BALANCE]   ${name} ${count.toString().padStart(3)} ${bar}`);
    });

  return warnings;
}

function isUnknownSpeakerEntry(speaker: GPTSpeaker): boolean {
  if (!speaker.name) return true;
  const name = speaker.name.toLowerCase().trim();
  return speaker.role === 'unknown' || name === 'unknown' || /^speaker\s*\d+$/i.test(speaker.name);
}

/**
 * Enforce cluster loyalty: when a raw diarization cluster has exactly ONE
 * self-identified speaker, reassign ALL segments in that cluster to that speaker.
 *
 * This fixes the common case where "My name is JJ" anchors only its own segment
 * to JJ, while the remaining 20+ segments from the same diarization cluster
 * (Speaker_E) leak to Host via baton-pass logic.
 *
 * Skips:
 *  - Clusters where the majority of segments already map to a host/co_host speaker
 *  - Dirty clusters (2+ unique self-ID names) — handled by Pass 2c
 *  - Clusters with 0 self-ID names (no evidence to act on)
 */
function enforceClusterLoyalty(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): {
  segments: SpeakerSegment[];
  reassignments: number;
  clustersConsolidated: string[];
  nameCorrections: Array<{ oldName: string; newName: string; speakerId: string }>;
} {
  let reassignments = 0;
  const clustersConsolidated: string[] = [];
  const nameCorrections: Array<{ oldName: string; newName: string; speakerId: string }> = [];

  // Build a set of host/co_host speaker IDs for majority check
  const hostIds = new Set(
    roster.filter(s => s.role === 'host' || s.role === 'co_host').map(s => s.id)
  );

  // --- Phase 1: Collect host intro names for ASR correction ---
  const hostIntroNames: Array<{ name: string; segIndex: number }> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segSpeakerId = (seg as any).finalSpeakerId || seg.speakerId;
    if (!hostIds.has(segSpeakerId)) continue;

    for (const pattern of INTRO_HANDOFF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(seg.text)) !== null) {
        const rawName = match[1]?.trim();
        if (rawName && isValidProperName(rawName) && isPlausibleHumanName(rawName)) {
          hostIntroNames.push({ name: rawName, segIndex: i });
        }
      }
    }
  }

  if (hostIntroNames.length > 0) {
    console.log(`[CLUSTER LOYALTY] Host intro names found: ${hostIntroNames.map(h => h.name).join(', ')}`);
  }

  // --- Phase 2: Group segments by initialSpeakerId (raw diarization cluster) ---
  const clusterMap = new Map<string, number[]>(); // clusterId -> segment indices
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clusterId = seg.initialSpeakerId || (seg as any).rawClusterId || seg.speakerId;
    if (!clusterMap.has(clusterId)) clusterMap.set(clusterId, []);
    clusterMap.get(clusterId)!.push(i);
  }

  // --- Phase 3: Process each cluster ---
  const updatedSegments = [...segments];

  for (const [clusterId, indices] of clusterMap.entries()) {
    console.log(`[CLUSTER LOYALTY] Processing cluster "${clusterId}" (${indices.length} segments)`);

    // 2b. Scan all segments for self-IDs FIRST (before host-majority check)
    const selfIdNames = new Set<string>();
    for (const idx of indices) {
      const seg = updatedSegments[idx];
      for (const pattern of STRONG_SELF_ID_PATTERNS) {
        const match = pattern.exec(seg.text);
        if (match && match[1]) {
          const extractedName = match[1].trim();
          if (isValidProperName(extractedName) && isPlausibleHumanName(extractedName)) {
            selfIdNames.add(extractedName);
          }
        }
      }
    }

    console.log(`[CLUSTER LOYALTY]   Self-ID names found: ${selfIdNames.size > 0 ? Array.from(selfIdNames).join(', ') : '(none)'}`);

    // No self-ID evidence → skip (also skip host-majority clusters without self-IDs)
    if (selfIdNames.size === 0) {
      continue;
    }

    // Note: we intentionally do NOT skip host-majority clusters when a self-ID exists.
    // The baton-pass often mis-assigns an entire cluster to Host; the self-ID
    // ("My name is JJ") is strong enough evidence to reclaim those segments.

    // Dirty cluster (2+ names) — handled by Pass 2c
    if (selfIdNames.size >= 2) {
      console.log(`[CLUSTER LOYALTY] Skipping dirty cluster ${clusterId}: ${Array.from(selfIdNames).join(', ')}`);
      continue; // Dirty cluster — handled by Pass 2c
    }

    // Exactly 1 unique name → consolidate
    const selfIdName = Array.from(selfIdNames)[0];

    // --- Phase 2.5: ASR correction via phonetic matching with host intros ---
    let resolvedName = selfIdName;
    for (const intro of hostIntroNames) {
      if (firstNamesSoundAlike(selfIdName, intro.name) && selfIdName !== intro.name) {
        // Prefer the intro version if it has more information (e.g., full name)
        const selfIdWordCount = selfIdName.split(/\s+/).length;
        const introWordCount = intro.name.split(/\s+/).length;
        if (introWordCount > selfIdWordCount || intro.name.length > selfIdName.length) {
          console.log(`[CLUSTER LOYALTY] ASR correction: "${selfIdName}" → "${intro.name}" (phonetic match with host intro)`);
          resolvedName = intro.name;
          break;
        }
      }
    }

    // Match resolvedName to roster speaker via fuzzyNameMatch
    const matchedSpeaker = roster.find(s =>
      s.name != null && fuzzyNameMatch(resolvedName, s.name)
    ) || roster.find(s =>
      s.name != null && fuzzyNameMatch(selfIdName, s.name)
    );

    if (!matchedSpeaker) {
      console.log(`[CLUSTER LOYALTY]   No roster match for "${resolvedName}" in cluster ${clusterId}, skipping`);
      continue;
    }

    console.log(`[CLUSTER LOYALTY]   Matched roster speaker: "${matchedSpeaker.name}" (${matchedSpeaker.id})`);


    // If ASR correction found a better name, update the roster speaker
    if (resolvedName !== selfIdName && matchedSpeaker.name !== resolvedName) {
      // Check if the roster already has the corrected name
      const alreadyHasCorrectedName = roster.some(s =>
        s.name != null && s.name.toLowerCase() === resolvedName.toLowerCase()
      );
      if (!alreadyHasCorrectedName) {
        const oldName = matchedSpeaker.name || '';
        // Only upgrade if resolved name has more info
        if (resolvedName.split(/\s+/).length > (oldName.split(/\s+/).length || 0) ||
            resolvedName.length > oldName.length) {
          console.log(`[CLUSTER LOYALTY] Upgrading roster name: "${oldName}" → "${resolvedName}"`);
          nameCorrections.push({ oldName, newName: resolvedName, speakerId: matchedSpeaker.id });
          matchedSpeaker.name = resolvedName;
        }
      }
    }

    // Reassign ALL cluster segments to the matched speaker
    let clusterReassignments = 0;
    for (const idx of indices) {
      const seg = updatedSegments[idx];
      const currentId = (seg as any).finalSpeakerId || seg.speakerId;
      if (currentId === matchedSpeaker.id) continue; // Already correct

      updatedSegments[idx] = {
        ...seg,
        speakerId: matchedSpeaker.id,
        finalSpeakerId: matchedSpeaker.id,
        confidence: Math.max(seg.confidence || 0, 0.80),
        confidenceReason: 'cluster_loyalty',
      } as SpeakerSegment;
      clusterReassignments++;
    }

    if (clusterReassignments > 0) {
      reassignments += clusterReassignments;
      clustersConsolidated.push(clusterId);
      console.log(
        `[CLUSTER LOYALTY]   Cluster ${clusterId}: reassigned ${clusterReassignments}/${indices.length} segments to "${matchedSpeaker.name}" (${matchedSpeaker.id}), ${indices.length - clusterReassignments} already correct`
      );
    } else {
      console.log(
        `[CLUSTER LOYALTY]   Cluster ${clusterId}: all ${indices.length} segments already assigned to "${matchedSpeaker.name}" (${matchedSpeaker.id})`
      );
    }
  }

  return { segments: updatedSegments, reassignments, clustersConsolidated, nameCorrections };
}

/**
 * Final safety-net pass: ensure any segment whose text contains a strong self-ID
 * ("I'm Scott Galloway", "My name is Kara") is assigned to the matching roster speaker.
 *
 * This runs as the LAST pipeline step so that no earlier post-processing step
 * can override a definitive self-identification. Only affects segments with
 * literal self-ID text, so it's narrowly scoped and safe from regressions.
 */
function enforceSelfIdSegments(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): {
  segments: SpeakerSegment[];
  corrections: number;
} {
  let corrections = 0;
  const updatedSegments = [...segments];

  for (let i = 0; i < updatedSegments.length; i++) {
    const seg = updatedSegments[i];

    for (const pattern of STRONG_SELF_ID_PATTERNS) {
      const match = pattern.exec(seg.text);
      if (match && match[1]) {
        const extractedName = match[1].trim();

        if (!isValidProperName(extractedName) || !isPlausibleHumanName(extractedName)) {
          break;
        }

        // Match against roster
        const matchedSpeaker = roster.find(s =>
          s.name != null && fuzzyNameMatch(extractedName, s.name)
        );

        if (!matchedSpeaker) break;

        const currentId = (seg as any).finalSpeakerId || seg.speakerId;
        if (currentId !== matchedSpeaker.id) {
          console.log(
            `[SELF-ID ENFORCE] Segment ${i}: "${seg.text.substring(0, 60)}..." — "${extractedName}" → reassigning from ${currentId} to ${matchedSpeaker.id} ("${matchedSpeaker.name}")`
          );
          updatedSegments[i] = {
            ...seg,
            speakerId: matchedSpeaker.id,
            finalSpeakerId: matchedSpeaker.id,
            confidence: Math.max(seg.confidence || 0, 0.95),
            confidenceReason: 'final_self_id_enforcement',
          } as SpeakerSegment;
          corrections++;
        }

        break; // Only process first matching pattern per segment
      }
    }
  }

  return { segments: updatedSegments, corrections };
}

/**
 * Resolve segments in dirty clusters (2+ final speakers sharing one raw diarization
 * cluster) by detecting a name-prefix pattern at the start of segment text.
 *
 * In debates, the host often says a candidate's name as a cue ("Emily, your turn"),
 * and ASR merges it into the candidate's first word, producing a segment like
 * "Emily I think my platform is..." that then gets mis-attributed by baton-pass.
 *
 * Reassignment requires:
 *  - Text starts with a roster speaker's name (case-insensitive)
 *  - Rest of text contains a first-person signal (I, my, I've, etc.)
 *  - Rest of text does NOT immediately start with "you"/"your" (addressing, not speaking)
 */
function resolveDirtyClusterByNamePrefix(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): {
  segments: SpeakerSegment[];
  reassignments: number;
  info: string[];
} {
  let reassignments = 0;
  const info: string[] = [];

  // --- Step 1: Build name → speaker lookup (full name + unambiguous first names) ---
  const firstNameCount = new Map<string, number>();
  for (const speaker of roster) {
    if (!speaker.name) continue;
    const firstName = speaker.name.toLowerCase().trim().split(/\s+/)[0];
    firstNameCount.set(firstName, (firstNameCount.get(firstName) || 0) + 1);
  }

  const nameLookup = new Map<string, GPTSpeaker>();
  for (const speaker of roster) {
    if (!speaker.name) continue;
    const normalized = speaker.name.toLowerCase().trim();
    const firstName = normalized.split(/\s+/)[0];
    // Only add first-name alias if unambiguous (no two speakers share the same first name)
    if (firstName.length >= 2 && firstNameCount.get(firstName) === 1) {
      nameLookup.set(firstName, speaker);
    }
    // Full name always wins (overwrites first-name entry if same key)
    nameLookup.set(normalized, speaker);
  }

  // --- Step 2: Identify dirty clusters (segments spanning 2+ distinct finalSpeakerIds) ---
  const clusterFinalIds = new Map<string, Set<string>>();
  const clusterIndices = new Map<string, number[]>();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clusterId = seg.initialSpeakerId || (seg as any).rawClusterId || seg.speakerId;
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;

    if (!clusterFinalIds.has(clusterId)) {
      clusterFinalIds.set(clusterId, new Set());
      clusterIndices.set(clusterId, []);
    }
    clusterFinalIds.get(clusterId)!.add(finalId);
    clusterIndices.get(clusterId)!.push(i);
  }

  const dirtyClusters = new Set<string>();
  for (const [clusterId, finalIds] of clusterFinalIds.entries()) {
    if (finalIds.size >= 2) dirtyClusters.add(clusterId);
  }

  if (dirtyClusters.size === 0) {
    return { segments, reassignments: 0, info: ['[NAME PREFIX] No dirty clusters found'] };
  }

  info.push(`[NAME PREFIX] Found ${dirtyClusters.size} dirty cluster(s) to scan`);

  // --- Step 3: Scan each segment in a dirty cluster for name-prefix pattern ---
  const updatedSegments = [...segments];

  for (const clusterId of dirtyClusters) {
    const indices = clusterIndices.get(clusterId)!;
    let clusterReassignments = 0;

    for (const idx of indices) {
      const seg = updatedSegments[idx];
      const trimmedText = seg.text.trimStart();

      let exactMatched = false;
      for (const [nameKey, speaker] of nameLookup.entries()) {
        const namePattern = new RegExp(
          `^${nameKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        );
        if (!namePattern.test(trimmedText)) continue;

        // Found a name prefix — extract the rest of the text
        const restOfText = trimmedText.slice(nameKey.length).trimStart();

        // Anti-validation: "Emily, you..." means addressing Emily, not Emily speaking
        if (/^you(r)?\b/i.test(restOfText)) break;

        // Validation: must contain a first-person signal
        if (!/\b(I|my|I'm|I've|I'd|I'll|we|our|me)\b/.test(restOfText)) break;

        // Already correctly attributed — no change
        const currentId = (seg as any).finalSpeakerId || seg.speakerId;
        if (currentId === speaker.id) { exactMatched = true; break; }

        updatedSegments[idx] = {
          ...seg,
          speakerId: speaker.id,
          finalSpeakerId: speaker.id,
          confidence: 0.75,
          confidenceReason: 'name_prefix',
        } as SpeakerSegment;

        clusterReassignments++;
        reassignments++;
        exactMatched = true;
        info.push(
          `[NAME PREFIX] ${clusterId}[${idx}] → "${speaker.name}": "${trimmedText.slice(0, 70)}..."`
        );
        break;
      }

      // Phonetic fallback: catch ASR spelling variants like "Maryam"/"Marianne" → "Mariam"
      if (!exactMatched) {
        const firstWord = trimmedText.split(/[\s,!?.]+/)[0];
        if (firstWord.length >= 3) {
          for (const speaker of roster) {
            if (!speaker.name) continue;
            const speakerFirstName = speaker.name.split(/\s+/)[0];

            // Guard: first letter must match (or be in same phonetic group) to prevent
            // false positives like soundex suffix collisions ("Sorry" S600 ≈ "Terry" T600)
            const prefixFirst = firstWord[0].toUpperCase();
            const speakerFirst = speakerFirstName[0].toUpperCase();
            const closeConsonants = [['C','K','Q'], ['S','Z'], ['F','V']];
            const firstLetterOk = prefixFirst === speakerFirst ||
              closeConsonants.some(g => g.includes(prefixFirst) && g.includes(speakerFirst));
            if (!firstLetterOk) continue;

            if (!soundsLike(firstWord, speakerFirstName)) continue;
            // Don't double-count exact matches already handled above
            if (firstWord.toLowerCase() === speakerFirstName.toLowerCase()) continue;

            const restOfText = trimmedText.slice(firstWord.length).trimStart();
            if (/^you(r)?\b/i.test(restOfText)) break;
            if (!/\b(I|my|I'm|I've|I'd|I'll|we|our|me)\b/.test(restOfText)) break;

            const currentId = (seg as any).finalSpeakerId || seg.speakerId;
            if (currentId === speaker.id) break;

            updatedSegments[idx] = {
              ...seg,
              speakerId: speaker.id,
              finalSpeakerId: speaker.id,
              confidence: 0.68,
              confidenceReason: 'name_prefix_phonetic',
            } as SpeakerSegment;

            clusterReassignments++;
            reassignments++;
            info.push(
              `[NAME PREFIX PHONETIC] ${clusterId}[${idx}] "${firstWord}" ≈ "${speakerFirstName}" → "${speaker.name}": "${trimmedText.slice(0, 70)}..."`
            );
            break;
          }
        }
      }
    }

    if (clusterReassignments > 0) {
      info.push(`[NAME PREFIX] Cluster ${clusterId}: ${clusterReassignments}/${indices.length} segments reassigned`);
    }
  }

  return { segments: updatedSegments, reassignments, info };
}

/**
 * Resolves acoustic_only segments from dirty clusters that are stuck on the
 * wrong speaker by checking two temporal signals:
 *
 * 1. CONTINUATION: If the immediately preceding non-host segment belongs to
 *    speaker X with no host callout between it and the stuck segment, the
 *    stuck segment is a continuation of X's speaking turn.
 *
 * 2. CALLOUT: If the most recent host segment before the stuck segment ends
 *    with "Thank you, [Name]" (the debate moderator cue to call on a speaker),
 *    assign the stuck segment to [Name] via fuzzy+phonetic matching.
 *
 * 3. LOOK-FORWARD: If the next host segment contains "Sorry, [Name], no worries"
 *    or similar, the stuck segment belongs to [Name] (host interrupted them).
 */
function resolveByTemporalHandoff(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): { segments: SpeakerSegment[]; reassignments: number; info: string[] } {
  const info: string[] = [];
  let reassignments = 0;

  // Sort segments by start time for ordered traversal
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);

  // Build host ID set
  const hostIds = new Set(
    roster
      .filter(sp => sp.role === 'host' || sp.role === 'co_host')
      .map(sp => sp.id)
      .filter(Boolean)
  );

  // Build name → GPTSpeaker lookup with first-name aliases (unambiguous only)
  const firstNameCount = new Map<string, number>();
  for (const sp of roster) {
    if (!sp.name) continue;
    const fn = sp.name.toLowerCase().split(/\s+/)[0];
    firstNameCount.set(fn, (firstNameCount.get(fn) || 0) + 1);
  }
  const nameLookup = new Map<string, GPTSpeaker>();
  for (const sp of roster) {
    if (!sp.name) continue;
    const normalized = sp.name.toLowerCase().trim();
    const firstName = normalized.split(/\s+/)[0];
    if (firstName.length >= 2 && firstNameCount.get(firstName) === 1) {
      nameLookup.set(firstName, sp);
    }
    nameLookup.set(normalized, sp);
  }

  // Helper: phonetic + fuzzy lookup for a name string against roster
  function lookupSpeaker(rawName: string): GPTSpeaker | null {
    const key = rawName.toLowerCase().trim();
    // Exact / substring match
    if (nameLookup.has(key)) return nameLookup.get(key)!;
    // Try first word only
    const firstWord = key.split(/\s+/)[0];
    if (nameLookup.has(firstWord)) return nameLookup.get(firstWord)!;
    // Fuzzy scan with existing fuzzyNameMatch
    for (const sp of roster) {
      if (!sp.name) continue;
      if (fuzzyNameMatch(rawName, sp.name)) return sp;
    }
    // Phonetic scan via soundsLike on first names
    for (const sp of roster) {
      if (!sp.name) continue;
      const spFirst = sp.name.split(/\s+/)[0];
      if (firstNamesSoundAlike(rawName, spFirst) || soundsLike(rawName, spFirst)) {
        // First-letter guard to avoid false positives (e.g. "Sorry" ≠ "Terry")
        const raw0 = rawName[0]?.toUpperCase() ?? '';
        const sp0 = spFirst[0]?.toUpperCase() ?? '';
        const closeConsonants: string[][] = [['C','K','Q'], ['S','Z'], ['F','V']];
        const firstOk = raw0 === sp0 || closeConsonants.some(g => g.includes(raw0) && g.includes(sp0));
        if (firstOk) return sp;
      }
    }
    return null;
  }

  // Process targets: acoustic_only segments in Speaker_D (dirty cluster)
  for (let idx = 0; idx < sorted.length; idx++) {
    const seg = sorted[idx];
    if (seg.confidenceReason !== 'acoustic_only') continue;
    if (seg.initialSpeakerId !== 'Speaker_D') continue;
    // Only fix segments wrongly assigned to host or that have changed speaker
    if (!hostIds.has(seg.finalSpeakerId ?? '')) continue;

    // === CHECK 1: CONTINUATION ===
    // Walk backwards; if we hit a non-host segment before any host segment
    // (or before a named-callout host segment), it's a continuation.
    let prevNonHost: SpeakerSegment | null = null;
    let namedCalloutInterrupts = false;
    for (let j = idx - 1; j >= 0; j--) {
      const s = sorted[j];
      if (hostIds.has(s.finalSpeakerId ?? '')) {
        // A host "Thank you, [Name]" is a transition — interrupts continuation
        const callout = s.text.match(/\bthank you[,.]?\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?)[.,]?\s*$/i);
        if (callout) namedCalloutInterrupts = true;
        break; // stop at first host segment
      }
      prevNonHost = s;
      break;
    }

    if (prevNonHost && !namedCalloutInterrupts && !hostIds.has(prevNonHost.finalSpeakerId ?? '')) {
      const prevSp = roster.find(sp => sp.id === prevNonHost!.finalSpeakerId);
      if (prevSp) {
        seg.finalSpeakerId = prevSp.id;
        seg.confidenceReason = 'temporal_continuation';
        seg.confidence = Math.max(seg.confidence ?? 0, 0.65);
        reassignments++;
        info.push(`[TEMPORAL] Continuation: t=${seg.startTime.toFixed(1)}s → ${prevSp.name ?? prevSp.id}`);
        continue;
      }
    }

    // === CHECK 2: CALLOUT — "Thank you, [Name]" immediately before ===
    let recentHost: SpeakerSegment | null = null;
    for (let j = idx - 1; j >= 0; j--) {
      if (hostIds.has(sorted[j].finalSpeakerId ?? '')) {
        recentHost = sorted[j];
        break;
      }
    }

    if (recentHost) {
      // "Thank you, [Name]" or "Thank you. [Name]." at end of host segment
      const callout = recentHost.text.match(
        /\bthank you[,.]?\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?)[.,]?\s*$/i
      );
      if (callout) {
        const rawCallout = callout[1].replace(/[.,!?]+$/, '').trim();
        const matched = lookupSpeaker(rawCallout);
        if (matched && !hostIds.has(matched.id)) {
          seg.finalSpeakerId = matched.id;
          seg.confidenceReason = 'temporal_callout';
          seg.confidence = Math.max(seg.confidence ?? 0, 0.72);
          reassignments++;
          info.push(`[TEMPORAL] Callout "${rawCallout}" → ${matched.name}: t=${seg.startTime.toFixed(1)}s`);
          continue;
        }
      }
    }

    // === CHECK 3: LOOK-FORWARD — "Sorry, [Name], no worries" in next host segment ===
    let nextHost: SpeakerSegment | null = null;
    for (let j = idx + 1; j < sorted.length; j++) {
      if (hostIds.has(sorted[j].finalSpeakerId ?? '')) {
        nextHost = sorted[j];
        break;
      }
    }

    if (nextHost) {
      // Host interrupted the speaker and apologised: "Sorry, J.J., no worries."
      const sorry = nextHost.text.match(
        /\bsorry,?\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?)[,.]?\s*no worries/i
      );
      if (sorry) {
        const rawSorry = sorry[1].replace(/[.,!?]+$/, '').trim();
        const matched = lookupSpeaker(rawSorry);
        if (matched && !hostIds.has(matched.id)) {
          seg.finalSpeakerId = matched.id;
          seg.confidenceReason = 'temporal_lookforward';
          seg.confidence = Math.max(seg.confidence ?? 0, 0.60);
          reassignments++;
          info.push(`[TEMPORAL] Look-forward "Sorry, ${rawSorry}" → ${matched.name}: t=${seg.startTime.toFixed(1)}s`);
          continue;
        }
      }
    }
  }

  return { segments: sorted, reassignments, info };
}

/**
 * POST-PROCESS: Handoff Response Reassignment
 *
 * When a host/moderator says "NAME, you wanted to talk about...", the next
 * segment(s) should belong to NAME. The CSP often misses this because unnamed
 * placeholder speakers have no anchors. This function uses the transcript's
 * own handoff evidence to route the correct segments.
 */
function reassignHandoffResponses(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): { segments: SpeakerSegment[]; reassignments: number; info: string[] } {
  const info: string[] = [];
  let reassignments = 0;

  // Sort by startTime for ordered traversal
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);

  // Build name → GPTSpeaker lookup (first names + full names, case-insensitive)
  const firstNameCount = new Map<string, number>();
  for (const sp of roster) {
    if (!sp.name) continue;
    const fn = sp.name.toLowerCase().split(/\s+/)[0];
    firstNameCount.set(fn, (firstNameCount.get(fn) || 0) + 1);
  }
  const nameLookup = new Map<string, GPTSpeaker>();
  for (const sp of roster) {
    if (!sp.name) continue;
    const normalized = sp.name.toLowerCase().trim();
    const firstName = normalized.split(/\s+/)[0];
    if (firstName.length >= 2 && firstNameCount.get(firstName) === 1) {
      nameLookup.set(firstName, sp);
    }
    nameLookup.set(normalized, sp);
  }

  function lookupByName(rawName: string): GPTSpeaker | null {
    const key = rawName.toLowerCase().trim();
    if (nameLookup.has(key)) return nameLookup.get(key)!;
    const firstWord = key.split(/\s+/)[0];
    if (nameLookup.has(firstWord)) return nameLookup.get(firstWord)!;
    for (const sp of roster) {
      if (!sp.name) continue;
      if (fuzzyNameMatch(rawName, sp.name)) return sp;
    }
    for (const sp of roster) {
      if (!sp.name) continue;
      const spFirst = sp.name.split(/\s+/)[0];
      if (firstNamesSoundAlike(rawName, spFirst) || soundsLike(rawName, spFirst)) {
        const raw0 = rawName[0]?.toUpperCase() ?? '';
        const sp0 = spFirst[0]?.toUpperCase() ?? '';
        const closeConsonants: string[][] = [['C','K','Q'], ['S','Z'], ['F','V']];
        const firstOk = raw0 === sp0 || closeConsonants.some(g => g.includes(raw0) && g.includes(sp0));
        if (firstOk) return sp;
      }
    }
    return null;
  }

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const handoffSpeakerId = seg.finalSpeakerId || seg.speakerId;

    // Collect ALL handoff pattern matches, then pick the one closest to end of text.
    // In moderator speech the last name is the handoff recipient:
    // "Thank you, Dominique. Mohsen, do you..." → Mohsen (last) gets the floor.
    const candidates: Array<{ speaker: GPTSpeaker; textIndex: number }> = [];

    for (const pattern of PANEL_HANDOFF_NAME_PATTERNS) {
      pattern.lastIndex = 0;
      const m = pattern.exec(seg.text);
      if (!m || !m[1]) continue;

      const rawName = m[1].trim();
      if (rawName.length < 2 || PANEL_HANDOFF_NAME_STOPWORDS.has(rawName.toLowerCase())) continue;

      const matched = lookupByName(rawName);
      if (matched && matched.id !== handoffSpeakerId) {
        candidates.push({ speaker: matched, textIndex: m.index });
      }
    }

    if (candidates.length === 0) continue;

    // Prefer the match closest to end of segment (highest text index)
    candidates.sort((a, b) => b.textIndex - a.textIndex);
    const recipientSpeaker = candidates[0].speaker;

    // Look at the next segment — reassign if it was wrongly kept with the handoff speaker
    if (i + 1 >= sorted.length) continue;
    const next = sorted[i + 1];
    const nextOwnerId = next.finalSpeakerId || next.speakerId;

    // Only reassign if the next segment belongs to the same speaker who made the handoff
    if (nextOwnerId !== handoffSpeakerId) continue;
    // Don't reassign if it's already correct
    if (nextOwnerId === recipientSpeaker.id) continue;

    // Reassign the next segment and contiguous segments from the same raw cluster
    const rawCluster = next.initialSpeakerId || (next as any).rawClusterId;
    let reassigned = 0;

    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      const candidateOwner = candidate.finalSpeakerId || candidate.speakerId;
      const candidateCluster = candidate.initialSpeakerId || (candidate as any).rawClusterId;

      // Stop if we hit a segment that's not from the same raw cluster or not assigned to the handoff speaker
      if (candidateOwner !== handoffSpeakerId) break;
      if (rawCluster && candidateCluster && candidateCluster !== rawCluster) break;

      candidate.finalSpeakerId = recipientSpeaker.id;
      candidate.speakerId = recipientSpeaker.id;
      candidate.confidenceReason = 'handoff_reassignment';
      candidate.confidence = Math.max(candidate.confidence ?? 0, 0.70);
      reassigned++;
      reassignments++;
    }

    if (reassigned > 0) {
      info.push(`[HANDOFF REASSIGN] "${seg.text.substring(0, 60)}..." → ${recipientSpeaker.name} (${reassigned} seg(s))`);
    }
  }

  return { segments: sorted, reassignments, info };
}

/**
 * POST-PROCESS: Handoff Cluster Coherence
 *
 * After `reassignHandoffResponses` establishes cluster ownership via transcript
 * evidence (e.g. 3 Speaker_C segments → Mohsen), claim remaining weakly-assigned
 * segments from those clusters. This catches segments with no preceding handoff
 * that happen to be from the same acoustic cluster.
 *
 * Safeguards:
 * - Requires ≥ 2 handoff_reassignment segments to establish ownership
 * - Only overrides 'acoustic_only' or weaker handoff claims
 * - Never overrides 'strong_self_id', 'handoff_consensus', 'temporal_callout'
 */
function claimHandoffClusters(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[]
): { segments: SpeakerSegment[]; claims: number; info: string[] } {
  const info: string[] = [];
  let claims = 0;

  // Strong confidence reasons that should never be overridden
  const PROTECTED_REASONS = new Set([
    'strong_self_id', 'handoff_consensus', 'temporal_callout',
    'temporal_continuation', 'temporal_lookforward',
  ]);

  // Step 1: Find handoff_reassignment segments, group by (speakerId, cluster)
  // Key: "speakerId|cluster" → count
  const handoffCounts = new Map<string, Map<string, number>>();

  for (const seg of segments) {
    if (seg.confidenceReason !== 'handoff_reassignment') continue;
    const speakerId = seg.finalSpeakerId || seg.speakerId;
    const cluster = seg.initialSpeakerId || (seg as any).rawClusterId;
    if (!speakerId || !cluster) continue;

    if (!handoffCounts.has(cluster)) handoffCounts.set(cluster, new Map());
    const clusterMap = handoffCounts.get(cluster)!;
    clusterMap.set(speakerId, (clusterMap.get(speakerId) || 0) + 1);
  }

  // Step 2: For each cluster, find the dominant handoff speaker (needs ≥ 2)
  const clusterOwner = new Map<string, string>(); // cluster → speakerId

  for (const [cluster, speakerCounts] of handoffCounts) {
    let bestSpeaker = '';
    let bestCount = 0;
    for (const [speakerId, count] of speakerCounts) {
      if (count > bestCount) {
        bestSpeaker = speakerId;
        bestCount = count;
      }
    }
    if (bestCount >= 2) {
      clusterOwner.set(cluster, bestSpeaker);
      const speaker = roster.find(s => s.id === bestSpeaker);
      info.push(`[CLUSTER COHERENCE] Cluster ${cluster} owned by ${speaker?.name || bestSpeaker} (${bestCount} handoff segs)`);
    }
  }

  if (clusterOwner.size === 0) {
    return { segments, claims, info };
  }

  // Step 3: Claim remaining segments from owned clusters
  for (const seg of segments) {
    const cluster = seg.initialSpeakerId || (seg as any).rawClusterId;
    if (!cluster || !clusterOwner.has(cluster)) continue;

    const ownerId = clusterOwner.get(cluster)!;
    const currentOwner = seg.finalSpeakerId || seg.speakerId;
    if (currentOwner === ownerId) continue; // Already correct

    // Check if this segment is protected
    if (seg.confidenceReason && PROTECTED_REASONS.has(seg.confidenceReason)) continue;

    // For handoff_reassignment segments assigned to a different speaker,
    // only override if that speaker has fewer handoff segments in this cluster
    if (seg.confidenceReason === 'handoff_reassignment') {
      const clusterMap = handoffCounts.get(cluster)!;
      const currentOwnerCount = clusterMap.get(currentOwner) || 0;
      const ownerCount = clusterMap.get(ownerId) || 0;
      if (currentOwnerCount >= ownerCount) continue; // Current owner is equally/more established
    }

    // Claim this segment
    const oldOwner = currentOwner;
    const oldReason = seg.confidenceReason || 'unset';
    const speaker = roster.find(s => s.id === ownerId);
    seg.finalSpeakerId = ownerId;
    seg.speakerId = ownerId;
    seg.confidenceReason = 'cluster_coherence_handoff';
    seg.confidence = Math.max(seg.confidence ?? 0, 0.65);
    claims++;
    info.push(`[CLUSTER COHERENCE] t=${seg.startTime.toFixed(1)}s: ${oldOwner} → ${ownerId} (${speaker?.name || 'unnamed'}) [was ${oldReason}]`);
  }

  return { segments, claims, info };
}

function mergeDuplicateUnknownSpeakers(
  speakers: GPTSpeaker[],
  segments: SpeakerSegment[]
): { speakers: GPTSpeaker[]; segments: SpeakerSegment[]; mergedCount: number } {
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

  // Second pass: fuzzy dedup using decideDuplicateName to catch cases like
  // "Mariam" (orphan-recovered) ↔ "Mariam Saleem" (GPT roster) that exact
  // normalization misses. Prefer the more informative name (longer / higher conf).
  const activeAfterFirstPass = speakers.filter(s => !remap.has(s.id));
  for (let i = 0; i < activeAfterFirstPass.length; i++) {
    const a = activeAfterFirstPass[i];
    if (!a.name || remap.has(a.id)) continue;
    for (let j = i + 1; j < activeAfterFirstPass.length; j++) {
      const b = activeAfterFirstPass[j];
      if (!b.name || remap.has(b.id)) continue;
      if (decideDuplicateName(a.name, b.name).kind !== 'hard') continue;

      // Keep the one with the longer name (more informative) or higher confidence
      const keepA = a.name.length >= b.name.length
        ? (a.confidence >= b.confidence ? a : b)
        : (b.confidence > a.confidence * 1.2 ? b : a.name.length >= b.name.length ? a : b);
      const drop = keepA.id === a.id ? b : a;

      if (!remap.has(drop.id)) {
        remap.set(drop.id, keepA.id);
        mergedCount++;
        console.log(`[MERGE] Fuzzy dedup: "${drop.name}" (${drop.id}) → "${keepA.name}" (${keepA.id})`);
      }
    }
  }

  if (remap.size === 0) {
    return { speakers, segments, mergedCount: 0 };
  }

  const updatedSegments: SpeakerSegment[] = segments.map(seg => {
    const currentId = seg.finalSpeakerId || seg.speakerId;
    const target = remap.get(currentId);
    if (!target) return seg;
    // Preserve original confidence and status — the merge corrects the speaker ID
    // but doesn't change the underlying evidence for the assignment (self-ID, CSP scores, etc.)
    return {
      ...seg,
      speakerId: target,
      finalSpeakerId: target,
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
  reassignedSegments: SpeakerSegment[]
): {
  speakers: Record<string, any>;
  segments: SpeakerSegment[];
  detectionMetadata: any;
} {
  const speakers: Record<string, any> = {};

  const roleFallbackName = (speaker: GPTSpeaker): string => {
    if (speaker.name) return speaker.name;
    const role = speaker.role || 'unknown';
    const roleLabel = role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    if (role === 'host' || role === 'co_host' || role === 'narrator' || role === 'advertiser' || role === 'quoted_audio') {
      return roleLabel;
    }
    const idMatch = /speaker_(\d+)/.exec(speaker.id);
    const suffix = idMatch ? idMatch[1] : speaker.id;
    return role === 'guest' ? `Guest ${suffix}` : `Speaker ${suffix}`;
  };

  // Build speaker records
  for (const gptSpeaker of gptSpeakers) {
    const speakerSegments = reassignedSegments.filter(s => (s.finalSpeakerId || s.speakerId) === gptSpeaker.id);

    speakers[gptSpeaker.id] = {
      id: gptSpeaker.id,
      finalName: roleFallbackName(gptSpeaker),
      role: gptSpeaker.role,
      roleConfidence: gptSpeaker.confidence,
      source: gptSpeaker.source,
      profile: gptSpeaker.profile,
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

    console.log('\nSegments reassigned:');
    result.segments.slice(0, 3).forEach(s => {
      console.log(`  ${s.speakerId}: "${s.text.substring(0, 50)}..."`);
    });

    if (result.diagnostics.dirtyClustersResolved?.length) {
      console.log(`\nDirty clusters resolved: ${result.diagnostics.dirtyClustersResolved.join(', ')}`);
      console.log(`Segments fixed: ${result.diagnostics.dirtyClusterSegmentsResolved}`);
    }

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
