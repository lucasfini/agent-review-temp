// ═══════════════════════════════════════════════════════════════
// Anchor Mapping — CSP-Based Speaker Attribution
// ═══════════════════════════════════════════════════════════════
//
// Orchestrates the three-phase speaker identity pipeline:
//
//   Phase 1: Confidence Scoring
//     → Score each segment based on anchor strength, agreement,
//       acoustic consistency, and role consistency
//
//   Phase 2: Constraint Satisfaction
//     → Extract anchors, build affinity matrix, solve constraints
//       to produce cluster ↔ identity assignments
//
//   Phase 3: Post-Hoc Reconciliation
//     → Re-scan for contradictions, merge duplicates, enforce
//       speaker ceiling, recompute confidence
//
// Between phases 2 and 3, a "contested segment resolver" uses
// linear context to disambiguate dirty clusters where the CSP
// couldn't produce a clear single assignment.
//
// Public API unchanged: performAnchorMapping(segments, roster) → segments

import { GPTSpeaker } from './gpt-speaker-intelligence';
import { SpeakerSegment } from './types';
import {
  Anchor,
  ClusterAssignment,
  extractAnchors,
  buildAffinityMatrix,
  solveConstraints,
  matchName,
  type IntroOverrideEvent,
} from './constraint-solver';
import {
  ScoredSegment,
  scoreSegments,
  CONFIDENCE_THRESHOLD,
} from './confidence-scoring';
import { reconcile } from './reconciliation-pass';

// ─────────────────────────────────────────────
// Takeback Patterns (used by the linear resolver)
// ─────────────────────────────────────────────

const TAKEBACK_PATTERNS = [
  /^(?:okay|alright|thank you|thanks|great|wonderful|perfect)(?:[.,])?\s*([A-Z][a-z]+)?/i,
  /moving on/i,
  /let's move/i,
  /next up/i,
];

const TAKEBACK_ADDRESS = [
  /(?:thank you|thanks),?\s+([a-zA-Z]+)/i,
];

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface AnchorMappingOptions {
  introWindowEndTime?: number;
  enableIntroOverride?: boolean;
  introOverrideEvents?: IntroOverrideEvent[];
  introSelfIdCounts?: Record<string, number>;
}

export function performAnchorMapping(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  options: AnchorMappingOptions = {}
): SpeakerSegment[] {
  console.log(`\n[ANCHOR] ═══ CSP-Based Anchor Mapping ═══`);
  console.log(`[ANCHOR] ${segments.length} segments, ${roster.length} roster entries`);

  if (segments.length === 0) return [];
  if (roster.length === 0) {
    console.log('[ANCHOR] Empty roster — returning segments unchanged');
    return segments;
  }

  // ── Phase 2: Constraint Satisfaction ──
  console.log('\n[ANCHOR] ── Phase 2: Constraint Satisfaction ──');
  const anchors = extractAnchors(segments, roster, {
    introWindowEndTime: options.introWindowEndTime,
    enableIntroOverride: options.enableIntroOverride,
    introOverrideEvents: options.introOverrideEvents,
    introSelfIdCounts: options.introSelfIdCounts,
  });
  if (options.introOverrideEvents && options.introOverrideEvents.length > 0) {
    console.log(`[ANCHOR] Intro override events: ${options.introOverrideEvents.length}`);
    options.introOverrideEvents.slice(0, 5).forEach(e => {
      console.log(`[ANCHOR]   seg ${e.segmentIndex}: handoff "${e.handoffName}" overridden by self-ID "${e.selfIdName}"`);
    });
  }
  const matrix = buildAffinityMatrix(segments, roster, anchors);
  const assignments = solveConstraints(matrix, roster);

  // ── Phase 1: Confidence Scoring ──
  console.log('\n[ANCHOR] ── Phase 1: Confidence Scoring ──');
  let scored = scoreSegments(segments, anchors, assignments, roster);
  logConfidenceDistribution(scored);

  // ── Contested Segment Resolution ──
  // For clusters the CSP marked as contested, use linear context
  // to assign individual segments (simplified baton pass)
  console.log('\n[ANCHOR] ── Contested Segment Resolution ──');
  scored = resolveContestedSegments(scored, anchors, assignments, roster);

  // ── Phase 3: Post-Hoc Reconciliation ──
  console.log('\n[ANCHOR] ── Phase 3: Post-Hoc Reconciliation ──');
  const { segments: reconciled, repairs } = reconcile(
    scored, anchors, assignments, roster
  );

  // ── Final Summary ──
  const assignedCount = reconciled.filter(s => s.assignedIdentity).length;
  const statusCounts = { confirmed: 0, tentative: 0, uncertain: 0 };
  for (const s of reconciled) statusCounts[s.status]++;
  console.log(`\n[ANCHOR] ═══ Complete ═══`);
  console.log(`[ANCHOR]   Assigned:   ${assignedCount}/${segments.length}`);
  console.log(`[ANCHOR]   Confirmed:  ${statusCounts.confirmed}`);
  console.log(`[ANCHOR]   Tentative:  ${statusCounts.tentative}`);
  console.log(`[ANCHOR]   Uncertain:  ${statusCounts.uncertain}`);
  console.log(`[ANCHOR]   Repairs:    ${repairs.length}`);

  // Convert ScoredSegment[] → SpeakerSegment[]
  return reconciled.map(seg => ({
    speakerId: seg.assignedIdentity || seg.clusterId,
    finalSpeakerId: seg.assignedIdentity || seg.clusterId,
    initialSpeakerId: seg.clusterId,
    text: seg.text,
    startTime: seg.startTime,
    endTime: seg.endTime,
    confidence: seg.confidence,
    status: seg.status,
  }));
}

// ─────────────────────────────────────────────
// Contested Segment Resolver
// ─────────────────────────────────────────────
//
// For clusters the CSP flagged as "contested" (dirty clusters
// where multiple identities share one raw AssemblyAI ID), we walk
// the segments linearly and use contextual signals to decide
// who holds the mic at each point.
//
// Priority order:
//   1. Direct self-ID anchor on this segment
//   2. Handoff target (previous segment was a handoff)
//   3. Handoff source (this segment does a handoff → it's the host)
//   4. Takeback (short phrase returning mic to host)
//   5. Baton hold (keep previous identity)

function resolveContestedSegments(
  segments: ScoredSegment[],
  anchors: Anchor[],
  assignments: ClusterAssignment[],
  roster: GPTSpeaker[]
): ScoredSegment[] {
  const contestedClusters = new Set(
    assignments.filter(a => a.contested).map(a => a.clusterId)
  );

  // Also include unassigned clusters (no CSP assignment at all)
  const assignedClusters = new Set(assignments.map(a => a.clusterId));
  const allClusters = new Set(segments.map(s => s.clusterId));
  for (const c of allClusters) {
    if (!assignedClusters.has(c)) contestedClusters.add(c);
  }

  if (contestedClusters.size === 0) {
    console.log('[ANCHOR] No contested clusters — skipping linear resolution');
    return segments;
  }

  console.log(`[ANCHOR] Resolving ${contestedClusters.size} contested/unassigned clusters: [${[...contestedClusters].join(', ')}]`);

  const hostEntry = roster.find(r => r.role === 'host' || r.role === 'co_host');

  // Index anchors by segment for fast lookup
  const anchorsBySegment = new Map<number, Anchor[]>();
  for (const a of anchors) {
    if (!anchorsBySegment.has(a.segmentIndex)) {
      anchorsBySegment.set(a.segmentIndex, []);
    }
    anchorsBySegment.get(a.segmentIndex)!.push(a);
  }

  // Track current identity through the linear walk
  let currentIdentity: string | null = hostEntry?.id ?? null;
  const updated = segments.map(s => ({ ...s, factors: { ...s.factors } }));

  for (let i = 0; i < updated.length; i++) {
    const seg = updated[i];

    // Non-contested segments: just track identity and move on
    if (!contestedClusters.has(seg.clusterId) && !seg.tentative) {
      if (seg.assignedIdentity) currentIdentity = seg.assignedIdentity;
      continue;
    }

    const myAnchors = anchorsBySegment.get(i) || [];

    // ── Priority 1: Direct self-ID or handoff-target on this segment ──
    const directAnchors = myAnchors.filter(a =>
      a.direction === 'self' || a.direction === 'handoff_target' || a.direction === 'handoff_source'
    );

    if (directAnchors.length > 0) {
      // Use the strongest direct anchor
      const best = directAnchors.sort((a, b) => {
        const sa = a.strength === 'strong' ? 3 : a.strength === 'medium' ? 2 : 1;
        const sb = b.strength === 'strong' ? 3 : b.strength === 'medium' ? 2 : 1;
        return sb - sa;
      })[0];

      const name = roster.find(r => r.id === best.targetIdentityId)?.name || best.targetIdentityId;
      const reason = best.direction === 'self' ? 'strong_self_id' as const : 'handoff_consensus' as const;
      updated[i] = {
        ...seg,
        assignedIdentity: best.targetIdentityId,
        assignedName: name,
        tentative: false,
        confidenceReason: reason,
        factors: {
          ...seg.factors,
          anchorStrength: best.strength === 'strong' ? 1.0 : 0.7,
        },
      };
      currentIdentity = best.targetIdentityId;

      // If this is a handoff source, the NEXT segment should be the handoff target
      if (best.direction === 'handoff_source') {
        // Find the corresponding handoff_target anchor
        const handoffTarget = anchors.find(
          a => a.segmentIndex === i + 1 && a.direction === 'handoff_target'
        );
        if (handoffTarget) {
          currentIdentity = handoffTarget.targetIdentityId;
        }
      }
      continue;
    }

    // ── Priority 2: Takeback detection ──
    if (hostEntry && currentIdentity !== hostEntry.id && isTakeback(seg.text, roster)) {
      const name = roster.find(r => r.id === hostEntry.id)?.name || hostEntry.id;
      updated[i] = {
        ...seg,
        assignedIdentity: hostEntry.id,
        assignedName: name,
        tentative: false,
        confidenceReason: 'handoff_consensus' as const,
        factors: {
          ...seg.factors,
          anchorStrength: Math.max(seg.factors.anchorStrength, 0.6),
        },
      };
      currentIdentity = hostEntry.id;
      continue;
    }

    // ── Priority 3: Baton hold ──
    if (currentIdentity) {
      const name = roster.find(r => r.id === currentIdentity)?.name || currentIdentity;
      updated[i] = {
        ...seg,
        assignedIdentity: currentIdentity,
        assignedName: name,
        confidenceReason: 'acoustic_only' as const,
        factors: {
          ...seg.factors,
          anchorStrength: Math.max(seg.factors.anchorStrength, 0.4),
        },
      };
    }
  }

  return updated;
}

// ─────────────────────────────────────────────
// Takeback Detection
// ─────────────────────────────────────────────

function isTakeback(text: string, roster: GPTSpeaker[]): boolean {
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 12) return false;

  for (const pattern of TAKEBACK_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // "Thank you, [RosterName]"
  const nameMatch = matchName(text, TAKEBACK_ADDRESS, roster);
  if (nameMatch) return true;

  return false;
}

// ─────────────────────────────────────────────
// Diagnostics
// ─────────────────────────────────────────────

function logConfidenceDistribution(segments: ScoredSegment[]): void {
  const buckets = { high: 0, medium: 0, low: 0, veryLow: 0 };
  const statuses = { confirmed: 0, tentative: 0, uncertain: 0 };

  for (const seg of segments) {
    if (seg.confidence >= 0.8) buckets.high++;
    else if (seg.confidence >= CONFIDENCE_THRESHOLD) buckets.medium++;
    else if (seg.confidence >= 0.4) buckets.low++;
    else buckets.veryLow++;

    statuses[seg.status]++;
  }

  console.log(`[ANCHOR] Confidence distribution:`);
  console.log(`  High (≥0.8):     ${buckets.high}`);
  console.log(`  Medium (≥0.6):   ${buckets.medium}`);
  console.log(`  Low (≥0.4):      ${buckets.low}`);
  console.log(`  Very low (<0.4): ${buckets.veryLow}`);
  console.log(`[ANCHOR] Status distribution:`);
  console.log(`  Confirmed:  ${statuses.confirmed}`);
  console.log(`  Tentative:  ${statuses.tentative}`);
  console.log(`  Uncertain:  ${statuses.uncertain}`);
}
