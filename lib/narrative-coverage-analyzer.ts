import OpenAI from 'openai';
import type {
  TopicSignal,
  CtaSignal,
  CoverageOpportunity,
  AiUsageDetail
} from '@/lib/narrative-coverage';
import { getPrompt, prompts } from '@/lib/prompts/loader';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import type { NarrativeCoverageVars } from '@/lib/prompts/types';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

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
  projectFormat?: string | null;
  maxTopics?: number;
  coverageWindow?: string;
  userId?: string;
  projectId?: string;
  reservationId?: string;
}

// Get configuration from centralized config
const config = prompts.audioRepurpose.narrativeCoverage;
const MODEL_ID = config.model;
// GPT-4o pricing: $2.50 per 1M input, $10 per 1M output
const INPUT_RATE_PER_TOKEN = 2.5 / 1_000_000;
const OUTPUT_RATE_PER_TOKEN = 10 / 1_000_000;

const STRICT_JSON_INSTRUCTION = `You are a JSON generator. Respond with ONLY one JSON object, no prose, no markdown fences. Shape:
{
  "coverage_window": "full_episode",
  "topics": [{"id": "string", "label": "string", "keywords": ["string"], "mentionCount": 0, "shareOfVoice": 0.0, "relatedCtas": ["string"], "assetsCovered": ["string"]}],
  "ctas": [{"id": "string", "label": "string", "mentionCount": 0, "cadenceDays": 7}],
  "opportunities": [{"type": "strength|hook|clarity|structure|pacing|depth|follow_up|audience_fit|cta|speaker_balance", "label": "string", "severity": "low|medium|high", "summary": "string", "recommendedAction": "string", "appliesTo": "this_episode|next_episode|both", "evidenceQuote": "optional string"}],
  "notes": "optional string"
}`;

const DEFAULT_RESULT: NarrativeCoverageAnalysisResult = {
  topics: [],
  ctas: [],
  opportunities: [],
  coverageWindow: 'full_episode',
  aiUsage: {
    provider: 'openai',
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
  const apiKey = await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured; unable to run narrative coverage analysis.');
  }

  if (!transcriptionText || transcriptionText.trim().length === 0) {
    return DEFAULT_RESULT;
  }

  const openai = new OpenAI({ apiKey, timeout: 180000, maxRetries: 1 });
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
    projectFormat: options.projectFormat || 'OTHER',
    goalsText: goalsText || 'None provided',
    transcriptSlice,
    summarySection: summarySnippet ? `\n\nExisting summary:\n${summarySnippet}\n` : '',
    MAX_TRANSCRIPT_CHARS
  };

  const { prompt: instructions } = getPrompt(
    ['audioRepurpose', 'narrativeCoverage'],
    vars
  );
  const strictPrompt = `${STRICT_JSON_INSTRUCTION}\n\n${instructions}`;

  const response = await openai.chat.completions.create({
    model: config.model,
    max_completion_tokens: config.max_tokens,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: STRICT_JSON_INSTRUCTION
      },
      {
        role: 'user',
        content: instructions
      }
    ]
  });

  // Track usage and bill user
  if (options.userId) {
    await trackOpenAIUsage({
      userId: options.userId,
      projectId: options.projectId,
      reservationId: options.reservationId,
      response,
      modelName: config.model,
      purpose: 'Narrative Coverage Analysis',
      shouldDebit: options.reservationId ? false : true
    });
  }

  const rawText = response.choices?.[0]?.message?.content || '';

  const parsed = safeJsonParse(rawText);

  const normalizedTopics = normalizeTopics(parsed?.topics || []);
  const normalizedCtas = normalizeCtas(parsed?.ctas || []);
  const normalizedOpportunities = normalizeOpportunities(parsed?.opportunities || []);

  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const aiCostUsd = Number(
    inputTokens * INPUT_RATE_PER_TOKEN + outputTokens * OUTPUT_RATE_PER_TOKEN
  );

  // Fallback: if AI returned nothing, derive simple topics from transcript
  const hasAiTopics = normalizedTopics.length > 0 || normalizedCtas.length > 0;
  const fallbackTopics = hasAiTopics ? [] : deriveHeuristicTopics(transcriptSlice, 6);
  const fallbackCtas = hasAiTopics ? [] : deriveHeuristicCtas(transcriptSlice);

  return {
    topics: normalizeShareOfVoice(hasAiTopics ? normalizedTopics : fallbackTopics),
    ctas: hasAiTopics ? normalizedCtas : fallbackCtas,
    opportunities: normalizedOpportunities,
    coverageWindow: parsed?.coverage_window || coverageWindow,
    notes: hasAiTopics ? parsed?.notes || undefined : 'Heuristic topics/ctas generated due to empty AI response.',
    aiUsage: {
      provider: 'openai',
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
  // Extract fenced block if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  let jsonStart = candidate.indexOf('{');
  let jsonEnd = candidate.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    return null;
  }

  let jsonString = candidate.slice(jsonStart, jsonEnd + 1);

  // Attempt to fix common JSON errors
  try {
    // First attempt: parse as-is
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('[NARRATIVE COVERAGE] Initial JSON parse failed, attempting to fix...', error);

    try {
      // Remove trailing commas before ] or }
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

      // Fix missing commas between array elements (common AI mistake)
      // This catches cases like: ]{ or ]} or }{ patterns
      jsonString = jsonString.replace(/\]\s*\{/g, '],{');
      jsonString = jsonString.replace(/\}\s*\{/g, '},{');
      jsonString = jsonString.replace(/\}\s*\[/g, '},[');
      jsonString = jsonString.replace(/\]\s*\[/g, '],[');

      // Fix unescaped quotes in strings (basic attempt)
      // This is imperfect but catches some cases
      return JSON.parse(jsonString);
    } catch (secondError) {
      try {
        const balanced = balanceJson(jsonString);
        return JSON.parse(balanced);
      } catch (thirdError) {
        console.error('[NARRATIVE COVERAGE] Failed to parse JSON after cleanup attempt');
        console.error('[NARRATIVE COVERAGE] Raw response excerpt:', raw.slice(0, 1000));
        console.error('[NARRATIVE COVERAGE] Extracted JSON excerpt:', jsonString.slice(0, 1000));
        console.error('[NARRATIVE COVERAGE] JSON error at position:', String(thirdError).match(/position (\d+)/)?.[1] || 'unknown');
        return null;
      }
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
      appliesTo: normalizeApplicability(item.appliesTo),
      evidenceQuote: typeof item.evidenceQuote === 'string' ? item.evidenceQuote : undefined,
      supportingTopics: Array.isArray(item.supportingTopics)
        ? item.supportingTopics.map(String)
        : undefined
    }));
}

function normalizeOpportunityType(type: any): CoverageOpportunity['type'] {
  const validTypes: CoverageOpportunity['type'][] = [
    'strength',
    'hook',
    'clarity',
    'structure',
    'pacing',
    'depth',
    'follow_up',
    'audience_fit',
    'cta',
    'speaker_balance',
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

function normalizeApplicability(value: any): CoverageOpportunity['appliesTo'] | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'this_episode' || normalized === 'next_episode' || normalized === 'both') {
    return normalized;
  }
  return undefined;
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

function deriveHeuristicCtas(transcript: string): CtaSignal[] {
  if (!transcript) return [];
  const patterns = [
    { id: 'newsletter', label: 'Newsletter CTA', match: /\bnewsletter|\bsubscribe|\bmailing list/gi },
    { id: 'sponsor', label: 'Sponsor Mention', match: /\bsponsor|\bbrought to you by|\bpresentation of/gi },
    { id: 'signup', label: 'Signup CTA', match: /\bsign ?up|\bjoin now|\bget started/gi },
    { id: 'offer', label: 'Offer/Promo', match: /\boffer|\bpromo|\bdiscount|\bcoupon/gi }
  ];

  const results: CtaSignal[] = [];
  patterns.forEach(pat => {
    const matches = transcript.match(pat.match);
    if (matches && matches.length > 0) {
      results.push({
        id: pat.id,
        label: pat.label,
        mentionCount: matches.length,
        cadenceDays: undefined,
        sentimentScore: undefined
      });
    }
  });

  return results;
}

function balanceJson(input: string) {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }

  let suffix = '';
  while (stack.length) {
    const opener = stack.pop();
    suffix += opener === '{' ? '}' : ']';
  }
  return input + suffix;
}

function extractNGrams(text: string, n: number, stopwords: Set<string>): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => w.length >= 3 && !stopwords.has(w));

  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n);
    if (gram.length === n) {
      ngrams.push(gram.join(' '));
    }
  }
  return ngrams;
}

function deriveHeuristicTopics(transcript: string, maxTopics: number): TopicSignal[] {
  if (!transcript) return [];

  const stopwords = new Set([
    // Existing basic words
    'the','a','an','and','or','but','to','of','in','on','for','with','at','by','from','as','is','it','that','this','these','those','be','are','was','were','can','could','should','would','have','has','had','do','does','did','not','no','yes','you','i','we','they','he','she','them','him','her','our','your','their','my','me','us',

    // NEW: Filler words causing issues
    'think','like','about','what','just','know','want','need','get','make','take','go','come','see','look',
    'going','something','things','thing','stuff','way','time','day','year','people','person',
    'really','very','much','many','some','more','most','all','every','each','other','another',
    'said','say','saying','says','tell','told','telling','asks','asked','asking',

    // NEW: Podcast-specific fillers
    'yeah','well','okay','ok','um','uh','ah','oh','hmm',
    'episode','podcast','show','today','right','actually','basically','literally',
    'kind','sort','little','bit','probably','maybe','perhaps',

    // NEW: Question words
    'who','where','when','why','how','which','whose','whom'
  ]);

  // Extract bi-grams (2-word) and tri-grams (3-word) phrases
  const bigrams = extractNGrams(transcript, 2, stopwords);
  const trigrams = extractNGrams(transcript, 3, stopwords);

  // Count frequencies
  const bigramFreq = new Map<string, number>();
  bigrams.forEach(gram => bigramFreq.set(gram, (bigramFreq.get(gram) || 0) + 1));

  const trigramFreq = new Map<string, number>();
  trigrams.forEach(gram => trigramFreq.set(gram, (trigramFreq.get(gram) || 0) + 1));

  // Combine (prefer tri-grams for more context)
  const allPhrases: Array<[string, number]> = [
    ...Array.from(trigramFreq.entries()),
    ...Array.from(bigramFreq.entries())
  ];

  // Filter phrases appearing 2+ times (reduce noise)
  const filtered = allPhrases.filter(([phrase, count]) => count >= 2);

  // If we have enough multi-word phrases, use them
  if (filtered.length >= maxTopics) {
    const sorted = filtered
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTopics);

    const total = sorted.reduce((sum, [, count]) => sum + count, 0) || 1;

    return sorted.map(([phrase, count], idx) => ({
      id: `heuristic_${idx}`,
      label: phrase,
      keywords: phrase.split(' '),
      mentionCount: count,
      shareOfVoice: Number((count / total).toFixed(4)),
      relatedCtas: [],
      assetsCovered: []
    }));
  }

  // Fallback: improved single-word extraction
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w =>
      w.length >= 5 &&           // Increase from >3 to >=5
      !stopwords.has(w) &&
      !/^\d+$/.test(w) &&         // No purely numeric
      /[a-z]{3,}/.test(w)         // Must have 3+ consecutive letters
    );

  const freq = new Map<string, number>();
  words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));

  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics);

  const total = sorted.reduce((sum, [, count]) => sum + count, 0) || 1;

  return sorted.map(([word, count], idx) => ({
    id: `heuristic_${idx}`,
    label: word,
    keywords: [word],
    mentionCount: count,
    shareOfVoice: Number((count / total).toFixed(4)),
    relatedCtas: [],
    assetsCovered: []
  }));
}
