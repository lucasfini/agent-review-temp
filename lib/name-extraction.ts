// AI-powered name extraction from podcast transcriptions
// Uses segment-based mapping for accurate speaker attribution
import { getAICompletion, AICompletionResponse } from '@/lib/ai-providers/multi-provider';
import { SpeakerSegment, DetectedSpeaker, SpeakerRole } from './types';
import { getPrompt, prompts } from '@/lib/prompts/loader';
import type { SpeakerNameExtractionVars } from '@/lib/prompts/types';
import { logUsageEvent, debitCredit } from '@/lib/billing/credit';
import { calculateTokenCost } from '@/lib/billing/cost-map';

export interface ExtractedName {
  name: string;
  fullName?: string;
  nicknames: string[];
  firstMentionTime: number;
  confidence: number;
  context: string;
}

export interface NamedSpeaker extends DetectedSpeaker {
  extractedName: ExtractedName | null;
  finalName: string;
  role?: SpeakerRole;
  roleConfidence?: number;
  roleSummary?: string;
  roleEvidence?: string[];
  autoRoleAssigned?: boolean;
  customName?: string;

  // Roster matching metadata
  rosterMatched?: boolean;
  rosterMatchMethod?: 'self_intro' | 'speaking_time' | 'introduced_by_other' | 'keyword_freq' | 'speaker_order' | 'force_assigned';
  rosterMatchConfidence?: number;
}

// Roster speaker type for pre-defined speakers
export interface PresetSpeaker {
  id: string;
  name: string;
  role: 'host' | 'guest' | 'cohost' | 'moderator' | 'other' | null;
  description?: string;
  priority: number;
}

/**
 * NEW INTERFACES FOR TWO-PHASE EXTRACTION
 */

// Name candidate collected from transcript (Phase 1)
interface NameCandidate {
  name: string;
  firstMentionSegmentIndex: number;
  mentionedBy: string[];  // speakerIds who mentioned this name
  mentionCount: number;
  contexts: string[];  // evidence segments
  introductionType?: 'guest_intro' | 'direct_address' | 'mentioned';
}

// Role candidate extracted from line labels (Phase 1)
interface RoleCandidate {
  role: string;
  speakerId: string;
  confidence: number;
  evidence: string;
}

function normalizeSpeakerRole(role?: string | null): SpeakerRole | undefined {
  if (!role) return undefined;
  if (role === 'cohost') return 'co_host';
  if (role === 'moderator') return 'host';
  if (role === 'other') return 'unknown';
  const validRoles: SpeakerRole[] = ['host', 'co_host', 'candidate', 'guest', 'advertiser', 'narrator', 'quoted_audio', 'unknown'];
  return validRoles.includes(role as SpeakerRole) ? (role as SpeakerRole) : undefined;
}

/**
 * UTILITY FUNCTIONS FOR HYBRID NAME EXTRACTION
 */

/**
 * Validate if a string is a valid person name
 * Filters out common false positives and role words
 */
function isValidName(name: string): boolean {
  if (name.length < 2 || name.length > 50) return false;
  if (!/^[A-Z]/.test(name)) return false;

  const lower = name.toLowerCase();

  // EXPANDED: Comprehensive role word filtering (exact match)
  const roleWords = [
    'correspondent', 'expert', 'analyst', 'commentator', 'journalist',
    'reporter', 'moderator', 'host', 'cohost', 'guest', 'speaker',
    'interviewer', 'panelist', 'contributor', 'pundit', 'producer',
    'editor', 'director', 'manager', 'assistant', 'coordinator'
  ];
  if (roleWords.includes(lower)) return false;

  // Reject single-word names (most real names are 2+ words)
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;  // "Correspondent" → false, "Alice Fraser" → true

  // Filter out common false positive words
  const commonWords = [
    'not', 'never', 'trying', 'going', 'show', 'podcast',
    'political', 'bugle', 'episode', 'today', 'welcome',
    'thanks', 'hello', 'okay', 'right', 'yeah', 'well', 'good'
  ];
  if (commonWords.some(word => lower.includes(word))) return false;

  // Must contain only letters, spaces, hyphens
  if (!/^[A-Za-z\s-]+$/.test(name)) return false;

  return true;
}

/**
 * Format seconds to MM:SS or H:MM:SS
 */
function formatMins(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert SpeakerSegment to compact format for LLM
 */
function compactSegment(seg: SpeakerSegment): import('@/lib/prompts/types').CompactSegment {
  // Truncate long segments (>300 chars)
  const text = seg.text.length > 300
    ? seg.text.substring(0, 300) + "..."
    : seg.text;

  return {
    speakerId: seg.speakerId,
    time: `${formatMins(seg.startTime)}-${formatMins(seg.endTime)}`,
    text
  };
}

/**
 * Estimate token count for a compact segment
 */
function estimateTokens(seg: import('@/lib/prompts/types').CompactSegment): number {
  const text = `[${seg.speakerId}] ${seg.time}: ${seg.text}\n\n`;
  return Math.ceil(text.length / 4); // ~4 chars per token
}

/**
 * Select segments for LLM processing (2000-3000 token budget)
 * Prioritizes: intro window, name mentions, direct address
 */
function selectSegmentsForLLM(allSegments: SpeakerSegment[]): {
  segments: import('@/lib/prompts/types').CompactSegment[];
  estimatedTokens: number;
} {
  const selected: import('@/lib/prompts/types').CompactSegment[] = [];
  let tokens = 0;
  const MAX_TOKENS = 3000;

  // PRIORITY 1: Intro window (first 3 minutes)
  const introSegments = allSegments.filter(s => s.startTime <= 180);
  for (const seg of introSegments) {
    const compact = compactSegment(seg);
    const segTokens = estimateTokens(compact);
    if (tokens + segTokens <= MAX_TOKENS) {
      selected.push(compact);
      tokens += segTokens;
    }
  }

  // PRIORITY 2: Name-mention segments (first 5 minutes)
  const nameMentionPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;
  const nameMentions = allSegments
    .filter(s => s.startTime <= 300 && nameMentionPattern.test(s.text))
    .slice(0, 20);

  for (const seg of nameMentions) {
    const compact = compactSegment(seg);
    const segTokens = estimateTokens(compact);
    if (tokens + segTokens <= MAX_TOKENS) {
      // Avoid duplicates
      if (!selected.some(s => s.speakerId === compact.speakerId && s.time === compact.time)) {
        selected.push(compact);
        tokens += segTokens;
      }
    }
  }

  // PRIORITY 3: Direct address ("Name," or "Name what...")
  const directAddressPattern = /\b([A-Z][a-z]+),\s|\b([A-Z][a-z]+)\s+(?:what|how|why)/;
  const directAddress = allSegments
    .filter(s => directAddressPattern.test(s.text))
    .slice(0, 10);

  for (const seg of directAddress) {
    const compact = compactSegment(seg);
    const segTokens = estimateTokens(compact);
    if (tokens + segTokens <= MAX_TOKENS) {
      // Avoid duplicates
      if (!selected.some(s => s.speakerId === compact.speakerId && s.time === compact.time)) {
        selected.push(compact);
        tokens += segTokens;
      }
    }
  }

  console.log(`[NAME EXTRACTION] Selected ${selected.length} segments (~${tokens} tokens) for LLM processing`);

  return { segments: selected, estimatedTokens: tokens };
}

/**
 * PHASE 1: CANDIDATE COLLECTION FUNCTIONS
 */

/**
 * Collect all name candidates mentioned in the transcript
 * Scans entire transcript for proper names (2+ capitalized words)
 * Returns Map of name -> NameCandidate with metadata
 */
function collectNameCandidates(segments: SpeakerSegment[]): Map<string, NameCandidate> {
  const candidates = new Map<string, NameCandidate>();

  // Pattern: 2+ capitalized words (real names)
  const namePattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const matches = Array.from(seg.text.matchAll(namePattern));

    for (const match of matches) {
      const name = match[1].trim();

      // Validate using isValidName
      if (!isValidName(name)) continue;

      const matchIndex = match.index || 0;

      // Check if this is a guest introduction
      const preContext = seg.text.substring(Math.max(0, matchIndex - 50), matchIndex);
      const isGuestIntro = /\b(?:joined|joining|welcome|introduce)\s+(?:by|us|you to)?\s*$/i.test(preContext);

      // Check if this is direct address (name followed by comma or question)
      const postContext = seg.text.substring(matchIndex + name.length, matchIndex + name.length + 15);
      const isDirect = /^,\s|^\s+(?:what|how|why|do|can|would)/i.test(postContext);

      // Add or update candidate
      if (!candidates.has(name)) {
        candidates.set(name, {
          name,
          firstMentionSegmentIndex: i,
          mentionedBy: [seg.speakerId],
          mentionCount: 1,
          contexts: [seg.text.substring(0, 150)],
          introductionType: isGuestIntro ? 'guest_intro' : (isDirect ? 'direct_address' : 'mentioned')
        });
      } else {
        const candidate = candidates.get(name)!;
        candidate.mentionCount++;
        if (!candidate.mentionedBy.includes(seg.speakerId)) {
          candidate.mentionedBy.push(seg.speakerId);
        }
        if (candidate.contexts.length < 3) {
          candidate.contexts.push(seg.text.substring(0, 150));
        }
      }
    }
  }

  console.log(`[NAME CANDIDATES] Found ${candidates.size} name candidates:`,
    Array.from(candidates.keys()).join(', '));

  return candidates;
}

/**
 * Collect role candidates from line labels
 * Extracts roles like "Correspondent", "Expert" from formatted lines
 * Returns Map of speakerId -> RoleCandidate
 */
function collectRoleCandidates(segments: SpeakerSegment[]): Map<string, RoleCandidate> {
  const roleCandidates = new Map<string, RoleCandidate>();

  // Line label pattern: "RoleName X minutes Y seconds:"
  const lineLabelPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+\d+\s+minutes?\s+\d+\s+seconds?:/;

  const roleWords = [
    'correspondent', 'expert', 'analyst', 'commentator', 'host',
    'cohost', 'moderator', 'journalist', 'reporter', 'guest',
    'interviewer', 'panelist', 'contributor', 'pundit'
  ];

  for (const seg of segments) {
    const match = seg.text.match(lineLabelPattern);
    if (match) {
      const label = match[1].trim();
      const lower = label.toLowerCase();

      // Check if this is a role word
      const isRole = roleWords.includes(lower) ||
                     roleWords.some(role => lower.includes(role));

      if (isRole) {
        roleCandidates.set(seg.speakerId, {
          role: label,
          speakerId: seg.speakerId,
          confidence: 0.95,
          evidence: seg.text.substring(0, 100)
        });
        console.log(`[ROLE CANDIDATE] ${seg.speakerId} → Role: "${label}"`);
      } else if (isValidName(label)) {
        // This is an actual name in line label format (not a role)
        console.log(`[LINE LABEL NAME] ${seg.speakerId} → Name: "${label}" (not a role)`);
      }
    }
  }

  return roleCandidates;
}

/**
 * Run deterministic heuristics to identify speaker names
 * NEW: Returns three separate buckets instead of unified results
 * PHASE 1: Candidate collection only (assignment happens later)
 */
function runDeterministicHeuristics(
  segments: SpeakerSegment[]
): {
  selfIntroductions: Map<string, import('@/lib/prompts/types').HeuristicResult>;
  nameCandidates: Map<string, NameCandidate>;
  roleCandidates: Map<string, RoleCandidate>;
} {
  console.log(`[NAME EXTRACTION] Running deterministic heuristics on ${segments.length} segments`);

  const selfIntroductions = new Map<string, import('@/lib/prompts/types').HeuristicResult>();

  // STEP 1: Self-introductions (speaker-specific, high confidence)
  // These are immediately assigned because the speaker explicitly identifies themselves
  const selfPatterns = [
    { pattern: /\bmy name (?:is|'s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/i, conf: 0.98 },
    { pattern: /\bI'?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s+and|,|\.|$)/i, conf: 0.95 },
    { pattern: /\bI am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s+and|,|\.|$)/i, conf: 0.92 },
  ];

  for (const seg of segments) {
    for (const { pattern, conf } of selfPatterns) {
      const match = seg.text.match(pattern);
      if (match && isValidName(match[1])) {
        const existing = selfIntroductions.get(seg.speakerId);
        if (!existing || conf > existing.confidence) {
          selfIntroductions.set(seg.speakerId, {
            speakerId: seg.speakerId,
            name: match[1].trim(),
            confidence: conf,
            method: 'self_intro',
            evidence: [{
              speakerId: seg.speakerId,
              startTime: seg.startTime,
              endTime: seg.endTime,
              text: seg.text.substring(0, 150)
            }]
          });
          console.log(`[HEURISTIC] Self-intro: ${seg.speakerId} → "${match[1].trim()}" (conf: ${conf})`);
        }
        break;
      }
    }
  }

  // STEP 2: Collect name candidates (not speaker-specific yet)
  const nameCandidates = collectNameCandidates(segments);

  // STEP 3: Collect role candidates (from line labels)
  const roleCandidates = collectRoleCandidates(segments);

  console.log(`[NAME EXTRACTION] Heuristics complete: ${selfIntroductions.size} self-intros, ${nameCandidates.size} name candidates, ${roleCandidates.size} roles`);

  return { selfIntroductions, nameCandidates, roleCandidates };
}

/**
 * PHASE 2: SPEAKER-NAME ASSIGNMENT FUNCTIONS
 */

/**
 * Find best speaker match for a name candidate using evidence scoring
 * Scores each unnamed speaker based on multiple evidence types
 * Returns speaker with highest evidence score
 */
function findBestSpeakerForName(
  candidate: NameCandidate,
  unnamedSpeakers: string[],
  segments: SpeakerSegment[]
): { speakerId: string; evidenceScore: number } | null {

  if (unnamedSpeakers.length === 0) return null;

  const mentionSegment = segments[candidate.firstMentionSegmentIndex];
  const introducerId = mentionSegment.speakerId;

  // Score each unnamed speaker
  const scores: Array<{ speakerId: string; score: number; reasons: string[] }> = [];

  for (const speakerId of unnamedSpeakers) {
    let score = 0;
    const reasons: string[] = [];

    // EVIDENCE 1: Next speaker after introduction (strongest)
    if (candidate.introductionType === 'guest_intro') {
      const firstAppearanceIndex = segments.findIndex(
        (s, i) => i > candidate.firstMentionSegmentIndex && s.speakerId === speakerId
      );
      if (firstAppearanceIndex > -1) {
        const distance = firstAppearanceIndex - candidate.firstMentionSegmentIndex;
        if (distance <= 5) {
          score += 50;
          reasons.push('next_after_intro');
        } else if (distance <= 10) {
          score += 30;
          reasons.push('soon_after_intro');
        }
      }
    }

    // EVIDENCE 2: Direct address to this speaker
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.text.includes(candidate.name) && i + 1 < segments.length && segments[i + 1].speakerId === speakerId) {
        score += 40;
        reasons.push('direct_address_before');
        break;
      }
      if (seg.speakerId === speakerId && i + 1 < segments.length && segments[i + 1].text.includes(candidate.name)) {
        score += 35;
        reasons.push('direct_address_after');
        break;
      }
    }

    // EVIDENCE 3: Proximity in transcript
    const speakerSegmentIndices = segments
      .map((s, i) => s.speakerId === speakerId ? i : -1)
      .filter(i => i > -1);

    const avgDistance = speakerSegmentIndices.length > 0
      ? speakerSegmentIndices.reduce((sum, idx) => sum + Math.abs(idx - candidate.firstMentionSegmentIndex), 0) / speakerSegmentIndices.length
      : 999;

    if (avgDistance < 10) {
      score += 20;
      reasons.push('close_proximity');
    } else if (avgDistance < 20) {
      score += 10;
      reasons.push('moderate_proximity');
    }

    // EVIDENCE 4: Speaking order (fallback)
    if (unnamedSpeakers.length > 1) {
      const isFirstUnnamed = unnamedSpeakers[0] === speakerId;
      if (isFirstUnnamed && candidate.firstMentionSegmentIndex < segments.length / 2) {
        score += 15;
        reasons.push('first_mentioned_first_speaker');
      }
    }

    scores.push({ speakerId, score, reasons });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  if (scores.length > 0 && scores[0].score > 0) {
    console.log(`[EVIDENCE] Best match for "${candidate.name}": ${scores[0].speakerId} (score: ${scores[0].score}, reasons: ${scores[0].reasons.join(', ')})`);
    return { speakerId: scores[0].speakerId, evidenceScore: scores[0].score };
  }

  return null;
}

/**
 * Calculate assignment confidence based on evidence score
 * Maps evidence scores to confidence values
 */
function calculateAssignmentConfidence(
  candidate: NameCandidate,
  targetSpeakerId: string,
  segments: SpeakerSegment[],
  evidenceScore: number
): number {
  let confidence = 0.60;  // Base

  // Boost based on evidence score
  if (evidenceScore >= 50) confidence = 0.90;       // Very strong
  else if (evidenceScore >= 40) confidence = 0.85;  // Strong
  else if (evidenceScore >= 30) confidence = 0.82;  // Good
  else if (evidenceScore >= 20) confidence = 0.78;  // Moderate
  else confidence = 0.70;                           // Weak

  // Additional boosts
  if (candidate.introductionType === 'guest_intro') confidence += 0.05;
  if (candidate.mentionCount >= 2) confidence += 0.03;

  return Math.min(confidence, 0.95);
}

/**
 * Assign name candidates to speakers based on evidence
 * Phase 2 of hybrid extraction
 */
function assignNamesToSpeakers(
  speakerIds: string[],
  segments: SpeakerSegment[],
  selfIntroductions: Map<string, import('@/lib/prompts/types').HeuristicResult>,
  nameCandidates: Map<string, NameCandidate>,
  threshold: number = 0.80
): Map<string, import('@/lib/prompts/types').HeuristicResult> {

  const assignments = new Map<string, import('@/lib/prompts/types').HeuristicResult>();

  // PRIORITY 1: Self-introductions (100% confidence)
  for (const [speakerId, result] of selfIntroductions) {
    assignments.set(speakerId, result);
  }

  // PRIORITY 2: Guest introductions (80-90% confidence)
  const unnamedSpeakers = speakerIds.filter(id => !assignments.has(id));

  for (const [name, candidate] of nameCandidates) {
    // Skip if this candidate is already assigned
    if (Array.from(assignments.values()).some(a => a.name === name)) continue;

    // Find speaker this name likely refers to
    const targetMatch = findBestSpeakerForName(
      candidate,
      unnamedSpeakers,
      segments
    );

    if (targetMatch) {
      const confidence = calculateAssignmentConfidence(candidate, targetMatch.speakerId, segments, targetMatch.evidenceScore);

      // AGGRESSIVE: Assign if confidence >= threshold (user requirement)
      if (confidence >= threshold) {
        assignments.set(targetMatch.speakerId, {
          speakerId: targetMatch.speakerId,
          name: candidate.name,
          confidence,
          method: candidate.introductionType === 'guest_intro' ? 'guest_intro' : 'direct_address',
          evidence: candidate.contexts.map((text, idx) => ({
            speakerId: candidate.mentionedBy[idx] || 'unknown',
            startTime: 0,
            endTime: 0,
            text
          }))
        });

        console.log(`[ASSIGNMENT] ${targetMatch.speakerId} → "${candidate.name}" (conf: ${confidence.toFixed(2)})`);

        // Remove from unnamed list
        const idx = unnamedSpeakers.indexOf(targetMatch.speakerId);
        if (idx > -1) unnamedSpeakers.splice(idx, 1);
      }
    }
  }

  console.log(`[ASSIGNMENT] Assigned ${assignments.size}/${speakerIds.length} speakers`);
  return assignments;
}

/**
 * Run structured LLM extraction for remaining speakers
 * Returns Map of speakerId -> LLMAssignment
 */
async function runStructuredLLMExtraction(
  segments: SpeakerSegment[],
  existingResults: Map<string, import('@/lib/prompts/types').HeuristicResult>,
  options?: { userId?: string; projectId?: string }
): Promise<Map<string, import('@/lib/prompts/types').LLMAssignment>> {
  // Select segments (2000-3000 tokens)
  const selection = selectSegmentsForLLM(segments);

  const speakerIds = Array.from(new Set(segments.map(s => s.speakerId)));
  const unnamedSpeakers = speakerIds.filter(id => !existingResults.has(id));

  if (unnamedSpeakers.length === 0) {
    console.log('[NAME EXTRACTION] All speakers already named, skipping LLM');
    return new Map();
  }

  console.log(`[NAME EXTRACTION] Calling LLM for ${unnamedSpeakers.length} unnamed speakers`);

  try {
    // Build structured utterances for GPT
    const structuredUtterances = selection.segments.map(s => ({
      speaker_id: s.speakerId,
      time_range: s.time,
      text: s.text
    }));

    // Get config from prompts
    const config = prompts.audioRepurpose.speakerNameExtraction as any;

    // Build user prompt with structured format
    const userPrompt = (config.userPrompt as string).replace(
      '${utterances}',
      JSON.stringify(structuredUtterances, null, 2)
    );

    // Call LLM with deterministic settings
    const response = await getAICompletion({
      model: config.model,
      messages: [
        { role: 'system', content: config.system },
        { role: 'user', content: userPrompt }
      ],
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      topP: config.top_p
    });

    // Track usage if userId/projectId provided
    if (options?.userId && options?.projectId) {
      const inputTokens = response.usage?.inputTokens || Math.ceil((config.system.length + userPrompt.length) / 4);
      const outputTokens = response.usage?.outputTokens || Math.ceil((response.content?.length || 0) / 4);

      const costResult = calculateTokenCost(
        'openai_gpt4_input',
        'openai_gpt4_output',
        inputTokens,
        outputTokens
      );

      // Log input tokens
      await logUsageEvent({
        userId: options.userId,
        projectId: options.projectId,
        serviceKey: 'openai_gpt4_input',
        serviceName: 'GPT-4o Input (Speaker Extraction)',
        provider: 'openai',
        units: inputTokens,
        unitType: 'input_tokens',
        rawCost: costResult.breakdown.input.rawCost,
        marginPercent: 35,
        billedCost: costResult.breakdown.input.billedCost,
        metadata: {
          model: config.model,
          feature: 'speaker_name_extraction_gpt'
        }
      });

      // Log output tokens
      await logUsageEvent({
        userId: options.userId,
        projectId: options.projectId,
        serviceKey: 'openai_gpt4_output',
        serviceName: 'GPT-4o Output (Speaker Extraction)',
        provider: 'openai',
        units: outputTokens,
        unitType: 'output_tokens',
        rawCost: costResult.breakdown.output.rawCost,
        marginPercent: 35,
        billedCost: costResult.breakdown.output.billedCost,
        metadata: {
          model: config.model,
          feature: 'speaker_name_extraction_gpt'
        }
      });

      // Debit user credits (don't throw on billing errors)
      try {
        await debitCredit(
          options.userId,
          costResult.billedCost,
          undefined,
          {
            reason: `Speaker name extraction (GPT) - ${unnamedSpeakers.length} speakers`,
            metadata: {
              projectId: options.projectId,
              feature: 'speaker_name_extraction',
              speakers: unnamedSpeakers.length
            }
          }
        );
      } catch (billingError) {
        console.error('[NAME EXTRACTION] Billing debit failed:', billingError);
      }
    }

    // Parse JSON (remove markdown fences if present)
    const content = response.content.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(content);

    // Validate and convert new GPT format to Map
    const llmResults = new Map<string, import('@/lib/prompts/types').LLMAssignment>();

    if (result.speakers && typeof result.speakers === 'object') {
      Object.entries(result.speakers).forEach(([speakerId, data]: [string, any]) => {
        if (!data || typeof data !== 'object') return;

        const name = data.name;
        const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5;
        const evidence = data.evidence || '';

        // Skip null names (GPT explicitly returned null)
        if (name === null || name === 'null' || !name) {
          console.log(`[LLM] ${speakerId} -> No name found (GPT returned null)`);
          return;
        }

        // Validate name
        if (!isValidName(name)) {
          console.log(`[LLM] Rejected assignment for ${speakerId}: invalid name "${name}"`);
          return;
        }

        // Create LLMAssignment format
        llmResults.set(speakerId, {
          speakerId,
          name,
          confidence,
          nameType: confidence > 0.8 ? 'self_intro' : 'uncertain',
          evidence: [{
            speakerId,
            startTime: 0,
            endTime: 0,
            text: evidence
          }],
          notes: `GPT extraction (conf: ${confidence})`
        });

        console.log(`[LLM] ${speakerId} -> "${name}" (conf: ${confidence.toFixed(2)})`);
      });
    }

    console.log(`[NAME EXTRACTION] LLM returned ${llmResults.size} valid assignments`);

    return llmResults;

  } catch (error: any) {
    console.error('[NAME EXTRACTION] LLM extraction failed:', error);
    return new Map();
  }
}

/**
 * Merge heuristic and LLM results
 * Heuristics take precedence (higher confidence)
 */
function mergeResults(
  heuristic: Map<string, import('@/lib/prompts/types').HeuristicResult>,
  llm: Map<string, import('@/lib/prompts/types').LLMAssignment>
): Map<string, import('@/lib/prompts/types').HeuristicResult | import('@/lib/prompts/types').LLMAssignment> {
  const merged = new Map<string, import('@/lib/prompts/types').HeuristicResult | import('@/lib/prompts/types').LLMAssignment>();

  // Add all heuristic results first (higher priority)
  for (const [speakerId, result] of heuristic) {
    merged.set(speakerId, result);
  }

  // Add LLM results for speakers not already named
  for (const [speakerId, result] of llm) {
    if (!merged.has(speakerId)) {
      merged.set(speakerId, result);
    } else {
      console.log(`[MERGE] Skipping LLM result for ${speakerId} (heuristic already found "${merged.get(speakerId)!.name}")`);
    }
  }

  return merged;
}

/**
 * Resolve conflicts where multiple speakers have the same name
 * Keep highest confidence, remove others
 */
function resolveConflicts(
  results: Map<string, import('@/lib/prompts/types').HeuristicResult | import('@/lib/prompts/types').LLMAssignment>
): Map<string, import('@/lib/prompts/types').HeuristicResult | import('@/lib/prompts/types').LLMAssignment> {
  // Detect duplicate names across speakers
  const nameToSpeakers = new Map<string, string[]>();
  for (const [speakerId, result] of results) {
    const name = result.name.toLowerCase();
    if (!nameToSpeakers.has(name)) nameToSpeakers.set(name, []);
    nameToSpeakers.get(name)!.push(speakerId);
  }

  // Resolve: keep highest confidence, remove others
  for (const [name, speakerIds] of nameToSpeakers) {
    if (speakerIds.length > 1) {
      console.log(`[CONFLICT] Multiple speakers named "${name}": ${speakerIds.join(', ')}`);

      const sorted = speakerIds
        .map(id => ({ id, result: results.get(id)! }))
        .sort((a, b) => b.result.confidence - a.result.confidence);

      console.log(`[CONFLICT] Keeping ${sorted[0].id} (conf: ${sorted[0].result.confidence}), removing others`);

      // Remove lower confidence assignments
      for (let i = 1; i < sorted.length; i++) {
        results.delete(sorted[i].id);
      }
    }
  }

  return results;
}

/**
 * Helper function to convert HeuristicResult or LLMAssignment to ExtractedName
 */
function toExtractedName(
  result: import('@/lib/prompts/types').HeuristicResult | import('@/lib/prompts/types').LLMAssignment
): ExtractedName {
  return {
    name: result.name,
    fullName: result.name,
    nicknames: [],
    firstMentionTime: result.evidence[0]?.startTime || 0,
    confidence: result.confidence,
    context: result.evidence.map(e => e.text.substring(0, 100)).join(' | ')
  };
}

/**
 * HYBRID NAME EXTRACTION - NEW ARCHITECTURE
 * Combines deterministic heuristics with structured LLM fallback
 *
 * FLOW:
 * 1. Run deterministic heuristics (self-intro, line labels, guest intro)
 * 2. Early exit if ≥70% coverage
 * 3. Run LLM for remaining unnamed speakers
 * 4. Merge results (heuristics take precedence)
 * 5. Resolve conflicts (duplicate names)
 * 6. Convert to NamedSpeaker format with fallback names
 */
async function extractSpeakerNamesHybrid(
  transcriptionText: string,
  speakers: Record<string, DetectedSpeaker>,
  speakerSegments: SpeakerSegment[],
  options?: {
    userId?: string;
    projectId?: string;
  }
): Promise<Record<string, NamedSpeaker>> {
  console.log(`[NAME EXTRACTION HYBRID] Starting for ${Object.keys(speakers).length} speakers`);

  const speakerIds = Object.keys(speakers);
  const namedSpeakers: Record<string, NamedSpeaker> = {};

  // Early exit: Single speaker (no extraction needed)
  if (speakerIds.length === 1) {
    console.log('[NAME EXTRACTION HYBRID] Single speaker detected, using fallback name');
    const speaker = speakers[speakerIds[0]];
    namedSpeakers[speakerIds[0]] = {
      ...speaker,
      extractedName: null,
      finalName: speaker.fallbackName || 'Speaker',
      rosterMatched: false
    };
    return namedSpeakers;
  }

  // STEP 1: Run deterministic heuristics (NEW: three-bucket return)
  const { selfIntroductions, nameCandidates, roleCandidates } = runDeterministicHeuristics(speakerSegments);

  // STEP 2: Assign names to speakers based on candidates
  const nameAssignments = assignNamesToSpeakers(
    speakerIds,
    speakerSegments,
    selfIntroductions,
    nameCandidates
  );

  // STEP 3: Check coverage threshold
  const coverageRatio = nameAssignments.size / speakerIds.length;
  console.log(`[NAME EXTRACTION HYBRID] Coverage: ${nameAssignments.size}/${speakerIds.length} (${(coverageRatio * 100).toFixed(1)}%)`);

  let finalResults: Map<string, import('@/lib/prompts/types').HeuristicResult | import('@/lib/prompts/types').LLMAssignment> = nameAssignments;

  // REDUCED THRESHOLD: Run LLM if coverage < 90% (was 70%)
  if (coverageRatio < 0.90) {
    console.log('[NAME EXTRACTION HYBRID] Running LLM fallback');
    const llmResults = await runStructuredLLMExtraction(
      speakerSegments,
      nameAssignments,
      options
    );

    const merged = mergeResults(nameAssignments, llmResults);
    finalResults = resolveConflicts(merged);
  }

  // STEP 4: Build final NamedSpeaker objects (with role badges)
  speakerIds.forEach((id, index) => {
    const speaker = speakers[id];
    const extractedResult = finalResults.get(id);
    const roleCandidate = roleCandidates.get(id);

    if (extractedResult) {
      namedSpeakers[id] = {
        ...speaker,
        extractedName: toExtractedName(extractedResult),
        finalName: extractedResult.name,
        rosterMatched: false,
        // NEW: Add role as metadata/badge
        role: normalizeSpeakerRole(roleCandidate?.role),
        roleConfidence: roleCandidate?.confidence
      };
    } else {
      // Fallback to numbered speaker
      const fallbackName = generateFallbackName(speaker, index, speakerIds.length);
      namedSpeakers[id] = {
        ...speaker,
        extractedName: null,
        finalName: fallbackName,
        rosterMatched: false,
        role: normalizeSpeakerRole(roleCandidate?.role),
        roleConfidence: roleCandidate?.confidence
      };
    }
  });

  console.log(`[NAME EXTRACTION HYBRID] Final mapping:`, Object.keys(namedSpeakers).map(id =>
    `${id}: "${namedSpeakers[id].finalName}"${namedSpeakers[id].role ? ` [${namedSpeakers[id].role}]` : ''} ${namedSpeakers[id].extractedName ? `(confidence: ${namedSpeakers[id].extractedName?.confidence.toFixed(2)})` : '(fallback)'}`
  ));

  return namedSpeakers;
}

/**
 * Extract speaker names using segment-based mapping for accurate attribution
 *
 * ENHANCED: Prioritizes roster matching if provided, falls back to pattern extraction
 * Uses speaker segment data directly instead of text position estimation
 */
export async function extractSpeakerNames(
  transcriptionText: string,
  speakers: Record<string, DetectedSpeaker>,
  speakerSegments: SpeakerSegment[],
  options?: {
    userId?: string;
    projectId?: string;
    rosterSpeakers?: PresetSpeaker[];
    excludedSpeakers?: Set<string>;
  }
): Promise<Record<string, NamedSpeaker>> {
  const excludedSpeakers = options?.excludedSpeakers || new Set();

  if (excludedSpeakers.size > 0) {
    console.log(`[NAME EXTRACTION] Excluding ${excludedSpeakers.size} non-speaker segments:`, Array.from(excludedSpeakers));
  }

  // Filter out excluded speakers from processing
  const filteredSpeakers = Object.fromEntries(
    Object.entries(speakers).filter(([id]) => !excludedSpeakers.has(id))
  );

  console.log(`[NAME EXTRACTION] Starting segment-based name extraction for ${Object.keys(filteredSpeakers).length} speakers (${Object.keys(speakers).length} total, ${excludedSpeakers.size} filtered)`);
  console.log(`[NAME EXTRACTION] Analyzing ${speakerSegments.length} speaker segments`);

  try {
    // PRIORITY: Try roster matching first if available
    if (options?.rosterSpeakers && options.rosterSpeakers.length > 0) {
      console.log(`[NAME EXTRACTION] 🎯 Roster matching with ${options.rosterSpeakers.length} entries`);

      try {
        const { matchSpeakersToRoster } = await import('./speaker-roster-matcher');

        const rosterMatches = await matchSpeakersToRoster(
          filteredSpeakers,
          speakerSegments,
          transcriptionText,
          options.rosterSpeakers
        );

        // Apply roster matches
        const namedSpeakers: Record<string, NamedSpeaker> = {};
        const matchedIds = new Set(rosterMatches.map(m => m.detectedSpeakerId));

        for (const match of rosterMatches) {
          const speaker = filteredSpeakers[match.detectedSpeakerId];
          namedSpeakers[match.detectedSpeakerId] = {
            ...speaker,
            extractedName: {
              name: match.rosterSpeaker.name,
              fullName: match.rosterSpeaker.name,
              nicknames: [],
              firstMentionTime: 0,
              confidence: match.confidence,
              context: match.evidence.join(' | ')
            },
            finalName: match.rosterSpeaker.name,
            role: normalizeSpeakerRole(match.rosterSpeaker.role),
            customName: match.rosterSpeaker.name,
            rosterMatched: true,
            rosterMatchMethod: match.matchMethod,
            rosterMatchConfidence: match.confidence
          };
        }

        // Fall back to hybrid extraction for unmatched speakers
        const unmatchedSpeakers = Object.fromEntries(
          Object.entries(filteredSpeakers).filter(([id]) => !matchedIds.has(id))
        );

        if (Object.keys(unmatchedSpeakers).length > 0) {
          console.log(`[NAME EXTRACTION] Hybrid extraction for ${Object.keys(unmatchedSpeakers).length} unmatched speakers`);

          const unmatchedSegments = speakerSegments.filter(s => !matchedIds.has(s.speakerId));
          const hybridResults = await extractSpeakerNamesHybrid(transcriptionText, unmatchedSpeakers, unmatchedSegments, options);

          // Merge results
          for (const [id, namedSpeaker] of Object.entries(hybridResults)) {
            namedSpeakers[id] = namedSpeaker;
          }
        }

        console.log(`[NAME EXTRACTION] Roster matching complete: ${rosterMatches.length} matched, ${Object.keys(unmatchedSpeakers).length} unmatched`);
        return namedSpeakers;

      } catch (error) {
        console.error('[NAME EXTRACTION] Roster matching failed:', error);
        // Fall through to standard extraction
      }
    }

    // FALLBACK: Use hybrid extraction (heuristics + LLM)
    return await extractSpeakerNamesHybrid(transcriptionText, filteredSpeakers, speakerSegments, options);
  } catch (error) {
    console.error('[NAME EXTRACTION] Error extracting speaker names:', error);

    // Enhanced fallback with better default names
    const result: Record<string, NamedSpeaker> = {};
    const speakerIds = Object.keys(filteredSpeakers).sort();

    speakerIds.forEach((id, index) => {
      const speaker = filteredSpeakers[id];
      const fallbackName = generateFallbackName(speaker, index, speakerIds.length);

      result[id] = {
        ...speaker,
        extractedName: null,
        finalName: fallbackName,
        rosterMatched: false
      };
    });

    console.log(`[NAME EXTRACTION] Using fallback names:`, Object.keys(result).map(id =>
      `${id}: "${result[id].finalName}"`
    ));

    return result;
  }
}

/**
 * Generate fallback names - try to use descriptive roles, then numbered speakers
 * Preference: Actual Name > Role (e.g., "Political Commentator") > Generic (e.g., "Speaker 1")
 */
function generateFallbackName(speaker: DetectedSpeaker, index: number, totalSpeakers: number): string {
  // Try to extract a role from the speaker's segments
  const role = extractRoleFromSegments(speaker);

  if (role) {
    return role;
  }

  // Fall back to numbered speakers
  return `Speaker ${index + 1}`;
}

/**
 * Try to extract a professional role/title from speaker segments
 * Returns roles like "Political Commentator", "Journalist", "Host", etc.
 */
function extractRoleFromSegments(speaker: DetectedSpeaker): string | null {
  // Common role patterns to look for
  const rolePatterns = [
    /\b(political commentator|political analyst)\b/i,
    /\b(commentator|analyst|expert)\b/i,
    /\b(journalist|reporter|correspondent)\b/i,
    /\b(lawyer|attorney)\b/i,
    /\b(host|co-host|moderator)\b/i,
    /\b(doctor|professor|teacher)\b/i,
    /\b(author|writer)\b/i,
    /\b(entrepreneur|founder|ceo)\b/i,
  ];

  // Search through the speaker's segments
  for (const segment of speaker.segments) {
    const text = segment.text;

    for (const pattern of rolePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Capitalize properly (e.g., "political commentator" -> "Political Commentator")
        const role = match[1]
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');

        return role;
      }
    }
  }

  return null;
}

/**
 * Get display name for a speaker (prioritizes custom > final > extracted > fallback)
 * Note: finalName takes precedence over extractedName because role classification
 * and other processes update finalName without updating extractedName.
 */
export function getSpeakerDisplayName(namedSpeaker?: NamedSpeaker | null): string {
  if (!namedSpeaker) {
    return 'Unknown Speaker';
  }
  if (namedSpeaker.customName && namedSpeaker.customName.trim().length > 0) {
    return namedSpeaker.customName.trim();
  }
  if (namedSpeaker.finalName) {
    return namedSpeaker.finalName;
  }
  if (namedSpeaker.extractedName) {
    return namedSpeaker.extractedName.name;
  }
  // Fallback for edge cases where finalName is missing
  if (namedSpeaker.fallbackName) {
    return namedSpeaker.fallbackName;
  }
  return `Speaker ${namedSpeaker.id}`;
}

/**
 * Generate speaker colors for UI display
 */
export function getSpeakerColor(speakerId: string): string {
  const colors = [
    'text-blue-600 bg-blue-50',
    'text-green-600 bg-green-50',
    'text-purple-600 bg-purple-50',
    'text-orange-600 bg-orange-50',
    'text-pink-600 bg-pink-50',
    'text-indigo-600 bg-indigo-50'
  ];

  // Generate consistent color based on speaker ID
  const hash = speakerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
