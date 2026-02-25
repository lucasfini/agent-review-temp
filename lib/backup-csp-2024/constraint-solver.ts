// ═══════════════════════════════════════════════════════════════
// Phase 2: Anchor Mapping as a Constraint Satisfaction Problem
// ═══════════════════════════════════════════════════════════════
//
// Replaces greedy speaker-name assignment with a constraint-based model.
// Produces an affinity matrix (cluster ↔ identity likelihoods)
// rather than permanent assignments.
//
// Input:  Raw segments, roster, extracted anchors
// Output: ClusterAssignment[] with scores and bind strengths

import { SpeakerSegment } from './types';
import { GPTSpeaker } from './gpt-speaker-intelligence';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AnchorStrength = 'strong' | 'medium' | 'weak';
export type AnchorDirection =
  | 'self'            // "My name is Erin" → binds this cluster to Erin
  | 'handoff_source'  // "Next we have Olami" → current speaker is the host
  | 'handoff_target'  // Next segment after a handoff → that person
  | 'address'         // "Thank you Aaron" → previous speaker was Aaron
  | 'indirect';       // "As Erin said" → ambient signal, no cluster bind

export interface Anchor {
  segmentIndex: number;
  strength: AnchorStrength;
  clusterId: string;           // raw AssemblyAI ID (Speaker_A)
  targetIdentityId: string;    // roster speaker ID
  targetIdentityName: string;  // human name
  direction: AnchorDirection;
  evidence: string;
}

export interface IntroOverrideEvent {
  segmentIndex: number;
  handoffName: string;
  selfIdName: string;
  reason: string;
}

export interface AnchorExtractionOptions {
  introWindowEndTime?: number;
  enableIntroOverride?: boolean;
  introOverrideEvents?: IntroOverrideEvent[];
  introSelfIdCounts?: Record<string, number>;
}

export interface AffinityMatrix {
  clusters: string[];
  identities: string[];
  scores: number[][];  // scores[clusterIdx][identityIdx]
}

export interface ClusterAssignment {
  clusterId: string;
  identityId: string;
  identityName: string;
  score: number;
  bindStrength: 'hard' | 'soft';
  contested: boolean;  // true if multiple identities compete for this cluster
}

// ─────────────────────────────────────────────
// Regex Patterns by Anchor Strength
// ─────────────────────────────────────────────

const STRONG_SELF_ID = [
  /\bmy name is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bI'?m\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /\bthis is\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+speaking/i,
];

const MEDIUM_HANDOFF = [
  /(?:next|up) (?:is|we have|hear from)\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /turning (?:it )?over to\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /let's hear from\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /start with(?:[.,])?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /go ahead(?:[.,])?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /moving (?:on )?to\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /and lastly,?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /(?:okay|alright|so)(?:[.,])?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})[.,]?$/i,
  // Short direct name calls: "Colin." / "Okay, Terry."
  /^(?:okay|alright|so)?(?:[.,])?\s*([a-zA-Z][a-zA-Z]+)[.,?]?$/i,
];

const MEDIUM_ADDRESS = [
  /thank(?:s| you),?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
  /what do you think,?\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})/i,
];

const WEAK_INDIRECT = [
  /as\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+(?:said|mentioned|noted|pointed out)/i,
  /like\s+([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})\s+(?:was saying|said)/i,
  /([a-zA-Z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,2})(?:'s|s) point about/i,
];

// ─────────────────────────────────────────────
// Affinity Score Weights
// ─────────────────────────────────────────────

const AFFINITY_WEIGHTS = {
  strong_self: 10.0,
  medium_handoff_source: 8.0,  // High: handoff behavior is a very strong host signal
  medium_handoff_target: 6.0,
  medium_address: 3.0,
  weak_indirect: 1.0,
};

// Temporal awareness: late strong anchors gain influence, early medium anchors decay
// Base weights above are NOT changed — only multiplied at matrix-build time
const TEMPORAL = {
  STRONG_BOOST: 0.3,   // Strong self-ID at transcript end → 1.3x base weight
  MEDIUM_DECAY: 0.2,   // Medium handoff at transcript end → 0.8x base weight
};

// Weak anchor accumulation cap: prevents indirect references from rivaling self-IDs
// 3 weak anchors (3 × 1.0 = 3.0) would exceed this cap and be clamped to 2.5
const WEAK_CAP = 0.25 * AFFINITY_WEIGHTS.strong_self; // 2.5

// ─────────────────────────────────────────────
// Phase 2a: Anchor Extraction
// ─────────────────────────────────────────────

export function extractAnchors(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  options: AnchorExtractionOptions = {}
): Anchor[] {
  const anchors: Anchor[] = [];
  const hostEntry = roster.find(r => r.role === 'host' || r.role === 'co_host');
  const introWindowEndTime = options.introWindowEndTime;
  const enableIntroOverride = options.enableIntroOverride === true;
  const introOverrideEvents = options.introOverrideEvents;
  const introSelfIdCounts = options.introSelfIdCounts || {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = seg.text;
    const clusterId = seg.speakerId;

    // Strong: Self-ID
    const selfMatch = matchName(text, STRONG_SELF_ID, roster);
    if (selfMatch) {
      anchors.push({
        segmentIndex: i,
        strength: 'strong',
        clusterId,
        targetIdentityId: selfMatch.id,
        targetIdentityName: selfMatch.name!,
        direction: 'self',
        evidence: text.substring(0, 60),
      });
    }

    // Medium: Handoff
    const handoffMatch = matchName(text, MEDIUM_HANDOFF, roster);
    if (handoffMatch) {
      // Source: current speaker is acting as host/moderator
      if (hostEntry) {
        anchors.push({
          segmentIndex: i,
          strength: 'medium',
          clusterId,
          targetIdentityId: hostEntry.id,
          targetIdentityName: hostEntry.name!,
          direction: 'handoff_source',
          evidence: text.substring(0, 60),
        });
      }

      // Target: next segment's speaker is the handoff target
      if (i + 1 < segments.length) {
        const nextSeg = segments[i + 1];
        const inIntroWindow =
          typeof introWindowEndTime === 'number'
            ? nextSeg.startTime <= introWindowEndTime
            : false;

        if (enableIntroOverride && inIntroWindow) {
          const selfIdMatch = matchName(nextSeg.text, STRONG_SELF_ID, roster);
          if (selfIdMatch && selfIdMatch.id !== handoffMatch.id) {
            if (introOverrideEvents) {
              introOverrideEvents.push({
                segmentIndex: i + 1,
                handoffName: handoffMatch.name || handoffMatch.id,
                selfIdName: selfIdMatch.name || selfIdMatch.id,
                reason: 'intro_window_self_id_override_roster_match',
              });
            }
            continue;
          }

          const rawSelfId = extractSelfIdName(nextSeg.text);
          if (rawSelfId) {
            const normalized = rawSelfId.toLowerCase().trim();
            const count = introSelfIdCounts[normalized] || 0;
            if (count >= 2) {
              if (introOverrideEvents) {
                introOverrideEvents.push({
                  segmentIndex: i + 1,
                  handoffName: handoffMatch.name || handoffMatch.id,
                  selfIdName: rawSelfId,
                  reason: 'intro_window_self_id_override_repeat',
                });
              }
              continue;
            }
          }
        }

        anchors.push({
          segmentIndex: i + 1,
          strength: 'medium',
          clusterId: nextSeg.speakerId,
          targetIdentityId: handoffMatch.id,
          targetIdentityName: handoffMatch.name!,
          direction: 'handoff_target',
          evidence: `Handoff from seg ${i}: "${text.substring(0, 40)}"`,
        });
      }
    }

    // Medium: Direct Address ("Thank you Aaron" → previous speaker was Aaron)
    const addressMatch = matchName(text, MEDIUM_ADDRESS, roster);
    if (addressMatch && i > 0) {
      anchors.push({
        segmentIndex: i - 1,
        strength: 'medium',
        clusterId: segments[i - 1].speakerId,
        targetIdentityId: addressMatch.id,
        targetIdentityName: addressMatch.name!,
        direction: 'address',
        evidence: `Addressed in seg ${i}: "${text.substring(0, 40)}"`,
      });
    }

    // Weak: Indirect Reference ("As Erin said earlier")
    const indirectMatch = matchName(text, WEAK_INDIRECT, roster);
    if (indirectMatch) {
      anchors.push({
        segmentIndex: i,
        strength: 'weak',
        clusterId,
        targetIdentityId: indirectMatch.id,
        targetIdentityName: indirectMatch.name!,
        direction: 'indirect',
        evidence: text.substring(0, 60),
      });
    }
  }

  const strong = anchors.filter(a => a.strength === 'strong').length;
  const medium = anchors.filter(a => a.strength === 'medium').length;
  const weak = anchors.filter(a => a.strength === 'weak').length;
  console.log(`[CSP] Extracted ${anchors.length} anchors: ${strong} strong, ${medium} medium, ${weak} weak`);

  return anchors;
}

// ─────────────────────────────────────────────
// Phase 2b: Build Affinity Matrix
// ─────────────────────────────────────────────

export function buildAffinityMatrix(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  anchors: Anchor[]
): AffinityMatrix {
  const clusterSet = new Set(segments.map(s => s.speakerId));
  const clusters = [...clusterSet].sort();
  const identities = roster.map(r => r.id);

  // Initialize NxM score matrix with zeros
  const scores: number[][] = clusters.map(() => identities.map(() => 0));
  const clusterIdx = new Map(clusters.map((c, i) => [c, i]));
  const identityIdx = new Map(identities.map((id, i) => [id, i]));

  // Weak contributions tracked separately so we can cap them
  const weakScores: number[][] = clusters.map(() => identities.map(() => 0));
  const totalSegments = segments.length;

  for (const anchor of anchors) {
    const ci = clusterIdx.get(anchor.clusterId);
    const ii = identityIdx.get(anchor.targetIdentityId);
    if (ci === undefined || ii === undefined) continue;

    // Base weight from anchor direction (unchanged constants)
    let baseWeight: number;
    switch (anchor.direction) {
      case 'self':            baseWeight = AFFINITY_WEIGHTS.strong_self; break;
      case 'handoff_source':  baseWeight = AFFINITY_WEIGHTS.medium_handoff_source; break;
      case 'handoff_target':  baseWeight = AFFINITY_WEIGHTS.medium_handoff_target; break;
      case 'address':         baseWeight = AFFINITY_WEIGHTS.medium_address; break;
      case 'indirect':        baseWeight = AFFINITY_WEIGHTS.weak_indirect; break;
    }

    // Temporal multiplier: normalized position in transcript (0.0 = start, 1.0 = end)
    const timeFactor = totalSegments > 1
      ? anchor.segmentIndex / (totalSegments - 1)
      : 0.5;

    let weight = baseWeight;
    if (anchor.strength === 'strong') {
      // Late strong anchors gain influence (a self-ID at the end is MORE reliable,
      // not less — the speaker has settled into the conversation)
      weight *= (1.0 + timeFactor * TEMPORAL.STRONG_BOOST);
    } else if (anchor.strength === 'medium') {
      // Early medium anchors (procedural handoffs) are most reliable;
      // late medium anchors decay slightly as conversation structure loosens
      weight *= (1.0 - timeFactor * TEMPORAL.MEDIUM_DECAY);
    }
    // Weak anchors: no temporal adjustment — capped separately below

    if (anchor.strength === 'weak') {
      weakScores[ci][ii] += weight;
    } else {
      scores[ci][ii] += weight;
    }
  }

  // Clamp weak contributions per cluster-identity pair, then merge
  for (let ci = 0; ci < clusters.length; ci++) {
    for (let ii = 0; ii < identities.length; ii++) {
      const clamped = Math.min(weakScores[ci][ii], WEAK_CAP);
      if (clamped > 0) scores[ci][ii] += clamped;
    }
  }

  // Log the matrix
  console.log(`[CSP] Affinity Matrix (${clusters.length} clusters × ${identities.length} identities):`);
  const header = ['Cluster', ...identities.map(id => roster.find(r => r.id === id)?.name || id)];
  console.log(`  ${header.join('\t')}`);
  for (let ci = 0; ci < clusters.length; ci++) {
    const row = [clusters[ci], ...scores[ci].map(s => s.toFixed(1))];
    console.log(`  ${row.join('\t')}`);
  }

  return { clusters, identities, scores };
}

// ─────────────────────────────────────────────
// Phase 2c: Constraint Solving
// ─────────────────────────────────────────────

interface Constraint {
  type: 'must_bind' | 'must_not_bind';
  clusterIdx: number;
  identityIdx: number;
  source: string;
}

export function solveConstraints(
  matrix: AffinityMatrix,
  roster: GPTSpeaker[],
  targetSpeakerCount?: number
): ClusterAssignment[] {
  const { clusters, identities, scores } = matrix;
  const N = clusters.length;
  const M = identities.length;

  if (N === 0 || M === 0) return [];

  const constraints: Constraint[] = [];
  const hardBinds = new Map<number, number>(); // clusterIdx → identityIdx

  // ── Step 1: Identify hard constraints from dominant strong self-IDs ──
  for (let ci = 0; ci < N; ci++) {
    let bestIdx = -1;
    let bestScore = 0;
    let secondBest = 0;

    for (let ii = 0; ii < M; ii++) {
      if (scores[ci][ii] > bestScore) {
        secondBest = bestScore;
        bestScore = scores[ci][ii];
        bestIdx = ii;
      } else if (scores[ci][ii] > secondBest) {
        secondBest = scores[ci][ii];
      }
    }

    // Hard bind requires strong self-ID level scores (≥10) with clear dominance
    if (bestScore >= AFFINITY_WEIGHTS.strong_self && bestScore > secondBest * 1.5) {
      hardBinds.set(ci, bestIdx);
      const name = roster.find(r => r.id === identities[bestIdx])?.name;
      constraints.push({
        type: 'must_bind',
        clusterIdx: ci,
        identityIdx: bestIdx,
        source: `Dominant self-ID: ${clusters[ci]} → ${name}`,
      });
      console.log(`[CSP] Hard bind: ${clusters[ci]} → ${name} (score ${bestScore.toFixed(1)} vs ${secondBest.toFixed(1)})`);
    }
  }

  // ── Step 2: Host exclusivity constraint ──
  const hostIdx = identities.findIndex(id => {
    const r = roster.find(r2 => r2.id === id);
    return r && (r.role === 'host' || r.role === 'co_host');
  });

  if (hostIdx >= 0) {
    // Find which cluster has highest host affinity
    let bestHostCluster = -1;
    let bestHostScore = 0;
    for (let ci = 0; ci < N; ci++) {
      if (scores[ci][hostIdx] > bestHostScore) {
        bestHostScore = scores[ci][hostIdx];
        bestHostCluster = ci;
      }
    }

    // Prevent other clusters from being assigned host
    if (bestHostCluster >= 0 && bestHostScore > 0) {
      for (let ci = 0; ci < N; ci++) {
        if (ci !== bestHostCluster) {
          constraints.push({
            type: 'must_not_bind',
            clusterIdx: ci,
            identityIdx: hostIdx,
            source: 'Host exclusivity',
          });
        }
      }
      console.log(`[CSP] Host exclusivity: only ${clusters[bestHostCluster]} can be host`);
    }
  }

  // ── Step 3: Apply constraints to create adjusted score matrix ──
  const adjusted = scores.map(row => [...row]);
  for (const c of constraints) {
    if (c.type === 'must_not_bind') {
      adjusted[c.clusterIdx][c.identityIdx] = -100;
    }
  }

  // ── Step 4: Greedy assignment with priority ordering ──
  const assignments: ClusterAssignment[] = [];
  const assignedClusters = new Set<number>();
  const assignedIdentities = new Set<number>();

  // First pass: lock hard bindings
  for (const [ci, ii] of hardBinds.entries()) {
    assignments.push({
      clusterId: clusters[ci],
      identityId: identities[ii],
      identityName: roster.find(r => r.id === identities[ii])?.name || identities[ii],
      score: adjusted[ci][ii],
      bindStrength: 'hard',
      contested: false,
    });
    assignedClusters.add(ci);
    assignedIdentities.add(ii);
  }

  // Second pass: greedy soft assignments by score
  const candidates: { ci: number; ii: number; score: number }[] = [];
  for (let ci = 0; ci < N; ci++) {
    if (assignedClusters.has(ci)) continue;
    for (let ii = 0; ii < M; ii++) {
      if (assignedIdentities.has(ii)) continue;
      if (adjusted[ci][ii] > 0) {
        candidates.push({ ci, ii, score: adjusted[ci][ii] });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const { ci, ii, score } of candidates) {
    if (assignedClusters.has(ci) || assignedIdentities.has(ii)) continue;

    // Check if this cluster is contested (significant affinity to multiple identities)
    let best = 0;
    let second = 0;
    for (let j = 0; j < M; j++) {
      if (adjusted[ci][j] > best) {
        second = best;
        best = adjusted[ci][j];
      } else if (adjusted[ci][j] > second) {
        second = adjusted[ci][j];
      }
    }
    const contested = second > 0 && best < second * 2;

    assignments.push({
      clusterId: clusters[ci],
      identityId: identities[ii],
      identityName: roster.find(r => r.id === identities[ii])?.name || identities[ii],
      score,
      bindStrength: 'soft',
      contested,
    });
    assignedClusters.add(ci);
    assignedIdentities.add(ii);
  }

  // Log results
  console.log(`[CSP] Solved ${assignments.length} assignments (${hardBinds.size} hard, ${assignments.length - hardBinds.size} soft):`);
  for (const a of assignments) {
    const flags = [a.bindStrength, a.contested ? 'CONTESTED' : ''].filter(Boolean).join(', ');
    console.log(`  ${a.clusterId} → ${a.identityName} (score: ${a.score.toFixed(1)}, ${flags})`);
  }

  // Log unassigned clusters
  for (let ci = 0; ci < N; ci++) {
    if (!assignedClusters.has(ci)) {
      console.log(`  ${clusters[ci]} → UNASSIGNED (no positive affinity)`);
    }
  }

  return assignments;
}

// ─────────────────────────────────────────────
// Name Matching Utilities (shared)
// ─────────────────────────────────────────────

export function matchName(
  text: string,
  patterns: RegExp[],
  roster: GPTSpeaker[]
): GPTSpeaker | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1];
      let bestMatch: GPTSpeaker | null = null;
      let bestScore = 0;

      for (const speaker of roster) {
        if (!speaker.name) continue;
        const score = calculateMatchScore(name, speaker.name);
        if (score > bestScore && score > 0.7) {
          bestScore = score;
          bestMatch = speaker;
        }
      }

      if (bestMatch) return bestMatch;
    }
  }
  return null;
}

export function calculateMatchScore(extracted: string, rosterName: string): number {
  const a = extracted.toLowerCase().trim();
  const b = rosterName.toLowerCase().trim();

  if (a === b) return 1.0;
  if (b.includes(a) || a.includes(b)) return 0.95;

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const sim = 1.0 - (dist / maxLen);
  if (sim > 0.8) return 0.9;

  const skelA = consonantSkeleton(a);
  const skelB = consonantSkeleton(b);
  if (skelA.length >= 2 && skelA === skelB) return 0.85;
  if (skelA.length >= 2 && (skelB.includes(skelA) || skelA.includes(skelB))) return 0.8;

  return 0.0;
}

function extractSelfIdName(text: string): string | null {
  for (const pattern of STRONG_SELF_ID) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function consonantSkeleton(str: string): string {
  return str.toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiouy]/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

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
