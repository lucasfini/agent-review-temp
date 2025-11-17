import Anthropic from '@anthropic-ai/sdk';
import type {
  TopicSignal,
  CtaSignal,
  CoverageOpportunity,
  AiUsageDetail
} from '@/lib/narrative-coverage';
import { getPrompt, prompts } from '@/lib/prompts/loader';
import type { NarrativeCoverageVars } from '@/lib/prompts/types';

interface NarrativeGoal {
  id: string;
  topic_id?: string | null;
  topic_label: string;
  goal_type: string;
  target_mentions?: number | null;
  cadence_days?: number | null;
}

export interface NarrativeCoverageAnalysisResult {
  topics: TopicSignal[];
  ctas: CtaSignal[];
  opportunities: CoverageOpportunity[];
  coverageWindow: string;
  aiUsage: AiUsageDetail;
  notes?: string;
}

export interface NarrativeCoverageAnalyzerOptions {
  projectTitle?: string | null;
  summary?: string | null;
  goals?: NarrativeGoal[];
  tier?: string;
  maxTopics?: number;
  coverageWindow?: string;
}

// Get configuration from centralized config
const config = prompts.audioRepurpose.narrativeCoverage;
const MODEL_ID = config.model;
const INPUT_RATE_PER_TOKEN = 3 / 1_000_000; // $3 per million input tokens
const OUTPUT_RATE_PER_TOKEN = 15 / 1_000_000; // $15 per million output tokens

const DEFAULT_RESULT: NarrativeCoverageAnalysisResult = {
  topics: [],
  ctas: [],
  opportunities: [],
  coverageWindow: 'full_episode',
  aiUsage: {
    provider: 'anthropic',
    model: MODEL_ID,
    runType: 'narrative_coverage',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0
  },
  notes: undefined
};

const MAX_TRANSCRIPT_CHARS = 90000;

export async function analyzeNarrativeCoverage(
  transcriptionText: string,
  options: NarrativeCoverageAnalyzerOptions = {}
): Promise<NarrativeCoverageAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured; unable to run narrative coverage analysis.');
  }

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    return DEFAULT_RESULT;
  }

  const anthropic = new Anthropic({ apiKey });
  const transcriptSlice = transcriptionText.slice(0, MAX_TRANSCRIPT_CHARS);
  const summarySnippet = options.summary ? options.summary.slice(0, 4000) : '';
  const coverageWindow = options.coverageWindow || 'full_episode';
  const goalsText = formatGoals(options.goals || []);
  const maxTopics = options.maxTopics || 8;

  // Build prompt using config loader
  const vars: NarrativeCoverageVars = {
    coverageWindow,
    maxTopics,
    projectTitle: options.projectTitle || 'Untitled Project',
    tier: options.tier || 'unknown',
    goalsText: goalsText || 'None provided',
    transcriptSlice,
    summarySnippet,
    MAX_TRANSCRIPT_CHARS
  };

  const { prompt: instructions } = getPrompt(
    ['audioRepurpose', 'narrativeCoverage'],
    vars
  );

  const response = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    messages: [
      {
        role: 'user',
        content: instructions
      }
    ]
  });

  const rawText =
    response.content[0]?.type === 'text'
      ? response.content[0].text
      : '';

  const parsed = safeJsonParse(rawText);

  const normalizedTopics = normalizeTopics(parsed?.topics || []);
  const normalizedCtas = normalizeCtas(parsed?.ctas || []);
  const normalizedOpportunities = normalizeOpportunities(parsed?.opportunities || []);

  const inputTokens = response.usage.input_tokens || 0;
  const outputTokens = response.usage.output_tokens || 0;
  const aiCostUsd = Number(
    inputTokens * INPUT_RATE_PER_TOKEN + outputTokens * OUTPUT_RATE_PER_TOKEN
  );

  return {
    topics: normalizeShareOfVoice(normalizedTopics),
    ctas: normalizedCtas,
    opportunities: normalizedOpportunities,
    coverageWindow: parsed?.coverage_window || coverageWindow,
    notes: parsed?.notes || undefined,
    aiUsage: {
      provider: 'anthropic',
      model: MODEL_ID,
      runType: 'narrative_coverage',
      inputTokens,
      outputTokens,
      costUsd: Number(aiCostUsd.toFixed(6)),
      metadata: {
        promptChars: transcriptSlice.length,
        goalsIncluded: goalsText.length > 0
      }
    }
  };
}

function formatGoals(goals: NarrativeGoal[]) {
  if (!goals.length) return '';
  return goals
    .map(goal => {
      const cadence = goal.cadence_days ? `${goal.cadence_days}d cadence` : 'no cadence';
      return `[${goal.goal_type}] ${goal.topic_label} (target ${goal.target_mentions || 1} mentions, ${cadence})`;
    })
    .join('; ');
}

function safeJsonParse(raw: string | null | undefined) {
  if (!raw) return null;

  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    return null;
  }

  let jsonString = trimmed.slice(jsonStart, jsonEnd + 1);

  // Attempt to fix common JSON errors
  try {
    // First attempt: parse as-is
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('[NARRATIVE COVERAGE] Initial JSON parse failed, attempting to fix...', error);

    try {
      // Remove trailing commas before ] or }
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

      // Fix unescaped quotes in strings (basic attempt)
      // This is imperfect but catches some cases

      return JSON.parse(jsonString);
    } catch (secondError) {
      console.error('[NARRATIVE COVERAGE] Failed to parse JSON after cleanup attempt');
      console.error('[NARRATIVE COVERAGE] Raw response excerpt:', raw.slice(0, 1000));
      console.error('[NARRATIVE COVERAGE] Extracted JSON:', jsonString.slice(0, 500));
      return null;
    }
  }
}

function normalizeTopics(topics: any[]): TopicSignal[] {
  return topics
    .filter(Boolean)
    .map((topic, index) => ({
      id: String(topic.id || `topic_${index}`),
      label: String(topic.label || `Topic ${index + 1}`),
      keywords: Array.isArray(topic.keywords) ? topic.keywords.map(String) : [],
      mentionCount: Number(topic.mentionCount || 0),
      sentimentScore: typeof topic.sentimentScore === 'number' ? topic.sentimentScore : undefined,
      shareOfVoice: typeof topic.shareOfVoice === 'number' ? topic.shareOfVoice : undefined,
      relatedCtas: Array.isArray(topic.relatedCtas) ? topic.relatedCtas.map(String) : [],
      assetsCovered: Array.isArray(topic.assetsCovered) ? topic.assetsCovered.map(String) : []
    }));
}

function normalizeCtas(ctas: any[]): CtaSignal[] {
  return ctas
    .filter(Boolean)
    .map((cta, index) => ({
      id: String(cta.id || `cta_${index}`),
      label: String(cta.label || `CTA ${index + 1}`),
      mentionCount: Number(cta.mentionCount || 0),
      cadenceDays: typeof cta.cadenceDays === 'number' ? cta.cadenceDays : undefined,
      sentimentScore: typeof cta.sentimentScore === 'number' ? cta.sentimentScore : undefined
    }));
}

function normalizeOpportunities(items: any[]): CoverageOpportunity[] {
  return items
    .filter(Boolean)
    .map((item, index) => ({
      type: normalizeOpportunityType(item.type) as CoverageOpportunity['type'],
      label: String(item.label || `Opportunity ${index + 1}`),
      topicId: item.topicId ? String(item.topicId) : undefined,
      severity: normalizeSeverity(item.severity),
      summary: String(item.summary || ''),
      recommendedAction: String(item.recommendedAction || ''),
      supportingTopics: Array.isArray(item.supportingTopics)
        ? item.supportingTopics.map(String)
        : undefined
    }));
}

function normalizeOpportunityType(type: any): CoverageOpportunity['type'] {
  const validTypes: CoverageOpportunity['type'][] = [
    'underrepresented',
    'balanced',
    'overindexed',
    'debt',
    'cta-gap',
    'new'
  ];
  if (typeof type === 'string') {
    const normalized = type.toLowerCase() as CoverageOpportunity['type'];
    if (validTypes.includes(normalized)) return normalized;
  }
  return 'balanced';
}

function normalizeSeverity(value: any): CoverageOpportunity['severity'] {
  const valid = ['low', 'medium', 'high'] as const;
  if (typeof value === 'string' && valid.includes(value.toLowerCase() as any)) {
    return value.toLowerCase() as CoverageOpportunity['severity'];
  }
  return 'medium';
}

function normalizeShareOfVoice(topics: TopicSignal[]): TopicSignal[] {
  if (!topics.length) return topics;
  const hasShare = topics.some(topic => typeof topic.shareOfVoice === 'number' && topic.shareOfVoice > 0);
  if (hasShare) return topics;

  const total = topics.reduce((sum, topic) => sum + (topic.mentionCount || 0), 0) || 1;
  return topics.map(topic => ({
    ...topic,
    shareOfVoice: Number(((topic.mentionCount || 0) / total).toFixed(4))
  }));
}
