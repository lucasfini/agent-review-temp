// ═══════════════════════════════════════════════════════════════
// Phase 1: Segment-Level Confidence Scoring
// ═══════════════════════════════════════════════════════════════
//
// Every transcript segment receives:
//   - confidence score (0.0–1.0) from 4 weighted factors
//   - confidenceReason: what dominated the assignment decision
//   - status: confirmed | tentative | uncertain (first-class state)
//   - traceability: initialSpeakerId / finalSpeakerId / reconciliationReason
//
// Segments below CONFIDENCE_THRESHOLD are marked "uncertain" and excluded
// from irreversible bulk assignment.

import { SpeakerSegment } from './types';
import { GPTSpeaker } from './gpt-speaker-intelligence';
import { Anchor, ClusterAssignment } from './constraint-solver';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ConfidenceFactors {
  anchorStrength: number;       // 0–1: strength of the best anchor for this segment
  anchorAgreement: number;      // 0–1: do all anchors in the cluster agree?
  acousticConsistency: number;  // 0–1: cluster cohesion proxy (embeddings when available)
  roleConsistency: number;      // 0–1: does segment behavior match the assigned role?
}

// Exactly one primary reason per segment — reflects the dominant factor
export type ConfidenceReason =
  | 'strong_self_id'        // Strong self-identification anchor on this segment or cluster
  | 'handoff_consensus'     // Handoff/address anchors produced consensus
  | 'acoustic_only'         // No direct anchors; assigned by cluster-level match only
  | 'conflicted_anchors'    // Multiple anchors disagree within the cluster
  | 'posthoc_repair'        // Reconciliation pass changed the assignment
  | 'transition_short'      // Very short segment at a speaker-change boundary
  | 'role_mismatch';        // Segment duration inconsistent with speaker's role

// First-class uncertainty state — downstream systems MUST respect this
export type SegmentStatus = 'confirmed' | 'tentative' | 'uncertain';

// Nullable — only set when reconciliation modifies a segment
export type ReconciliationReason =
  | 'late_self_id_override'
  | 'duplicate_merge'
  | 'ceiling_remap'
  | 'acoustic_conflict_resolution'
  | null;

export interface ScoredSegment {
  index: number;
  clusterId: string;                        // raw AssemblyAI ID (Speaker_A)
  assignedIdentity: string | null;          // roster speaker ID
  assignedName: string | null;              // human name
  confidence: number;                       // overall 0.0–1.0
  factors: ConfidenceFactors;
  tentative: boolean;                       // derived: status !== 'confirmed'
  status: SegmentStatus;                    // first-class uncertainty state
  confidenceReason: ConfidenceReason;       // what justified the assignment
  initialSpeakerId: string | null;          // pre-reconciliation identity
  finalSpeakerId: string | null;            // post-reconciliation identity
  reconciliationReason: ReconciliationReason; // what changed (null if nothing)
  text: string;
  startTime: number;
  endTime: number;
  embedding?: number[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

export const CONFIDENCE_THRESHOLD = 0.6;

const FACTOR_WEIGHTS = {
  anchorStrength: 0.35,
  anchorAgreement: 0.25,
  acousticConsistency: 0.20,
  roleConsistency: 0.20,
};

// ─────────────────────────────────────────────
// Main Scoring Function
// ─────────────────────────────────────────────

export function scoreSegments(
  segments: SpeakerSegment[],
  anchors: Anchor[],
  assignments: ClusterAssignment[],
  roster: GPTSpeaker[]
): ScoredSegment[] {
  const assignmentMap = new Map(assignments.map(a => [a.clusterId, a]));

  // Pre-compute: anchors grouped by cluster
  const clusterAnchors = new Map<string, Anchor[]>();
  for (const anchor of anchors) {
    if (!clusterAnchors.has(anchor.clusterId)) {
      clusterAnchors.set(anchor.clusterId, []);
    }
    clusterAnchors.get(anchor.clusterId)!.push(anchor);
  }

  // Pre-compute: anchors grouped by segment index
  const segmentAnchors = new Map<number, Anchor[]>();
  for (const anchor of anchors) {
    if (!segmentAnchors.has(anchor.segmentIndex)) {
      segmentAnchors.set(anchor.segmentIndex, []);
    }
    segmentAnchors.get(anchor.segmentIndex)!.push(anchor);
  }

  // Pre-compute: cluster sizes (segment count per raw ID)
  const clusterSizes = new Map<string, number>();
  for (const seg of segments) {
    clusterSizes.set(seg.speakerId, (clusterSizes.get(seg.speakerId) || 0) + 1);
  }

  const scored: ScoredSegment[] = segments.map((seg, index) => {
    const clusterId = seg.speakerId;
    const assignment = assignmentMap.get(clusterId);
    const myClusterAnchors = clusterAnchors.get(clusterId) || [];
    const mySegAnchors = segmentAnchors.get(index) || [];

    const factors = computeFactors(
      seg, assignment, myClusterAnchors, mySegAnchors, roster, clusterSizes
    );

    const confidence = weightedScore(factors);
    const reason = determineReason(mySegAnchors, myClusterAnchors, assignment);
    const status = determineStatus(confidence, assignment, myClusterAnchors, mySegAnchors);

    return {
      index,
      clusterId,
      assignedIdentity: assignment?.identityId ?? null,
      assignedName: assignment?.identityName ?? null,
      confidence,
      factors,
      tentative: status !== 'confirmed',
      status,
      confidenceReason: reason,
      initialSpeakerId: null,    // set by orchestrator before reconciliation
      finalSpeakerId: null,      // set by orchestrator after reconciliation
      reconciliationReason: null, // set by reconciliation pass if modified
      text: seg.text,
      startTime: seg.startTime,
      endTime: seg.endTime,
      embedding: seg.embedding,
    };
  });

  // Second pass: detect transition_short and role_mismatch
  // Only reclassifies segments that had no strong prior reason (acoustic_only or
  // conflicted_anchors). Segments tagged posthoc_repair, temporal_continuation,
  // strong_self_id, handoff_consensus, etc. are left unchanged.
  return scored.map((s, i) => {
    // Only reclassify segments with no strong prior reason
    if (s.confidenceReason !== 'acoustic_only' && s.confidenceReason !== 'conflicted_anchors') {
      return s;
    }

    const duration = s.endTime - s.startTime;

    // transition_short: < 3s AND at a speaker-change boundary
    if (duration < 3) {
      const prevCluster = i > 0 ? scored[i - 1].clusterId : null;
      const nextCluster = i < scored.length - 1 ? scored[i + 1].clusterId : null;
      const atBoundary = prevCluster !== s.clusterId || nextCluster !== s.clusterId;
      if (atBoundary) {
        return { ...s, confidenceReason: 'transition_short' as ConfidenceReason, status: 'uncertain' as SegmentStatus, tentative: true };
      }
    }

    // role_mismatch: host with anomalously long turn (> 120s)
    // Guest short-turn rule removed — guests legitimately give brief acknowledgments
    const assignment = assignmentMap.get(s.clusterId);
    if (assignment) {
      const rosterEntry = roster.find(r => r.id === assignment.identityId);
      if (rosterEntry) {
        const isHost = rosterEntry.role === 'host' || rosterEntry.role === 'co_host';
        if (isHost && duration > 120) {
          return { ...s, confidenceReason: 'role_mismatch' as ConfidenceReason, status: 'uncertain' as SegmentStatus, tentative: true };
        }
      }
    }

    return s;
  });
}

// ─────────────────────────────────────────────
// Recompute After Reconciliation
// ─────────────────────────────────────────────

export function recomputeConfidence(segments: ScoredSegment[]): ScoredSegment[] {
  return segments.map(seg => {
    const confidence = weightedScore(seg.factors);
    // Status must also be recomputed since factors may have changed,
    // but we can't call determineStatus without the original assignment/anchors.
    // Use a simplified derivation: if reconciliation touched it, keep posthoc status.
    let status: SegmentStatus;
    if (seg.reconciliationReason) {
      // Reconciled segments: derive status from new confidence only
      status = confidence < CONFIDENCE_THRESHOLD ? 'uncertain'
        : seg.tentative ? 'tentative' : 'confirmed';
    } else {
      // Untouched segments: preserve existing status logic
      status = seg.status;
      if (confidence < CONFIDENCE_THRESHOLD) status = 'uncertain';
    }

    return {
      ...seg,
      confidence,
      tentative: status !== 'confirmed',
      status,
    };
  });
}

// ─────────────────────────────────────────────
// Reason Code Determination
// ─────────────────────────────────────────────

function determineReason(
  segAnchors: Anchor[],
  clusterAnchors: Anchor[],
  assignment: ClusterAssignment | undefined
): ConfidenceReason {
  // Priority 1: Strong self-ID on this segment
  if (segAnchors.some(a => a.strength === 'strong' && a.direction === 'self')) {
    return 'strong_self_id';
  }

  // Priority 2: Conflicting anchors in the cluster
  if (assignment && clusterAnchors.length > 1) {
    const targets = new Set(clusterAnchors.map(a => a.targetIdentityId));
    if (targets.size > 1) return 'conflicted_anchors';
  }

  // Priority 3: Handoff / address / procedural consensus
  const allAnchors = [...segAnchors, ...clusterAnchors];
  const hasHandoff = allAnchors.some(a =>
    a.direction === 'handoff_target' ||
    a.direction === 'handoff_source' ||
    a.direction === 'address'
  );
  if (hasHandoff && assignment) return 'handoff_consensus';

  // Priority 4: Strong self-ID inherited from cluster (not on this segment)
  if (clusterAnchors.some(a => a.strength === 'strong' && a.direction === 'self')) {
    return 'strong_self_id';
  }

  // Default: cluster-level assignment only, no specific anchors
  return 'acoustic_only';
}

// ─────────────────────────────────────────────
// Status Determination
// ─────────────────────────────────────────────

function determineStatus(
  confidence: number,
  assignment: ClusterAssignment | undefined,
  clusterAnchors: Anchor[],
  segAnchors?: Anchor[]
): SegmentStatus {
  // Self-ID segments are confirmed regardless of contested cluster status.
  // The speaker explicitly identified themselves — that's definitive.
  if (segAnchors?.some(a => a.strength === 'strong' && a.direction === 'self')) {
    return 'confirmed';
  }

  // Below threshold → always uncertain
  if (confidence < CONFIDENCE_THRESHOLD) return 'uncertain';

  // Above threshold but contested cluster → tentative
  if (assignment?.contested) return 'tentative';

  // Above threshold but only weak anchors → tentative
  const hasStrongOrMedium = clusterAnchors.some(a => a.strength !== 'weak');
  if (clusterAnchors.length > 0 && !hasStrongOrMedium) return 'tentative';

  // No assignment at all → tentative
  if (!assignment) return 'tentative';

  return 'confirmed';
}

// ─────────────────────────────────────────────
// Factor Computation (unchanged logic)
// ─────────────────────────────────────────────

function weightedScore(factors: ConfidenceFactors): number {
  return (
    factors.anchorStrength * FACTOR_WEIGHTS.anchorStrength +
    factors.anchorAgreement * FACTOR_WEIGHTS.anchorAgreement +
    factors.acousticConsistency * FACTOR_WEIGHTS.acousticConsistency +
    factors.roleConsistency * FACTOR_WEIGHTS.roleConsistency
  );
}

function computeFactors(
  seg: SpeakerSegment,
  assignment: ClusterAssignment | undefined,
  clusterAnchors: Anchor[],
  segAnchors: Anchor[],
  roster: GPTSpeaker[],
  clusterSizes: Map<string, number>
): ConfidenceFactors {

  // ── 1. Anchor Strength ──
  let anchorStrength = 0.3;

  if (segAnchors.length > 0) {
    const best = Math.max(...segAnchors.map(strengthScore));
    anchorStrength = best;
  } else if (clusterAnchors.length > 0) {
    const best = Math.max(...clusterAnchors.map(strengthScore));
    anchorStrength = best * 0.8;
  }

  // ── 2. Anchor Agreement ──
  let anchorAgreement = 0.5;

  if (assignment && clusterAnchors.length > 0) {
    const agreeing = clusterAnchors.filter(
      a => a.targetIdentityId === assignment.identityId
    ).length;
    const total = clusterAnchors.length;

    if (total > 0) {
      anchorAgreement = agreeing / total;
      if (agreeing === total && total >= 2) anchorAgreement = 1.0;
      if (agreeing < total * 0.5) anchorAgreement = 0.3;
    }
  } else if (assignment && clusterAnchors.length === 0) {
    // Anchor-free but assigned: vacuously no conflicts — treat as neutral-positive
    anchorAgreement = 0.7;
  } else if (!assignment) {
    anchorAgreement = 0.2;
  }

  // ── 3. Acoustic Consistency (proxy) ──
  let acousticConsistency = 0.5;
  const clusterSize = clusterSizes.get(seg.speakerId) || 1;

  if (assignment?.bindStrength === 'hard') {
    acousticConsistency = 0.9;
  } else if (assignment?.contested && clusterAnchors.length > 0) {
    // Genuine conflict: contested assignment AND there are anchors pointing elsewhere
    acousticConsistency = 0.35;
  } else if (clusterSize >= 5) {
    acousticConsistency = 0.85;
  } else if (clusterSize >= 3) {
    acousticConsistency = 0.75;
  } else if (clusterSize === 1) {
    acousticConsistency = 0.4;
  }

  // ── Self-ID override for acoustic consistency ──
  // When a segment has a direct strong self-ID, the speaker explicitly identified
  // themselves. Dirty/contested cluster status shouldn't drag down their confidence.
  const hasDirectSelfId = segAnchors.some(a => a.strength === 'strong' && a.direction === 'self');
  if (hasDirectSelfId && acousticConsistency < 0.7) {
    acousticConsistency = 0.7;
  }

  // ── 4. Role Consistency ──
  let roleConsistency = 0.7;

  if (assignment) {
    const rosterEntry = roster.find(r => r.id === assignment.identityId);
    if (rosterEntry) {
      const isHost = rosterEntry.role === 'host' || rosterEntry.role === 'co_host';
      const wordCount = seg.text.split(/\s+/).length;

      if (isHost) {
        if (wordCount > 100) roleConsistency = 0.5;
        else if (wordCount < 20) roleConsistency = 0.95;
        else roleConsistency = 0.8;
      } else {
        if (wordCount < 3) roleConsistency = 0.6;
        else roleConsistency = 0.85;
      }
    }
  } else {
    roleConsistency = 0.4;
  }

  return { anchorStrength, anchorAgreement, acousticConsistency, roleConsistency };
}

function strengthScore(anchor: Anchor): number {
  switch (anchor.strength) {
    case 'strong': return 1.0;
    case 'medium': return 0.7;
    case 'weak':   return 0.4;
  }
}
