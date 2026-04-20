import type { SpeakerSegment } from '@/lib/types';
import {
  inspectConversationalNamingState,
  resolveConversationalHumanNamesInSpeakerMap,
} from '@/lib/refactored-speaker-pipeline';
import type { ShowIdentityMatch, ShowRosterEntry } from '@/lib/show-speaker-memory';

type SpeakerFinalizationOptions = {
  projectType?: string;
  title?: string;
  filename?: string;
  showIdentity?: ShowIdentityMatch | null;
  showRoster?: ShowRosterEntry[];
};

type PipelineSnapshot = {
  stage: string;
  speakerMap: Record<string, { finalName: string | null; role: string | null; segmentCount: number }>;
  initialToFinalCounts: Record<string, Record<string, number>>;
  conversationalDrift: Array<{ speakerId: string; initialSpeakerIds: string[]; segmentCount: number }>;
  conversationalNaming: ReturnType<typeof inspectConversationalNamingState>;
  assignmentTrust: SpeakerAssignmentTrustSummary;
  warnings: string[];
};

export type SpeakerAssignmentTrustSummary = {
  confidence: number;
  reviewCount: number;
  confirmedReviewCount: number;
  segmentReviewIndices: number[];
  reviewItems: Array<{
    index: number;
    speakerId: string;
    reasons: string[];
    primaryReason: string;
  }>;
  reasonCounts: Record<string, number>;
  speakerSummaries: Array<{
    speakerId: string;
    finalName: string | null;
    role: string | null;
    assignmentConfidence: number | null;
    requiresReview: boolean;
    segmentCount: number;
    anonymous: boolean;
    contradictions: string[];
    reviewReasons: string[];
    confirmedSegmentCount: number;
  }>;
};

function normalizeSpeakerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getSpeakerNameForMerge(speaker: any): string | null {
  return speaker?.finalName ||
    speaker?.customName ||
    speaker?.extractedName?.name ||
    speaker?.fallbackName ||
    speaker?.name ||
    null;
}

function isConversationalSegment(segment: SpeakerSegment): boolean {
  if (segment.segmentKind === 'ad_read' || segment.segmentKind === 'promo') {
    return false;
  }
  if (segment.segmentKind === 'quoted_audio') {
    return false;
  }
  return true;
}

function isRiskySegmentReason(reason: string | null | undefined): boolean {
  return reason === 'acoustic_only' ||
    reason === 'transition_short' ||
    reason === 'role_mismatch' ||
    reason === 'conflicted_anchors';
}

function isAnonymousConversationalSpeakerName(name: string | null | undefined): boolean {
  if (!name) return true;
  return /^speaker\s+\d+$/i.test(name.trim());
}

function incrementReasonCount(counts: Record<string, number>, reason: string) {
  counts[reason] = (counts[reason] || 0) + 1;
}

function isConfirmedReviewSegment(segment: SpeakerSegment): boolean {
  return (segment as any).reviewStatus === 'confirmed';
}

function getSegmentWordCount(segment: SpeakerSegment): number {
  return String(segment.text || '').split(/\s+/).filter(Boolean).length;
}

function getContradictionAliases(contradictions: string[]): string[] {
  const aliases = new Set<string>();
  for (const contradiction of contradictions) {
    const match = contradiction.match(/:([A-Za-z][A-Za-z.'-]*)$/);
    if (match?.[1]) {
      aliases.add(match[1]);
    }
  }
  return Array.from(aliases);
}

function segmentContainsAlias(segment: SpeakerSegment, aliases: string[]): boolean {
  const text = String(segment.text || '');
  return aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  });
}

function buildTargetedReviewIndicesForSpeaker(
  ownedSegments: Array<{ segment: SpeakerSegment; index: number }>,
  options: {
    requiresReview: boolean;
    assignmentConfidence: number | null;
    contradictions: string[];
    anonymous: boolean;
  }
): number[] {
  const riskySpeaker = options.requiresReview ||
    (options.assignmentConfidence != null && options.assignmentConfidence < 0.75) ||
    options.contradictions.length > 0 ||
    options.anonymous;

  if (!riskySpeaker) return [];

  const contradictionAliases = getContradictionAliases(options.contradictions);
  const candidates = new Map<number, { score: number; reasons: Set<string> }>();

  const addCandidate = (index: number, score: number, reason: string) => {
    const owned = ownedSegments.find((entry) => entry.index === index);
    if (!owned) return;
    if (isConfirmedReviewSegment(owned.segment)) return;
    const existing = candidates.get(index) || { score: 0, reasons: new Set<string>() };
    existing.score = Math.max(existing.score, score);
    existing.reasons.add(reason);
    candidates.set(index, existing);
  };

  const sortedOwnedSegments = [...ownedSegments].sort((a, b) => a.index - b.index);

  for (const { segment, index } of sortedOwnedSegments) {
    if (segment.status === 'uncertain' && isRiskySegmentReason(segment.confidenceReason)) {
      addCandidate(index, 100, `uncertain:${segment.confidenceReason || 'unknown'}`);
    }
    if (contradictionAliases.length > 0 && segmentContainsAlias(segment, contradictionAliases)) {
      addCandidate(index, 90, 'contradiction_alias');
    }
    const text = String(segment.text || '');
    if (/\b[A-Z][a-z]+,\s/.test(text) || /\?/.test(text)) {
      addCandidate(index, 70, 'anchor_turn');
    }
  }

  for (const { index } of sortedOwnedSegments.slice(0, 2)) {
    addCandidate(index, 65, 'early_turn');
  }

  const substantiveSegments = sortedOwnedSegments
    .filter(({ segment }) => !isConfirmedReviewSegment(segment))
    .map(({ segment, index }) => ({
      index,
      duration: Math.max(0, (segment.endTime || 0) - (segment.startTime || 0)),
      words: getSegmentWordCount(segment),
    }))
    .filter(({ words, duration }) => words >= 12 || duration >= 8)
    .sort((a, b) => {
      if (b.words !== a.words) return b.words - a.words;
      if (b.duration !== a.duration) return b.duration - a.duration;
      return a.index - b.index;
    });

  for (const candidate of substantiveSegments.slice(0, 2)) {
    addCandidate(candidate.index, 55, 'representative_substantive');
  }

  if (options.anonymous && sortedOwnedSegments.length > 0) {
    addCandidate(sortedOwnedSegments[0].index, 60, 'anonymous_fallback');
  }

  return Array.from(candidates.entries())
    .sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return a[0] - b[0];
    })
    .slice(0, 5)
    .map(([index]) => index)
    .sort((a, b) => a - b);
}

function buildTargetedReviewItemsForSpeaker(
  speakerId: string,
  ownedSegments: Array<{ segment: SpeakerSegment; index: number }>,
  options: {
    requiresReview: boolean;
    assignmentConfidence: number | null;
    contradictions: string[];
    anonymous: boolean;
  }
): Array<{ index: number; speakerId: string; reasons: string[]; primaryReason: string }> {
  const riskySpeaker = options.requiresReview ||
    (options.assignmentConfidence != null && options.assignmentConfidence < 0.75) ||
    options.contradictions.length > 0 ||
    options.anonymous;

  if (!riskySpeaker) return [];

  const contradictionAliases = getContradictionAliases(options.contradictions);
  const candidates = new Map<number, { score: number; reasons: Set<string> }>();

  const addCandidate = (index: number, score: number, reason: string) => {
    const owned = ownedSegments.find((entry) => entry.index === index);
    if (!owned) return;
    if (isConfirmedReviewSegment(owned.segment)) return;
    const existing = candidates.get(index) || { score: 0, reasons: new Set<string>() };
    existing.score = Math.max(existing.score, score);
    existing.reasons.add(reason);
    candidates.set(index, existing);
  };

  const sortedOwnedSegments = [...ownedSegments].sort((a, b) => a.index - b.index);

  for (const { segment, index } of sortedOwnedSegments) {
    if (segment.status === 'uncertain' && isRiskySegmentReason(segment.confidenceReason)) {
      addCandidate(index, 100, `uncertain:${segment.confidenceReason || 'unknown'}`);
    }
    if (contradictionAliases.length > 0 && segmentContainsAlias(segment, contradictionAliases)) {
      addCandidate(index, 90, 'contradiction_alias');
    }
    const text = String(segment.text || '');
    if (/\b[A-Z][a-z]+,\s/.test(text) || /\?/.test(text)) {
      addCandidate(index, 70, 'anchor_turn');
    }
  }

  for (const { index } of sortedOwnedSegments.slice(0, 2)) {
    addCandidate(index, 65, 'early_turn');
  }

  const substantiveSegments = sortedOwnedSegments
    .filter(({ segment }) => !isConfirmedReviewSegment(segment))
    .map(({ segment, index }) => ({
      index,
      duration: Math.max(0, (segment.endTime || 0) - (segment.startTime || 0)),
      words: getSegmentWordCount(segment),
    }))
    .filter(({ words, duration }) => words >= 12 || duration >= 8)
    .sort((a, b) => {
      if (b.words !== a.words) return b.words - a.words;
      if (b.duration !== a.duration) return b.duration - a.duration;
      return a.index - b.index;
    });

  for (const candidate of substantiveSegments.slice(0, 2)) {
    addCandidate(candidate.index, 55, 'representative_substantive');
  }

  if (options.anonymous && sortedOwnedSegments.length > 0) {
    addCandidate(sortedOwnedSegments[0].index, 60, 'anonymous_fallback');
  }

  return Array.from(candidates.entries())
    .sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return a[0] - b[0];
    })
    .slice(0, 5)
    .map(([index, value]) => ({
      index,
      speakerId,
      reasons: Array.from(value.reasons),
      primaryReason: Array.from(value.reasons)[0] || 'review',
    }))
    .sort((a, b) => a.index - b.index);
}

export function computeSpeakerAssignmentTrust(
  segments: SpeakerSegment[],
  speakers: Record<string, any>
): SpeakerAssignmentTrustSummary {
  const conversationalSegments = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => isConversationalSegment(segment));
  const totalConversationalSegments = conversationalSegments.length;
  const reasonCounts: Record<string, number> = {};
  const reviewIndices = new Set<number>();
  const reviewItems = new Map<number, { index: number; speakerId: string; reasons: Set<string>; primaryReason: string }>();
  const speakerSummaries: SpeakerAssignmentTrustSummary['speakerSummaries'] = [];

  if (totalConversationalSegments === 0) {
    return {
      confidence: 0,
      reviewCount: 0,
      confirmedReviewCount: 0,
      segmentReviewIndices: [],
      reviewItems: [],
      reasonCounts,
      speakerSummaries,
    };
  }

  let penalty = 0;
  let confirmedReviewCount = 0;

  for (const [speakerId, rawSpeaker] of Object.entries(speakers || {})) {
    const speaker = rawSpeaker as any;
    const ownedSegments = conversationalSegments.filter(({ segment }) => (
      ((segment as any).finalSpeakerId || segment.speakerId) === speakerId
    ));
    if (ownedSegments.length === 0) continue;

    const segmentShare = ownedSegments.length / totalConversationalSegments;
    const finalName = speaker.finalName || speaker.name || speaker.fallbackName || null;
    const assignmentConfidence = typeof speaker.assignmentConfidence === 'number'
      ? Math.max(0, Math.min(1, speaker.assignmentConfidence))
      : null;
    const contradictions = Array.isArray(speaker.assignmentContradictions)
      ? speaker.assignmentContradictions.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const anonymous = isAnonymousConversationalSpeakerName(finalName);
    const requiresReview = Boolean(speaker.requiresReview);
    const reviewReasons = new Set<string>();
    const confirmedSegments = ownedSegments.filter(({ segment }) => isConfirmedReviewSegment(segment));
    const confirmedSegmentCount = confirmedSegments.length;
    const confirmedRatio = ownedSegments.length > 0 ? confirmedSegmentCount / ownedSegments.length : 0;
    confirmedReviewCount += confirmedSegmentCount;

    if (requiresReview) {
      reviewReasons.add('requires_review');
      incrementReasonCount(reasonCounts, 'requires_review');
      penalty += 0.45 * segmentShare;
    }

    if (assignmentConfidence != null && assignmentConfidence < 0.75) {
      reviewReasons.add('low_assignment_confidence');
      incrementReasonCount(reasonCounts, 'low_assignment_confidence');
      penalty += (0.75 - assignmentConfidence) * 0.35 * Math.max(0.75, segmentShare);
    }

    if (contradictions.length > 0) {
      reviewReasons.add('assignment_contradiction');
      incrementReasonCount(reasonCounts, 'assignment_contradiction');
      penalty += Math.min(0.3, 0.12 * contradictions.length) * Math.max(0.75, segmentShare);
    }

    if (anonymous) {
      reviewReasons.add('anonymous_fallback');
      incrementReasonCount(reasonCounts, 'anonymous_fallback');
      penalty += 0.18 * segmentShare;
    }

    for (const { segment, index } of ownedSegments) {
      const reason = segment.confidenceReason;
      const uncertain = segment.status === 'uncertain' && isRiskySegmentReason(reason);
      if (uncertain) {
        reviewReasons.add('uncertain_segment');
        incrementReasonCount(reasonCounts, 'uncertain_segment');
        penalty += 0.14 / totalConversationalSegments;
      }
      if (isConfirmedReviewSegment(segment)) {
        incrementReasonCount(reasonCounts, 'confirmed_review');
      }
    }

    const targetedReviewIndices = buildTargetedReviewIndicesForSpeaker(ownedSegments, {
      requiresReview,
      assignmentConfidence,
      contradictions,
      anonymous,
    });
    for (const index of targetedReviewIndices) {
      reviewIndices.add(index);
    }
    const targetedReviewItems = buildTargetedReviewItemsForSpeaker(speakerId, ownedSegments, {
      requiresReview,
      assignmentConfidence,
      contradictions,
      anonymous,
    });
    for (const item of targetedReviewItems) {
      const existing = reviewItems.get(item.index);
      if (existing) {
        item.reasons.forEach((reason) => existing.reasons.add(reason));
        continue;
      }
      reviewItems.set(item.index, {
        ...item,
        reasons: new Set(item.reasons),
      });
    }

    if (confirmedSegmentCount > 0) {
      reviewReasons.add('confirmed_review');
      penalty -= Math.min(0.24, (0.12 * confirmedSegmentCount) + (0.12 * confirmedRatio)) * Math.max(0.35, segmentShare);
    }

    speakerSummaries.push({
      speakerId,
      finalName,
      role: speaker.role || null,
      assignmentConfidence,
      requiresReview,
      segmentCount: ownedSegments.length,
      anonymous,
      contradictions,
      reviewReasons: Array.from(reviewReasons),
      confirmedSegmentCount,
    });
  }

  const reviewRatio = reviewIndices.size / totalConversationalSegments;
  let confidence = Math.max(0.2, Math.min(0.99, 0.98 - Math.max(0, penalty)));
  if (reviewIndices.size > 0) {
    confidence = Math.min(confidence, 0.93 - Math.min(0.35, reviewRatio * 0.45));
  }

  return {
    confidence: Number(confidence.toFixed(3)),
    reviewCount: reviewIndices.size,
    confirmedReviewCount,
    segmentReviewIndices: Array.from(reviewIndices).sort((a, b) => a - b),
    reviewItems: Array.from(reviewItems.values())
      .map((item) => ({
        index: item.index,
        speakerId: item.speakerId,
        reasons: Array.from(item.reasons),
        primaryReason: item.primaryReason,
      }))
      .sort((a, b) => a.index - b.index),
    reasonCounts,
    speakerSummaries: speakerSummaries.sort((a, b) => b.segmentCount - a.segmentCount),
  };
}

export function attachSpeakerAssignmentMetadata(
  speakerData: any
): any {
  const summary = computeSpeakerAssignmentTrust(
    Array.isArray(speakerData?.segments) ? speakerData.segments : [],
    speakerData?.speakers || {}
  );
  const existingDiagnostics = speakerData?.detectionMetadata?.pipelineDiagnostics;
  const finalRecurringOwnership = summary.speakerSummaries
    .filter((speaker) => speaker.role === 'host' || speaker.role === 'co_host')
    .map((speaker) => ({
      speakerId: speaker.speakerId,
      finalName: speaker.finalName,
      role: speaker.role,
      assignmentConfidence: speaker.assignmentConfidence,
      requiresReview: speaker.requiresReview,
      contradictions: speaker.contradictions,
    }));

  return {
    ...speakerData,
    detectionMetadata: {
      ...(speakerData?.detectionMetadata || {}),
      speakerAssignmentConfidence: summary.confidence,
      speakerAssignmentReviewCount: summary.reviewCount,
      confirmedReviewCount: summary.confirmedReviewCount,
      speakerAssignmentBreakdown: {
        segmentReviewIndices: summary.segmentReviewIndices,
        reviewItems: summary.reviewItems,
        reasonCounts: summary.reasonCounts,
        speakerSummaries: summary.speakerSummaries,
      },
      pipelineDiagnostics: existingDiagnostics ? {
        ...existingDiagnostics,
        finalAssignmentConfidence: summary.confidence,
        finalReviewSummary: {
          reviewCount: summary.reviewCount,
          confirmedReviewCount: summary.confirmedReviewCount,
          reasonCounts: summary.reasonCounts,
          reviewSpeakerIds: summary.speakerSummaries
            .filter((speaker) => speaker.reviewReasons.length > 0)
            .map((speaker) => speaker.speakerId),
        },
        finalRecurringOwnership,
      } : existingDiagnostics,
    },
  };
}

export function mergeDuplicateSpeakersByName(
  segments: SpeakerSegment[],
  speakers: Record<string, any>
): { segments: SpeakerSegment[]; speakers: Record<string, any>; mergedCount: number } {
  const nameMap = new Map<string, string[]>();
  const segmentCounts = new Map<string, number>();

  for (const seg of segments) {
    const id = (seg as any).finalSpeakerId || seg.speakerId;
    segmentCounts.set(id, (segmentCounts.get(id) || 0) + 1);
  }

  for (const [id, speaker] of Object.entries(speakers)) {
    const name = getSpeakerNameForMerge(speaker);
    if (!name) continue;
    const normalized = normalizeSpeakerName(name);
    if (!nameMap.has(normalized)) nameMap.set(normalized, []);
    nameMap.get(normalized)!.push(id);
  }

  const remap = new Map<string, string>();
  let mergedCount = 0;

  for (const [name, ids] of nameMap.entries()) {
    if (ids.length <= 1) continue;

    const sorted = ids.sort((a, b) => {
      const aCount = segmentCounts.get(a) || 0;
      const bCount = segmentCounts.get(b) || 0;
      if (aCount !== bCount) return bCount - aCount;
      const aRole = speakers[a]?.role || 'unknown';
      const bRole = speakers[b]?.role || 'unknown';
      if (aRole === 'unknown' && bRole !== 'unknown') return 1;
      if (bRole === 'unknown' && aRole !== 'unknown') return -1;
      const aConf = speakers[a]?.roleConfidence || speakers[a]?.confidence || 0;
      const bConf = speakers[b]?.roleConfidence || speakers[b]?.confidence || 0;
      return bConf - aConf;
    });

    const primary = sorted[0];
    for (const dup of sorted.slice(1)) {
      remap.set(dup, primary);
      mergedCount++;
      console.log(`[MERGE] Duplicate name "${name}" -> ${dup} merged into ${primary}`);
    }
  }

  if (remap.size === 0) {
    return { segments, speakers, mergedCount: 0 };
  }

  const updatedSegments = segments.map((seg) => {
    const currentId = (seg as any).finalSpeakerId || seg.speakerId;
    const target = remap.get(currentId);
    if (!target) return seg;
    const confidence = typeof seg.confidence === 'number' ? seg.confidence : 0.8;
    return {
      ...seg,
      speakerId: target,
      finalSpeakerId: target,
      confidence,
      status: seg.status ?? 'tentative',
    };
  });

  const updatedSpeakers: Record<string, any> = { ...speakers };
  for (const dup of remap.keys()) {
    delete updatedSpeakers[dup];
  }

  return { segments: updatedSegments, speakers: updatedSpeakers, mergedCount };
}

export function applyNeighborSmoothing(
  segments: SpeakerSegment[],
  options: { projectType?: string } = {}
): { segments: SpeakerSegment[]; updatedSegments: number; skippedLong: number; skippedCrossCluster: number } {
  if (segments.length < 3) {
    return { segments, updatedSegments: 0, skippedLong: 0, skippedCrossCluster: 0 };
  }

  const updated = [...segments];
  let updatedSegments = 0;
  let skippedLong = 0;
  let skippedCrossCluster = 0;
  const normalizedProjectType = (options.projectType || '').toUpperCase();
  const protectConversationalCrossCluster =
    normalizedProjectType === 'INTERVIEW' || normalizedProjectType === 'PODCAST';

  for (let i = 1; i < segments.length - 1; i++) {
    const prev = segments[i - 1];
    const next = segments[i + 1];
    const curr = segments[i];
    const prevId = (prev as any).finalSpeakerId || prev.speakerId;
    const nextId = (next as any).finalSpeakerId || next.speakerId;
    const currId = (curr as any).finalSpeakerId || curr.speakerId;
    if (prevId !== nextId || currId === prevId) continue;

    if (
      protectConversationalCrossCluster &&
      isConversationalSegment(curr)
    ) {
      const prevInitialId = (prev as any).initialSpeakerId || prev.speakerId;
      const nextInitialId = (next as any).initialSpeakerId || next.speakerId;
      const currInitialId = (curr as any).initialSpeakerId || curr.speakerId;
      if (
        prevInitialId !== nextInitialId ||
        currInitialId !== prevInitialId
      ) {
        skippedCrossCluster++;
        continue;
      }
    }

    const confidence = curr.confidence ?? 1;
    const duration = curr.endTime - curr.startTime;
    if (duration > 4) {
      skippedLong++;
      continue;
    }
    if ((curr as any)._debateCorrected || (curr as any)._correctionReason) continue;
    if (confidence >= 0.7 && curr.status !== 'tentative' && curr.status !== 'uncertain') continue;

    updated[i] = {
      ...curr,
      speakerId: prevId,
      finalSpeakerId: prevId,
      confidence,
      status: curr.status ?? 'tentative',
    };
    updatedSegments++;
  }

  if (skippedLong > 0) {
    console.log(`[SMOOTH] Skipped long segments (>4s): ${skippedLong}`);
  }
  if (skippedCrossCluster > 0) {
    console.log(`[SMOOTH] Skipped cross-cluster conversational smoothing: ${skippedCrossCluster}`);
  }

  return { segments: updated, updatedSegments, skippedLong, skippedCrossCluster };
}

export function enforceFinalSpeakerIdContract(
  segments: SpeakerSegment[],
  label: string
): SpeakerSegment[] {
  let mismatches = 0;
  const updated = segments.map((seg) => {
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;
    const initialId = (seg as any).initialSpeakerId || seg.speakerId;
    const current = seg.speakerId;

    if (current !== finalId) {
      mismatches++;
      return {
        ...seg,
        speakerId: finalId,
        finalSpeakerId: finalId,
        initialSpeakerId: initialId,
      };
    }

    return {
      ...seg,
      finalSpeakerId: finalId,
      initialSpeakerId: initialId,
    };
  });

  if (mismatches > 0) {
    console.error(`[FINAL SPEAKER ID] ${label}: ${mismatches} segments had speakerId != finalSpeakerId. Enforced finalSpeakerId.`);
  } else {
    console.log(`[FINAL SPEAKER ID] ${label}: all segments aligned`);
  }

  return updated;
}

export function logSpeakerAssignmentCounts(segments: SpeakerSegment[], label: string) {
  const initialCounts = new Map<string, number>();
  const finalCounts = new Map<string, number>();

  for (const seg of segments) {
    const initialId = (seg as any).initialSpeakerId || seg.speakerId;
    const finalId = (seg as any).finalSpeakerId || seg.speakerId;
    initialCounts.set(initialId, (initialCounts.get(initialId) || 0) + 1);
    finalCounts.set(finalId, (finalCounts.get(finalId) || 0) + 1);
  }

  const formatCounts = (counts: Map<string, number>) =>
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${id}:${count}`)
      .join(', ');

  console.log(`[SPEAKER COUNT] ${label} | initial: ${formatCounts(initialCounts)}`);
  console.log(`[SPEAKER COUNT] ${label} | final:   ${formatCounts(finalCounts)}`);
}

export function buildSpeakerDataFromSegments(
  segments: SpeakerSegment[],
  speakersWithNames: Record<string, any>
): Record<string, any> {
  const grouped = new Map<string, SpeakerSegment[]>();

  for (const seg of segments) {
    const id = (seg as any).finalSpeakerId || seg.speakerId;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(seg);
  }

  const speakers: Record<string, any> = {};

  for (const [id, segs] of grouped.entries()) {
    const rosterEntry = speakersWithNames?.[id] || {};
    const fallbackName = rosterEntry.finalName || rosterEntry.fallbackName || rosterEntry.name || id;
    const totalDuration = segs.reduce((sum, segment) => sum + (segment.endTime - segment.startTime), 0);

    speakers[id] = {
      id,
      finalName: fallbackName,
      role: rosterEntry.role || rosterEntry.displayRole || 'unknown',
      roleConfidence: rosterEntry.roleConfidence,
      assignmentConfidence: rosterEntry.assignmentConfidence,
      assignmentContradictions: rosterEntry.assignmentContradictions,
      requiresReview: rosterEntry.requiresReview,
      extractedName: rosterEntry.extractedName,
      profile: rosterEntry.profile,
      segments: segs.map((segment) => ({
        speakerId: segment.speakerId,
        finalSpeakerId: (segment as any).finalSpeakerId || segment.speakerId,
        initialSpeakerId: (segment as any).initialSpeakerId,
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
        confidence: segment.confidence,
        status: (segment as any).status,
        confidenceReason: (segment as any).confidenceReason,
        reviewStatus: (segment as any).reviewStatus,
        reviewConfirmedAt: (segment as any).reviewConfirmedAt,
        segmentKind: (segment as any).segmentKind,
        sponsorName: (segment as any).sponsorName,
        attributionEvidence: (segment as any).attributionEvidence,
      })),
      totalDuration,
      segmentCount: segs.length,
      gptAttribution: true,
    };
  }

  if (speakersWithNames) {
    for (const [id, speaker] of Object.entries(speakersWithNames)) {
      if (speakers[id]) continue;
      if (speaker?.source !== 'intro_handoff') continue;

      speakers[id] = {
        id,
        finalName: speaker.finalName || speaker.fallbackName || speaker.name || id,
        role: speaker.role || speaker.displayRole || 'unknown',
        roleConfidence: speaker.roleConfidence,
        assignmentConfidence: speaker.assignmentConfidence,
        assignmentContradictions: speaker.assignmentContradictions,
        requiresReview: speaker.requiresReview,
        extractedName: speaker.extractedName,
        profile: speaker.profile,
        segments: [],
        totalDuration: 0,
        segmentCount: 0,
        gptAttribution: true,
        seededOnly: true,
        source: speaker.source,
      };
    }
  }

  return speakers;
}

function collectInitialToFinalCounts(segments: SpeakerSegment[]): Record<string, Record<string, number>> {
  const counts = new Map<string, Map<string, number>>();

  for (const segment of segments) {
    const initialId = (segment as any).initialSpeakerId || segment.speakerId;
    const finalId = (segment as any).finalSpeakerId || segment.speakerId;
    if (!counts.has(initialId)) counts.set(initialId, new Map<string, number>());
    const row = counts.get(initialId)!;
    row.set(finalId, (row.get(finalId) || 0) + 1);
  }

  return Object.fromEntries(
    Array.from(counts.entries()).map(([initialId, row]) => [
      initialId,
      Object.fromEntries(Array.from(row.entries()).sort((a, b) => b[1] - a[1])),
    ])
  );
}

function collectConversationalDrift(segments: SpeakerSegment[]) {
  const byFinalSpeakerId = new Map<string, { initialIds: Set<string>; segmentCount: number }>();

  for (const segment of segments) {
    if (!isConversationalSegment(segment)) continue;
    const finalSpeakerId = (segment as any).finalSpeakerId || segment.speakerId;
    const initialSpeakerId = (segment as any).initialSpeakerId || segment.speakerId;
    if (!byFinalSpeakerId.has(finalSpeakerId)) {
      byFinalSpeakerId.set(finalSpeakerId, { initialIds: new Set<string>(), segmentCount: 0 });
    }
    const entry = byFinalSpeakerId.get(finalSpeakerId)!;
    entry.initialIds.add(initialSpeakerId);
    entry.segmentCount++;
  }

  return Array.from(byFinalSpeakerId.entries())
    .map(([speakerId, entry]) => ({
      speakerId,
      initialSpeakerIds: Array.from(entry.initialIds).sort(),
      segmentCount: entry.segmentCount,
    }))
    .filter((entry) => entry.initialSpeakerIds.length > 1);
}

function summarizeSpeakerMap(
  segments: SpeakerSegment[],
  speakers: Record<string, any>
): Record<string, { finalName: string | null; role: string | null; segmentCount: number }> {
  const segmentCounts = new Map<string, number>();
  for (const segment of segments) {
    const finalSpeakerId = (segment as any).finalSpeakerId || segment.speakerId;
    segmentCounts.set(finalSpeakerId, (segmentCounts.get(finalSpeakerId) || 0) + 1);
  }

  const ids = new Set<string>([
    ...Object.keys(speakers || {}),
    ...Array.from(segmentCounts.keys()),
  ]);

  return Object.fromEntries(
    Array.from(ids).sort().map((id) => {
      const speaker = speakers?.[id] || {};
      return [id, {
        finalName: speaker.finalName || speaker.name || speaker.fallbackName || null,
        role: speaker.role || speaker.displayRole || null,
        segmentCount: segmentCounts.get(id) || 0,
      }];
    })
  );
}

function buildAnonymousAnchorWarnings(
  snapshot: PipelineSnapshot
): string[] {
  const warnings = [...snapshot.warnings];
  const { hostSpeakerId, guestSpeakerId, introAnchorFound } = snapshot.conversationalNaming;
  if (!introAnchorFound || !hostSpeakerId || !guestSpeakerId) {
    return warnings;
  }

  const hostName = snapshot.speakerMap[hostSpeakerId]?.finalName || '';
  const guestName = snapshot.speakerMap[guestSpeakerId]?.finalName || '';
  const hostAnonymous = /^speaker\s+\d+$/i.test(hostName) || hostName.length === 0;
  const guestAnonymous = /^speaker\s+\d+$/i.test(guestName) || guestName.length === 0;
  if (hostAnonymous && guestAnonymous) {
    warnings.push('Strong intro anchor found but both host and guest remain anonymous');
  }
  return warnings;
}

export function collectSpeakerPipelineSnapshot(
  stage: string,
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  options: SpeakerFinalizationOptions = {}
): PipelineSnapshot {
  const orderedIds = Object.keys(speakers || {});
  const roster = orderedIds.map((id) => {
    const speaker = speakers[id] || {};
    const rawName = typeof speaker.finalName === 'string'
      ? speaker.finalName
      : typeof speaker.name === 'string'
        ? speaker.name
        : null;
    return {
      id,
      name: rawName && !/^Speaker\s+\d+$/i.test(rawName) ? rawName : null,
      role: speaker.role || 'unknown',
      confidence: speaker.roleConfidence || speaker.confidence || 0,
      source: speaker.source,
      profile: speaker.profile,
    };
  });

  const conversationalNaming = inspectConversationalNamingState(roster, segments, options);
  const conversationalDrift = collectConversationalDrift(segments);
  const warnings = conversationalDrift.map((entry) =>
    `${entry.speakerId} owns multiple conversational initialSpeakerId values: ${entry.initialSpeakerIds.join(', ')}`
  );

  const snapshot: PipelineSnapshot = {
    stage,
    speakerMap: summarizeSpeakerMap(segments, speakers),
    initialToFinalCounts: collectInitialToFinalCounts(segments),
    conversationalDrift,
    conversationalNaming,
    assignmentTrust: computeSpeakerAssignmentTrust(segments, speakers),
    warnings,
  };

  snapshot.warnings = buildAnonymousAnchorWarnings(snapshot);
  return snapshot;
}

export function finalizeSpeakerAttributionForStorage(
  speakers: Record<string, any>,
  segments: SpeakerSegment[],
  options: SpeakerFinalizationOptions = {}
): {
  speakers: Record<string, any>;
  speakerDataSpeakers: Record<string, any>;
  namingAssigned: number;
  namingInfo: string[];
  snapshot: PipelineSnapshot;
} {
  const resolvedHumans = resolveConversationalHumanNamesInSpeakerMap(
    speakers,
    segments,
    options
  );
  const rawSpeakerDataSpeakers = buildSpeakerDataFromSegments(segments, resolvedHumans.speakers);
  const speakerDataSpeakers = attachSpeakerAssignmentMetadata({
    segments,
    speakers: rawSpeakerDataSpeakers,
  }).speakers;
  const snapshot = collectSpeakerPipelineSnapshot(
    'post-final-naming',
    segments,
    speakerDataSpeakers,
    options
  );

  return {
    speakers: resolvedHumans.speakers,
    speakerDataSpeakers,
    namingAssigned: resolvedHumans.assigned,
    namingInfo: resolvedHumans.info,
    snapshot,
  };
}
