import OpenAI from 'openai';
import { SpeakerSegment } from './types';

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

export async function classifySpeakerRoles(
  speakers: Record<string, SpeakerProfile>,
  options: { transcriptContext?: string } = {}
): Promise<Record<string, SpeakerRoleClassification>> {
  if (!speakers || Object.keys(speakers).length === 0) {
    return {};
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[SPEAKER ROLES] ⚠️ Missing OPENAI_API_KEY, skipping role classification.');
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

  const userContent = [
    'You are analyzing a podcast or interview conversation.',
    'Classify each speaker into the most likely conversational role and summarize why.',
    'You MUST respond with a JSON array. Each object must include:',
    '{ "speakerId": "...", "role": "one of roles", "displayName": "human friendly name", "confidence": 0-1, "summary": "...", "evidence": ["short quotes"] }',
    `Allowed roles: ${ROLE_HINT}. If none apply, use "unknown".`,
    'Display names should be concise (e.g., "Primary Host", "Ad Read Voice", "Guest Expert").',
    'Use evidence snippets actually spoken by that speaker.',
    '',
    'Speakers:',
    speakerSummaries.map((summary, index) => [
      `Speaker ${index + 1} (id: ${summary.id}, duration: ${summary.duration.toFixed(1)}s, segments: ${summary.segmentCount})`,
      summary.sample
    ].join('\n')).join('\n---\n')
  ];

  if (transcriptSnippet) {
    userContent.push('\nConversation context snippet:\n', transcriptSnippet);
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: 'You are a precise analyst that strictly returns valid JSON objects describing speaker roles.'
        },
        {
          role: 'user',
          content: userContent.join('\n')
        }
      ]
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = safeParseResponse(raw);
    const classifications: Record<string, SpeakerRoleClassification> = {};

    if (Array.isArray(parsed.speakers)) {
      parsed.speakers.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const speakerId = item.speakerId || item.id;
        if (!speakerId || !speakers[speakerId]) return;

        const role = normalizeRole(item.role);
        const displayName = typeof item.displayName === 'string' && item.displayName.trim().length > 0
          ? item.displayName.trim()
          : buildFallbackDisplayName(role, speakers[speakerId]);
        const confidence = typeof item.confidence === 'number'
          ? clamp(item.confidence, 0, 1)
          : (typeof item.confidence === 'string' ? Number.parseFloat(item.confidence) : 0) || 0.4;
        const summary = typeof item.summary === 'string'
          ? item.summary.trim().slice(0, 500)
          : '';
        const evidence = Array.isArray(item.evidence)
          ? item.evidence
              .slice(0, 4)
              .map((str) => String(str).trim())
              .filter((snippet) => snippet.length > 0)
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
  if (!role || role === 'unknown') {
    return base;
  }

  const roleLabel = role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return `${roleLabel}`;
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
