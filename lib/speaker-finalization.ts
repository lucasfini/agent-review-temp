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
  rosterExpectedNamesMissing?: string[];
  rosterCoverageRatio?: number;
  segmentReviewIndices: number[];
  reviewItems: Array<{
    index: number;
    speakerId: string;
    reasons: string[];
    primaryReason: string;
  }>;
  speakerSuggestions?: Array<{
    speakerId: string;
    suggestedName: string;
    suggestedRole?: string | null;
    confidence: number;
    reason: string;
    source: string;
    rejectedReason?: string;
    evidenceSegmentIndices?: number[];
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
    ownershipStable?: boolean;
    panelCorroborated?: boolean;
    suppressedBoundaryCount?: number;
  }>;
  calibrationSummary?: {
    boundarySuppressedCount: number;
    panelCorroborationApplied: boolean;
  };
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

type MergeSpeakerStats = {
  segmentCount: number;
  totalDuration: number;
  conversationalSegmentCount: number;
  conversationalDuration: number;
  substantiveTurns: number;
  dominantInitialSpeakerId: string | null;
  dominantInitialSpeakerCount: number;
  mainConversationShare: number;
};

type InitialClusterStats = {
  initialSpeakerId: string;
  segmentCount: number;
  totalDuration: number;
  substantiveTurns: number;
  firstStart: number;
  mainConversationShare: number;
};

function isConversationalSegment(segment: SpeakerSegment): boolean {
  if (segment.segmentKind === 'ad_read' || segment.segmentKind === 'promo') {
    return false;
  }
  if (segment.segmentKind === 'quoted_audio') {
    return false;
  }
  return true;
}

function isShortAcknowledgementText(text: string | null | undefined): boolean {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  return words <= 4 && /^(?:sure|yeah|yes|right|okay|ok|exactly|thanks?|thank you)[.!?]*$/i.test(normalized);
}

function isConversationTrustEligibleSegment(segment: SpeakerSegment, speakers: Record<string, any>): boolean {
  if (!isConversationalSegment(segment)) return false;
  const speakerId = (segment as any).finalSpeakerId || segment.speakerId;
  const speaker = speakerId ? speakers?.[speakerId] : null;
  const role = speaker?.role;
  if ((role === 'advertiser' || role === 'quoted_audio' || role === 'narrator') && isShortAcknowledgementText(segment.text)) {
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

function normalizeSuggestionName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function isValidSuggestedSpeakerName(name: string | null | undefined): name is string {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length < 3) return false;
  if (/^speaker\s+\d+$/i.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed);
}

function buildSpeakerNameSuggestions(speakerData: any): SpeakerAssignmentTrustSummary['speakerSuggestions'] {
  const existing = speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.speakerSuggestions;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing.filter((suggestion: any) => (
      typeof suggestion?.speakerId === 'string' &&
      isValidSuggestedSpeakerName(suggestion?.suggestedName) &&
      typeof suggestion?.confidence === 'number'
    ));
  }

  const rejectedRepairs = speakerData?.detectionMetadata?.pipelineDiagnostics?.speakerVerification?.rejectedRepairs;
  const speakers = speakerData?.speakers || {};
  const suggestions = new Map<string, NonNullable<SpeakerAssignmentTrustSummary['speakerSuggestions']>[number]>();

  if (Array.isArray(rejectedRepairs)) {
    for (const item of rejectedRepairs) {
      const proposal = item?.proposal;
      const repairType = proposal?.repairType;
      if (repairType !== 'rename' && repairType !== 'bindIntroName') continue;
      if (item?.reason !== 'proposal_confidence_below_threshold') continue;
      if (!isValidSuggestedSpeakerName(proposal?.proposedName)) continue;

      const speakerId = proposal?.targetSpeakerId || proposal?.sourceSpeakerId;
      if (typeof speakerId !== 'string' || !speakerId) continue;

      const currentName = speakers[speakerId]?.finalName || speakers[speakerId]?.name || speakers[speakerId]?.fallbackName;
      if (currentName && !isAnonymousConversationalSpeakerName(currentName)) {
        continue;
      }

      const confidence = Math.max(0, Math.min(1, Number(proposal?.confidence || 0)));
      if (confidence < 0.45) continue;

      const suggestion = {
        speakerId,
        suggestedName: proposal.proposedName.trim(),
        suggestedRole: proposal?.proposedRole || null,
        confidence,
        reason: proposal?.reason || 'Low-confidence speaker name candidate',
        source: repairType === 'bindIntroName' ? 'verifier_intro_binding' : 'verifier_rename',
        rejectedReason: item?.reason,
        evidenceSegmentIndices: Array.isArray(proposal?.evidenceSegmentIndices)
          ? proposal.evidenceSegmentIndices.filter((index: unknown): index is number => typeof index === 'number' && Number.isInteger(index) && index >= 0)
          : [],
      };

      const key = `${speakerId}:${normalizeSuggestionName(suggestion.suggestedName)}`;
      const existingSuggestion = suggestions.get(key);
      if (!existingSuggestion || suggestion.confidence > existingSuggestion.confidence) {
        suggestions.set(key, suggestion);
      }
    }
  }

  const pendingPresetSuggestions = speakerData?.detectionMetadata?.pipelineDiagnostics?.presetPendingSuggestions;
  if (Array.isArray(pendingPresetSuggestions) && pendingPresetSuggestions.length > 0) {
    const bySpeakerSegmentCount = new Map<string, number>();
    const segments: any[] = Array.isArray(speakerData?.segments) ? speakerData.segments : [];
    for (const segment of segments) {
      const speakerId = segment?.finalSpeakerId || segment?.speakerId;
      if (typeof speakerId !== 'string' || !speakerId) continue;
      bySpeakerSegmentCount.set(speakerId, (bySpeakerSegmentCount.get(speakerId) || 0) + 1);
    }

    const candidateSpeakerIds = Object.keys(speakers)
      .filter((speakerId) => {
        const speaker = speakers[speakerId];
        const currentName = speaker?.finalName || speaker?.name || speaker?.fallbackName || null;
        if (!isAnonymousConversationalSpeakerName(currentName)) return false;
        const role = String(speaker?.role || '').toLowerCase();
        if (role === 'advertiser' || role === 'listener_clip') return false;
        return true;
      })
      .sort((a, b) => {
        const diff = (bySpeakerSegmentCount.get(b) || 0) - (bySpeakerSegmentCount.get(a) || 0);
        if (diff !== 0) return diff;
        return a.localeCompare(b);
      });

    const assignedSpeakers = new Set<string>();
    for (const pending of pendingPresetSuggestions) {
      if (!isValidSuggestedSpeakerName(pending?.name)) continue;
      const speakerId = candidateSpeakerIds.find((id) => !assignedSpeakers.has(id));
      if (!speakerId) continue;

      const suggestion = {
        speakerId,
        suggestedName: String(pending.name).trim(),
        suggestedRole: pending?.role || null,
        confidence: Math.max(0, Math.min(1, Number(pending?.confidence || 0.68))),
        reason: pending?.reason || 'Preset roster name is pending participant evidence before automatic promotion.',
        source: 'preset_roster_pending',
        rejectedReason: 'preset_unmatched_suggested',
        evidenceSegmentIndices: [],
      };

      const key = `${speakerId}:${normalizeSuggestionName(suggestion.suggestedName)}`;
      const existingSuggestion = suggestions.get(key);
      if (!existingSuggestion || suggestion.confidence > existingSuggestion.confidence) {
        suggestions.set(key, suggestion);
      }
      assignedSpeakers.add(speakerId);
    }
  }

  return Array.from(suggestions.values()).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.speakerId.localeCompare(b.speakerId);
  });
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

function getSegmentDuration(segment: SpeakerSegment): number {
  return Math.max(0, (segment.endTime || 0) - (segment.startTime || 0));
}

function hasPanelStyleIntro(segments: SpeakerSegment[]): boolean {
  return segments.some((segment) => {
    if (!isConversationalSegment(segment)) return false;
    if ((segment.startTime || 0) > 120) return false;
    const text = String(segment.text || '');
    return /\b(?:our\s+usual\s+panel|our\s+panel\s+includes|we\s+have|we(?:'ve|\s+have)\s+got|and\s+our\s+very\s+own)\b/i.test(text);
  });
}

function isAcknowledgementLikeSegment(segment: SpeakerSegment): boolean {
  const text = String(segment.text || '').trim();
  if (!text) return true;
  const normalized = text.toLowerCase().replace(/[^\w\s']/g, '').trim();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 8 || getSegmentDuration(segment) > 4.5) return false;
  if (/\?$/.test(text)) return false;
  return /^(?:yeah|yes|yep|right|sure|okay|ok|mmhmm|hi|hello|thanks|thank you|nice to be here|lovely to be here|great to be here|good to be here|no problem|exactly|totally|absolutely|i agree|thats right|that's right|fair enough|sounds good)(?:\b|$)/i.test(normalized);
}

type SpeakerOwnershipStability = {
  substantiveTurns: number;
  conversationalDuration: number;
  stableOwnership: boolean;
  panelCorroborated: boolean;
  boundaryUncertainIndices: number[];
  isolatedBoundaryIndices: number[];
  onlyBoundaryRisk: boolean;
  derivedAssignmentConfidence: number | null;
};

function assessSpeakerOwnershipStability(
  ownedSegments: Array<{ segment: SpeakerSegment; index: number }>,
  options: {
    finalName: string | null;
    assignmentConfidence: number | null;
    contradictions: string[];
    requiresReview: boolean;
    anonymous: boolean;
    panelEpisode: boolean;
    namedConversationalSpeakerCount: number;
  }
): SpeakerOwnershipStability {
  const substantiveTurns = ownedSegments.filter(({ segment }) => {
    const duration = getSegmentDuration(segment);
    const words = getSegmentWordCount(segment);
    return words >= 12 || duration >= 8;
  }).length;
  const conversationalDuration = ownedSegments.reduce((sum, { segment }) => sum + getSegmentDuration(segment), 0);
  const uncertainSegments = ownedSegments.filter(({ segment }) => (
    segment.status === 'uncertain' &&
    isRiskySegmentReason(segment.confidenceReason) &&
    !isConfirmedReviewSegment(segment)
  ));
  const boundaryUncertain = uncertainSegments.filter(({ segment }) => segment.confidenceReason === 'transition_short');
  const nonBoundaryUncertain = uncertainSegments.filter(({ segment }) => segment.confidenceReason !== 'transition_short');
  const isolatedBoundaryIndices = boundaryUncertain
    .filter(({ segment }) => isAcknowledgementLikeSegment(segment))
    .map(({ index }) => index);
  const corroboratedNamedSpeaker = !options.anonymous && options.namedConversationalSpeakerCount >= 2;
  const panelStableOwnership = options.panelEpisode &&
    options.namedConversationalSpeakerCount >= 3 &&
    substantiveTurns >= 1 &&
    conversationalDuration >= 20;
  const stableOwnership = corroboratedNamedSpeaker &&
    !options.requiresReview &&
    options.contradictions.length === 0 &&
    (options.assignmentConfidence == null || options.assignmentConfidence >= 0.75) &&
    ((substantiveTurns >= 2 || conversationalDuration >= 40) || panelStableOwnership);
  const panelCorroborated = stableOwnership &&
    options.panelEpisode &&
    options.namedConversationalSpeakerCount >= 3 &&
    substantiveTurns >= 1;
  const onlyBoundaryRisk = uncertainSegments.length > 0 && nonBoundaryUncertain.length === 0;

  let derivedAssignmentConfidence: number | null = options.assignmentConfidence;
  if (derivedAssignmentConfidence == null && !options.anonymous) {
    if (stableOwnership && onlyBoundaryRisk) {
      derivedAssignmentConfidence = panelCorroborated ? 0.9 : 0.88;
    } else if (stableOwnership) {
      derivedAssignmentConfidence = 0.84;
    } else if (substantiveTurns >= 1 && conversationalDuration >= 20 && options.contradictions.length === 0) {
      derivedAssignmentConfidence = 0.72;
    }
  }

  return {
    substantiveTurns,
    conversationalDuration,
    stableOwnership,
    panelCorroborated,
    boundaryUncertainIndices: boundaryUncertain.map(({ index }) => index),
    isolatedBoundaryIndices,
    onlyBoundaryRisk,
    derivedAssignmentConfidence: derivedAssignmentConfidence == null
      ? null
      : Number(Math.max(0, Math.min(1, derivedAssignmentConfidence)).toFixed(2)),
  };
}

function buildMergeSpeakerStats(segments: SpeakerSegment[]): Map<string, MergeSpeakerStats> {
  const stats = new Map<string, {
    segmentCount: number;
    totalDuration: number;
    conversationalSegmentCount: number;
    conversationalDuration: number;
    substantiveTurns: number;
    initialSpeakerCounts: Map<string, number>;
  }>();
  let totalConversationalDuration = 0;

  for (const segment of segments) {
    const speakerId = (segment as any).finalSpeakerId || segment.speakerId;
    if (!stats.has(speakerId)) {
      stats.set(speakerId, {
        segmentCount: 0,
        totalDuration: 0,
        conversationalSegmentCount: 0,
        conversationalDuration: 0,
        substantiveTurns: 0,
        initialSpeakerCounts: new Map<string, number>(),
      });
    }
    const entry = stats.get(speakerId)!;
    const duration = Math.max(0, (segment.endTime || 0) - (segment.startTime || 0));
    entry.segmentCount += 1;
    entry.totalDuration += duration;

    if (isConversationalSegment(segment)) {
      const initialSpeakerId = (segment as any).initialSpeakerId || segment.speakerId;
      entry.conversationalSegmentCount += 1;
      entry.conversationalDuration += duration;
      entry.initialSpeakerCounts.set(
        initialSpeakerId,
        (entry.initialSpeakerCounts.get(initialSpeakerId) || 0) + 1
      );
      totalConversationalDuration += duration;

      const wordCount = getSegmentWordCount(segment);
      if (wordCount >= 8 || duration >= 6) {
        entry.substantiveTurns += 1;
      }
    }
  }

  return new Map(
    Array.from(stats.entries()).map(([speakerId, entry]) => {
      const dominantInitial = Array.from(entry.initialSpeakerCounts.entries())
        .sort((a, b) => b[1] - a[1])[0] || null;
      return [speakerId, {
        segmentCount: entry.segmentCount,
        totalDuration: entry.totalDuration,
        conversationalSegmentCount: entry.conversationalSegmentCount,
        conversationalDuration: entry.conversationalDuration,
        substantiveTurns: entry.substantiveTurns,
        dominantInitialSpeakerId: dominantInitial?.[0] || null,
        dominantInitialSpeakerCount: dominantInitial?.[1] || 0,
        mainConversationShare: totalConversationalDuration > 0
          ? entry.conversationalDuration / totalConversationalDuration
          : 0,
      }];
    })
  );
}

function isMaterialConversationalCluster(stats: MergeSpeakerStats | undefined): boolean {
  if (!stats) return false;
  return stats.conversationalDuration >= 45 ||
    stats.conversationalSegmentCount >= 6 ||
    stats.substantiveTurns >= 3 ||
    stats.mainConversationShare >= 0.18;
}

function buildInitialClusterStats(segments: SpeakerSegment[]): InitialClusterStats[] {
  const stats = new Map<string, {
    segmentCount: number;
    totalDuration: number;
    substantiveTurns: number;
    firstStart: number;
  }>();
  let totalConversationalDuration = 0;

  for (const segment of segments) {
    if (!isConversationalSegment(segment)) continue;
    const initialSpeakerId = (segment as any).initialSpeakerId || segment.speakerId;
    const duration = Math.max(0, (segment.endTime || 0) - (segment.startTime || 0));
    totalConversationalDuration += duration;
    if (!stats.has(initialSpeakerId)) {
      stats.set(initialSpeakerId, {
        segmentCount: 0,
        totalDuration: 0,
        substantiveTurns: 0,
        firstStart: segment.startTime || 0,
      });
    }
    const entry = stats.get(initialSpeakerId)!;
    entry.segmentCount += 1;
    entry.totalDuration += duration;
    entry.firstStart = Math.min(entry.firstStart, segment.startTime || 0);
    if (getSegmentWordCount(segment) >= 8 || duration >= 6) {
      entry.substantiveTurns += 1;
    }
  }

  return Array.from(stats.entries())
    .map(([initialSpeakerId, entry]) => ({
      initialSpeakerId,
      segmentCount: entry.segmentCount,
      totalDuration: entry.totalDuration,
      substantiveTurns: entry.substantiveTurns,
      firstStart: entry.firstStart,
      mainConversationShare: totalConversationalDuration > 0 ? entry.totalDuration / totalConversationalDuration : 0,
    }))
    .sort((a, b) => b.totalDuration - a.totalDuration);
}

function countAlternationsBetweenInitialClusters(
  segments: SpeakerSegment[],
  clusterA: string,
  clusterB: string
): number {
  const filtered = segments
    .filter((segment) => isConversationalSegment(segment))
    .map((segment) => (segment as any).initialSpeakerId || segment.speakerId)
    .filter((clusterId) => clusterId === clusterA || clusterId === clusterB);
  let alternations = 0;
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i] !== filtered[i - 1]) {
      alternations++;
    }
  }
  return alternations;
}

function shouldSkipDuplicateSpeakerMerge(
  segments: SpeakerSegment[],
  primaryId: string,
  duplicateId: string,
  primaryStats: MergeSpeakerStats | undefined,
  duplicateStats: MergeSpeakerStats | undefined,
  options: SpeakerFinalizationOptions
): boolean {
  if (!primaryStats || !duplicateStats) return false;
  if (primaryStats.conversationalSegmentCount === 0 || duplicateStats.conversationalSegmentCount === 0) {
    return false;
  }

  const normalizedProjectType = (options.projectType || '').toUpperCase();
  const protectConversationalMerges =
    normalizedProjectType === 'PODCAST' ||
    normalizedProjectType === 'INTERVIEW' ||
    Boolean(options.showIdentity) ||
    ((options.showRoster?.length || 0) >= 2);

  if (!protectConversationalMerges) {
    return false;
  }

  const differentDominantInitial =
    primaryStats.dominantInitialSpeakerId &&
    duplicateStats.dominantInitialSpeakerId &&
    primaryStats.dominantInitialSpeakerId !== duplicateStats.dominantInitialSpeakerId;

  if (!differentDominantInitial) {
    const alternations = countAlternationsBetweenInitialClusters(
      segments,
      primaryStats.dominantInitialSpeakerId || primaryId,
      duplicateStats.dominantInitialSpeakerId || duplicateId
    );
    if (alternations < 4) {
      return false;
    }
  }

  return isMaterialConversationalCluster(primaryStats) && isMaterialConversationalCluster(duplicateStats);
}

function getNextSpeakerId(speakers: Record<string, any>): string {
  const maxSpeakerNumber = Object.keys(speakers).reduce((max, id) => {
    const numericMatch = /speaker_(\d+)/i.exec(id);
    return numericMatch ? Math.max(max, Number(numericMatch[1])) : max;
  }, 0);
  return `speaker_${maxSpeakerNumber + 1}`;
}

function preventOneOffConversationalCollapse(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  options: SpeakerFinalizationOptions = {}
): { segments: SpeakerSegment[]; speakers: Record<string, any>; restoredClusters: string[] } {
  const normalizedProjectType = (options.projectType || '').toUpperCase();
  if (normalizedProjectType !== 'PODCAST' && normalizedProjectType !== 'INTERVIEW') {
    return { segments, speakers, restoredClusters: [] };
  }

  const speakerStats = buildMergeSpeakerStats(segments);
  const dominantFinalSpeakers = Array.from(speakerStats.entries())
    .filter(([, stats]) => isMaterialConversationalCluster(stats))
    .sort((a, b) => b[1].conversationalDuration - a[1].conversationalDuration);
  if (dominantFinalSpeakers.length >= 2) {
    return { segments, speakers, restoredClusters: [] };
  }

  const initialClusterStats = buildInitialClusterStats(segments).filter((entry) => (
    entry.totalDuration >= 45 ||
    entry.segmentCount >= 5 ||
    entry.substantiveTurns >= 3 ||
    entry.mainConversationShare >= 0.18
  ));
  if (initialClusterStats.length < 2) {
    return { segments, speakers, restoredClusters: [] };
  }

  const primaryCluster = initialClusterStats[0];
  const secondaryCluster = initialClusterStats[1];
  if (countAlternationsBetweenInitialClusters(segments, primaryCluster.initialSpeakerId, secondaryCluster.initialSpeakerId) < 4) {
    return { segments, speakers, restoredClusters: [] };
  }

  const primaryFinalId = segments.find((segment) => (
    ((segment as any).initialSpeakerId || segment.speakerId) === primaryCluster.initialSpeakerId
  ))?.finalSpeakerId || dominantFinalSpeakers[0]?.[0];
  const secondaryCurrentFinalId = segments.find((segment) => (
    ((segment as any).initialSpeakerId || segment.speakerId) === secondaryCluster.initialSpeakerId
  ))?.finalSpeakerId || null;
  if (!primaryFinalId || (secondaryCurrentFinalId && secondaryCurrentFinalId !== primaryFinalId)) {
    return { segments, speakers, restoredClusters: [] };
  }

  const updatedSpeakers: Record<string, any> = { ...speakers };
  const collapsedTemplate = updatedSpeakers[primaryFinalId] || {};
  const reusableId = Object.keys(updatedSpeakers).find((speakerId) => (
    speakerId !== primaryFinalId &&
    (speakerStats.get(speakerId)?.conversationalSegmentCount || 0) === 0
  ));
  const restoredSpeakerId = reusableId || getNextSpeakerId(updatedSpeakers);
  if (!updatedSpeakers[restoredSpeakerId]) {
    const numericMatch = /speaker_(\d+)/i.exec(restoredSpeakerId);
    const fallbackName = numericMatch ? `Speaker ${numericMatch[1]}` : restoredSpeakerId;
    updatedSpeakers[restoredSpeakerId] = {
      id: restoredSpeakerId,
      finalName: fallbackName,
      fallbackName,
      role: 'unknown',
      source: 'two-speaker collapse prevention',
      roleConfidence: 0.55,
      requiresReview: true,
      assignmentConfidence: 0.55,
      assignmentContradictions: ['collapsed_one_off_conversation'],
    };
  }

  const updatedSegments = segments.map((segment) => {
    const initialSpeakerId = (segment as any).initialSpeakerId || segment.speakerId;
    if (initialSpeakerId !== secondaryCluster.initialSpeakerId) {
      return segment;
    }
    return {
      ...segment,
      speakerId: restoredSpeakerId,
      finalSpeakerId: restoredSpeakerId,
      attributionEvidence: 'raw_diarization' as const,
      confidenceReason: 'clean_cluster_consistency',
      status: segment.status ?? 'tentative',
    };
  });

  return {
    segments: updatedSegments,
    speakers: updatedSpeakers,
    restoredClusters: [secondaryCluster.initialSpeakerId],
  };
}

function reconcileCollapsePreventionMetadata(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  restoredClusters: string[]
): Record<string, any> {
  if (restoredClusters.length === 0) return speakers;

  const conversationalStats = buildMergeSpeakerStats(segments);
  const materialClusters = Array.from(conversationalStats.entries())
    .filter(([, stats]) => isMaterialConversationalCluster(stats));
  if (materialClusters.length < 2) {
    return speakers;
  }

  return Object.fromEntries(
    Object.entries(speakers).map(([speakerId, speaker]) => {
      const contradictions = Array.isArray(speaker?.assignmentContradictions)
        ? speaker.assignmentContradictions.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      if (!contradictions.includes('collapsed_one_off_conversation')) {
        return [speakerId, speaker];
      }

      const remainingContradictions = contradictions.filter((value: string) => value !== 'collapsed_one_off_conversation');
      return [speakerId, {
        ...speaker,
        assignmentConfidence: Math.max(
          typeof speaker?.assignmentConfidence === 'number' ? speaker.assignmentConfidence : 0,
          0.82
        ),
        assignmentContradictions: remainingContradictions,
        requiresReview: remainingContradictions.length > 0 ? Boolean(speaker?.requiresReview) : false,
      }];
    })
  );
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
    stableOwnership?: boolean;
    panelCorroborated?: boolean;
    boundaryReviewBudget?: number;
  }
): number[] {
  const hasUnresolvedUncertainSegments = ownedSegments.some(({ segment }) => (
    segment.status === 'uncertain' &&
    isRiskySegmentReason(segment.confidenceReason) &&
    !isConfirmedReviewSegment(segment)
  ));
  const riskySpeaker = options.requiresReview ||
    (options.assignmentConfidence != null && options.assignmentConfidence < 0.75) ||
    options.contradictions.length > 0 ||
    options.anonymous ||
    hasUnresolvedUncertainSegments;

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
      if (options.stableOwnership &&
        segment.confidenceReason === 'transition_short' &&
        isAcknowledgementLikeSegment(segment)
      ) {
        continue;
      }
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

  if (!options.stableOwnership) {
    for (const { index } of sortedOwnedSegments.slice(0, 2)) {
      addCandidate(index, 65, 'early_turn');
    }
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

  if (!options.stableOwnership || !options.panelCorroborated) {
    for (const candidate of substantiveSegments.slice(0, 2)) {
      addCandidate(candidate.index, 55, 'representative_substantive');
    }
  }

  if (options.anonymous && sortedOwnedSegments.length > 0) {
    addCandidate(sortedOwnedSegments[0].index, 60, 'anonymous_fallback');
  }

  return Array.from(candidates.entries())
    .sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return a[0] - b[0];
    })
    .slice(0, options.boundaryReviewBudget ?? 5)
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
    stableOwnership?: boolean;
    panelCorroborated?: boolean;
    boundaryReviewBudget?: number;
  }
): Array<{ index: number; speakerId: string; reasons: string[]; primaryReason: string }> {
  const hasUnresolvedUncertainSegments = ownedSegments.some(({ segment }) => (
    segment.status === 'uncertain' &&
    isRiskySegmentReason(segment.confidenceReason) &&
    !isConfirmedReviewSegment(segment)
  ));
  const riskySpeaker = options.requiresReview ||
    (options.assignmentConfidence != null && options.assignmentConfidence < 0.75) ||
    options.contradictions.length > 0 ||
    options.anonymous ||
    hasUnresolvedUncertainSegments;

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
      if (options.stableOwnership &&
        segment.confidenceReason === 'transition_short' &&
        isAcknowledgementLikeSegment(segment)
      ) {
        continue;
      }
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

  if (!options.stableOwnership) {
    for (const { index } of sortedOwnedSegments.slice(0, 2)) {
      addCandidate(index, 65, 'early_turn');
    }
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

  if (!options.stableOwnership || !options.panelCorroborated) {
    for (const candidate of substantiveSegments.slice(0, 2)) {
      addCandidate(candidate.index, 55, 'representative_substantive');
    }
  }

  if (options.anonymous && sortedOwnedSegments.length > 0) {
    addCandidate(sortedOwnedSegments[0].index, 60, 'anonymous_fallback');
  }

  return Array.from(candidates.entries())
    .sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return a[0] - b[0];
    })
    .slice(0, options.boundaryReviewBudget ?? 5)
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
    .filter(({ segment }) => isConversationTrustEligibleSegment(segment, speakers));
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
  let boundarySuppressedCount = 0;
  const panelEpisode = hasPanelStyleIntro(segments);
  const namedConversationalSpeakerCount = Array.from(new Set(
    conversationalSegments
      .map(({ segment }) => ((segment as any).finalSpeakerId || segment.speakerId))
      .filter((speakerId): speakerId is string => typeof speakerId === 'string' && !!speakers?.[speakerId])
      .filter((speakerId) => !isAnonymousConversationalSpeakerName(
        speakers[speakerId]?.finalName || speakers[speakerId]?.name || speakers[speakerId]?.fallbackName || null
      ))
  )).length;

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
    const ownership = assessSpeakerOwnershipStability(ownedSegments, {
      finalName,
      assignmentConfidence,
      contradictions,
      requiresReview,
      anonymous,
      panelEpisode,
      namedConversationalSpeakerCount,
    });
    const effectiveAssignmentConfidence = ownership.derivedAssignmentConfidence;
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

    if (effectiveAssignmentConfidence != null && effectiveAssignmentConfidence < 0.75) {
      reviewReasons.add('low_assignment_confidence');
      incrementReasonCount(reasonCounts, 'low_assignment_confidence');
      penalty += (0.75 - effectiveAssignmentConfidence) * 0.35 * Math.max(0.75, segmentShare);
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
        const boundaryOnly = reason === 'transition_short';
        const lowValueBoundary = boundaryOnly && isAcknowledgementLikeSegment(segment);
        if (ownership.stableOwnership && boundaryOnly && lowValueBoundary) {
          penalty += 0.02 / totalConversationalSegments;
          boundarySuppressedCount += 1;
          incrementReasonCount(reasonCounts, 'suppressed_transition_short');
        } else if (ownership.stableOwnership && boundaryOnly) {
          penalty += 0.06 / totalConversationalSegments;
          boundarySuppressedCount += 1;
          incrementReasonCount(reasonCounts, 'suppressed_transition_short');
        } else {
          penalty += 0.14 / totalConversationalSegments;
        }
      }
      void index;
      if (isConfirmedReviewSegment(segment)) {
        incrementReasonCount(reasonCounts, 'confirmed_review');
      }
    }

    const boundaryReviewBudget = ownership.stableOwnership
      ? (ownership.panelCorroborated ? 2 : 3)
      : 5;

    const targetedReviewIndices = buildTargetedReviewIndicesForSpeaker(ownedSegments, {
      requiresReview,
      assignmentConfidence: effectiveAssignmentConfidence,
      contradictions,
      anonymous,
      stableOwnership: ownership.stableOwnership,
      panelCorroborated: ownership.panelCorroborated,
      boundaryReviewBudget,
    });
    for (const index of targetedReviewIndices) {
      reviewIndices.add(index);
    }
    const targetedReviewItems = buildTargetedReviewItemsForSpeaker(speakerId, ownedSegments, {
      requiresReview,
      assignmentConfidence: effectiveAssignmentConfidence,
      contradictions,
      anonymous,
      stableOwnership: ownership.stableOwnership,
      panelCorroborated: ownership.panelCorroborated,
      boundaryReviewBudget,
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
      assignmentConfidence: effectiveAssignmentConfidence,
      requiresReview,
      segmentCount: ownedSegments.length,
      anonymous,
      contradictions,
      reviewReasons: Array.from(reviewReasons),
      confirmedSegmentCount,
      ownershipStable: ownership.stableOwnership,
      panelCorroborated: ownership.panelCorroborated,
      suppressedBoundaryCount: ownership.stableOwnership ? ownership.boundaryUncertainIndices.length : 0,
    });
  }

  const effectiveReviewCount = Math.max(0, reviewIndices.size - (boundarySuppressedCount * 0.8));
  const reviewRatio = reviewIndices.size / totalConversationalSegments;
  const effectiveReviewRatio = effectiveReviewCount / totalConversationalSegments;
  let confidence = Math.max(0.2, Math.min(0.99, 0.98 - Math.max(0, penalty)));
  if (reviewIndices.size > 0) {
    const reviewCapBase = boundarySuppressedCount > 0 ? 0.96 : 0.93;
    const reviewCapPenalty = boundarySuppressedCount > 0
      ? Math.min(0.22, effectiveReviewRatio * 0.3)
      : Math.min(0.35, reviewRatio * 0.45);
    confidence = Math.min(confidence, reviewCapBase - reviewCapPenalty);
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
    calibrationSummary: {
      boundarySuppressedCount,
      panelCorroborationApplied: panelEpisode,
    },
  };
}

export function attachSpeakerAssignmentMetadata(
  speakerData: any
): any {
  const summaryBase = computeSpeakerAssignmentTrust(
    Array.isArray(speakerData?.segments) ? speakerData.segments : [],
    speakerData?.speakers || {}
  );
  const pendingPresetSuggestions = Array.isArray(speakerData?.detectionMetadata?.pipelineDiagnostics?.presetPendingSuggestions)
    ? speakerData.detectionMetadata.pipelineDiagnostics.presetPendingSuggestions
    : [];
  const rosterExpectedNamesMissing = pendingPresetSuggestions
    .map((entry: any) => (typeof entry?.name === 'string' ? entry.name.trim() : ''))
    .filter((value: string) => value.length > 0);
  const explicitRosterSize = Array.isArray(speakerData?.detectionMetadata?.pipelineDiagnostics?.showRosterMatches)
    ? speakerData.detectionMetadata.pipelineDiagnostics.showRosterMatches.length
    : null;
  const rosterCoverageRatio = typeof explicitRosterSize === 'number' && explicitRosterSize > 0
    ? Math.max(0, Math.min(1, (explicitRosterSize - rosterExpectedNamesMissing.length) / explicitRosterSize))
    : (rosterExpectedNamesMissing.length > 0 ? 0 : undefined);
  const rosterMissingPenalty = Math.min(0.12, rosterExpectedNamesMissing.length * 0.04);
  const summary: SpeakerAssignmentTrustSummary = {
    ...summaryBase,
    confidence: Number(Math.max(0.2, summaryBase.confidence - rosterMissingPenalty).toFixed(3)),
    reasonCounts: {
      ...summaryBase.reasonCounts,
      ...(rosterExpectedNamesMissing.length > 0
        ? { missing_explicit_roster_name: rosterExpectedNamesMissing.length }
        : {}),
    },
    rosterExpectedNamesMissing: rosterExpectedNamesMissing.length > 0 ? rosterExpectedNamesMissing : undefined,
    rosterCoverageRatio,
  };
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
  const finalNameProvenance = Object.values(speakerData?.speakers || {}).map((speaker: any) => ({
    speakerId: speaker.id,
    finalName: typeof speaker.finalName === 'string' ? speaker.finalName : null,
    provenance: Array.isArray(speaker.nameProvenance) ? speaker.nameProvenance : [],
    finalNameLocked: Boolean(speaker.finalNameLocked),
  }));
  const finalizationSnapshots = Array.isArray(existingDiagnostics?.finalizationSnapshots)
    ? existingDiagnostics.finalizationSnapshots.map((snapshot: any) => ({
        ...snapshot,
        conversationalNaming: snapshot?.conversationalNaming
          ? {
              ...snapshot.conversationalNaming,
              nameProvenance: finalNameProvenance,
            }
          : snapshot?.conversationalNaming,
      }))
    : existingDiagnostics?.finalizationSnapshots;
  const pipelineDiagnosticsBase = existingDiagnostics || {};
  const speakerSummaryById = new Map(summary.speakerSummaries.map((speaker) => [speaker.speakerId, speaker]));
  const speakerSuggestions = buildSpeakerNameSuggestions(speakerData);
  const speakersWithFinalTrust = Object.fromEntries(
    Object.entries(speakerData?.speakers || {}).map(([speakerId, speaker]: [string, any]) => {
      const summaryEntry = speakerSummaryById.get(speakerId);
      if (!summaryEntry) {
        return [speakerId, speaker];
      }
      return [speakerId, {
        ...speaker,
        assignmentConfidence: summaryEntry.assignmentConfidence,
        requiresReview: summaryEntry.requiresReview,
        assignmentContradictions: summaryEntry.contradictions,
      }];
    })
  );

  return {
    ...speakerData,
    speakers: speakersWithFinalTrust,
    detectionMetadata: {
      ...(speakerData?.detectionMetadata || {}),
      speakerAssignmentConfidence: summary.confidence,
      speakerAssignmentReviewCount: summary.reviewCount,
      confirmedReviewCount: summary.confirmedReviewCount,
      speakerAssignmentBreakdown: {
        segmentReviewIndices: summary.segmentReviewIndices,
        reviewItems: summary.reviewItems,
        speakerSuggestions,
        reasonCounts: summary.reasonCounts,
        speakerSummaries: summary.speakerSummaries,
        rosterExpectedNamesMissing: summary.rosterExpectedNamesMissing,
        rosterCoverageRatio: summary.rosterCoverageRatio,
      },
      pipelineDiagnostics: {
        ...pipelineDiagnosticsBase,
        finalizationSnapshots,
        finalNameProvenance,
        finalAssignmentConfidence: summary.confidence,
        finalReviewSummary: {
          reviewCount: summary.reviewCount,
          confirmedReviewCount: summary.confirmedReviewCount,
          reasonCounts: summary.reasonCounts,
          calibrationSummary: summary.calibrationSummary,
          rosterExpectedNamesMissing: summary.rosterExpectedNamesMissing,
          rosterCoverageRatio: summary.rosterCoverageRatio,
          reviewSpeakerIds: summary.speakerSummaries
            .filter((speaker) => speaker.reviewReasons.length > 0)
            .map((speaker) => speaker.speakerId),
        },
        finalRecurringOwnership,
        calibrationSummary: summary.calibrationSummary,
      },
    },
  };
}

export function mergeDuplicateSpeakersByName(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  options: SpeakerFinalizationOptions = {}
): { segments: SpeakerSegment[]; speakers: Record<string, any>; mergedCount: number } {
  const nameMap = new Map<string, string[]>();
  const segmentCounts = new Map<string, number>();
  const mergeStats = buildMergeSpeakerStats(segments);

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
      if (shouldSkipDuplicateSpeakerMerge(segments, primary, dup, mergeStats.get(primary), mergeStats.get(dup), options)) {
        console.log(
          `[MERGE] Skipping duplicate merge for "${name}" between ${primary} and ${dup} because both are substantive conversational clusters`
        );
        continue;
      }
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
      finalNameLocked: rosterEntry.finalNameLocked,
      nameProvenance: rosterEntry.nameProvenance,
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
        finalNameLocked: speaker.finalNameLocked,
        nameProvenance: speaker.nameProvenance,
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
  segments: SpeakerSegment[];
} {
  const collapsePrevention = preventOneOffConversationalCollapse(segments, speakers, options);
  const resolvedHumans = resolveConversationalHumanNamesInSpeakerMap(
    collapsePrevention.speakers,
    collapsePrevention.segments,
    options
  );
  const rawSpeakerDataSpeakers = buildSpeakerDataFromSegments(collapsePrevention.segments, resolvedHumans.speakers);
  const reconciledSpeakerDataSpeakers = reconcileCollapsePreventionMetadata(
    collapsePrevention.segments,
    rawSpeakerDataSpeakers,
    collapsePrevention.restoredClusters
  );
  const speakerDataSpeakers = attachSpeakerAssignmentMetadata({
    segments: collapsePrevention.segments,
    speakers: reconciledSpeakerDataSpeakers,
  }).speakers;
  const snapshot = collectSpeakerPipelineSnapshot(
    'post-final-naming',
    collapsePrevention.segments,
    speakerDataSpeakers,
    options
  );
  if (collapsePrevention.restoredClusters.length > 0) {
    snapshot.warnings.push(
      `Restored collapsed one-off conversational clusters: ${collapsePrevention.restoredClusters.join(', ')}`
    );
  }

  return {
    speakers: resolvedHumans.speakers,
    speakerDataSpeakers,
    namingAssigned: resolvedHumans.assigned,
    namingInfo: [
      ...collapsePrevention.restoredClusters.map((clusterId) =>
        `[COLLAPSE PREVENTION] Restored initial cluster ${clusterId} to its own conversational speaker`
      ),
      ...resolvedHumans.info,
    ],
    snapshot,
    segments: collapsePrevention.segments,
  };
}
