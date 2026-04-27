import OpenAI from 'openai';
import type { SpeakerSegment, SpeakerRole } from '@/lib/types';
import type { ShowIdentityMatch, ShowRosterEntry } from '@/lib/show-speaker-memory';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';
import { computeSpeakerAssignmentTrust } from '@/lib/speaker-finalization';

type SpeakerVerificationContext = {
  title?: string;
  filename?: string;
  showIdentity?: ShowIdentityMatch | null;
  showRoster?: ShowRosterEntry[];
  openaiApiKey?: string;
  userId?: string;
  projectId?: string;
  reservationId?: string;
};

type SpeakerClusterStats = {
  speakerId: string;
  finalName: string | null;
  role: string | null;
  segmentCount: number;
  totalDuration: number;
  conversationalSegmentCount: number;
  conversationalDuration: number;
  substantiveTurns: number;
  longAnswerTurns: number;
  adSegmentCount: number;
  promoSegmentCount: number;
  quotedSegmentCount: number;
  adRatio: number;
  mainConversationShare: number;
  firstStart: number | null;
  sampleSegments: Array<{ index: number; startTime: number; endTime: number; text: string; kind?: string; reason?: string | null }>;
};

type SpeakerVerificationRepairProposal = {
  repairType: 'rename' | 'demote' | 'merge' | 'splitRecommendation' | 'bindIntroName' | 'classifyQuotedAudio' | 'clearName';
  targetSpeakerId?: string;
  sourceSpeakerId?: string;
  mergeIntoSpeakerId?: string;
  proposedName?: string | null;
  proposedRole?: SpeakerRole | null;
  evidenceSegmentIndices?: number[];
  confidence?: number;
  reason?: string;
};

type SpeakerVerificationDiagnostics = {
  skipped: boolean;
  triggerReasons: string[];
  modelsAttempted: string[];
  modelUsed: string | null;
  escalationReason: string | null;
  dossierSummary: {
    title: string | null;
    filename: string | null;
    showIdentity: { id: string; displayName: string; matchedBy: string } | null;
    speakerCount: number;
    segmentCount: number;
    currentTrust: number;
    currentReviewCount: number;
    clusters: Array<Omit<SpeakerClusterStats, 'sampleSegments'> & { sampleSegmentIndices: number[] }>;
  };
  deterministicRepairs: Array<{ repairType: string; speakerId: string; reason: string; before?: string | null; after?: string | null }>;
  proposals: SpeakerVerificationRepairProposal[];
  acceptedRepairs: Array<{ proposal: SpeakerVerificationRepairProposal; reason: string }>;
  rejectedRepairs: Array<{ proposal: SpeakerVerificationRepairProposal; reason: string }>;
  finalTrustDelta: number | null;
  error?: string;
};

type ProposalValidationResult = {
  ok: boolean;
  reason: string;
  mode?: 'cluster' | 'segment';
};

type SpeakerVerificationResult = {
  segments: SpeakerSegment[];
  speakers: Record<string, any>;
  diagnostics: SpeakerVerificationDiagnostics;
};

const DEFAULT_VERIFIER_MODEL = 'gpt-5.2';
const DEFAULT_HEAVY_VERIFIER_MODEL = 'gpt-5';
const SAFE_VERIFIER_FALLBACK_MODEL = 'gpt-5';

function getMediumVerifierModel(): string {
  return process.env.SPEAKER_VERIFIER_MODEL ||
    process.env.OPENAI_SPEAKER_VERIFIER_MODEL ||
    DEFAULT_VERIFIER_MODEL;
}

function getHeavyVerifierModel(): string {
  return process.env.SPEAKER_VERIFIER_HEAVY_MODEL ||
    process.env.OPENAI_SPEAKER_VERIFIER_HEAVY_MODEL ||
    DEFAULT_HEAVY_VERIFIER_MODEL;
}

function isModelUnavailableError(error: any): boolean {
  const message = String(error?.message || '');
  return /model_not_found|does not exist|not_found|do not have access|404/i.test(message);
}

function normalizeName(name: string | null | undefined): string {
  return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function getDisplayName(speaker: any): string | null {
  const name = speaker?.finalName || speaker?.customName || speaker?.extractedName?.name || speaker?.name || speaker?.fallbackName || null;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

function isAnonymousName(name: string | null | undefined): boolean {
  if (!name) return true;
  return /^speaker\s+\d+$/i.test(name.trim());
}

function getFallbackName(speakerId: string): string {
  const match = /speaker_(\d+)/i.exec(speakerId);
  return match ? `Speaker ${match[1]}` : speakerId;
}

function isConversationalSegment(segment: SpeakerSegment): boolean {
  return segment.segmentKind !== 'ad_read' && segment.segmentKind !== 'promo' && segment.segmentKind !== 'quoted_audio';
}

function wordCount(text: string | null | undefined): number {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function segmentDuration(segment: SpeakerSegment): number {
  return Math.max(0, (segment.endTime || 0) - (segment.startTime || 0));
}

function truncateText(text: string, max = 260): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function isSubstantiveTurn(segment: SpeakerSegment): boolean {
  return wordCount(segment.text) >= 12 || segmentDuration(segment) >= 8;
}

function isLongAnswerTurn(segment: SpeakerSegment): boolean {
  return wordCount(segment.text) >= 35 || segmentDuration(segment) >= 20;
}

function buildClusterStats(segments: SpeakerSegment[], speakers: Record<string, any>): SpeakerClusterStats[] {
  const totalConversationDuration = segments
    .filter(isConversationalSegment)
    .reduce((sum, segment) => sum + segmentDuration(segment), 0);

  return Object.entries(speakers || {}).map(([speakerId, speaker]) => {
    const owned = segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => ((segment as any).finalSpeakerId || segment.speakerId) === speakerId);
    const conversational = owned.filter(({ segment }) => isConversationalSegment(segment));
    const conversationalDuration = conversational.reduce((sum, { segment }) => sum + segmentDuration(segment), 0);
    const adCount = owned.filter(({ segment }) => segment.segmentKind === 'ad_read' || Boolean(segment.sponsorName)).length;
    const promoCount = owned.filter(({ segment }) => segment.segmentKind === 'promo').length;
    const quotedCount = owned.filter(({ segment }) => segment.segmentKind === 'quoted_audio').length;
    const substantive = conversational.filter(({ segment }) => isSubstantiveTurn(segment));
    const longAnswers = conversational.filter(({ segment }) => isLongAnswerTurn(segment));
    const firstStart = owned.length > 0
      ? Math.min(...owned.map(({ segment }) => segment.startTime || 0))
      : null;
    const firstSamples = owned.slice(0, 2);
    const longSamples = [...longAnswers]
      .sort((a, b) => segmentDuration(b.segment) - segmentDuration(a.segment))
      .slice(0, 3);
    const sampleMap = new Map<number, { segment: SpeakerSegment; index: number }>();
    [...firstSamples, ...longSamples].forEach((item) => sampleMap.set(item.index, item));
    return {
      speakerId,
      finalName: getDisplayName(speaker),
      role: speaker?.role || null,
      segmentCount: owned.length,
      totalDuration: owned.reduce((sum, { segment }) => sum + segmentDuration(segment), 0),
      conversationalSegmentCount: conversational.length,
      conversationalDuration,
      substantiveTurns: substantive.length,
      longAnswerTurns: longAnswers.length,
      adSegmentCount: adCount,
      promoSegmentCount: promoCount,
      quotedSegmentCount: quotedCount,
      adRatio: owned.length > 0 ? (adCount + promoCount) / owned.length : 0,
      mainConversationShare: totalConversationDuration > 0 ? conversationalDuration / totalConversationDuration : 0,
      firstStart,
      sampleSegments: Array.from(sampleMap.values()).map(({ segment, index }) => ({
        index,
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: truncateText(segment.text),
        kind: segment.segmentKind,
        reason: segment.confidenceReason || null,
      })),
    };
  }).sort((a, b) => b.conversationalDuration - a.conversationalDuration);
}

function isLikelyHumanName(name: string | null | undefined): boolean {
  const trimmed = String(name || '').trim();
  if (!trimmed || /^speaker\s+\d+$/i.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (words.some((word) => !/^[A-Z][A-Za-z'.-]+$/.test(word))) return false;
  return true;
}

function isLikelyFirstName(name: string | null | undefined): boolean {
  const trimmed = String(name || '').trim();
  return /^[A-Z][A-Za-z'.-]{2,}$/.test(trimmed);
}

function proposalReasonText(proposal: SpeakerVerificationRepairProposal): string {
  return String(proposal.reason || '').toLowerCase();
}

function isBlockedConversationalHumanName(name: string | null | undefined): boolean {
  const trimmed = String(name || '').trim();
  if (!trimmed) return true;
  if (!isLikelyHumanName(trimmed)) return true;
  return /\b(?:station|airport|terminal|assembly|council|department|secretary|minister|senator|president|government|administration|united states|america|treaty|resolution|act|bill|law|nobel|university|college|school|institute|foundation|studio|media|podcast|show|newsletter|tour|labs?|llc|inc|corp|company)\b/i.test(trimmed);
}

function isListenerSelfIdProposal(
  proposal: SpeakerVerificationRepairProposal,
  targetStats: SpeakerClusterStats | undefined
): boolean {
  const confidence = typeof proposal.confidence === 'number' ? proposal.confidence : 0;
  if (confidence < 0.9) return false;
  if (!isLikelyFirstName(proposal.proposedName) && !isLikelyHumanName(proposal.proposedName)) return false;
  const reason = proposalReasonText(proposal);
  if (!/\b(?:self-identif|my name is|this is|listener|voicemail|submission|caller)\b/.test(reason)) return false;
  if ((targetStats?.adRatio || 0) >= 0.2) return false;
  if ((targetStats?.conversationalSegmentCount || 0) > 4) return false;
  if ((targetStats?.conversationalDuration || 0) > 75) return false;
  return true;
}

function isResidualMultiGuestBindingProposal(
  proposal: SpeakerVerificationRepairProposal,
  targetSpeaker: any,
  targetStats: SpeakerClusterStats | undefined,
  speakers: Record<string, any>,
  statsById: Map<string, SpeakerClusterStats>
): boolean {
  const confidence = typeof proposal.confidence === 'number' ? proposal.confidence : 0;
  if (proposal.repairType !== 'bindIntroName') return false;
  if (confidence < 0.52) return false;
  if (!proposal.proposedName || isBlockedConversationalHumanName(proposal.proposedName)) return false;
  if (!targetStats || (targetStats.adRatio || 0) >= 0.2) return false;
  if ((targetStats.substantiveTurns || 0) < 2 && (targetStats.conversationalDuration || 0) < 45) return false;
  if (!isAnonymousName(getDisplayName(targetSpeaker))) return false;

  const reason = proposalReasonText(proposal);
  if (!/\b(?:remaining|only other|unbound|second guest|multi-guest|introduced|intro names)\b/.test(reason)) return false;

  const anonymousSubstantive = Array.from(statsById.values()).filter((entry) => {
    const speaker = speakers[entry.speakerId];
    return isAnonymousName(getDisplayName(speaker)) &&
      (entry.adRatio || 0) < 0.2 &&
      (entry.substantiveTurns >= 2 || entry.conversationalDuration >= 45);
  });
  if (anonymousSubstantive.length !== 1 || anonymousSubstantive[0].speakerId !== targetStats.speakerId) return false;

  const namedGuests = Object.values(speakers).filter((speaker: any) => (
    speaker?.role === 'guest' &&
    !isAnonymousName(getDisplayName(speaker)) &&
    !isBlockedConversationalHumanName(getDisplayName(speaker))
  ));
  return namedGuests.length >= 1;
}

function isHumanConversationalSpeaker(speaker: any): boolean {
  const role = speaker?.role || 'unknown';
  const name = getDisplayName(speaker);
  return role !== 'advertiser' &&
    role !== 'narrator' &&
    role !== 'quoted_audio' &&
    !isAnonymousName(name) &&
    !isBlockedConversationalHumanName(name);
}

function isGenericSpeakerName(name: string | null | undefined): boolean {
  if (!name) return true;
  return /^speaker\s+\d+$/i.test(name.trim()) || /^quoted audio$/i.test(name.trim());
}

function isProtectedParticipantSpeaker(speaker: any): boolean {
  const role = speaker?.role || 'unknown';
  const provenance = Array.isArray(speaker?.nameProvenance) ? speaker.nameProvenance : [];
  return role === 'host' ||
    role === 'co_host' ||
    Boolean(speaker?.finalNameLocked) ||
    provenance.some((reason: unknown) => (
      typeof reason === 'string' &&
      /recurring_roster|known_host_intro|self_id|guest_intro|direct_intro|panel_intro|dominant_reply_after_intro/.test(reason)
    ));
}

function isAdLikeText(text: string | null | undefined): boolean {
  return /\b(?:sponsor|sponsored|brought to you by|use code|promo code|checkout|limited time|subscribe|newsletter|advertiser|visit|dot com|free trial|offer|save|discount)\b/i.test(String(text || ''));
}

function isShortSpilloverText(text: string | null | undefined): boolean {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (wordCount(normalized) <= 4 && /^(?:sure|yeah|yes|right|okay|ok|exactly|thanks?|thank you)[.!?]*$/i.test(normalized)) {
    return true;
  }
  return wordCount(normalized) <= 3 && normalized.length <= 18;
}

function isQuotedLikeText(text: string | null | undefined): boolean {
  return /\b(?:\[foreign language\]|\[speaker\]|clip|tape|audio|speech|said|quote|president|trump|biden|taliban|podium|rally|address|legislator|administration|congress|white house|sanctuary cities|nuclear weapon)\b/i.test(String(text || ''));
}

function getEvidenceIndexSet(proposal: SpeakerVerificationRepairProposal): Set<number> {
  return new Set(
    (Array.isArray(proposal.evidenceSegmentIndices) ? proposal.evidenceSegmentIndices : [])
      .filter((index): index is number => Number.isInteger(index) && index >= 0)
  );
}

function getOwnedSegmentItems(segments: SpeakerSegment[], speakerId: string): Array<{ segment: SpeakerSegment; index: number }> {
  return segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => ((segment as any).finalSpeakerId || segment.speakerId) === speakerId);
}

function getTargetedOwnedSegmentItems(
  proposal: SpeakerVerificationRepairProposal,
  segments: SpeakerSegment[],
  speakerId: string
): Array<{ segment: SpeakerSegment; index: number }> {
  const evidence = getEvidenceIndexSet(proposal);
  const owned = getOwnedSegmentItems(segments, speakerId);
  if (evidence.size === 0) return owned;
  return owned.filter(({ index }) => evidence.has(index));
}

function findDominantConversationalCluster(
  stats: SpeakerClusterStats[],
  excludeIds = new Set<string>()
): SpeakerClusterStats | null {
  return stats.find((entry) => (
    !excludeIds.has(entry.speakerId) &&
    entry.conversationalSegmentCount >= 3 &&
    (entry.substantiveTurns >= 2 || entry.conversationalDuration >= 45)
  )) || null;
}

function detectTitleGuestCandidate(title?: string, filename?: string): string | null {
  const source = `${title || ''} ${filename || ''}`.replace(/[_-]+/g, ' ');
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:explains|on|talks|discusses|breaks down|joins)\b/,
    /\b(?:with|conversation with|talking to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    const candidate = match?.[1]?.trim();
    if (candidate && isLikelyHumanName(candidate) && !isBlockedConversationalHumanName(candidate)) {
      return candidate;
    }
  }
  return null;
}

function detectDirectAddressNameForCluster(
  segments: SpeakerSegment[],
  speakerId: string,
  title?: string
): string | null {
  const titleNames = extractLikelyFullNames(`${title || ''}`);
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (!isConversationalSegment(segment) || !isConversationalSegment(next)) continue;
    const nextSpeakerId = (next as any).finalSpeakerId || next.speakerId;
    if (nextSpeakerId !== speakerId || !isSubstantiveTurn(next)) continue;
    const match = /\b(?:so|now|first|then|and)\s+([A-Z][a-z]{2,})\b/.exec(segment.text || '');
    const firstName = match?.[1]?.trim();
    if (!firstName) continue;
    const fullName = titleNames.find((name) => name.toLowerCase().startsWith(`${firstName.toLowerCase()} `));
    if (fullName && !isBlockedConversationalHumanName(fullName)) return fullName;
  }
  return null;
}

function extractLikelyFullNames(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) || [];
  const rejected = /\b(?:The|This|That|What|With|Podcast|World|Youtube|Google|Future|State|Union|Audio|Studios|Bloomberg|Democrats|Republicans)\b/;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const candidate = match.trim();
    if (rejected.test(candidate)) continue;
    if (isBlockedConversationalHumanName(candidate)) continue;
    const normalized = normalizeName(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(candidate);
  }
  return names;
}

function applySpeakerName(
  speaker: any,
  name: string,
  role: SpeakerRole,
  confidence: number,
  provenance: string[]
): any {
  return {
    ...speaker,
    finalName: name,
    fallbackName: name,
    name,
    role,
    roleConfidence: Math.max(speaker?.roleConfidence || speaker?.confidence || 0, confidence),
    assignmentConfidence: Math.max(speaker?.assignmentConfidence || 0, confidence),
    requiresReview: false,
    finalNameLocked: true,
    nameProvenance: Array.from(new Set([
      ...(Array.isArray(speaker?.nameProvenance) ? speaker.nameProvenance : []),
      ...provenance,
    ])),
    extractedName: {
      ...(speaker?.extractedName || {}),
      name,
      confidence,
      context: 'Controlled speaker verification',
    },
  };
}

function clearSpeakerHumanName(speakerId: string, speaker: any, reason: string, role?: SpeakerRole): any {
  const fallbackName = getFallbackName(speakerId);
  if (role === 'advertiser' && speaker?.role === 'advertiser' && !isGenericSpeakerName(getDisplayName(speaker))) {
    return {
      ...speaker,
      role: 'advertiser',
      assignmentConfidence: Math.max(speaker?.assignmentConfidence || 0, 0.72),
      requiresReview: false,
      assignmentContradictions: Array.isArray(speaker?.assignmentContradictions)
        ? speaker.assignmentContradictions
        : [],
    };
  }
  return {
    ...speaker,
    finalName: fallbackName,
    fallbackName,
    name: fallbackName,
    role: role || (speaker?.role === 'advertiser' ? 'advertiser' : 'unknown'),
    roleConfidence: Math.min(speaker?.roleConfidence || speaker?.confidence || 0.65, 0.65),
    assignmentConfidence: Math.min(speaker?.assignmentConfidence || 0.65, 0.65),
    requiresReview: true,
    finalNameLocked: false,
    nameProvenance: [],
    assignmentContradictions: Array.from(new Set([
      ...(Array.isArray(speaker?.assignmentContradictions) ? speaker.assignmentContradictions : []),
      reason,
    ])),
  };
}

function applyDeterministicRepairs(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  stats: SpeakerClusterStats[],
  context: SpeakerVerificationContext
): { segments: SpeakerSegment[]; speakers: Record<string, any>; repairs: SpeakerVerificationDiagnostics['deterministicRepairs'] } {
  const updatedSpeakers: Record<string, any> = Object.fromEntries(
    Object.entries(speakers || {}).map(([id, speaker]) => [id, { ...speaker }])
  );
  const repairs: SpeakerVerificationDiagnostics['deterministicRepairs'] = [];
  const statsById = new Map(stats.map((entry) => [entry.speakerId, entry]));

  const byName = new Map<string, string[]>();
  for (const [speakerId, speaker] of Object.entries(updatedSpeakers)) {
    if (!isHumanConversationalSpeaker(speaker)) continue;
    const normalized = normalizeName(getDisplayName(speaker));
    if (!normalized) continue;
    byName.set(normalized, [...(byName.get(normalized) || []), speakerId]);
  }

  for (const [, ids] of byName) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort((a, b) => {
      const aStats = statsById.get(a);
      const bStats = statsById.get(b);
      const aScore = (aStats?.conversationalDuration || 0) + ((aStats?.substantiveTurns || 0) * 12) - ((aStats?.adRatio || 0) * 80);
      const bScore = (bStats?.conversationalDuration || 0) + ((bStats?.substantiveTurns || 0) * 12) - ((bStats?.adRatio || 0) * 80);
      return bScore - aScore;
    });
    const dominant = sorted[0];
    for (const duplicateId of sorted.slice(1)) {
      const duplicateStats = statsById.get(duplicateId);
      const dominantStats = statsById.get(dominant);
      const clearlyFragmentOrAd =
        (duplicateStats?.adRatio || 0) >= 0.35 ||
        (duplicateStats?.conversationalDuration || 0) < 18 ||
        (duplicateStats?.substantiveTurns || 0) === 0 ||
        ((dominantStats?.conversationalDuration || 0) >= Math.max(45, (duplicateStats?.conversationalDuration || 0) * 4));
      if (!clearlyFragmentOrAd) continue;
      const before = getDisplayName(updatedSpeakers[duplicateId]);
      updatedSpeakers[duplicateId] = clearSpeakerHumanName(
        duplicateId,
        updatedSpeakers[duplicateId],
        'duplicate_name_fragment_or_ad_spillover',
        (duplicateStats?.adRatio || 0) >= 0.6 ? 'advertiser' : 'unknown'
      );
      repairs.push({
        repairType: 'clear_duplicate_fragment_name',
        speakerId: duplicateId,
        reason: `Dominant cluster ${dominant} owns the substantive conversation for "${before}"`,
        before,
        after: getDisplayName(updatedSpeakers[duplicateId]),
      });
    }
  }

  const namedHumanIds = new Set(
    Object.entries(updatedSpeakers)
      .filter(([, speaker]) => isHumanConversationalSpeaker(speaker))
      .map(([speakerId]) => speakerId)
  );
  const titleGuest = detectTitleGuestCandidate(context.title, context.filename);
  if (titleGuest && !Array.from(namedHumanIds).some((id) => normalizeName(getDisplayName(updatedSpeakers[id])) === normalizeName(titleGuest))) {
    const dominantAnonymous = findDominantConversationalCluster(
      stats.filter((entry) => isAnonymousName(getDisplayName(updatedSpeakers[entry.speakerId]))),
      new Set()
    );
    if (dominantAnonymous && dominantAnonymous.mainConversationShare >= 0.16) {
      const before = getDisplayName(updatedSpeakers[dominantAnonymous.speakerId]);
      updatedSpeakers[dominantAnonymous.speakerId] = applySpeakerName(
        updatedSpeakers[dominantAnonymous.speakerId],
        titleGuest,
        'guest',
        0.82,
        ['title_guest_candidate', 'dominant_reply_after_intro']
      );
      repairs.push({
        repairType: 'promote_title_guest_dominant_cluster',
        speakerId: dominantAnonymous.speakerId,
        reason: `Title guest "${titleGuest}" matched dominant anonymous conversational cluster`,
        before,
        after: titleGuest,
      });
    }
  }

  for (const entry of stats) {
    const speaker = updatedSpeakers[entry.speakerId];
    if (!speaker || !isAnonymousName(getDisplayName(speaker))) continue;
    const directAddressName = detectDirectAddressNameForCluster(segments, entry.speakerId, context.title);
    if (!directAddressName || entry.substantiveTurns < 1 || entry.conversationalDuration < 12) continue;
    const before = getDisplayName(speaker);
    updatedSpeakers[entry.speakerId] = applySpeakerName(
      speaker,
      directAddressName,
      'guest',
      0.84,
      ['direct_address_intro', 'dominant_reply_after_intro']
    );
    repairs.push({
      repairType: 'bind_direct_address_guest',
      speakerId: entry.speakerId,
      reason: `Direct-address cue bound "${directAddressName}" to next substantive reply cluster`,
      before,
      after: directAddressName,
    });
  }

  for (const entry of stats) {
    const speaker = updatedSpeakers[entry.speakerId];
    if (!speaker || !isHumanConversationalSpeaker(speaker)) continue;
    if (entry.adRatio < 0.55) continue;
    const before = getDisplayName(speaker);
    updatedSpeakers[entry.speakerId] = clearSpeakerHumanName(
      entry.speakerId,
      speaker,
      'human_name_on_ad_heavy_cluster',
      entry.adRatio >= 0.75 ? 'advertiser' : 'unknown'
    );
    repairs.push({
      repairType: 'clear_ad_heavy_human_name',
      speakerId: entry.speakerId,
      reason: `Cluster is ${(entry.adRatio * 100).toFixed(0)}% ad/promo by segment count`,
      before,
      after: getDisplayName(updatedSpeakers[entry.speakerId]),
    });
  }

  return { segments, speakers: updatedSpeakers, repairs };
}

function detectRiskTriggers(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  stats: SpeakerClusterStats[],
  trust = computeSpeakerAssignmentTrust(segments, speakers)
): string[] {
  const triggers = new Set<string>();
  if (trust.confidence < 0.9) triggers.add('low_speaker_assignment_confidence');
  if (trust.reviewCount > 6) triggers.add('high_targeted_review_count');

  const nameGroups = new Map<string, SpeakerClusterStats[]>();
  for (const entry of stats) {
    const speaker = speakers[entry.speakerId];
    if (!isHumanConversationalSpeaker(speaker)) continue;
    const normalized = normalizeName(getDisplayName(speaker));
    nameGroups.set(normalized, [...(nameGroups.get(normalized) || []), entry]);
    if (entry.adRatio >= 0.35) triggers.add('human_name_on_ad_or_promo_heavy_cluster');
  }
  for (const entries of nameGroups.values()) {
    if (entries.length > 1) triggers.add('duplicate_human_name_across_clusters');
  }

  if (stats.some((entry) => (
    isAnonymousName(getDisplayName(speakers[entry.speakerId])) &&
    entry.conversationalSegmentCount >= 5 &&
    entry.substantiveTurns >= 2 &&
    entry.mainConversationShare >= 0.12
  ))) {
    triggers.add('anonymous_substantive_conversational_cluster');
  }

  const earlyText = segments
    .filter((segment) => (segment.startTime || 0) <= 180 && isConversationalSegment(segment))
    .map((segment) => segment.text || '')
    .join(' ');
  if (/\b(?:joined by|welcome|with|talking to|conversation with)\b[^.?!]{0,160}\b(?:and|as well as)\b/i.test(earlyText)) {
    triggers.add('possible_unbound_multi_guest_intro');
  }
  if (stats.some((entry) => entry.quotedSegmentCount > 0 || (
    entry.firstStart != null &&
    entry.firstStart < 90 &&
    isAnonymousName(getDisplayName(speakers[entry.speakerId])) &&
    /\b(?:clip|tape|audio|speech|said|news|president|trump|biden|quote)\b/i.test(entry.sampleSegments.map((sample) => sample.text).join(' '))
  ))) {
    triggers.add('possible_quoted_or_cold_open_audio');
  }

  return Array.from(triggers);
}

function buildVerifierDossier(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  stats: SpeakerClusterStats[],
  context: SpeakerVerificationContext,
  triggerReasons: string[]
) {
  const trust = computeSpeakerAssignmentTrust(segments, speakers);
  const introSegments = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => (segment.startTime || 0) <= 240 && isConversationalSegment(segment))
    .filter(({ segment }) => /\b(?:i'm|this is|joined by|welcome|with|talking to|conversation with|my guest|our guests|so|now|first)\b/i.test(segment.text || ''))
    .slice(0, 20)
    .map(({ segment, index }) => ({
      index,
      speakerId: (segment as any).finalSpeakerId || segment.speakerId,
      startTime: segment.startTime,
      text: truncateText(segment.text, 360),
    }));
  const directAddressAnchors = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => isConversationalSegment(segment))
    .filter(({ segment }) => /\b(?:so|now|first|then|and)\s+[A-Z][a-z]{2,}\b/.test(segment.text || ''))
    .slice(0, 25)
    .map(({ segment, index }) => ({
      index,
      speakerId: (segment as any).finalSpeakerId || segment.speakerId,
      startTime: segment.startTime,
      text: truncateText(segment.text, 260),
    }));

  return {
    title: context.title || null,
    filename: context.filename || null,
    showIdentity: context.showIdentity
      ? {
          id: context.showIdentity.id,
          displayName: context.showIdentity.displayName,
          matchedBy: context.showIdentity.matchedBy,
        }
      : null,
    showRoster: (context.showRoster || []).map((entry) => ({
      name: entry.name,
      role: entry.role || null,
      aliases: entry.aliases || [],
      confidenceSource: entry.confidenceSource || null,
    })),
    triggerReasons,
    currentTrust: trust.confidence,
    currentReviewCount: trust.reviewCount,
    speakers: stats.map((entry) => ({
      ...entry,
      sampleSegments: entry.sampleSegments,
    })),
    introSegments,
    directAddressAnchors,
    reviewItems: trust.reviewItems.slice(0, 30),
  };
}

function buildDossierSummary(
  segments: SpeakerSegment[],
  stats: SpeakerClusterStats[],
  context: SpeakerVerificationContext,
  trust = computeSpeakerAssignmentTrust(segments, Object.fromEntries(stats.map((entry) => [entry.speakerId, { finalName: entry.finalName, role: entry.role }])) as any)
): SpeakerVerificationDiagnostics['dossierSummary'] {
  return {
    title: context.title || null,
    filename: context.filename || null,
    showIdentity: context.showIdentity
      ? {
          id: context.showIdentity.id,
          displayName: context.showIdentity.displayName,
          matchedBy: context.showIdentity.matchedBy,
        }
      : null,
    speakerCount: stats.length,
    segmentCount: segments.length,
    currentTrust: trust.confidence,
    currentReviewCount: trust.reviewCount,
    clusters: stats.map(({ sampleSegments, ...entry }) => ({
      ...entry,
      sampleSegmentIndices: sampleSegments.map((sample) => sample.index),
    })),
  };
}

async function callVerifierModel(
  model: string,
  dossier: any,
  context: SpeakerVerificationContext
): Promise<{ proposals: SpeakerVerificationRepairProposal[]; overallConfidence: number; raw: any; responseModel: string }> {
  if (!context.openaiApiKey) {
    throw new Error('OpenAI API key not configured for speaker verification');
  }
  const openai = new OpenAI({ apiKey: context.openaiApiKey, timeout: 120000 });
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are a conservative speaker-attribution verifier for podcast transcripts.',
          'You receive structured cluster evidence, not a full transcript.',
          'Return only JSON. Propose repairs only when participant evidence supports them.',
          'Never assign human names to ad/promo/sponsor/credit/title/entity-only clusters.',
          'Prefer Speaker N / review over a plausible but weak human name.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          instructions: {
            outputSchema: {
              overallConfidence: 'number 0..1',
              proposals: [{
                repairType: 'rename|demote|merge|splitRecommendation|bindIntroName|classifyQuotedAudio|clearName',
                targetSpeakerId: 'speaker id',
                sourceSpeakerId: 'optional source speaker id',
                mergeIntoSpeakerId: 'optional merge target speaker id',
                proposedName: 'canonical human name or null',
                proposedRole: 'host|co_host|guest|advertiser|narrator|quoted_audio|unknown',
                evidenceSegmentIndices: ['segment indices supporting repair'],
                confidence: 'number 0..1',
                reason: 'short explanation',
              }],
            },
            safety: [
              'Do not rename ad-heavy clusters as humans.',
              'Do not place guest names on tiny fragments when a dominant answer cluster exists.',
              'Do not merge two substantive alternating speakers.',
              'Do classify quoted/cold-open clips as quoted_audio when they are not participants.',
            ],
          },
          dossier,
        }),
      },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 5000,
  });

  if (context.userId) {
    await trackOpenAIUsage({
      userId: context.userId,
      projectId: context.projectId,
      reservationId: context.reservationId,
      response,
      modelName: model,
      purpose: 'Speaker Verification',
      shouldDebit: context.reservationId ? false : true,
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  return {
    proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
    overallConfidence: typeof parsed.overallConfidence === 'number' ? parsed.overallConfidence : 0,
    raw: parsed,
    responseModel: response.model || model,
  };
}

async function callVerifierModelWithFallback(
  requestedModel: string,
  fallbackModel: string,
  dossier: any,
  context: SpeakerVerificationContext
): Promise<{
  proposals: SpeakerVerificationRepairProposal[];
  overallConfidence: number;
  raw: any;
  responseModel: string;
  attemptedModels: string[];
  fallbackReason: string | null;
}> {
  const attemptedModels = [requestedModel];
  try {
    const result = await callVerifierModel(requestedModel, dossier, context);
    return { ...result, attemptedModels, fallbackReason: null };
  } catch (error: any) {
    if (!isModelUnavailableError(error) || requestedModel === fallbackModel) {
      throw error;
    }
    attemptedModels.push(fallbackModel);
    const result = await callVerifierModel(fallbackModel, dossier, context);
    return {
      ...result,
      attemptedModels,
      fallbackReason: `model_unavailable:${requestedModel}`,
    };
  }
}

function validateProposal(
  proposal: SpeakerVerificationRepairProposal,
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  statsById: Map<string, SpeakerClusterStats>
): ProposalValidationResult {
  const targetId = proposal.targetSpeakerId || proposal.sourceSpeakerId;
  if (!targetId || !speakers[targetId]) return { ok: false, reason: 'missing_target_speaker' };
  const targetStats = statsById.get(targetId);
  const targetSpeaker = speakers[targetId];
  const repairType = proposal.repairType;
  const confidence = typeof proposal.confidence === 'number' ? proposal.confidence : 0;
  if (confidence < 0.68 && repairType !== 'splitRecommendation') {
    if (isResidualMultiGuestBindingProposal(proposal, targetSpeaker, targetStats, speakers, statsById)) {
      return { ok: true, reason: 'accepted_residual_multi_guest_binding' };
    }
    if ((repairType === 'rename' || repairType === 'bindIntroName') && isListenerSelfIdProposal(proposal, targetStats)) {
      return { ok: true, reason: 'accepted_listener_self_id' };
    }
    return { ok: false, reason: 'proposal_confidence_below_threshold' };
  }

  if (repairType === 'rename' || repairType === 'bindIntroName') {
    if (!proposal.proposedName || isBlockedConversationalHumanName(proposal.proposedName)) {
      if (isListenerSelfIdProposal(proposal, targetStats)) {
        return { ok: true, reason: 'accepted_listener_self_id' };
      }
      return { ok: false, reason: 'blocked_or_invalid_human_name' };
    }
    if ((targetStats?.adRatio || 0) >= 0.35) {
      return { ok: false, reason: 'target_cluster_ad_or_promo_heavy' };
    }
    if ((targetStats?.substantiveTurns || 0) === 0 && (targetStats?.conversationalDuration || 0) < 18) {
      return { ok: false, reason: 'target_cluster_is_fragment' };
    }
    const sameNameDominant = Array.from(statsById.values()).find((entry) => (
      entry.speakerId !== targetId &&
      normalizeName(getDisplayName(speakers[entry.speakerId])) === normalizeName(proposal.proposedName) &&
      entry.conversationalDuration > Math.max(45, (targetStats?.conversationalDuration || 0) * 3)
    ));
    if (sameNameDominant) {
      return { ok: false, reason: `same_name_dominant_cluster_exists:${sameNameDominant.speakerId}` };
    }
  }

  if (repairType === 'merge') {
    const sourceId = proposal.sourceSpeakerId || proposal.targetSpeakerId;
    const targetMergeId = proposal.mergeIntoSpeakerId;
    if (!sourceId || !targetMergeId || !speakers[sourceId] || !speakers[targetMergeId]) {
      return { ok: false, reason: 'missing_merge_source_or_target' };
    }
    const sourceStats = statsById.get(sourceId);
    const targetMergeStats = statsById.get(targetMergeId);
    if (
      (sourceStats?.substantiveTurns || 0) >= 2 &&
      (targetMergeStats?.substantiveTurns || 0) >= 2 &&
      (sourceStats?.conversationalDuration || 0) >= 30 &&
      (targetMergeStats?.conversationalDuration || 0) >= 30
    ) {
      return { ok: false, reason: 'would_merge_two_substantive_speakers' };
    }
  }

  if (repairType === 'classifyQuotedAudio') {
    const owned = getOwnedSegmentItems(segments, targetId);
    const targeted = getTargetedOwnedSegmentItems(proposal, segments, targetId);
    const quotedLikeTargets = targeted.filter(({ segment }) => (
      segment.segmentKind === 'quoted_audio' || isQuotedLikeText(segment.text)
    ));
    const quotedShare = owned.length > 0
      ? owned.filter(({ segment }) => segment.segmentKind === 'quoted_audio' || isQuotedLikeText(segment.text)).length / owned.length
      : 0;
    const entireClusterQuoted = owned.length > 0 && quotedShare >= 0.8;

    if (isProtectedParticipantSpeaker(targetSpeaker)) {
      if (quotedLikeTargets.length === 0) {
        return { ok: false, reason: 'protected_recurring_speaker_cluster' };
      }
      return { ok: true, reason: 'accepted_segment_level_quoted_audio_for_protected_speaker', mode: 'segment' };
    }

    if (entireClusterQuoted) {
      return { ok: true, reason: 'accepted_cluster_quoted_audio', mode: 'cluster' };
    }

    if (quotedLikeTargets.length > 0) {
      return { ok: true, reason: 'accepted_segment_level_quoted_audio', mode: 'segment' };
    }

    return { ok: false, reason: 'quoted_audio_evidence_not_supported' };
  }

  if (repairType === 'clearName' || repairType === 'demote') {
    const proposedRole = proposal.proposedRole || 'unknown';
    if (proposedRole === 'advertiser') {
      return { ok: true, reason: 'accepted_advertiser_demotion', mode: 'segment' };
    }
    if (targetSpeaker?.role === 'advertiser' && !isGenericSpeakerName(getDisplayName(targetSpeaker))) {
      return { ok: true, reason: 'advertiser_name_preserved', mode: 'segment' };
    }
  }

  return { ok: true, reason: 'accepted' };
}

function applyAcceptedProposal(
  proposal: SpeakerVerificationRepairProposal,
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  validationMode?: 'cluster' | 'segment'
): { segments: SpeakerSegment[]; speakers: Record<string, any> } {
  const updatedSpeakers: Record<string, any> = Object.fromEntries(
    Object.entries(speakers).map(([id, speaker]) => [id, { ...speaker }])
  );
  let updatedSegments = segments;
  const targetId = proposal.targetSpeakerId || proposal.sourceSpeakerId;

  if ((proposal.repairType === 'rename' || proposal.repairType === 'bindIntroName') && targetId && proposal.proposedName) {
    const listenerSelfId = validationMode === 'segment' || isLikelyFirstName(proposal.proposedName);
    updatedSpeakers[targetId] = applySpeakerName(
      updatedSpeakers[targetId],
      proposal.proposedName,
      listenerSelfId
        ? 'unknown'
        : proposal.proposedRole && proposal.proposedRole !== 'advertiser' && proposal.proposedRole !== 'quoted_audio'
        ? proposal.proposedRole
        : 'guest',
      Math.max(0.78, proposal.confidence || 0.78),
      listenerSelfId
        ? ['verifier_listener_self_id']
        : [proposal.repairType === 'bindIntroName' ? 'verifier_intro_binding' : 'verifier_rename']
    );
  } else if ((proposal.repairType === 'clearName' || proposal.repairType === 'demote') && targetId) {
    if (proposal.proposedRole === 'advertiser') {
      const currentName = getDisplayName(updatedSpeakers[targetId]);
      const preserveAdvertiserName = updatedSpeakers[targetId]?.role === 'advertiser' &&
        currentName &&
        !isGenericSpeakerName(currentName);
      updatedSpeakers[targetId] = preserveAdvertiserName
        ? {
            ...updatedSpeakers[targetId],
            role: 'advertiser',
            assignmentConfidence: Math.max(updatedSpeakers[targetId]?.assignmentConfidence || 0, proposal.confidence || 0.72),
            requiresReview: false,
          }
        : clearSpeakerHumanName(
            targetId,
            updatedSpeakers[targetId],
            `verifier_${proposal.repairType}`,
            'advertiser'
          );
      const evidence = getEvidenceIndexSet(proposal);
      updatedSegments = segments.map((segment, index) => {
        const speakerId = (segment as any).finalSpeakerId || segment.speakerId;
        if (speakerId !== targetId) return segment;
        if (evidence.size > 0 && !evidence.has(index) && !isAdLikeText(segment.text) && !isShortSpilloverText(segment.text)) return segment;
        if (!isAdLikeText(segment.text) && !segment.sponsorName && !isShortSpilloverText(segment.text) && evidence.size === 0) return segment;
        return {
          ...segment,
          segmentKind: 'ad_read',
          status: segment.status || 'tentative',
          confidenceReason: segment.confidenceReason || 'verifier_ad_demotion',
        };
      });
    } else {
      updatedSpeakers[targetId] = clearSpeakerHumanName(
        targetId,
        updatedSpeakers[targetId],
        `verifier_${proposal.repairType}`,
        proposal.proposedRole || 'unknown'
      );
    }
  } else if (proposal.repairType === 'classifyQuotedAudio' && targetId) {
    const segmentLevel = validationMode === 'segment';
    if (!segmentLevel) {
      updatedSpeakers[targetId] = {
        ...updatedSpeakers[targetId],
        role: 'quoted_audio',
        finalName: updatedSpeakers[targetId]?.finalName && !isAnonymousName(updatedSpeakers[targetId].finalName)
          ? updatedSpeakers[targetId].finalName
          : 'Quoted Audio',
        fallbackName: 'Quoted Audio',
        assignmentConfidence: Math.max(updatedSpeakers[targetId]?.assignmentConfidence || 0, proposal.confidence || 0.8),
        requiresReview: false,
        nameProvenance: Array.from(new Set([
          ...(Array.isArray(updatedSpeakers[targetId]?.nameProvenance) ? updatedSpeakers[targetId].nameProvenance : []),
          'verifier_quoted_audio',
        ])),
      };
    } else {
      updatedSpeakers[targetId] = {
        ...updatedSpeakers[targetId],
        assignmentConfidence: Math.max(updatedSpeakers[targetId]?.assignmentConfidence || 0, proposal.confidence || 0.75),
        nameProvenance: Array.from(new Set([
          ...(Array.isArray(updatedSpeakers[targetId]?.nameProvenance) ? updatedSpeakers[targetId].nameProvenance : []),
          'verifier_segment_quoted_audio',
        ])),
      };
    }
    const evidence = getEvidenceIndexSet(proposal);
    updatedSegments = segments.map((segment, index) => {
      const speakerId = (segment as any).finalSpeakerId || segment.speakerId;
      if (speakerId !== targetId) return segment;
      if (segmentLevel && evidence.size > 0 && !evidence.has(index)) return segment;
      if (segmentLevel && evidence.size === 0 && !isQuotedLikeText(segment.text)) return segment;
      return { ...segment, segmentKind: 'quoted_audio' };
    });
  } else if (proposal.repairType === 'merge') {
    const sourceId = proposal.sourceSpeakerId || proposal.targetSpeakerId;
    const mergeInto = proposal.mergeIntoSpeakerId;
    if (sourceId && mergeInto && sourceId !== mergeInto && updatedSpeakers[sourceId] && updatedSpeakers[mergeInto]) {
      updatedSegments = segments.map((segment) => {
        const speakerId = (segment as any).finalSpeakerId || segment.speakerId;
        if (speakerId !== sourceId) return segment;
        return {
          ...segment,
          speakerId: mergeInto,
          finalSpeakerId: mergeInto,
          status: segment.status || 'tentative',
          confidenceReason: segment.confidenceReason || 'verifier_merge',
        };
      });
      delete updatedSpeakers[sourceId];
    }
  }

  return { segments: updatedSegments, speakers: updatedSpeakers };
}

function applyVerifierProposals(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  proposals: SpeakerVerificationRepairProposal[]
): {
  segments: SpeakerSegment[];
  speakers: Record<string, any>;
  accepted: SpeakerVerificationDiagnostics['acceptedRepairs'];
  rejected: SpeakerVerificationDiagnostics['rejectedRepairs'];
} {
  let currentSegments = segments;
  let currentSpeakers = speakers;
  const accepted: SpeakerVerificationDiagnostics['acceptedRepairs'] = [];
  const rejected: SpeakerVerificationDiagnostics['rejectedRepairs'] = [];

  for (const proposal of proposals.slice(0, 12)) {
    const statsById = new Map(buildClusterStats(currentSegments, currentSpeakers).map((entry) => [entry.speakerId, entry]));
    const validation = validateProposal(proposal, currentSegments, currentSpeakers, statsById);
    if (!validation.ok) {
      rejected.push({ proposal, reason: validation.reason });
      continue;
    }
    const result = applyAcceptedProposal(proposal, currentSegments, currentSpeakers, validation.mode);
    currentSegments = result.segments;
    currentSpeakers = result.speakers;
    accepted.push({ proposal, reason: validation.reason });
  }

  return { segments: currentSegments, speakers: currentSpeakers, accepted, rejected };
}

function shouldEscalateToHeavy(
  triggerReasons: string[],
  mediumResult: { proposals: SpeakerVerificationRepairProposal[]; overallConfidence: number } | null,
  mediumAcceptedCount: number,
  mediumRejectedCount: number
): string | null {
  if (!mediumResult) return 'medium_failed';
  if (mediumResult.overallConfidence < 0.72) return 'medium_low_overall_confidence';
  if (triggerReasons.some((reason) => reason === 'duplicate_human_name_across_clusters' || reason === 'anonymous_substantive_conversational_cluster') && mediumAcceptedCount === 0) {
    return 'medium_no_repair_for_high_risk_case';
  }
  if (mediumRejectedCount > mediumAcceptedCount && mediumRejectedCount > 0) {
    return 'medium_conflicted_with_safety_gates';
  }
  return null;
}

export async function runControlledSpeakerVerification(
  segments: SpeakerSegment[],
  speakers: Record<string, any>,
  context: SpeakerVerificationContext
): Promise<SpeakerVerificationResult> {
  const initialTrust = computeSpeakerAssignmentTrust(segments, speakers);
  const initialStats = buildClusterStats(segments, speakers);
  const initialTriggers = detectRiskTriggers(segments, speakers, initialStats, initialTrust);
  const initialDiagnostics: SpeakerVerificationDiagnostics = {
    skipped: initialTriggers.length === 0,
    triggerReasons: initialTriggers,
    modelsAttempted: [],
    modelUsed: null,
    escalationReason: null,
    dossierSummary: buildDossierSummary(segments, initialStats, context, initialTrust),
    deterministicRepairs: [],
    proposals: [],
    acceptedRepairs: [],
    rejectedRepairs: [],
    finalTrustDelta: null,
  };

  if (initialTriggers.length === 0) {
    return { segments, speakers, diagnostics: initialDiagnostics };
  }

  const deterministic = applyDeterministicRepairs(segments, speakers, initialStats, context);
  let currentSegments = deterministic.segments;
  let currentSpeakers = deterministic.speakers;
  const postDeterministicTrust = computeSpeakerAssignmentTrust(currentSegments, currentSpeakers);
  const postDeterministicStats = buildClusterStats(currentSegments, currentSpeakers);
  const remainingTriggers = detectRiskTriggers(currentSegments, currentSpeakers, postDeterministicStats, postDeterministicTrust);
  const diagnostics: SpeakerVerificationDiagnostics = {
    ...initialDiagnostics,
    skipped: false,
    triggerReasons: remainingTriggers.length > 0 ? remainingTriggers : initialTriggers,
    deterministicRepairs: deterministic.repairs,
    dossierSummary: buildDossierSummary(currentSegments, postDeterministicStats, context, postDeterministicTrust),
  };

  if (remainingTriggers.length === 0 || !context.openaiApiKey) {
    const finalTrust = computeSpeakerAssignmentTrust(currentSegments, currentSpeakers);
    diagnostics.finalTrustDelta = Number((finalTrust.confidence - initialTrust.confidence).toFixed(3));
    if (!context.openaiApiKey) diagnostics.error = 'OpenAI API key not configured; deterministic verification only';
    return { segments: currentSegments, speakers: currentSpeakers, diagnostics };
  }

  try {
    const dossier = buildVerifierDossier(currentSegments, currentSpeakers, postDeterministicStats, context, remainingTriggers);
    const mediumRequestedModel = getMediumVerifierModel();
    const medium = await callVerifierModelWithFallback(
      mediumRequestedModel,
      SAFE_VERIFIER_FALLBACK_MODEL,
      dossier,
      context
    );
    diagnostics.modelsAttempted.push(...medium.attemptedModels);
    if (medium.fallbackReason) {
      diagnostics.escalationReason = medium.fallbackReason;
    }
    diagnostics.modelUsed = medium.responseModel;
    diagnostics.proposals = medium.proposals;
    let applied = applyVerifierProposals(currentSegments, currentSpeakers, medium.proposals);
    currentSegments = applied.segments;
    currentSpeakers = applied.speakers;
    diagnostics.acceptedRepairs.push(...applied.accepted);
    diagnostics.rejectedRepairs.push(...applied.rejected);

    const escalationReason = shouldEscalateToHeavy(
      remainingTriggers,
      { proposals: medium.proposals, overallConfidence: medium.overallConfidence },
      applied.accepted.length,
      applied.rejected.length
    );
    if (escalationReason) {
      diagnostics.escalationReason = diagnostics.escalationReason
        ? `${diagnostics.escalationReason};${escalationReason}`
        : escalationReason;
      const heavyStats = buildClusterStats(currentSegments, currentSpeakers);
      const heavyTriggers = detectRiskTriggers(currentSegments, currentSpeakers, heavyStats);
      const heavyDossier = buildVerifierDossier(currentSegments, currentSpeakers, heavyStats, context, heavyTriggers.length ? heavyTriggers : remainingTriggers);
      const heavyRequestedModel = getHeavyVerifierModel();
      const heavy = await callVerifierModelWithFallback(
        heavyRequestedModel,
        SAFE_VERIFIER_FALLBACK_MODEL,
        heavyDossier,
        context
      );
      diagnostics.modelsAttempted.push(...heavy.attemptedModels);
      if (heavy.fallbackReason) {
        diagnostics.escalationReason = `${diagnostics.escalationReason};${heavy.fallbackReason}`;
      }
      diagnostics.modelUsed = heavy.responseModel;
      diagnostics.proposals.push(...heavy.proposals);
      applied = applyVerifierProposals(currentSegments, currentSpeakers, heavy.proposals);
      currentSegments = applied.segments;
      currentSpeakers = applied.speakers;
      diagnostics.acceptedRepairs.push(...applied.accepted);
      diagnostics.rejectedRepairs.push(...applied.rejected);
    }
  } catch (error: any) {
    diagnostics.error = error?.message || 'Speaker verification failed';
  }

  const finalTrust = computeSpeakerAssignmentTrust(currentSegments, currentSpeakers);
  diagnostics.finalTrustDelta = Number((finalTrust.confidence - initialTrust.confidence).toFixed(3));
  diagnostics.dossierSummary = buildDossierSummary(
    currentSegments,
    buildClusterStats(currentSegments, currentSpeakers),
    context,
    finalTrust
  );

  return {
    segments: currentSegments,
    speakers: currentSpeakers,
    diagnostics,
  };
}
