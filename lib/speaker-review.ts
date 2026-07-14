type SpeakerDataLike = {
  segments?: any[];
  speakers?: Record<string, any>;
  detectionMetadata?: Record<string, unknown> & {
    speakerAssignmentConfidence?: number;
    speakerAssignmentReviewCount?: number;
    confirmedReviewCount?: number;
    speakerAssignmentBreakdown?: {
      segmentReviewIndices?: number[];
      reviewItems?: Array<{
        index: number;
        speakerId: string;
        reasons?: string[];
        primaryReason?: string;
      }>;
      speakerSuggestions?: SpeakerSuggestion[];
    };
    pipelineDiagnostics?: {
      speakerVerification?: {
        rejectedRepairs?: Array<{
          reason?: string;
          proposal?: {
            repairType?: string;
            targetSpeakerId?: string;
            sourceSpeakerId?: string;
            proposedName?: string | null;
            proposedRole?: string | null;
            confidence?: number;
            reason?: string;
            evidenceSegmentIndices?: number[];
          };
        }>;
      };
    };
  };
};

const REVIEW_CONFIDENCE_THRESHOLD = 0.75;
const MIN_SUGGESTED_NAME_CONFIDENCE = 0.45;

export type SpeakerSuggestion = {
  speakerId: string;
  suggestedName: string;
  suggestedRole?: string | null;
  confidence: number;
  reason: string;
  source: string;
  rejectedReason?: string;
  evidenceSegmentIndices?: number[];
};

function isConversationalSegment(segment: any): boolean {
  return segment?.segmentKind !== 'ad_read' &&
    segment?.segmentKind !== 'promo' &&
    segment?.segmentKind !== 'quoted_audio';
}

function isConfirmedReviewSegment(segment: any): boolean {
  return segment?.reviewStatus === 'confirmed';
}

function isOpenReviewIndex(
  speakerData: SpeakerDataLike | null | undefined,
  index: number
): boolean {
  const segment = speakerData?.segments?.[index];
  return !segment || !isConfirmedReviewSegment(segment);
}

export function isRiskyConfidenceReason(reason: string | null | undefined): boolean {
  return reason === 'acoustic_only' ||
    reason === 'transition_short' ||
    reason === 'role_mismatch' ||
    reason === 'conflicted_anchors';
}

export function getStoredReviewSegmentIndices(speakerData: SpeakerDataLike | null | undefined): number[] {
  const stored = speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.segmentReviewIndices;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0)
    .filter((index) => isOpenReviewIndex(speakerData, index))
    .sort((a, b) => a - b);
}

export function getStoredReviewItems(speakerData: SpeakerDataLike | null | undefined) {
  const stored = speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.reviewItems;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((item): item is { index: number; speakerId: string; reasons?: string[]; primaryReason?: string } => (
      typeof item?.index === 'number' && typeof item?.speakerId === 'string'
    ))
    .filter((item) => isOpenReviewIndex(speakerData, item.index))
    .sort((a, b) => a.index - b.index);
}

function isGenericSpeakerName(name: string | null | undefined): boolean {
  return /^speaker\s+\d+$/i.test(String(name || '').trim());
}

function getSpeakerNameForSuggestion(
  speakerData: SpeakerDataLike | null | undefined,
  speakerId: string
): string | null {
  const speaker = speakerData?.speakers?.[speakerId];
  return speaker?.customName ||
    speaker?.finalName ||
    speaker?.extractedName?.name ||
    speaker?.fallbackName ||
    speaker?.name ||
    null;
}

function isOpenSpeakerNameSuggestion(
  speakerData: SpeakerDataLike | null | undefined,
  speakerId: string
): boolean {
  const currentName = getSpeakerNameForSuggestion(speakerData, speakerId);
  return !currentName || isGenericSpeakerName(currentName);
}

function isValidSuggestionName(name: string | null | undefined): name is string {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length < 3) return false;
  if (isGenericSpeakerName(trimmed)) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  return true;
}

export function getSpeakerSuggestionsFromSpeakerData(
  speakerData: SpeakerDataLike | null | undefined
): SpeakerSuggestion[] {
  const stored = speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.speakerSuggestions;
  if (Array.isArray(stored)) {
    return stored
      .filter((suggestion): suggestion is SpeakerSuggestion => (
        typeof suggestion?.speakerId === 'string' &&
        isValidSuggestionName(suggestion?.suggestedName) &&
        typeof suggestion?.confidence === 'number' &&
        isOpenSpeakerNameSuggestion(speakerData, suggestion.speakerId)
      ))
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return a.speakerId.localeCompare(b.speakerId);
      });
  }

  const rejected = speakerData?.detectionMetadata?.pipelineDiagnostics?.speakerVerification?.rejectedRepairs;
  if (!Array.isArray(rejected)) return [];

  const bySpeakerAndName = new Map<string, SpeakerSuggestion>();
  for (const item of rejected) {
    const proposal = item?.proposal;
    const repairType = proposal?.repairType;
    if (repairType !== 'rename' && repairType !== 'bindIntroName') continue;
    if (item?.reason !== 'proposal_confidence_below_threshold') continue;
    if (!isValidSuggestionName(proposal?.proposedName)) continue;

    const speakerId = proposal?.targetSpeakerId || proposal?.sourceSpeakerId;
    if (!speakerId) continue;
    if (!isOpenSpeakerNameSuggestion(speakerData, speakerId)) {
      continue;
    }

    const confidence = Math.max(0, Math.min(1, Number(proposal?.confidence || 0)));
    if (confidence < MIN_SUGGESTED_NAME_CONFIDENCE) continue;

    const key = `${speakerId}:${normalizeForSuggestion(proposal!.proposedName!)}`;
    const suggestion: SpeakerSuggestion = {
      speakerId,
      suggestedName: proposal!.proposedName!.trim(),
      suggestedRole: proposal?.proposedRole || null,
      confidence,
      reason: proposal?.reason || 'Low-confidence speaker name candidate',
      source: repairType === 'bindIntroName' ? 'verifier_intro_binding' : 'verifier_rename',
      rejectedReason: item?.reason,
      evidenceSegmentIndices: Array.isArray(proposal?.evidenceSegmentIndices)
        ? proposal!.evidenceSegmentIndices!.filter((index): index is number => Number.isInteger(index) && index >= 0)
        : [],
    };
    const existing = bySpeakerAndName.get(key);
    if (!existing || suggestion.confidence > existing.confidence) {
      bySpeakerAndName.set(key, suggestion);
    }
  }

  return Array.from(bySpeakerAndName.values()).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.speakerId.localeCompare(b.speakerId);
  });
}

function normalizeForSuggestion(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function formatReviewReason(reason: string | null | undefined): string {
  if (!reason) return 'Needs review';
  if (reason.startsWith('uncertain:transition_short')) return 'Boundary segment';
  if (reason.startsWith('uncertain:role_mismatch')) return 'Role mismatch';
  if (reason.startsWith('uncertain:acoustic_only')) return 'Acoustic only';
  if (reason.startsWith('uncertain:conflicted_anchors')) return 'Conflicting anchors';
  if (reason === 'contradiction_alias') return 'Ownership contradiction';
  if (reason === 'assignment_contradiction') return 'Ownership contradiction';
  if (reason === 'low_assignment_confidence') return 'Low confidence';
  if (reason === 'requires_review') return 'Needs review';
  if (reason === 'anchor_turn') return 'Anchor turn';
  if (reason === 'early_turn') return 'Early turn';
  if (reason === 'representative_substantive') return 'Representative sample';
  if (reason === 'anonymous_fallback') return 'Unnamed speaker';
  return 'Needs review';
}

export function getReviewSegmentIndicesFromSpeakerData(
  speakerData: SpeakerDataLike | null | undefined
): number[] {
  const storedItems = getStoredReviewItems(speakerData);
  if (storedItems.length > 0) {
    return storedItems.map((item) => item.index);
  }
  const hasStoredItems = Array.isArray(speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.reviewItems);
  const stored = getStoredReviewSegmentIndices(speakerData);
  const hasStoredIndices = Array.isArray(speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.segmentReviewIndices);
  if (hasStoredIndices) return stored;
  if (hasStoredItems) return [];
  if (stored.length > 0) return stored;

  const segments = Array.isArray(speakerData?.segments) ? speakerData!.segments! : [];
  const speakers = speakerData?.speakers || {};
  const bySpeaker = new Map<string, Array<{ index: number; segment: any }>>();
  const indices = new Set<number>();

  segments.forEach((segment, index) => {
    const speakerId = segment?.finalSpeakerId || segment?.speakerId;
    if (!speakerId) return;
    if (!bySpeaker.has(speakerId)) bySpeaker.set(speakerId, []);
    bySpeaker.get(speakerId)!.push({ index, segment });
    if (segment?.status === 'uncertain' && isRiskyConfidenceReason(segment?.confidenceReason) && !isConfirmedReviewSegment(segment)) {
      indices.add(index);
    }
  });

  for (const [speakerId, ownedSegments] of bySpeaker.entries()) {
    const speaker = speakers[speakerId];
    const speakerNeedsReview = Boolean(
      speaker?.requiresReview ||
      (typeof speaker?.assignmentConfidence === 'number' && speaker.assignmentConfidence < REVIEW_CONFIDENCE_THRESHOLD) ||
      (Array.isArray(speaker?.assignmentContradictions) && speaker.assignmentContradictions.length > 0) ||
      /^speaker\s+\d+$/i.test(String(speaker?.finalName || speaker?.name || speaker?.fallbackName || '').trim())
    );
    if (!speakerNeedsReview) continue;

    for (const { index } of ownedSegments.slice(0, 2)) {
      if (!isConfirmedReviewSegment(segments[index])) {
        indices.add(index);
      }
    }

    const representative = ownedSegments
      .filter(({ segment }) => !isConfirmedReviewSegment(segment))
      .map(({ index, segment }) => ({
        index,
        words: String(segment?.text || '').split(/\s+/).filter(Boolean).length,
        duration: Math.max(0, (segment?.endTime || 0) - (segment?.startTime || 0)),
      }))
      .sort((a, b) => {
        if (b.words !== a.words) return b.words - a.words;
        if (b.duration !== a.duration) return b.duration - a.duration;
        return a.index - b.index;
      })[0];

    if (representative) {
      indices.add(representative.index);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

export function getReviewItemsFromSpeakerData(
  speakerData: SpeakerDataLike | null | undefined
) {
  const storedItems = getStoredReviewItems(speakerData);
  if (storedItems.length > 0) {
    return storedItems.map((item) => ({
      ...item,
      reasons: Array.isArray(item.reasons) ? item.reasons : [],
      primaryReason: item.primaryReason || (Array.isArray(item.reasons) && item.reasons[0]) || 'review',
      label: formatReviewReason(item.primaryReason || (Array.isArray(item.reasons) && item.reasons[0]) || 'review'),
    }));
  }

  return getReviewSegmentIndicesFromSpeakerData(speakerData).map((index) => ({
    index,
    speakerId: String(speakerData?.segments?.[index]?.finalSpeakerId || speakerData?.segments?.[index]?.speakerId || ''),
    reasons: [],
    primaryReason: 'review',
    label: formatReviewReason('review'),
  }));
}

export function isReviewSegment(
  speakerData: SpeakerDataLike | null | undefined,
  segment: any,
  index: number
): boolean {
  const stored = getStoredReviewSegmentIndices(speakerData);
  if (Array.isArray(speakerData?.detectionMetadata?.speakerAssignmentBreakdown?.segmentReviewIndices)) {
    return stored.includes(index);
  }

  const speakerId = segment?.finalSpeakerId || segment?.speakerId;
  const speaker = speakerId ? speakerData?.speakers?.[speakerId] : null;
  if (isConfirmedReviewSegment(segment)) return false;
  return Boolean(
    getReviewSegmentIndicesFromSpeakerData(speakerData).includes(index) ||
    speaker?.requiresReview ||
    (typeof speaker?.assignmentConfidence === 'number' && speaker.assignmentConfidence < REVIEW_CONFIDENCE_THRESHOLD) ||
    (Array.isArray(speaker?.assignmentContradictions) && speaker.assignmentContradictions.length > 0) ||
    (segment?.status === 'uncertain' && isRiskyConfidenceReason(segment?.confidenceReason))
  );
}

export function getSpeakerAssignmentConfidencePercent(
  speakerData: SpeakerDataLike | null | undefined
): number | null {
  const stored = speakerData?.detectionMetadata?.speakerAssignmentConfidence;
  if (typeof stored === 'number' && stored >= 0) {
    return Math.max(0, Math.min(1, stored)) * 100;
  }

  const segments = Array.isArray(speakerData?.segments) ? speakerData!.segments! : [];
  const speakers = speakerData?.speakers || {};
  const conversationalSegments = segments.filter(isConversationalSegment);
  if (conversationalSegments.length === 0) {
    return null;
  }

  const reviewIndices = getReviewSegmentIndicesFromSpeakerData(speakerData);
  const conversationalSpeakerIds = new Set(
    conversationalSegments
      .map((segment) => segment?.finalSpeakerId || segment?.speakerId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  );
  const anonymousSpeakers = Array.from(conversationalSpeakerIds).filter((speakerId) => {
    const name = speakers[speakerId]?.finalName || speakers[speakerId]?.name || speakers[speakerId]?.fallbackName || '';
    return /^speaker\s+\d+$/i.test(String(name).trim());
  }).length;
  const riskySpeakers = Array.from(conversationalSpeakerIds).filter((speakerId) => {
    const speaker = speakers[speakerId];
    return Boolean(
      speaker?.requiresReview ||
      (typeof speaker?.assignmentConfidence === 'number' && speaker.assignmentConfidence < REVIEW_CONFIDENCE_THRESHOLD) ||
      (Array.isArray(speaker?.assignmentContradictions) && speaker.assignmentContradictions.length > 0)
    );
  }).length;

  const reviewRatio = reviewIndices.length / conversationalSegments.length;
  const anonymousRatio = anonymousSpeakers / Math.max(1, conversationalSpeakerIds.size);
  const riskySpeakerRatio = riskySpeakers / Math.max(1, conversationalSpeakerIds.size);

  let confidence = 0.96;
  confidence -= Math.min(0.45, reviewRatio * 0.55);
  confidence -= anonymousRatio * 0.12;
  confidence -= riskySpeakerRatio * 0.18;

  return Math.max(20, Math.min(98, confidence * 100));
}
