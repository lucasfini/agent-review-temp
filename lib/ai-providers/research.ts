/**
 * Research Provider
 * Purpose: Generate research links and profiles for podcast insights
 * Supports: OpenAI (GPT-4o, GPT-5.2) and Perplexity (Sonar)
 */

import { getPrompt, getSystemMessage, prompts } from '@/lib/prompts/loader';
import { trackOpenAIUsage, trackPerplexityUsage } from '@/lib/billing/track-usage';
import { getAICompletion } from './multi-provider';
import type { ResearchLinksVars } from '@/lib/prompts/types';

export interface PerplexitySource {
  title: string;
  url: string;
  description?: string;
  type?: string; // 'wikipedia' | 'documentation' | 'article' | 'academic'
}

export interface PersonResearchProfile {
  summary?: string;
  current_work?: string;
  notable_background?: string;
}

export interface ResearchLinksResult {
  sources: PerplexitySource[];
  personProfile?: PersonResearchProfile;
  raw_content?: string;
  cost_usd: number;
  tokens_used: {
    input: number;
    output: number;
  };
}

export interface ResearchLinksBillingOptions {
  userId?: string;
  projectId?: string;
  reservationId?: string;
}

/**
 * Generate research links for a given insight using the configured AI model
 */
export async function generateResearchLinks(
  insightLabel: string,
  insightContext: string,
  category: 'person' | 'concept' | 'tool',
  billing?: ResearchLinksBillingOptions
): Promise<ResearchLinksResult> {
  try {
    // Get config based on category
    const configKey = category === 'person' ? 'person' : 'concept';
    const config = prompts.audioRepurpose.researchLinks[configKey];

    // Build template variables
    const vars: ResearchLinksVars = {
      label: insightLabel,
      context: insightContext
    };

    // Get system message and prompt from config
    const systemMessage = getSystemMessage(['audioRepurpose', 'researchLinks', configKey]) || '';
    const { prompt } = getPrompt(['audioRepurpose', 'researchLinks', configKey], vars);

    // Call multi-provider completion
    const response = await getAICompletion({
      model: config.model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      responseFormat: config.response_format as { type: 'json_object' | 'text' } | undefined,
    });

    // Parse research data from response
    const parsed = parseResearchFromResponse(response.content, category);

    // Track billing based on provider
    if (billing?.userId) {
      if (response.provider === 'openai') {
        await trackOpenAIUsage({
          userId: billing.userId,
          projectId: billing.projectId,
          reservationId: billing.reservationId,
          response: {
            usage: {
              prompt_tokens: response.usage.inputTokens,
              completion_tokens: response.usage.outputTokens,
              total_tokens: response.usage.totalTokens,
            }
          },
          modelName: response.model,
          purpose: 'Insight Research Links',
          shouldDebit: billing.reservationId ? false : true,
        }).catch(err => console.error('[RESEARCH] OpenAI billing failed:', err));
      } else if (response.provider === 'perplexity') {
        await trackPerplexityUsage({
          userId: billing.userId,
          projectId: billing.projectId,
          reservationId: billing.reservationId,
          modelName: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          purpose: 'Insight Research Links',
          metadata: { insightLabel, category },
          shouldDebit: billing.reservationId ? false : true,
        }).catch(err => console.error('[RESEARCH] Perplexity billing failed:', err));
      }
    }

    // Estimate cost (legacy support for return object)
    // GPT-4o: $5/$15 per 1M, GPT-5.2: $1.75/$14 per 1M (simplified for local return)
    const isGPT5 = response.model.includes('gpt-5');
    const inputRate = isGPT5 ? 1.75 : 5.00;
    const outputRate = isGPT5 ? 14.00 : 15.00;
    const cost = (response.usage.inputTokens / 1_000_000) * inputRate + 
                 (response.usage.outputTokens / 1_000_000) * outputRate;

    return {
      sources: parsed.sources,
      personProfile: parsed.personProfile,
      raw_content: response.content,
      cost_usd: cost,
      tokens_used: {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens
      }
    };
  } catch (error) {
    console.error('Failed to generate research links:', error);
    return {
      sources: [],
      cost_usd: 0,
      tokens_used: { input: 0, output: 0 }
    };
  }
}

/**
 * Parse sources from AI response content
 */
function parseResearchFromResponse(
  content: string,
  category: 'person' | 'concept' | 'tool'
): { sources: PerplexitySource[]; personProfile?: PersonResearchProfile } {
  try {
    let jsonText = content.trim();
    
    // Remove markdown fences
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonText);
    
    // Normalize format
    if (category === 'person') {
      const sources = Array.isArray(parsed.sources)
        ? parsed.sources.map((s: any) => ({
            title: s.title || '',
            url: s.url || '',
            description: s.description,
            type: s.type
          })).filter((s: any) => s.url)
        : [];

      return {
        sources,
        personProfile: parsed.profile && typeof parsed.profile === 'object'
          ? {
              summary: parsed.profile.summary,
              current_work: parsed.profile.current_work,
              notable_background: parsed.profile.notable_background,
            }
          : undefined
      };
    } else {
      // For concepts/tools, expect { sources: [...] }
      const sources = Array.isArray(parsed.sources)
        ? parsed.sources
        : Array.isArray(parsed) ? parsed : [];
        
      return {
        sources: sources.map((s: any) => ({
          title: s.title || '',
          url: s.url || '',
          description: s.description,
          type: s.type
        })).filter((s: any) => s.url)
      };
    }
  } catch (err) {
    console.warn('[RESEARCH] Failed to parse JSON response:', err);
    return { sources: [] };
  }
}

/**
 * Batch generate research links for multiple insights
 */
export async function generateResearchLinksForInsights(
  insights: Array<{
    label: string;
    context: string;
    category: 'person' | 'concept' | 'tool';
  }>,
  maxConcurrent: number = 3,
  billing?: ResearchLinksBillingOptions
): Promise<Map<string, ResearchLinksResult>> {
  const results = new Map<string, ResearchLinksResult>();

  for (let i = 0; i < insights.length; i += maxConcurrent) {
    const batch = insights.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (insight) => {
      const result = await generateResearchLinks(
        insight.label,
        insight.context,
        insight.category,
        billing
      );
      return { label: insight.label, result };
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(({ label, result }) => {
      results.set(label, result);
    });

    if (i + maxConcurrent < insights.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
