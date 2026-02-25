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

import { SpeakerSegment, SpeakerIdentityProfile } from './types';
import { GPTSpeaker } from './gpt-speaker-intelligence';
import {
  acousticSimilarity,
  lexicalOverlap,
  computeRoleCompatibility,
  hasAdLexicalHint,
  buildClusterProfiles,
} from './speaker-profiles';
import {
  STRONG_SELF_ID_PATTERNS,
  MEDIUM_HANDOFF_PATTERNS,
  MEDIUM_ADDRESS_PATTERNS,
  WEAK_INDIRECT_PATTERNS,
  TITLE_ADDRESS_PATTERNS,
} from './self-id-patterns';

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
  identityProfiles?: Record<string, SpeakerIdentityProfile>;
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

// Use imported patterns from self-id-patterns.ts
const STRONG_SELF_ID = STRONG_SELF_ID_PATTERNS;
const MEDIUM_HANDOFF = MEDIUM_HANDOFF_PATTERNS;
const MEDIUM_ADDRESS = MEDIUM_ADDRESS_PATTERNS;
const WEAK_INDIRECT = WEAK_INDIRECT_PATTERNS;

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

const PROFILE_WEIGHTS = {
  acoustic: 6.0,  // Increased from 3.0 (now 60% of self-ID weight)
  lexical: 1.5,   // Slight increase to match
  variancePenalty: 2.0,  // Increase penalty weight
  role: 1.5,      // Decrease (will be context-aware)
};

const PROFILE_THRESHOLDS = {
  highVariance: 0.45,
  lowVariance: 0.15,
};

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
      console.log(`[CSP] Self-ID anchor: seg ${i} → "${selfMatch.name}" (evidence: "${text.substring(0, 60)}")`);
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
          // Check for roster-matched self-ID
          const selfIdMatch = matchName(nextSeg.text, STRONG_SELF_ID, roster);
          if (selfIdMatch && selfIdMatch.id !== handoffMatch.id) {
            console.log(`[CSP] Intro override: handoff "${handoffMatch.name}" contradicted by self-ID "${selfIdMatch.name}"`);
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

          // Check for repeated raw self-ID (not in roster but appears 2+ times)
          const rawSelfId = extractSelfIdName(nextSeg.text);
          if (rawSelfId) {
            const normalized = rawSelfId.toLowerCase().trim();
            const count = introSelfIdCounts[normalized] || 0;
            if (count >= 2) {
              console.log(`[CSP] Intro override: handoff "${handoffMatch.name}" contradicted by repeated self-ID "${rawSelfId}" (${count}x)`);
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

          // NEW: Acoustic validation
          // If handoff target has an existing profile, check if next segment matches acoustically
          const targetProfile = options.identityProfiles?.[handoffMatch.id];
          const nextSegEmbedding = (nextSeg as any).embedding as number[] | undefined;
          if (targetProfile?.acoustic?.centrdEmbedding && nextSegEmbedding) {
            const sim = acousticSimilarity(
              { acoustic: { centrdEmbedding: nextSegEmbedding, variance: 0 } } as any,
              targetProfile
            );
            if (sim < 0.50) {  // Strong mismatch
              console.log(`[CSP] Intro override: handoff "${handoffMatch.name}" rejected (acoustic mismatch: ${sim.toFixed(2)})`);
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

    // ── Phase D: Title-based direct address ──
    // "Prime Minister, where does this podcast find you?" → current speaker = host (not the PM).
    // Only apply for 2-speaker interviews (exactly 1 host/co_host + exactly 1 guest).
    const titleHosts = roster.filter(r => r.role === 'host' || r.role === 'co_host');
    const titleGuests = roster.filter(r => r.role === 'guest');
    if (titleHosts.length === 1 && titleGuests.length === 1) {
      for (const pattern of TITLE_ADDRESS_PATTERNS) {
        if (pattern.test(text)) {
          console.log(`[CSP] Title-address anchor: seg ${i} → current speaker is host (evidence: "${text.slice(0, 60)}")`);
          // Current speaker is the host (they are addressing the titled guest)
          anchors.push({
            segmentIndex: i,
            strength: 'medium',
            clusterId,
            targetIdentityId: titleHosts[0].id,
            targetIdentityName: titleHosts[0].name!,
            direction: 'handoff_source',
            evidence: text.slice(0, 60),
          });
          // Next segment is the guest's response
          if (i + 1 < segments.length) {
            anchors.push({
              segmentIndex: i + 1,
              strength: 'medium',
              clusterId: segments[i + 1].speakerId,
              targetIdentityId: titleGuests[0].id,
              targetIdentityName: titleGuests[0].name!,
              direction: 'handoff_target',
              evidence: `Title-address response from seg ${i}: "${text.slice(0, 40)}"`,
            });
          }
          break; // Only fire once per segment
        }
      }
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

  // ── Validation: Check for orphaned self-IDs (self-IDs not in roster) ──
  const orphanedSelfIds = new Set<string>();
  const rosterNames = new Set(roster.map(r => r.name?.toLowerCase()).filter(Boolean));

  for (let i = 0; i < segments.length; i++) {
    const text = segments[i].text;
    const rawSelfId = extractSelfIdName(text);

    if (rawSelfId) {
      const normalized = rawSelfId.toLowerCase().trim();
      // Check if this name exists in roster
      if (!rosterNames.has(normalized)) {
        // Also check for partial matches (first name only)
        const firstName = normalized.split(/\s+/)[0];
        const rosterNamesArray = Array.from(rosterNames);
        const hasPartialMatch = rosterNamesArray.some(rosterName =>
          rosterName.split(/\s+/)[0] === firstName
        );

        if (!hasPartialMatch) {
          orphanedSelfIds.add(rawSelfId);
        }
      }
    }
  }

  if (orphanedSelfIds.size > 0) {
    console.warn(`[CSP] ⚠️  ORPHANED SELF-IDs DETECTED: ${orphanedSelfIds.size} self-identifications NOT in GPT roster`);
    console.warn(`[CSP] Orphaned names: ${[...orphanedSelfIds].join(', ')}`);
    console.warn(`[CSP] → These speakers were missed in Pass 1 (GPT speaker intelligence)`);
    console.warn(`[CSP] → Segments will fall back to acoustic clustering (may cause misassignment)`);
    console.warn(`[CSP] → Consider improving Pass 1 prompt or increasing intro window`);
  }

  return anchors;
}

// ─────────────────────────────────────────────
// Phase 2b: Build Affinity Matrix
// ─────────────────────────────────────────────

export function buildAffinityMatrix(
  segments: SpeakerSegment[],
  roster: GPTSpeaker[],
  anchors: Anchor[],
  profiles?: {
    clusterProfiles?: Record<string, SpeakerIdentityProfile>;
    identityProfiles?: Record<string, SpeakerIdentityProfile>;
    context?: 'podcast' | 'debate';
  }
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
  const clusterProfiles = profiles?.clusterProfiles || buildClusterProfiles(segments);
  const identityProfiles = profiles?.identityProfiles || Object.fromEntries(
    roster.map(r => [r.id, r.profile]).filter(([, p]) => !!p)
  );

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

  // Add role + profile based scores
  let roleScoreHits = 0;
  let profileScoreHits = 0;

  for (let ci = 0; ci < clusters.length; ci++) {
    const clusterId = clusters[ci];
    const clusterProfile = clusterProfiles[clusterId];

    for (let ii = 0; ii < identities.length; ii++) {
      const identityId = identities[ii];
      const identity = roster.find(r => r.id === identityId);
      const identityProfile = identityProfiles[identityId];

      let roleScore = 0;
      if (identity?.role) {
        roleScore = computeRoleCompatibility(clusterProfile, identity.role, profiles?.context) * PROFILE_WEIGHTS.role;
        if (identity.role === 'advertiser' && clusterProfile && hasAdLexicalHint(clusterProfile)) {
          roleScore += 1.0;
        }
      }

      let profileScore = 0;
      if (clusterProfile && identityProfile) {
        const acoustic = acousticSimilarity(clusterProfile, identityProfile);
        const lexical = lexicalOverlap(clusterProfile, identityProfile);
        profileScore += acoustic * PROFILE_WEIGHTS.acoustic;
        profileScore += lexical * PROFILE_WEIGHTS.lexical;

        if (
          clusterProfile.acoustic?.variance !== undefined &&
          identityProfile.acoustic?.variance !== undefined
        ) {
          const clusterVar = clusterProfile.acoustic.variance;
          const identityVar = identityProfile.acoustic.variance;
          if (clusterVar > PROFILE_THRESHOLDS.highVariance && identityVar < PROFILE_THRESHOLDS.lowVariance) {
            profileScore -= PROFILE_WEIGHTS.variancePenalty;
          }
        }
      }

      if (roleScore !== 0) roleScoreHits++;
      if (profileScore !== 0) profileScoreHits++;

      // Diagnostic logging for profile scoring
      if (roleScore !== 0 || profileScore !== 0) {
        const acoustic = clusterProfile && identityProfile ? acousticSimilarity(clusterProfile, identityProfile) : 0;
        const lexical = clusterProfile && identityProfile ? lexicalOverlap(clusterProfile, identityProfile) : 0;
        console.log(`[CSP] Profile scoring: cluster=${clusters[ci]}, identity=${identities[ii]}, role=${roleScore.toFixed(2)}, acoustic=${(acoustic * PROFILE_WEIGHTS.acoustic).toFixed(2)}, lexical=${(lexical * PROFILE_WEIGHTS.lexical).toFixed(2)}`);
      }

      scores[ci][ii] += roleScore + profileScore;
    }
  }

  // ── Baseline affinity for unnamed roster entries ──
  // Floor-enforced entries (name: null) may have zero affinity with all clusters
  // because they lack text anchors, role data, and identity profiles.
  // Without a baseline, the greedy solver's `> 0` gate prevents them from ever
  // receiving a cluster assignment — rendering floor enforcement useless.
  const UNNAMED_BASELINE = 0.1;
  for (let ii = 0; ii < identities.length; ii++) {
    const identity = roster.find(r => r.id === identities[ii]);
    if (!identity?.name) {
      const hasAnyAffinity = clusters.some((_, ci) => scores[ci][ii] > 0);
      if (!hasAnyAffinity) {
        for (let ci = 0; ci < clusters.length; ci++) {
          scores[ci][ii] += UNNAMED_BASELINE;
        }
        console.log(`[CSP] Unnamed identity ${identities[ii]} given baseline affinity ${UNNAMED_BASELINE} across all clusters`);
      }
    }
  }

  if (roleScoreHits > 0 || profileScoreHits > 0) {
    console.log(`[CSP] Role/Profile scoring applied: roleHits=${roleScoreHits}, profileHits=${profileScoreHits}`);
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
  targetSpeakerCount?: number,
  clusterSegmentCounts?: Map<string, number>
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

  // ── Fallback: distribute remaining unassigned clusters to remaining identities ──
  // Safety net for edge cases where baseline affinity gets zeroed out by
  // constraints (e.g., host exclusivity) or profile penalties.
  const remainingClusters: number[] = [];
  const remainingIdentities: number[] = [];
  for (let ci = 0; ci < N; ci++) if (!assignedClusters.has(ci)) remainingClusters.push(ci);
  for (let ii = 0; ii < M; ii++) if (!assignedIdentities.has(ii)) remainingIdentities.push(ii);

  if (remainingClusters.length > 0 && remainingIdentities.length > 0) {
    // Sort remaining clusters by segment count descending (largest unassigned first)
    if (clusterSegmentCounts) {
      remainingClusters.sort((a, b) =>
        (clusterSegmentCounts.get(clusters[b]) || 0) - (clusterSegmentCounts.get(clusters[a]) || 0)
      );
    }

    const pairCount = Math.min(remainingClusters.length, remainingIdentities.length);
    console.log(`[CSP] Fallback distribution: pairing ${pairCount} remaining clusters with identities`);
    for (let i = 0; i < pairCount; i++) {
      const ci = remainingClusters[i];
      const ii = remainingIdentities[i];
      assignments.push({
        clusterId: clusters[ci],
        identityId: identities[ii],
        identityName: roster.find(r => r.id === identities[ii])?.name || identities[ii],
        score: 0.01,
        bindStrength: 'soft',
        contested: false,
      });
      assignedClusters.add(ci);
      assignedIdentities.add(ii);
      console.log(`  Fallback: ${clusters[ci]} → ${roster.find(r => r.id === identities[ii])?.name || identities[ii]}`);
    }
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

// Invalid names that should never be extracted (adjectives, possessives, common words)
const INVALID_NAME_PATTERNS = [
  /^(your|my|his|her|their|our)\b/i,  // Possessives
  /^(the|a|an)\b/i,  // Articles
  /^(nigerian|american|canadian|british|indian|chinese|african|european|asian)/i,  // Nationalities
  /^(student|candidate|host|moderator|speaker|person|guy|man|woman)/i,  // Descriptors
  /^(first|second|third|last|next|final)/i,  // Ordinals
  /^(one|two|three|four|five)/i,  // Numbers
];

function extractSelfIdName(text: string): string | null {
  for (const pattern of STRONG_SELF_ID) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();

      // Validate: reject invalid patterns
      for (const invalidPattern of INVALID_NAME_PATTERNS) {
        if (invalidPattern.test(extracted)) {
          console.log(`[CSP] Rejected invalid self-ID name: "${extracted}" (matched ${invalidPattern})`);
          return null;
        }
      }

      // Validate: must contain at least one letter
      if (!/[a-zA-Z]/.test(extracted)) {
        return null;
      }

      // Allow initials/nicknames: 2-3 characters, all same case (JJ, DJ, jj, etc.)
      const isInitials = /^[A-Z]{2,3}$/.test(extracted) || /^[a-z]{2,3}$/.test(extracted);
      if (isInitials) {
        return extracted; // Initials are valid
      }

      // Validate: reject if all lowercase (likely a verb or adjective) - but not initials
      if (extracted === extracted.toLowerCase()) {
        return null;
      }

      return extracted;
    }
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
