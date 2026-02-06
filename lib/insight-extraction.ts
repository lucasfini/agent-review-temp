/**
 * AI-Powered Insight Extraction Pipeline
 * Architecture: GPT-4o-mini (strict JSON mode) → Perplexity Sonar Pro
 * Purpose: Extract educational insights (concepts + people) from podcast transcripts
 * Cost: ~$0.02 per podcast (~40% savings vs Claude Haiku)
 */

import { createClient } from '@supabase/supabase-js';
import { getAICompletion, type AIMessage } from './ai-providers/multi-provider';
import { generateResearchLinksForInsights, type PerplexitySource } from './ai-providers/perplexity';
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

    if (extractionResult.insights.length === 0) {
      console.warn('[Insights] No insights extracted');
      return { success: true, insightCount: 0, totalCost: extractionResult.cost_usd };
    }

    console.log(`[Insights] Extracted ${extractionResult.insights.length} insights`);

    // Step 2: Enrich top insights with research links from Perplexity
    console.log('[Insights] Enriching top insights with research links...');
    const enrichedInsights = await enrichTopInsightsWithResearch(
      extractionResult.insights,
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

  const topInsights = scored.slice(0, maxCount).map((item) => item.insight);
  const remainingInsights = scored.slice(maxCount).map((item) => item.insight);

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
    return {
      ...insight,
      external_sources: research?.sources || [],
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
