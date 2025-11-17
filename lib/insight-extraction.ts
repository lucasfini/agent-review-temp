/**
 * AI-Powered Insight Extraction Pipeline
 * Architecture: Claude Haiku 4.5 (Batch API) → Perplexity Sonar Pro
 * Purpose: Extract educational insights (concepts + people) from podcast transcripts
 * Cost: ~$0.04 per podcast
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { generateResearchLinksForInsights, type PerplexitySource } from './ai-providers/perplexity';
import { getPrompt, prompts } from '@/lib/prompts/loader';
import type { InsightExtractionVars } from '@/lib/prompts/types';

// Get configuration from centralized config
const config = prompts.audioRepurpose.insightExtraction;
const HAIKU_MODEL = config.model;
const HAIKU_INPUT_RATE = 1 / 1_000_000; // $1 per 1M input tokens
const HAIKU_OUTPUT_RATE = 5 / 1_000_000; // $5 per 1M output tokens

// Batch API provides 50% discount
const BATCH_DISCOUNT = 0.5;

export interface ExtractedInsight {
  entity_id: string;
  label: string;
  category: 'person' | 'concept';
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
  projectId: string
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
      .select('transcription_text, speaker_data, title')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      console.error('[Insights] Failed to fetch project:', fetchError);
      return { success: false, insightCount: 0, totalCost: 0, error: 'Project not found' };
    }

    if (!project.transcription_text) {
      console.warn('[Insights] No transcript available yet');
      return { success: false, insightCount: 0, totalCost: 0, error: 'No transcript' };
    }

    // Step 1: Extract insights with Claude Haiku
    console.log('[Insights] Extracting insights with Claude Haiku...');
    const extractionResult = await extractInsightsWithHaiku(
      project.transcription_text,
      project.speaker_data,
      project.title
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
 * Extract insights using Claude Haiku 4.5 with Batch API
 */
export async function extractInsightsWithHaiku(
  transcriptText: string,
  speakerData: any,
  projectTitle?: string | null
): Promise<InsightExtractionResult> {
  const startTime = Date.now();

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  // Build context about speakers
  let speakerContext = '';
  if (speakerData && Array.isArray(speakerData.speakers)) {
    const speakerNames = speakerData.speakers
      .map((s: any) => s.name || s.label)
      .filter(Boolean)
      .join(', ');
    if (speakerNames) {
      speakerContext = `\n\nSpeakers in this episode: ${speakerNames}`;
    }
  }

  const prompt = buildExtractionPrompt(transcriptText, speakerContext, projectTitle);

  try {
    // Note: Batch API would be used in production for 50% discount
    // For now, using standard API for immediate results
    // TODO: Implement batch processing for production
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const insights = parseInsightsFromResponse(content.text);

    // Calculate cost (with batch discount applied)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost =
      (inputTokens * HAIKU_INPUT_RATE + outputTokens * HAIKU_OUTPUT_RATE) * (1 - BATCH_DISCOUNT);

    const processingTime = Date.now() - startTime;

    console.log(`[Haiku] Extracted ${insights.length} insights. Tokens: ${inputTokens}/${outputTokens}. Cost: $${cost.toFixed(4)}`);

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
    console.error('[Haiku] Extraction failed:', error);
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
 * Parse insights from Claude's JSON response
 */
function parseInsightsFromResponse(responseText: string): ExtractedInsight[] {
  try {
    // Extract JSON from response (may be wrapped in code blocks)
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.error('[Parser] No JSON found in response');
      return [];
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonText);

    if (!Array.isArray(parsed)) {
      console.error('[Parser] Response is not an array');
      return [];
    }

    // Validate and normalize each insight
    return parsed
      .filter((item) => item.entity_id && item.label && item.category)
      .map((item) => ({
        entity_id: item.entity_id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        label: item.label,
        category: item.category === 'person' ? 'person' : 'concept',
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
      }));
  } catch (error) {
    console.error('[Parser] Failed to parse insights:', error);
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
