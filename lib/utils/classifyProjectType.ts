/**
 * Project Type Classification Utility
 *
 * Classifies transcripts into project types to enable context-aware
 * speaker correction strategies:
 * - DEBATE: Moderator introduces/hands off to panelists (alphabetical, turns)
 * - INTERVIEW: Host asks questions, guest answers (1-on-1 dynamic)
 * - PODCAST: Conversational flow between hosts and guests
 * - MONOLOGUE: Single speaker (lecture, solo podcast, presentation)
 * - OTHER: Unclassifiable or mixed format
 */

import type { SpeakerSegment } from '@/lib/types';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export type ProjectType = 'DEBATE' | 'INTERVIEW' | 'PODCAST' | 'MONOLOGUE' | 'OTHER';

interface ClassificationResult {
  type: ProjectType;
  confidence: number;
  signals: ClassificationSignal[];
  metadata: {
    speakerCount: number;
    moderatorCandidate?: string;
    turnPatternScore: number;
    conversationalScore: number;
  };
}

interface ClassificationSignal {
  signal: string;
  weight: number;
  detected: boolean;
  evidence?: string;
}

function isLikelyPanelPodcast(params: {
  speakerCount: number;
  hasModeratorSignal: boolean;
  hasAlphabeticalMention: boolean;
  hasInterviewStyle: boolean;
  hasConversationalStyle: boolean;
  moderatorConfidence: number;
  dominantRatio: number;
}): boolean {
  const {
    speakerCount,
    hasModeratorSignal,
    hasAlphabeticalMention,
    hasInterviewStyle,
    hasConversationalStyle,
    moderatorConfidence,
    dominantRatio,
  } = params;

  if (!hasModeratorSignal || hasAlphabeticalMention) return false;
  if (speakerCount < 3 || speakerCount > 4) return false;

  // Host-led market/panel podcasts often look "moderated" without being debates.
  // Bias these mixed-format shows toward PODCAST unless there are formal-debate cues.
  const hostLedButConversational = dominantRatio >= 0.15 && dominantRatio <= 0.5;
  const informalFormatSignal = hasInterviewStyle || hasConversationalStyle;

  return informalFormatSignal && hostLedButConversational && moderatorConfidence < 0.9;
}

// Procedural/moderator language patterns
const MODERATOR_PATTERNS = [
  /\b(?:next (?:we have|up is|is)|let's (?:hear from|welcome|turn to)|over to you)/gi,
  /\b(?:moving on to|thank you|thanks for (?:that|joining)|before we go)/gi,
  /\b(?:our next (?:speaker|panelist|guest)|now (?:turning to|we'll hear from))/gi,
  /\b(?:in alphabetical order|going (?:around the table|in order))/gi,
  /\b(?:please welcome|introducing|our (?:first|second|third|final) (?:speaker|panelist))/gi,
  /\b(?:time for (?:our|the) (?:first|next|final))/gi,
  /\b(?:let's start with|we'll begin with|beginning with)/gi,
];

// Interview-style question patterns
const INTERVIEW_PATTERNS = [
  /\?$/,  // Ends with question mark
  /\b(?:what do you think|how do you|can you tell us|could you explain)/gi,
  /\b(?:in your experience|your perspective|your take on)/gi,
  /\b(?:let's dive into|tell me about|talk to me about)/gi,
];

// Conversational podcast patterns
const PODCAST_PATTERNS = [
  /\b(?:so basically|you know what|that's crazy|wait what)/gi,
  /\b(?:i was thinking|exactly|totally|absolutely|right\?$)/gi,
  /\b(?:oh man|dude|yeah yeah|no way|for real)/gi,
  /\b(?:speaking of which|on that note|going back to)/gi,
];

/**
 * Counts pattern matches in text
 */
function countPatternMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Analyzes speaker distribution and dynamics
 */
function analyzeSpeakerDynamics(segments: SpeakerSegment[]): {
  speakerCount: number;
  dominantSpeakerId: string | null;
  dominantRatio: number;
  avgSegmentDuration: number;
  turnFrequency: number;
} {
  if (!segments.length) {
    return { speakerCount: 0, dominantSpeakerId: null, dominantRatio: 0, avgSegmentDuration: 0, turnFrequency: 0 };
  }

  const speakerDurations: Record<string, number> = {};
  const speakerSegments: Record<string, number> = {};
  let totalDuration = 0;

  for (const segment of segments) {
    const duration = segment.endTime - segment.startTime;
    speakerDurations[segment.speakerId] = (speakerDurations[segment.speakerId] || 0) + duration;
    speakerSegments[segment.speakerId] = (speakerSegments[segment.speakerId] || 0) + 1;
    totalDuration += duration;
  }

  const speakerIds = Object.keys(speakerDurations);
  let dominantSpeakerId: string | null = null;
  let maxDuration = 0;

  for (const id of speakerIds) {
    if (speakerDurations[id] > maxDuration) {
      maxDuration = speakerDurations[id];
      dominantSpeakerId = id;
    }
  }

  const dominantRatio = totalDuration > 0 ? maxDuration / totalDuration : 0;
  const avgSegmentDuration = totalDuration / segments.length;

  // Turn frequency: how often speakers switch per minute
  const totalMinutes = totalDuration / 60;
  const turnFrequency = totalMinutes > 0 ? segments.length / totalMinutes : 0;

  return {
    speakerCount: speakerIds.length,
    dominantSpeakerId,
    dominantRatio,
    avgSegmentDuration,
    turnFrequency,
  };
}

/**
 * Detects moderator by analyzing procedural language usage per speaker
 */
function detectModerator(
  segments: SpeakerSegment[]
): { moderatorId: string | null; confidence: number; evidence: string[] } {
  const speakerScores: Record<string, { count: number; examples: string[] }> = {};

  for (const segment of segments) {
    const text = segment.text;
    let matchCount = 0;
    const examples: string[] = [];

    for (const pattern of MODERATOR_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = text.match(regex);
      if (matches) {
        matchCount += matches.length;
        examples.push(...matches.slice(0, 2));
      }
    }

    if (matchCount > 0) {
      if (!speakerScores[segment.speakerId]) {
        speakerScores[segment.speakerId] = { count: 0, examples: [] };
      }
      speakerScores[segment.speakerId].count += matchCount;
      speakerScores[segment.speakerId].examples.push(...examples);
    }
  }

  let moderatorId: string | null = null;
  let maxScore = 0;

  for (const [speakerId, data] of Object.entries(speakerScores)) {
    if (data.count > maxScore) {
      maxScore = data.count;
      moderatorId = speakerId;
    }
  }

  // Need at least 3 moderator phrases to be confident
  const confidence = Math.min(maxScore / 5, 1);

  return {
    moderatorId: maxScore >= 3 ? moderatorId : null,
    confidence,
    evidence: moderatorId ? speakerScores[moderatorId].examples.slice(0, 5) : [],
  };
}

/**
 * Checks for alphabetical order mention in transcript
 */
function detectAlphabeticalOrder(transcript: string): boolean {
  const alphaPatterns = [
    /alphabetical(?:ly| order)/i,
    /going in order/i,
    /a to z/i,
    /starting with (?:the letter )?[a-z]/i,
  ];

  return alphaPatterns.some(p => p.test(transcript));
}

/**
 * Main classification function
 */
export function classifyProjectType(
  segments: SpeakerSegment[],
  transcript?: string
): ClassificationResult {
  const fullText = transcript || segments.map(s => s.text).join(' ');
  const dynamics = analyzeSpeakerDynamics(segments);
  const moderatorDetection = detectModerator(segments);
  const signals: ClassificationSignal[] = [];

  // Signal 1: Speaker count
  const isSingleSpeaker = dynamics.speakerCount === 1;
  const isTwoSpeaker = dynamics.speakerCount === 2;
  const isMultiSpeaker = dynamics.speakerCount >= 3;

  signals.push({
    signal: 'speaker_count',
    weight: 1.0,
    detected: true,
    evidence: `${dynamics.speakerCount} speakers detected`,
  });

  // Signal 2: Dominant speaker ratio (monologue detection)
  const isDominantSpeaker = dynamics.dominantRatio > 0.85;
  signals.push({
    signal: 'dominant_speaker',
    weight: 0.8,
    detected: isDominantSpeaker,
    evidence: `Dominant speaker has ${(dynamics.dominantRatio * 100).toFixed(0)}% of speaking time`,
  });

  // Signal 3: Moderator detection
  const hasModeratorSignal = moderatorDetection.moderatorId !== null;
  signals.push({
    signal: 'moderator_detected',
    weight: 1.2,
    detected: hasModeratorSignal,
    evidence: hasModeratorSignal
      ? `Moderator: ${moderatorDetection.moderatorId} (${moderatorDetection.evidence.slice(0, 3).join(', ')})`
      : 'No moderator pattern detected',
  });

  // Signal 4: Alphabetical order mention (strong debate signal)
  const hasAlphabeticalMention = detectAlphabeticalOrder(fullText);
  signals.push({
    signal: 'alphabetical_order',
    weight: 1.5,
    detected: hasAlphabeticalMention,
    evidence: hasAlphabeticalMention ? 'Alphabetical order mentioned' : undefined,
  });

  // Signal 5: Interview-style questions
  const interviewScore = countPatternMatches(fullText, INTERVIEW_PATTERNS);
  const hasInterviewStyle = interviewScore > 10;
  signals.push({
    signal: 'interview_style',
    weight: 0.7,
    detected: hasInterviewStyle,
    evidence: `${interviewScore} interview-style patterns found`,
  });

  // Signal 6: Conversational patterns
  const podcastScore = countPatternMatches(fullText, PODCAST_PATTERNS);
  const hasConversationalStyle = podcastScore > 8;
  signals.push({
    signal: 'conversational_style',
    weight: 0.6,
    detected: hasConversationalStyle,
    evidence: `${podcastScore} conversational patterns found`,
  });

  // Signal 7: Turn frequency (debates have structured turns, podcasts are more chaotic)
  const hasStructuredTurns = dynamics.turnFrequency > 2 && dynamics.turnFrequency < 8;
  const panelPodcastSignal = isLikelyPanelPodcast({
    speakerCount: dynamics.speakerCount,
    hasModeratorSignal,
    hasAlphabeticalMention,
    hasInterviewStyle,
    hasConversationalStyle,
    moderatorConfidence: moderatorDetection.confidence,
    dominantRatio: dynamics.dominantRatio,
  });
  signals.push({
    signal: 'structured_turns',
    weight: 0.5,
    detected: hasStructuredTurns,
    evidence: `Turn frequency: ${dynamics.turnFrequency.toFixed(1)}/min`,
  });

  signals.push({
    signal: 'panel_podcast_shape',
    weight: 1.0,
    detected: panelPodcastSignal,
    evidence: panelPodcastSignal
      ? 'Moderator-like host with 2-3 guests, but conversational/panel podcast cues dominate'
      : undefined,
  });

  // Classification logic
  let type: ProjectType;
  let confidence: number;
  const formalDebateSignal =
    hasAlphabeticalMention ||
    dynamics.speakerCount >= 5 ||
    (hasModeratorSignal &&
      hasStructuredTurns &&
      moderatorDetection.confidence >= 0.9 &&
      !hasInterviewStyle &&
      !hasConversationalStyle);

  if (isSingleSpeaker || isDominantSpeaker) {
    // MONOLOGUE: Single speaker or one speaker dominates >85%
    type = 'MONOLOGUE';
    confidence = isDominantSpeaker ? 0.7 + (dynamics.dominantRatio - 0.85) : 0.95;
  } else if (hasModeratorSignal && isMultiSpeaker && formalDebateSignal && !panelPodcastSignal) {
    // DEBATE: Moderator + 3+ speakers
    type = 'DEBATE';
    confidence = 0.6 + (moderatorDetection.confidence * 0.3);
    if (hasAlphabeticalMention) confidence += 0.1;
  } else if (panelPodcastSignal) {
    type = 'PODCAST';
    confidence = hasConversationalStyle ? 0.82 : 0.74;
  } else if (isTwoSpeaker && hasInterviewStyle && !hasConversationalStyle) {
    // INTERVIEW: 2 speakers with interview-style Q&A
    type = 'INTERVIEW';
    confidence = 0.7;
  } else if (isTwoSpeaker || (isMultiSpeaker && !hasModeratorSignal)) {
    // PODCAST: 2-3 speakers with conversational flow, no clear moderator
    type = 'PODCAST';
    confidence = hasConversationalStyle ? 0.8 : 0.6;
  } else {
    // OTHER: Doesn't fit clear patterns
    type = 'OTHER';
    confidence = 0.4;
  }

  return {
    type,
    confidence: Math.min(confidence, 1),
    signals,
    metadata: {
      speakerCount: dynamics.speakerCount,
      moderatorCandidate: moderatorDetection.moderatorId || undefined,
      turnPatternScore: dynamics.turnFrequency,
      conversationalScore: podcastScore,
    },
  };
}

/**
 * AI-powered classification using GPT (for higher accuracy)
 * Falls back to heuristic classification if AI fails
 */
export async function classifyProjectTypeWithAI(
  transcript: string,
  segments: SpeakerSegment[],
  options: {
    openaiApiKey?: string;
    userId?: string;
    projectId?: string;
    reservationId?: string;
  } = {}
): Promise<ClassificationResult> {
  // First, get heuristic classification as baseline
  const heuristicResult = classifyProjectType(segments, transcript);

  // If no API key or heuristics are very confident, skip AI
  if (!options.openaiApiKey || heuristicResult.confidence > 0.85) {
    return heuristicResult;
  }

  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: options.openaiApiKey });

    // Truncate transcript for API efficiency
    const truncatedTranscript = transcript.slice(0, 4000);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a media format classifier. Analyze the transcript and classify it into ONE of these types:

DEBATE: A formal discussion with a moderator/host introducing panelists, often with structured turn-taking. Look for phrases like "Next we have", "Let's hear from", "In alphabetical order", moderator handoffs.

INTERVIEW: A 1-on-1 conversation where one person asks questions and another answers. Clear host/guest dynamic with Q&A format.

PODCAST: A conversational show with hosts (often co-hosts) discussing topics casually. Natural back-and-forth, casual language, shared hosting duties.

MONOLOGUE: A single person speaking (lecture, solo podcast, presentation, audiobook). Minimal or no dialogue.

OTHER: Doesn't fit the above categories (e.g., mixed formats, scripted drama, unclear).

Respond in JSON format only:
{
  "type": "DEBATE" | "INTERVIEW" | "PODCAST" | "MONOLOGUE" | "OTHER",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`
        },
        {
          role: 'user',
          content: `Classify this transcript:\n\n${truncatedTranscript}`
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0.1,
    });

    if (options.userId) {
      await trackOpenAIUsage({
        userId: options.userId,
        projectId: options.projectId,
        reservationId: options.reservationId,
        response,
        modelName: 'gpt-4o-mini',
        purpose: 'Project Type Classification',
        shouldDebit: options.reservationId ? false : true,
      }).catch((billingError) => {
        console.error('[CLASSIFY] Billing tracking failed:', billingError);
      });
    }

    const content = response.choices[0]?.message?.content;
    if (content) {
      const aiResult = JSON.parse(content);
      const validTypes: ProjectType[] = ['DEBATE', 'INTERVIEW', 'PODCAST', 'MONOLOGUE', 'OTHER'];

      if (validTypes.includes(aiResult.type)) {
        return {
          type: aiResult.type,
          confidence: aiResult.confidence || 0.8,
          signals: [
            ...heuristicResult.signals,
            {
              signal: 'ai_classification',
              weight: 1.5,
              detected: true,
              evidence: aiResult.reasoning || 'AI classification',
            },
          ],
          metadata: {
            ...heuristicResult.metadata,
          },
        };
      }
    }
  } catch (error) {
    console.error('[CLASSIFY] AI classification failed, using heuristics:', error);
  }

  return heuristicResult;
}
