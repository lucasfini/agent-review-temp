/**
 * AI-Powered Insight Extraction Pipeline
 * Architecture: GPT-4o-mini (strict JSON mode) → Perplexity Sonar Pro
 * Purpose: Extract educational insights (concepts + people) from podcast transcripts
 * Cost: ~$0.02 per podcast (~40% savings vs Claude Haiku)
 */

import { createClient } from '@supabase/supabase-js';
import { getAICompletion, type AIMessage } from './ai-providers/multi-provider';
import { generateResearchLinksForInsights, type PerplexitySource, type PersonResearchProfile } from './ai-providers/perplexity';
import { getPrompt, prompts } from '@/lib/prompts/loader';
import type { InsightExtractionVars } from '@/lib/prompts/types';
import { trackOpenAIUsage, trackAnthropicUsage } from '@/lib/billing/track-usage';

// Get configuration from centralized config
const config = prompts.audioRepurpose.insightExtraction;

// GPT-4o-mini pricing (per 1M tokens)
const GPT4O_MINI_INPUT_RATE = 0.15 / 1_000_000;  // $0.15 per 1M input tokens
const GPT4O_MINI_OUTPUT_RATE = 0.60 / 1_000_000; // $0.60 per 1M output tokens

export interface ExtractedInsight {
  entity_id: string;
  label: string;
  category: 'person' | 'concept' | 'tool';
  match_text: string;
  match_variants?: string[];
  transcript_excerpts: Array<{
    text: string;
    timestamp?: number;
  }>;
  simple_definition: string;
  full_explanation: string;
  related_concepts?: string[];
  why_it_matters: string;
  relationships?: Array<{
    type: string;
    entityId: string;
    description: string;
  }>;
  confidence: number;
}

export interface InsightExtractionResult {
  insights: ExtractedInsight[];
  cost_usd: number;
  tokens_used: {
    input: number;
    output: number;
  };
  processing_time_ms: number;
}

export interface EnrichedInsight extends ExtractedInsight {
  external_sources: PerplexitySource[];
}

type SpeakerInsightCandidate = {
  speakerId: string;
  label: string;
  role: string;
  roleSummary?: string;
  confidence: number;
  segmentCount: number;
  totalDuration: number;
  transcriptExcerpt: string;
};

type PersonProfileRelationshipType =
  | 'person_summary'
  | 'current_work'
  | 'notable_background'
  | 'episode_relevance';

const NON_SUBSTANTIVE_SPEAKER_ROLES = new Set([
  'advertiser',
  'quoted_audio',
  'sponsor_voice',
  'promo_voice',
  'call_to_action',
]);

const SUBSTANTIVE_SPEAKER_ROLES = new Set([
  'host',
  'co_host',
  'guest',
  'candidate',
  'moderator',
  'interviewer',
  'panelist',
  'expert_commentator',
  'storyteller',
  'narrator',
]);

/**
 * Main orchestration function to process insights for a project
 */
export async function processInsightsForProject(
  projectId: string,
  userId?: string
): Promise<{ success: boolean; insightCount: number; totalCost: number; error?: string }> {
  const startTime = Date.now();

  try {
    console.log(`[Insights] Starting extraction for project ${projectId}`);

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch project data
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('transcription_text, speaker_data, title, user_id')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      console.error('[Insights] Failed to fetch project:', fetchError);
      return { success: false, insightCount: 0, totalCost: 0, error: 'Project not found' };
    }

    const effectiveUserId = userId || project.user_id;
    if (!effectiveUserId) {
        console.warn('[Insights] No user ID found for billing');
    }

    if (!project.transcription_text) {
      console.warn('[Insights] No transcript available yet');
      return { success: false, insightCount: 0, totalCost: 0, error: 'No transcript' };
    }

    // Step 1: Extract insights with GPT-4o-mini (strict JSON mode)
    console.log('[Insights] Extracting insights with GPT-4o-mini...');
    const extractionResult = await extractInsightsWithHaiku(
      project.transcription_text,
      project.speaker_data,
      project.title,
      effectiveUserId,
      projectId
    );

    const mergedInsights = mergeSpeakerPeopleInsights(
      extractionResult.insights,
      project.speaker_data,
      project.title
    );

    if (mergedInsights.length === 0) {
      console.warn('[Insights] No insights extracted');
      return { success: true, insightCount: 0, totalCost: extractionResult.cost_usd };
    }

    console.log(`[Insights] Extracted ${mergedInsights.length} insights`);

    // Step 2: Enrich top insights with research links from Perplexity
    console.log('[Insights] Enriching top insights with research links...');
    const enrichedInsights = await enrichTopInsightsWithResearch(
      mergedInsights,
      5 // Top 5 insights get research links
    );

    // Calculate total cost
    const perplexityCost = enrichedInsights.reduce(
      (sum, insight) => sum + (insight.external_sources.length > 0 ? 0.004 : 0), // ~$0.004 per insight
      0
    );
    const totalCost = extractionResult.cost_usd + perplexityCost;

    // Step 3: Save insights to database
    console.log('[Insights] Saving to database...');
    const saveResult = await saveInsightsToDatabase(
      projectId,
      enrichedInsights,
      totalCost
    );

    if (!saveResult.success) {
      console.error('[Insights] Failed to save to database:', saveResult.error);
      return {
        success: false,
        insightCount: enrichedInsights.length,
        totalCost,
        error: saveResult.error
      };
    }

    const processingTime = Date.now() - startTime;
    console.log(
      `[Insights] Complete! ${enrichedInsights.length} insights saved in ${processingTime}ms. Cost: $${totalCost.toFixed(4)}`
    );

    return {
      success: true,
      insightCount: enrichedInsights.length,
      totalCost
    };
  } catch (error) {
    console.error('[Insights] Fatal error:', error);
    return {
      success: false,
      insightCount: 0,
      totalCost: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Extract insights using GPT-4o-mini with strict JSON mode
 */
export async function extractInsightsWithHaiku(
  transcriptText: string,
  speakerData: any,
  projectTitle?: string | null,
  userId?: string,
  projectId?: string
): Promise<InsightExtractionResult> {
  const startTime = Date.now();

  // Build context about speakers
  let speakerContext = '';
  if (speakerData && Array.isArray(speakerData.speakers)) {
    const speakerNames = speakerData.speakers
      .map((s: any) => s.name || s.label)
      .filter(Boolean)
      .join(', ');
    if (speakerNames) {
      speakerContext = `Speakers in this episode: ${speakerNames}`;
    }
  }

  const userPrompt = buildExtractionPrompt(transcriptText, speakerContext, projectTitle);

  // Build messages array for multi-provider
  const messages: AIMessage[] = [];

  // Add system message if defined in config
  if (config.system) {
    messages.push({ role: 'system', content: config.system });
  }

  messages.push({ role: 'user', content: userPrompt });

  try {
    // Use multi-provider with strict JSON mode for GPT-4o-mini
    const response = await getAICompletion({
      model: config.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      // Enable strict JSON mode if config specifies it
      responseFormat: config.response_format as { type: 'json_object' | 'text' } | undefined,
    });

    // Track usage if user ID is present
    if (userId) {
      if (response.provider === 'openai') {
        await trackOpenAIUsage({
          userId,
          projectId,
          response: {
            usage: {
              prompt_tokens: response.usage.inputTokens,
              completion_tokens: response.usage.outputTokens,
              total_tokens: response.usage.totalTokens
            }
          },
          modelName: config.model,
          purpose: 'Insight Extraction',
          shouldDebit: true
        });
      } else if (response.provider === 'anthropic') {
        // Map model name to 'sonnet-4.5' or 'haiku-4.5' if possible, or fallback
        const modelName = config.model.includes('sonnet') ? 'sonnet-4.5' : 'haiku-4.5';
        await trackAnthropicUsage({
          userId,
          projectId,
          response: {
            usage: {
              input_tokens: response.usage.inputTokens,
              output_tokens: response.usage.outputTokens
            }
          },
          modelName,
          purpose: 'Insight Extraction',
          shouldDebit: true
        });
      }
    }

    const insights = parseInsightsFromResponse(response.content);

    // Calculate cost using GPT-4o-mini rates
    const inputTokens = response.usage.inputTokens;
    const outputTokens = response.usage.outputTokens;
    const cost = inputTokens * GPT4O_MINI_INPUT_RATE + outputTokens * GPT4O_MINI_OUTPUT_RATE;

    const processingTime = Date.now() - startTime;

    console.log(`[GPT-4o-mini] Extracted ${insights.length} insights. Tokens: ${inputTokens}/${outputTokens}. Cost: $${cost.toFixed(4)}`);

    return {
      insights,
      cost_usd: cost,
      tokens_used: {
        input: inputTokens,
        output: outputTokens,
      },
      processing_time_ms: processingTime,
    };
  } catch (error) {
    console.error('[GPT-4o-mini] Extraction failed:', error);
    return {
      insights: [],
      cost_usd: 0,
      tokens_used: { input: 0, output: 0 },
      processing_time_ms: Date.now() - startTime,
    };
  }
}

/**
 * Build the extraction prompt for Claude Haiku using centralized config
 */
function buildExtractionPrompt(
  transcript: string,
  speakerContext: string,
  projectTitle?: string | null
): string {
  const vars: InsightExtractionVars = {
    titleContext: projectTitle ? `Podcast: "${projectTitle}"` : '',
    speakerContext,
    transcript
  };

  const { prompt } = getPrompt(['audioRepurpose', 'insightExtraction'], vars);
  return prompt;
}

/**
 * Parse insights from GPT-4o-mini strict JSON response
 * Expects format: { "insights": [...] } or legacy array format
 */
function parseInsightsFromResponse(responseText: string): ExtractedInsight[] {
  try {
    // With strict JSON mode, response should be clean JSON
    // But handle legacy formats and edge cases gracefully
    let jsonText = responseText.trim();

    // Guard: empty string means the model hit its token cap before producing any output
    if (!jsonText || jsonText === '{}') {
      console.warn('[Parser] Empty or stub response — model likely hit token cap. Returning 0 insights.');
      return [];
    }

    // Remove markdown code fences if present
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);

    // Handle both { insights: [...] } wrapper and legacy array format
    let insightsArray: any[];
    if (Array.isArray(parsed)) {
      insightsArray = parsed;
    } else if (parsed && Array.isArray(parsed.insights)) {
      insightsArray = parsed.insights;
    } else {
      console.error('[Parser] Unexpected JSON structure:', Object.keys(parsed || {}));
      return [];
    }

    // Validate and normalize each insight
    return insightsArray
      .filter((item) => item.entity_id && item.label && item.category)
      .map((item) => {
        // Normalize category to one of: person, concept, tool
        let category: 'person' | 'concept' | 'tool' = 'concept';
        const rawCategory = (item.category || '').toLowerCase();
        if (rawCategory === 'person') {
          category = 'person';
        } else if (rawCategory === 'tool' || rawCategory === 'product' || rawCategory === 'software' || rawCategory === 'org' || rawCategory === 'organization') {
          category = 'tool';
        }

        return {
          entity_id: item.entity_id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          label: item.label,
          category,
          match_text: item.match_text || item.label,
          match_variants: Array.isArray(item.match_variants) ? item.match_variants : [],
          transcript_excerpts: Array.isArray(item.transcript_excerpts)
            ? item.transcript_excerpts
            : [],
          simple_definition: item.simple_definition || '',
          full_explanation: item.full_explanation || item.simple_definition || '',
          related_concepts: Array.isArray(item.related_concepts) ? item.related_concepts : [],
          why_it_matters: item.why_it_matters || '',
          relationships: Array.isArray(item.relationships) ? item.relationships : [],
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
        };
      });
  } catch (error) {
    console.error('[Parser] Failed to parse insights:', error);
    console.error('[Parser] Raw response:', responseText.slice(0, 500));
    return [];
  }
}

function slugifyEntityId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'person';
}

function normalizeInsightLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isPlaceholderSpeakerName(name: string): boolean {
  return (
    !name ||
    /^speaker(?:\s+|_)\d+$/i.test(name) ||
    /^unknown$/i.test(name) ||
    /^advertiser$/i.test(name)
  );
}

function humanizeSpeakerRole(role: string): string {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function trimInsightExcerpt(text: string, maxLength: number = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildSpeakerInsightSummary(
  candidate: SpeakerInsightCandidate,
  projectTitle?: string | null
): Pick<ExtractedInsight, 'simple_definition' | 'full_explanation' | 'why_it_matters'> {
  const roleLabel = humanizeSpeakerRole(candidate.role || 'speaker').toLowerCase();
  const topicLabel = projectTitle?.trim() ? `"${projectTitle.trim()}"` : 'this episode';
  const rolePreamble = candidate.roleSummary?.trim()
    ? candidate.roleSummary.trim()
    : `${candidate.label} is a ${roleLabel} in ${topicLabel}.`;

  return {
    simple_definition: `${candidate.label} is a ${roleLabel} featured in this conversation.`,
    full_explanation: `${rolePreamble} Their remarks help frame the discussion in ${topicLabel} and clarify how their perspective fits into the broader topic.`,
    why_it_matters: `${candidate.label} is one of the core voices shaping the conversation in ${topicLabel}, so understanding who they are makes the episode easier to follow.`,
  };
}

function enrichPersonInsightProfile(
  insight: ExtractedInsight,
  personProfile?: PersonResearchProfile
): ExtractedInsight {
  if (insight.category !== 'person' || !personProfile) {
    return insight;
  }

  const summary = personProfile.summary?.trim();
  const currentWork = personProfile.current_work?.trim();
  const notableBackground = personProfile.notable_background?.trim();

  const fullExplanation = [
    insight.full_explanation?.trim(),
    currentWork,
    notableBackground,
  ].filter(Boolean).join(' ');

  return {
    ...insight,
    simple_definition: summary || insight.simple_definition,
    full_explanation: fullExplanation || insight.full_explanation,
    relationships: mergeProfileRelationships(
      insight.relationships,
      buildPersonProfileRelationships({
        label: insight.label,
        summary: summary || insight.simple_definition,
        currentWork,
        notableBackground,
        episodeRelevance: insight.why_it_matters,
      })
    ),
  };
}

function buildPersonProfileRelationships(params: {
  label: string;
  summary?: string;
  currentWork?: string;
  notableBackground?: string;
  episodeRelevance?: string;
}): Array<{ type: PersonProfileRelationshipType; entityId: string; description: string }> {
  const entityId = `person-${slugifyEntityId(params.label)}`;
  const entries: Array<{ type: PersonProfileRelationshipType; entityId: string; description: string }> = [];

  if (params.summary?.trim()) {
    entries.push({ type: 'person_summary', entityId, description: params.summary.trim() });
  }
  if (params.currentWork?.trim()) {
    entries.push({ type: 'current_work', entityId, description: params.currentWork.trim() });
  }
  if (params.notableBackground?.trim()) {
    entries.push({ type: 'notable_background', entityId, description: params.notableBackground.trim() });
  }
  if (params.episodeRelevance?.trim()) {
    entries.push({ type: 'episode_relevance', entityId, description: params.episodeRelevance.trim() });
  }

  return entries;
}

function mergeProfileRelationships(
  existing: Array<{ type: string; entityId: string; description: string }> | undefined,
  incoming: Array<{ type: PersonProfileRelationshipType; entityId: string; description: string }>
) {
  const merged = new Map<string, { type: string; entityId: string; description: string }>();

  for (const item of existing || []) {
    if (item?.type && item?.description) {
      merged.set(item.type, item);
    }
  }

  for (const item of incoming) {
    merged.set(item.type, item);
  }

  return Array.from(merged.values());
}

export function buildSpeakerPeopleInsights(
  speakerData: any,
  projectTitle?: string | null
): ExtractedInsight[] {
  const speakers = speakerData?.speakers;
  if (!speakers || typeof speakers !== 'object') {
    return [];
  }

  return Object.entries(speakers)
    .map(([speakerId, rawSpeaker]): SpeakerInsightCandidate | null => {
      const speaker = rawSpeaker as any;
      const label = (
        speaker.customName ||
        speaker.finalName ||
        speaker.extractedName?.name ||
        speaker.fallbackName ||
        speaker.name ||
        ''
      ).trim();

      if (!label || isPlaceholderSpeakerName(label)) {
        return null;
      }

      const role = String(speaker.role || 'unknown').toLowerCase();
      if (NON_SUBSTANTIVE_SPEAKER_ROLES.has(role)) {
        return null;
      }

      const segmentCount = Number(speaker.segmentCount || 0);
      const totalDuration = Number(speaker.totalDuration || 0);
      const isSubstantive = SUBSTANTIVE_SPEAKER_ROLES.has(role) || segmentCount >= 2 || totalDuration >= 30;
      if (!isSubstantive) {
        return null;
      }

      const excerptSegment = Array.isArray(speaker.segments)
        ? [...speaker.segments]
            .filter(segment => typeof segment?.text === 'string' && segment.text.trim().length > 0)
            .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime))[0]
        : null;

      return {
        speakerId,
        label,
        role,
        roleSummary: speaker.roleSummary || speaker.summary,
        confidence: Math.min(0.99, Math.max(0.6, Number(speaker.roleConfidence || speaker.confidence || 0.78))),
        segmentCount,
        totalDuration,
        transcriptExcerpt: trimInsightExcerpt(excerptSegment?.text || ''),
      };
    })
    .filter((candidate): candidate is SpeakerInsightCandidate => candidate !== null)
    .map((candidate) => {
      const summary = buildSpeakerInsightSummary(candidate, projectTitle);

      return {
        entity_id: `person-${slugifyEntityId(candidate.label)}`,
        label: candidate.label,
        category: 'person' as const,
        match_text: candidate.label,
        match_variants: [candidate.label.split(' ')[0]].filter(Boolean),
        transcript_excerpts: candidate.transcriptExcerpt
          ? [{ text: candidate.transcriptExcerpt }]
          : [],
        simple_definition: summary.simple_definition,
        full_explanation: summary.full_explanation,
        related_concepts: [],
        why_it_matters: summary.why_it_matters,
        relationships: buildPersonProfileRelationships({
          label: candidate.label,
          summary: summary.simple_definition,
          currentWork: candidate.roleSummary || `${candidate.label} is featured as a ${humanizeSpeakerRole(candidate.role || 'speaker').toLowerCase()} in this conversation.`,
          notableBackground: candidate.segmentCount > 0
            ? `${candidate.label} speaks across ${candidate.segmentCount} segment${candidate.segmentCount === 1 ? '' : 's'} in this episode, making them one of the main voices to track.`
            : undefined,
          episodeRelevance: summary.why_it_matters,
        }),
        confidence: candidate.confidence,
      };
    });
}

export function mergeSpeakerPeopleInsights(
  insights: ExtractedInsight[],
  speakerData: any,
  projectTitle?: string | null
): ExtractedInsight[] {
  const merged = new Map<string, ExtractedInsight>();

  for (const insight of insights) {
    merged.set(normalizeInsightLabel(insight.label), insight);
  }

  for (const speakerInsight of buildSpeakerPeopleInsights(speakerData, projectTitle)) {
    const key = normalizeInsightLabel(speakerInsight.label);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, speakerInsight);
      continue;
    }

    if (existing.category !== 'person') {
      continue;
    }

    merged.set(key, {
      ...existing,
      entity_id: existing.entity_id || speakerInsight.entity_id,
      transcript_excerpts: existing.transcript_excerpts?.length
        ? existing.transcript_excerpts
        : speakerInsight.transcript_excerpts,
      simple_definition: existing.simple_definition || speakerInsight.simple_definition,
      full_explanation: existing.full_explanation || speakerInsight.full_explanation,
      why_it_matters: existing.why_it_matters || speakerInsight.why_it_matters,
      match_variants: Array.from(new Set([...(existing.match_variants || []), ...(speakerInsight.match_variants || [])])),
      relationships: mergeProfileRelationships(existing.relationships, (speakerInsight.relationships || []) as Array<any>),
      confidence: Math.max(existing.confidence || 0, speakerInsight.confidence || 0),
    });
  }

  return Array.from(merged.values());
}

export function rankPersonSources(sources: PerplexitySource[]): PerplexitySource[] {
  return [...sources].sort((left, right) => {
    const leftWikipedia = left.type === 'wikipedia' || left.url?.includes('wikipedia.org');
    const rightWikipedia = right.type === 'wikipedia' || right.url?.includes('wikipedia.org');

    if (leftWikipedia !== rightWikipedia) {
      return leftWikipedia ? -1 : 1;
    }

    return 0;
  });
}

/**
 * Enrich top N insights with research links from Perplexity
 */
export async function enrichTopInsightsWithResearch(
  insights: ExtractedInsight[],
  maxCount: number = 5
): Promise<EnrichedInsight[]> {
  // Sort by confidence and frequency (number of excerpts)
  const scored = insights.map((insight) => ({
    insight,
    score: insight.confidence * (1 + insight.transcript_excerpts.length * 0.2),
  }));

  scored.sort((a, b) => b.score - a.score);
  const prioritizedPeople = scored
    .filter(item => item.insight.category === 'person')
    .map(item => item.insight);
  const otherTopInsights = scored
    .filter(item => item.insight.category !== 'person')
    .slice(0, Math.max(0, maxCount - prioritizedPeople.length))
    .map(item => item.insight);
  const topInsights = Array.from(new Map(
    [...prioritizedPeople, ...otherTopInsights].map(insight => [insight.entity_id, insight])
  ).values());
  const enrichedIds = new Set(topInsights.map(insight => insight.entity_id));
  const remainingInsights = scored
    .map((item) => item.insight)
    .filter(insight => !enrichedIds.has(insight.entity_id));

  console.log(`[Enrichment] Enriching top ${topInsights.length} insights with research links`);

  // Prepare data for Perplexity
  const researchRequests = topInsights.map((insight) => ({
    label: insight.label,
    context: insight.transcript_excerpts[0]?.text || insight.full_explanation,
    category: insight.category,
  }));

  // Get research links from Perplexity
  const researchResults = await generateResearchLinksForInsights(researchRequests);

  // Merge results
  const enriched: EnrichedInsight[] = topInsights.map((insight) => {
    const research = researchResults.get(insight.label);
    const enrichedInsight = enrichPersonInsightProfile(insight, research?.personProfile);
    return {
      ...enrichedInsight,
      external_sources: insight.category === 'person'
        ? rankPersonSources(research?.sources || [])
        : research?.sources || [],
    };
  });

  // Add remaining insights without research links
  const remainingEnriched: EnrichedInsight[] = remainingInsights.map((insight) => ({
    ...insight,
    external_sources: [],
  }));

  return [...enriched, ...remainingEnriched];
}

/**
 * Save insights to Supabase database
 */
async function saveInsightsToDatabase(
  projectId: string,
  insights: EnrichedInsight[],
  totalCost: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Prepare insight records
    const insightRecords = insights.map((insight) => ({
      project_id: projectId,
      entity_id: insight.entity_id,
      label: insight.label,
      category: insight.category,
      match_text: insight.match_text,
      match_variants: insight.match_variants,
      transcript_excerpts: insight.transcript_excerpts,
      simple_definition: insight.simple_definition,
      full_explanation: insight.full_explanation,
      related_concepts: insight.related_concepts,
      why_it_matters: insight.why_it_matters,
      relationships: insight.relationships,
      external_sources: insight.external_sources,
      confidence: insight.confidence,
      status: 'auto_detected',
      cost_usd: totalCost / insights.length, // Distribute cost evenly
    }));

    // Delete existing insights for this project (for refresh functionality)
    await supabase.from('insights').delete().eq('project_id', projectId);

    // Insert new insights
    const { error: insertError } = await supabase
      .from('insights')
      .insert(insightRecords);

    if (insertError) {
      console.error('[DB] Failed to insert insights:', insertError);
      return { success: false, error: insertError.message };
    }

    // Update project metadata
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        insights_processed_at: new Date().toISOString(),
        insights_cost_usd: totalCost,
      })
      .eq('id', projectId);

    if (updateError) {
      console.warn('[DB] Failed to update project metadata:', updateError);
      // Don't fail the whole operation
    }

    return { success: true };
  } catch (error) {
    console.error('[DB] Save failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database error',
    };
  }
}
