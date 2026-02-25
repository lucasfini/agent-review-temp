// ═══════════════════════════════════════════════════════════════
// Phase 3: Post-Hoc Reconciliation & Repair Pass
// ═══════════════════════════════════════════════════════════════
//
// After the entire transcript is processed, this pass:
//   1. Snapshots initialSpeakerId for traceability
//   2. Re-scans for strong self-IDs that contradict earlier assignments
//   3. Detects duplicate humans (same name across multiple clusters)
//   4. Enforces speaker count ceiling without discarding truth
//   5. Recomputes confidence scores after repairs
//   6. Sets finalSpeakerId and derives status for every segment
//
// Every modified segment receives:
//   - confidenceReason = 'posthoc_repair'
//   - reconciliationReason = specific repair type
//
// Principle: never create new speakers beyond the limit; never
// forcibly assign uncertain segments.

import { GPTSpeaker } from './gpt-speaker-intelligence';
import { SpeakerIdentityProfile } from './types';
import { acousticSimilarity, PROFILE_THRESHOLDS, computeRoleCompatibility } from './speaker-profiles';
import { Anchor, ClusterAssignment } from './constraint-solver';
import {
  ScoredSegment,
  SegmentStatus,
  recomputeConfidence,
  CONFIDENCE_THRESHOLD,
} from './confidence-scoring';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RepairAction {
  type: 'cluster_reassign' | 'merge_clusters' | 'downgrade_tentative' | 'ceiling_remap';
  description: string;
  affectedSegments: number[];
}

export interface ReconciliationResult {
  segments: ScoredSegment[];
  repairs: RepairAction[];
}

// ─────────────────────────────────────────────
// Main Reconciliation
// ─────────────────────────────────────────────

export function reconcile(
  segments: ScoredSegment[],
  anchors: Anchor[],
  assignments: ClusterAssignment[],
  roster: GPTSpeaker[],
  targetSpeakerCount?: number,
  profiles?: {
    clusterProfiles?: Record<string, SpeakerIdentityProfile>;
    identityProfiles?: Record<string, SpeakerIdentityProfile>;
  }
): ReconciliationResult {
  const repairs: RepairAction[] = [];
  let working = deepCopySegments(segments);
  const assignmentMap = new Map(assignments.map(a => [a.clusterId, a]));

  console.log(`\n[RECONCILE] Starting post-hoc reconciliation for ${working.length} segments...`);

  // ─────────────────────────────────────────
  // Step 0: Snapshot pre-reconciliation state
  // ─────────────────────────────────────────
  working = working.map(seg => ({
    ...seg,
    initialSpeakerId: seg.assignedIdentity,
  }));

  // ─────────────────────────────────────────
  // Step 1: Re-scan strong self-IDs for contradictions
  // ─────────────────────────────────────────
  working = repairSelfIdContradictions(working, anchors, roster, assignmentMap, repairs, profiles);

  // ─────────────────────────────────────────
  // Step 2: Detect duplicate humans across clusters
  // ─────────────────────────────────────────
  working = repairDuplicateIdentities(working, assignmentMap, repairs, profiles);

  // ─────────────────────────────────────────
  // Step 3: Enforce speaker count ceiling
  // ─────────────────────────────────────────
  const ceiling = targetSpeakerCount || roster.length;
  working = enforceSpeakerCeiling(working, ceiling, roster, repairs, profiles);

  // ─────────────────────────────────────────
  // Step 4: Recompute confidence scores
  // ─────────────────────────────────────────
  working = recomputeConfidence(working);

  // ─────────────────────────────────────────
  // Step 5: Set finalSpeakerId and derive status
  // ─────────────────────────────────────────
  working = working.map(seg => {
    const status: SegmentStatus =
      seg.confidence < CONFIDENCE_THRESHOLD ? 'uncertain'
      : seg.tentative ? 'tentative'
      : 'confirmed';

    return {
      ...seg,
      finalSpeakerId: seg.assignedIdentity,
      status,
      tentative: status !== 'confirmed',
    };
  });

  const statusCounts = { confirmed: 0, tentative: 0, uncertain: 0 };
  for (const seg of working) statusCounts[seg.status]++;
  console.log(`[RECONCILE] Complete: ${repairs.length} repairs | confirmed: ${statusCounts.confirmed}, tentative: ${statusCounts.tentative}, uncertain: ${statusCounts.uncertain}`);

  return { segments: working, repairs };
}

// ─────────────────────────────────────────────
// Step 1: Self-ID Contradiction Repair
// ─────────────────────────────────────────────

function repairSelfIdContradictions(
  segments: ScoredSegment[],
  anchors: Anchor[],
  roster: GPTSpeaker[],
  assignmentMap: Map<string, ClusterAssignment>,
  repairs: RepairAction[],
  profiles?: {
    clusterProfiles?: Record<string, SpeakerIdentityProfile>;
    identityProfiles?: Record<string, SpeakerIdentityProfile>;
  }
): ScoredSegment[] {
  let working = segments;

  // Group strong self-ID anchors by cluster
  const strongAnchors = anchors.filter(a => a.strength === 'strong' && a.direction === 'self');
  const clusterSelfIds = new Map<string, Map<string, number>>();

  for (const anchor of strongAnchors) {
    if (!clusterSelfIds.has(anchor.clusterId)) {
      clusterSelfIds.set(anchor.clusterId, new Map());
    }
    const counts = clusterSelfIds.get(anchor.clusterId)!;
    counts.set(anchor.targetIdentityId, (counts.get(anchor.targetIdentityId) || 0) + 1);
  }

  for (const [clusterId, identityCounts] of clusterSelfIds.entries()) {
    const assignment = assignmentMap.get(clusterId);
    if (!assignment) continue;

    // Find dominant self-ID in this cluster
    let dominantId = '';
    let dominantCount = 0;
    for (const [id, count] of identityCounts.entries()) {
      if (count > dominantCount) {
        dominantCount = count;
        dominantId = id;
      }
    }

    // If the dominant self-ID contradicts the current assignment → reassign
    if (dominantId && dominantId !== assignment.identityId) {
      const newName = roster.find(r => r.id === dominantId)?.name || dominantId;
      const clusterProfile = profiles?.clusterProfiles?.[clusterId];
      const identityProfile = profiles?.identityProfiles?.[dominantId];
      const acousticMismatch = identityProfile && clusterProfile
        ? acousticSimilarity(clusterProfile, identityProfile) < PROFILE_THRESHOLDS.acousticExtremeMismatch
        : false;

      console.log(
        `[RECONCILE] Contradiction in ${clusterId}: assigned ${assignment.identityName} ` +
        `but self-identifies as ${newName} (${dominantCount} anchors) → reassigning`
      );

      const affected: number[] = [];
      working = working.map(seg => {
        if (seg.clusterId === clusterId) {
          affected.push(seg.index);
          return {
            ...seg,
            assignedIdentity: dominantId,
            assignedName: newName,
            confidenceReason: 'posthoc_repair' as const,
            reconciliationReason: acousticMismatch
              ? 'acoustic_conflict_resolution' as const
              : 'late_self_id_override' as const,
            tentative: acousticMismatch ? true : seg.tentative,
            factors: {
              ...seg.factors,
              anchorStrength: 1.0,
              anchorAgreement: 0.9,
              acousticConsistency: acousticMismatch ? 0.2 : seg.factors.acousticConsistency,
            },
          };
        }
        return seg;
      });

      repairs.push({
        type: 'cluster_reassign',
        description: `Reassigned ${clusterId}: ${assignment.identityName} → ${newName} (${dominantCount} self-IDs)`,
        affectedSegments: affected,
      });

      assignmentMap.set(clusterId, {
        ...assignment,
        identityId: dominantId,
        identityName: newName,
        bindStrength: 'hard',
        contested: false,
      });
    }
  }

  return working;
}

// ─────────────────────────────────────────────
// Step 2: Duplicate Identity Repair
// ─────────────────────────────────────────────

function repairDuplicateIdentities(
  segments: ScoredSegment[],
  assignmentMap: Map<string, ClusterAssignment>,
  repairs: RepairAction[],
  profiles?: {
    clusterProfiles?: Record<string, SpeakerIdentityProfile>;
    identityProfiles?: Record<string, SpeakerIdentityProfile>;
  }
): ScoredSegment[] {
  let working = segments;

  // Group clusters by assigned identity
  const identityToClusters = new Map<string, string[]>();
  for (const [clusterId, assignment] of assignmentMap.entries()) {
    if (!identityToClusters.has(assignment.identityId)) {
      identityToClusters.set(assignment.identityId, []);
    }
    identityToClusters.get(assignment.identityId)!.push(clusterId);
  }

  for (const [identityId, clusterIds] of identityToClusters.entries()) {
    if (clusterIds.length <= 1) continue;

    const assignment = assignmentMap.get(clusterIds[0])!;
    console.log(
      `[RECONCILE] Duplicate: ${assignment.identityName} appears in clusters [${clusterIds.join(', ')}]`
    );

    // Find dominant cluster (most segments)
    const clusterSegCounts = new Map<string, number>();
    for (const seg of working) {
      if (clusterIds.includes(seg.clusterId)) {
        clusterSegCounts.set(seg.clusterId, (clusterSegCounts.get(seg.clusterId) || 0) + 1);
      }
    }

    let dominantCluster = '';
    let maxCount = 0;
    for (const [cId, count] of clusterSegCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantCluster = cId;
      }
    }

    // Keep dominant, downgrade minor clusters to tentative (only if acoustically compatible)
    const minorClusters = clusterIds.filter(c => c !== dominantCluster);
    const affected: number[] = [];
    const dominantProfile = profiles?.clusterProfiles?.[dominantCluster];

    working = working.map(seg => {
      if (minorClusters.includes(seg.clusterId) && seg.assignedIdentity === identityId) {
        const clusterProfile = profiles?.clusterProfiles?.[seg.clusterId];
        const canMerge =
          dominantProfile &&
          clusterProfile &&
          acousticSimilarity(dominantProfile, clusterProfile) >= PROFILE_THRESHOLDS.acousticSimilarityMin;

        if (!canMerge) return seg;
        affected.push(seg.index);
        return {
          ...seg,
          tentative: true,
          confidence: Math.min(seg.confidence, 0.5),
          confidenceReason: 'posthoc_repair' as const,
          reconciliationReason: 'duplicate_merge' as const,
          factors: {
            ...seg.factors,
            acousticConsistency: 0.3,
          },
        };
      }
      return seg;
    });

    if (affected.length > 0) {
      repairs.push({
        type: 'downgrade_tentative',
        description: `Downgraded ${affected.length} segments in minor clusters for duplicate ${assignment.identityName}`,
        affectedSegments: affected,
      });
    }
  }

  return working;
}

// ─────────────────────────────────────────────
// Step 3: Speaker Count Ceiling Enforcement
// ─────────────────────────────────────────────

function enforceSpeakerCeiling(
  segments: ScoredSegment[],
  ceiling: number,
  roster: GPTSpeaker[],
  repairs: RepairAction[],
  profiles?: {
    clusterProfiles?: Record<string, SpeakerIdentityProfile>;
    identityProfiles?: Record<string, SpeakerIdentityProfile>;
  }
): ScoredSegment[] {
  let working = segments;

  // Count active identities
  const activeIdentities = new Set<string>();
  for (const seg of working) {
    if (seg.assignedIdentity) activeIdentities.add(seg.assignedIdentity);
  }

  if (activeIdentities.size <= ceiling) return working;

  console.log(`[RECONCILE] Speaker ceiling: ${activeIdentities.size} active > ${ceiling} limit`);

  // Count segments per identity
  const identitySegCounts = new Map<string, number>();
  for (const seg of working) {
    if (seg.assignedIdentity) {
      identitySegCounts.set(
        seg.assignedIdentity,
        (identitySegCounts.get(seg.assignedIdentity) || 0) + 1
      );
    }
  }

  // Sort by segment count ascending (smallest first = overflow candidates)
  const sorted = [...identitySegCounts.entries()].sort((a, b) => a[1] - b[1]);
  const overflowCount = activeIdentities.size - ceiling;
  const overflow = sorted.slice(0, overflowCount);

  const keepIds = new Set(sorted.slice(overflowCount).map(([id]) => id));

  for (const [overflowId, count] of overflow) {
    const overflowName = roster.find(r => r.id === overflowId)?.name || overflowId;
    const overflowRole = roster.find(r => r.id === overflowId)?.role;

    // Prefer role + acoustic compatible target
    let targetId: string | null = null;
    let targetName: string | null = null;

    let bestScore = -Infinity;
    const overflowProfile = profiles?.identityProfiles?.[overflowId];
    for (const [keepId] of sorted.filter(([id]) => keepIds.has(id)).reverse()) {
      const keepRole = roster.find(r => r.id === keepId)?.role;
      const roleScore = computeRoleCompatibility(
        profiles?.identityProfiles?.[keepId],
        overflowRole as any
      );
      const acousticScore = overflowProfile && profiles?.identityProfiles?.[keepId]
        ? acousticSimilarity(overflowProfile, profiles?.identityProfiles?.[keepId])
        : 0;

      const score = roleScore + acousticScore;
      if (score > bestScore) {
        bestScore = score;
        targetId = keepId;
        targetName = roster.find(r => r.id === keepId)?.name || keepId;
      }
    }

    // Fallback: largest surviving identity
    if (!targetId) {
      const largest = sorted[sorted.length - 1];
      targetId = largest[0];
      targetName = roster.find(r => r.id === targetId)?.name || targetId;
    }

    console.log(
      `[RECONCILE] Ceiling remap: ${overflowName} (${count} segs) → ${targetName} (flagged)`
    );

    const affected: number[] = [];
    working = working.map(seg => {
      if (seg.assignedIdentity === overflowId) {
        affected.push(seg.index);
        return {
          ...seg,
          assignedIdentity: targetId,
          assignedName: `${targetName} (was: ${overflowName})`,
          tentative: true,
          confidence: Math.min(seg.confidence, 0.45),
          confidenceReason: 'posthoc_repair' as const,
          reconciliationReason: 'ceiling_remap' as const,
          factors: {
            ...seg.factors,
            anchorAgreement: 0.2,
            acousticConsistency: 0.3,
          },
        };
      }
      return seg;
    });

    repairs.push({
      type: 'ceiling_remap',
      description: `Remapped ${overflowName} → ${targetName} to enforce ceiling (${count} segments)`,
      affectedSegments: affected,
    });
  }

  return working;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function deepCopySegments(segments: ScoredSegment[]): ScoredSegment[] {
  return segments.map(s => ({
    ...s,
    factors: { ...s.factors },
  }));
}
