import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { SpeakerSegment } from './types';
import { prompts } from '@/lib/prompts/loader';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export interface SpeakerRoleClassification {
  speakerId: string;
  role: string;
  displayName: string;
  confidence: number;
  summary: string;
  evidence: string[];
}

interface SpeakerProfile {
  id: string;
  fallbackName?: string | null;
  totalDuration: number;
  segments: SpeakerSegment[];
  behavioralStats?: {
    handoffGivenCount?: number;
    handoffReceivedCount?: number;
    avgTurnSeconds?: number;
  } | null;
}

const ROLE_OPTIONS = [
  'host',
  'co_host',
  'guest',
  'interviewer',
  'moderator',
  'panelist',
  'narrator',
  'storyteller',
  'ad_reader',
  'sponsor_voice',
  'promo_voice',
  'call_to_action',
  'expert_commentator',
  'audience_question',
  'unknown'
] as const;

const ROLE_HINT = ROLE_OPTIONS.join(', ');
const AD_LIKE_ROLES = new Set([
  'ad_reader',
  'sponsor_voice',
  'promo_voice',
  'call_to_action',
]);

export async function classifySpeakerRoles(
  speakers: Record<string, SpeakerProfile>,
  options: {
    transcriptContext?: string;
    userId?: string;
    projectId?: string;
    reservationId?: string;
    apiKey?: string;
  } = {}
): Promise<Record<string, SpeakerRoleClassification>> {
  if (!speakers || Object.keys(speakers).length === 0) {
    return {};
  }

  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    console.warn('[SPEAKER ROLES] ⚠️ OpenAI API key not configured, skipping role classification.');
    return {};
  }

  const openai = new OpenAI({ apiKey });
  const speakerEntries = Object.values(speakers);

  const speakerSummaries = speakerEntries.map((speaker) => ({
    id: speaker.id,
    fallbackName: speaker.fallbackName || null,
    duration: speaker.totalDuration ?? 0,
    segmentCount: speaker.segments?.length ?? 0,
    sample: buildSpeakerSample(speaker.segments ?? [])
  })).filter((summary) => summary.sample.trim().length > 0);

  if (speakerSummaries.length === 0) {
    console.warn('[SPEAKER ROLES] ⚠️ Unable to collect speaker samples for role classification.');
    return {};
  }

  const transcriptSnippet = options.transcriptContext
    ? options.transcriptContext.slice(0, 1200)
    : null;

  // Build structured utterances for GPT
  const structuredUtterances = speakerSummaries.map((summary) => {
    const behavioral = speakers[summary.id]?.behavioralStats;
    return {
      speaker_id: summary.id,
      duration_seconds: summary.duration,
      segment_count: summary.segmentCount,
      handoffs_given: behavioral?.handoffGivenCount ?? null,
      handoffs_received: behavioral?.handoffReceivedCount ?? null,
      avg_turn_seconds: behavioral?.avgTurnSeconds != null
        ? Math.round(behavioral.avgTurnSeconds * 10) / 10
        : null,
      sample_utterances: summary.sample
    };
  });

  // Get config for speaker role classification
  const config = prompts.audioRepurpose.speakerRoleClassification as any;

  // Build user prompt with structured format
  const userPrompt = (config.userPrompt as string).replace(
    '${utterances}',
    JSON.stringify(structuredUtterances, null, 2)
  );

  try {
    const response = await openai.chat.completions.create({
      model: config.model,
      max_completion_tokens: config.max_tokens,
      top_p: config.top_p || 1,
      messages: [
        {
          role: 'system',
          content: config.system || ''
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      response_format: { type: 'json_object' }
    });

    // Track usage and billing (don't throw on billing errors)
    if (options.userId) {
      try {
        await trackOpenAIUsage({
          userId: options.userId,
          projectId: options.projectId,
          reservationId: options.reservationId,
          response,
          modelName: config.model,
          purpose: 'Speaker Role Classification',
          metadata: {
            speakerCount: speakerEntries.length,
          },
          shouldDebit: options.reservationId ? false : true,
        });
      } catch (billingError) {
        console.error('[SPEAKER ROLES] Billing tracking failed:', billingError);
        // Continue processing even if billing fails
      }
    }

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = safeParseResponse(raw);
    const classifications: Record<string, SpeakerRoleClassification> = {};

    // Handle new GPT format: { speakers: { "Speaker_A": {...}, "Speaker_B": {...} } }
    if (parsed.speakers && typeof parsed.speakers === 'object' && !Array.isArray(parsed.speakers)) {
      Object.entries(parsed.speakers).forEach(([speakerId, item]: [string, any]) => {
        if (!item || typeof item !== 'object') return;
        if (!speakerId || !speakers[speakerId]) return;

        const role = applyConservativeRoleGuards(
          normalizeRole(item.role),
          speakers[speakerId]
        );
        const displayName = buildFallbackDisplayName(role, speakers[speakerId]);
        const confidence = typeof item.confidence === 'number'
          ? clamp(item.confidence, 0, 1)
          : 0.5;
        const summary = typeof item.summary === 'string'
          ? item.summary.trim().slice(0, 500)
          : '';
        const evidence = Array.isArray(item.evidence)
          ? item.evidence
              .slice(0, 4)
              .map((str: any) => String(str).trim())
              .filter((snippet: string) => snippet.length > 0)
          : [];

        classifications[speakerId] = {
          speakerId,
          role,
          displayName,
          confidence,
          summary,
          evidence
        };
      });
    }
    // Fallback: Handle old array format for backwards compatibility
    else if (Array.isArray(parsed.speakers)) {
      parsed.speakers.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const speakerId = item.speakerId || item.id;
        if (!speakerId || !speakers[speakerId]) return;

        const role = applyConservativeRoleGuards(
          normalizeRole(item.role),
          speakers[speakerId]
        );
        const displayName = buildFallbackDisplayName(role, speakers[speakerId]);
        const confidence = typeof item.confidence === 'number'
          ? clamp(item.confidence, 0, 1)
          : 0.5;
        const summary = typeof item.summary === 'string'
          ? item.summary.trim().slice(0, 500)
          : '';
        const evidence = Array.isArray(item.evidence)
          ? item.evidence
              .slice(0, 4)
              .map((str: any) => String(str).trim())
              .filter((snippet: string) => snippet.length > 0)
          : [];

        classifications[speakerId] = {
          speakerId,
          role,
          displayName,
          confidence,
          summary,
          evidence
        };
      });
    }

    return classifications;
  } catch (classificationError) {
    console.error('[SPEAKER ROLES] Role classification failed:', classificationError);
    return {};
  }
}

function buildSpeakerSample(segments: SpeakerSegment[], limit = 900): string {
  if (!segments || segments.length === 0) return '';

  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const parts: string[] = [];
  let totalChars = 0;

  for (const segment of sorted) {
    const text = (segment.text || '').trim();
    if (!text) continue;

    const line = `[${formatTimestamp(segment.startTime)}-${formatTimestamp(segment.endTime)}] ${text}`;
    parts.push(line);
    totalChars += line.length;

    if (totalChars >= limit) break;
  }

  return parts.join('\n');
}

function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function normalizeRole(role: string | undefined): string {
  if (!role) return 'unknown';
  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  if (ROLE_OPTIONS.includes(normalized as typeof ROLE_OPTIONS[number])) {
    return normalized;
  }
  return 'unknown';
}

function buildFallbackDisplayName(role: string, speaker: SpeakerProfile): string {
  const base = speaker.fallbackName || `Speaker ${speaker.id}`;
  return base;
}

function applyConservativeRoleGuards(role: string, speaker: SpeakerProfile): string {
  if (!AD_LIKE_ROLES.has(role)) {
    return role;
  }

  if (!speaker?.segments?.length) {
    return role;
  }

  if (speakerHasConversationalTurns(speaker)) {
    return 'unknown';
  }

  return role;
}

function speakerHasConversationalTurns(speaker: SpeakerProfile): boolean {
  return speaker.segments.some((segment) => !isAdLikeSegment(segment));
}

function isAdLikeSegment(segment: SpeakerSegment): boolean {
  if (!segment) return false;
  if (segment.segmentKind === 'ad_read' || segment.segmentKind === 'promo') {
    return true;
  }

  const text = (segment.text || '').trim();
  if (!text) return false;

  return /\b(?:support\s+for\s+(?:this|the)\s+(?:show|podcast|episode)\s+comes?\s+from|this\s+(?:show|episode)\s+is\s+brought\s+to\s+you\s+by|use\s+code\b|promo\s+code\b|visit\s+\S+\.(?:com|org|net|io|co)\b|terms\s+and\s+conditions\s+apply)\b/i.test(text);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ParsedRoleResponse {
  speakers: RoleResponse[];
}

interface RoleResponse {
  speakerId?: string;
  id?: string;
  role?: string;
  displayName?: string;
  confidence?: number | string;
  summary?: string;
  evidence?: string[];
}

function safeParseResponse(content: string): ParsedRoleResponse {
  // Strip markdown code blocks if present
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  }

  try {
    const parsed = JSON.parse(cleanContent);
    if (Array.isArray(parsed)) {
      return { speakers: parsed };
    }
    if (parsed && Array.isArray(parsed.speakers)) {
      return { speakers: parsed.speakers };
    }
  } catch (parseError) {
    console.debug('[SPEAKER ROLES] Raw role response was not valid JSON:', parseError);
    // Try to extract JSON array manually
    const match = cleanContent.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) {
          return { speakers: arr };
        }
      } catch {
        // ignore
      }
    }
    console.warn('[SPEAKER ROLES] ⚠️ Unable to parse JSON role response.');
  }

  return { speakers: [] };
}

export const __testUtils = {
  applyConservativeRoleGuards,
  buildFallbackDisplayName,
  isAdLikeSegment,
  speakerHasConversationalTurns,
};
