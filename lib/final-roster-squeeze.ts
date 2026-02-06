// FINAL ROSTER SQUEEZE
//
// Last-resort consolidation that guarantees the output has exactly
// `targetCount` speakers. Runs AFTER verifySpeakerIntegrity and
// cullDeadSpeakers.
//
// IMPLEMENATION: Strict 3-Phase Logic
// 1. The Purge: Remove garbage names (>3 words, forbidden phrases)
// 2. Global Phonetic Consolidation: Merge homophones (Aaron/Erin)
// 3. Hard Cap: Squeeze overflow speakers into "Unknown" or neighbors

import type { GPTSpeaker } from './gpt-speaker-intelligence';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SqueezeResult {
  speakers: GPTSpeaker[];
  segments: Array<{
    speakerId: string;
    text: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
  merges: Array<{
    from: { id: string; name: string | null };
    into: { id: string; name: string | null };
    reason: 'garbage_purge' | 'phonetic' | 'hard_cap';
  }>;
}

// ─────────────────────────────────────────────
// Phonetic & Distance Helpers
// ─────────────────────────────────────────────

/**
 * Build a "consonant skeleton" for phonetic comparison.
 * "Aaron" → "rn", "Erin" → "rn"
 */
function consonantSkeleton(name: string): string {
  return name
    .toLowerCase()
    .replace(/[aeiou]/g, '')       // strip vowels
    .replace(/(.)\1+/g, '$1')      // collapse repeated consonants
    .replace(/[^a-z]/g, '')        // strip non-alpha
    .trim();
}

/**
 * Levenshtein distance for fuzzy matching
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

// ─────────────────────────────────────────────
// Core Function
// ─────────────────────────────────────────────

export function forceHardRosterCap(
  speakers: GPTSpeaker[],
  segments: Array<{
    speakerId: string;
    text: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>,
  targetCount: number | undefined
): SqueezeResult {
  console.log('\n[SQUEEZE] Starting Strict 3-Phase Roster Squeeze...');
  console.log(`[SQUEEZE] Input: ${speakers.length} speakers, Target: ${targetCount || 'None'}`);

  // Initial state
  let currentSpeakers = [...speakers];
  let currentSegments = [...segments];
  const merges: SqueezeResult['merges'] = [];
  const remapTable = new Map<string, string>(); // Deleted ID -> Target ID

  // Helper to remap a speaker ID using the current table
  const resolveId = (id: string) => {
    let curr = id;
    while (remapTable.has(curr)) {
      curr = remapTable.get(curr)!;
    }
    return curr;
  };

  // ─────────────────────────────────────────────
  // PHASE 1: THE PURGE (Name Validity > Segment Count)
  // ─────────────────────────────────────────────
  console.log('[SQUEEZE] Phase 1: The Purge');
  
  const keptAfterPurge: GPTSpeaker[] = [];
  const purgedIds = new Set<string>();

  for (const speaker of currentSpeakers) {
    let shouldPurge = false;
    let purgeReason = '';

    if (speaker.name) {
      const wordCount = speaker.name.trim().split(/\s+/).length;
      const lowerName = speaker.name.toLowerCase();

      // Rule 1: Name > 3 words
      if (wordCount > 3) {
        shouldPurge = true;
        purgeReason = `Name too long (${wordCount} words): "${speaker.name}"`;
      }
      // Rule 2: Forbidden phrases
      else if (lowerName.includes('in full support') || lowerName.includes('proposal') || lowerName.includes('so happy to share')) {
        shouldPurge = true;
        purgeReason = `Forbidden phrase in name: "${speaker.name}"`;
      }
    }

    if (shouldPurge) {
      console.log(`[SQUEEZE] PURGING: ${purgeReason}`);
      purgedIds.add(speaker.id);
      merges.push({
        from: { id: speaker.id, name: speaker.name },
        into: { id: 'dropped', name: 'DROPPED' }, // Special marker
        reason: 'garbage_purge'
      });
    } else {
      keptAfterPurge.push(speaker);
    }
  }

  // Update segments: Drop segments belonging to purged speakers
  if (purgedIds.size > 0) {
    const beforeCount = currentSegments.length;
    currentSegments = currentSegments.filter(s => !purgedIds.has(s.speakerId));
    console.log(`[SQUEEZE] Dropped ${beforeCount - currentSegments.length} segments from purged speakers.`);
    currentSpeakers = keptAfterPurge;
  }

  // ─────────────────────────────────────────────
  // PHASE 2: GLOBAL PHONETIC CONSOLIDATION
  // ─────────────────────────────────────────────
  console.log('[SQUEEZE] Phase 2: Global Phonetic Consolidation');

  let changed = true;
  while (changed) {
    changed = false;
    // Sort by confidence desc so we prioritize keeping high-conf speakers
    currentSpeakers.sort((a, b) => b.confidence - a.confidence);
    
    const toRemove = new Set<string>();

    for (let i = 0; i < currentSpeakers.length; i++) {
      if (toRemove.has(currentSpeakers[i].id)) continue;
      
      for (let j = i + 1; j < currentSpeakers.length; j++) {
        if (toRemove.has(currentSpeakers[j].id)) continue;

        const s1 = currentSpeakers[i];
        const s2 = currentSpeakers[j];

        if (!s1.name || !s2.name) continue;

        const skel1 = consonantSkeleton(s1.name);
        const skel2 = consonantSkeleton(s2.name);

        // Check for strong phonetic match
        if (skel1.length > 0 && skel1 === skel2) {
          // Match found!
          // Target is s1 (higher confidence due to sort), Source is s2
          console.log(`[SQUEEZE] Phonetic Match: "${s2.name}" (${s2.id}) -> "${s1.name}" (${s1.id})`);
          
          remapTable.set(s2.id, s1.id);
          toRemove.add(s2.id);
          merges.push({
            from: { id: s2.id, name: s2.name },
            into: { id: s1.id, name: s1.name },
            reason: 'phonetic'
          });
          changed = true;
        }
      }
    }

    if (toRemove.size > 0) {
      currentSpeakers = currentSpeakers.filter(s => !toRemove.has(s.id));
    }
  }

  // Apply Phase 2 remaps to segments immediately
  currentSegments = currentSegments.map(s => {
    const newId = resolveId(s.speakerId);
    return { ...s, speakerId: newId };
  });

  // ─────────────────────────────────────────────
  // PHASE 3: THE HARD CAP
  // ─────────────────────────────────────────────
  console.log('[SQUEEZE] Phase 3: The Hard Cap');

  if (targetCount && targetCount > 0 && currentSpeakers.length > targetCount) {
    console.log(`[SQUEEZE] Over cap by ${currentSpeakers.length - targetCount}. Squeezing...`);

    // Recalculate segment counts for remaining speakers
    const segCounts = new Map<string, number>();
    currentSegments.forEach(s => {
      segCounts.set(s.speakerId, (segCounts.get(s.speakerId) || 0) + 1);
    });

    // Loop until we reach target
    while (currentSpeakers.length > targetCount) {
      // Sort by segment count ASCENDING (smallest first)
      currentSpeakers.sort((a, b) => {
        const cA = segCounts.get(a.id) || 0;
        const cB = segCounts.get(b.id) || 0;
        return cA - cB;
      });

      const victim = currentSpeakers[0]; // Smallest speaker
      const remainingCandidates = currentSpeakers.slice(1);

      // Find best merge target (Neighbor or Unknown)
      // Preference: 1. "Unknown" role, 2. Fuzzy neighbor, 3. Largest speaker
      let target = remainingCandidates.find(s => s.role === 'unknown' || s.name === 'Unknown');
      
      if (!target && victim.name) {
        // Try fuzzy match
        let bestDist = Infinity;
        for (const cand of remainingCandidates) {
          if (!cand.name) continue;
          const dist = levenshtein(victim.name, cand.name);
          if (dist < bestDist) {
            bestDist = dist;
            target = cand;
          }
        }
        // Only accept fuzzy if it's somewhat close? No, "nearest neighbor" implied forced merge
      }

      // Fallback: Largest speaker
      if (!target) {
        target = remainingCandidates.sort((a, b) => (segCounts.get(b.id)||0) - (segCounts.get(a.id)||0))[0];
      }

      console.log(`[SQUEEZE] Cap Squeeze: "${victim.name}" (${segCounts.get(victim.id)} segs) -> "${target.name}"`);

      remapTable.set(victim.id, target.id);
      
      // Update segment counts for the target
      const victimCount = segCounts.get(victim.id) || 0;
      segCounts.set(target.id, (segCounts.get(target.id) || 0) + victimCount);

      merges.push({
        from: { id: victim.id, name: victim.name },
        into: { id: target.id, name: target.name },
        reason: 'hard_cap'
      });

      // Remove victim
      currentSpeakers = remainingCandidates;
    }
  } else {
    console.log('[SQUEEZE] Hard cap not exceeded or not set.');
  }

  // ─────────────────────────────────────────────
  // FINAL CLEANUP
  // ─────────────────────────────────────────────

  // Final remapping of segments (Phase 3 updates)
  const finalSegments = currentSegments.map(s => {
    const newId = resolveId(s.speakerId);
    return { ...s, speakerId: newId };
  });

  // Renumber remaining speakers for cleanliness (speaker_1, speaker_2...)
  // and update segments one last time to match new clean IDs
  const cleanIdMap = new Map<string, string>();
  const finalSpeakers = currentSpeakers.map((s, idx) => {
    const cleanId = `speaker_${idx + 1}`;
    cleanIdMap.set(s.id, cleanId);
    return { ...s, id: cleanId };
  });

  const outputSegments = finalSegments.map(s => ({
    ...s,
    speakerId: cleanIdMap.get(s.speakerId) || s.speakerId
  }));

  console.log(`[SQUEEZE] Complete. Final roster size: ${finalSpeakers.length}`);

  return {
    speakers: finalSpeakers,
    segments: outputSegments,
    merges
  };
}
