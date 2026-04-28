/**
 * Perplexity API Client
 * Purpose: Generate research links with citations for podcast insights
 * Model: Sonar Pro (2x more citations, real-time web access)
 * Cost: ~$0.02 per insight (5 insights × $0.004 each)
 */

import { getPrompt, getSystemMessage, prompts } from '@/lib/prompts/loader';
import { trackPerplexityUsage } from '@/lib/billing/track-usage';
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

export interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
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
 * Generate research links for a given insight using Perplexity Sonar Pro
 */
export async function generateResearchLinks(
  insightLabel: string,
  insightContext: string,
  category: 'person' | 'concept' | 'tool',
  billing?: ResearchLinksBillingOptions
): Promise<ResearchLinksResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.warn('PERPLEXITY_API_KEY not set, skipping research link generation');
    return {
      sources: [],
      cost_usd: 0,
      tokens_used: { input: 0, output: 0 }
    };
  }

  try {
    // Get config based on category (tool uses concept prompt - looking for docs/official sites)
    const configKey = category === 'person' ? 'person' : 'concept';
    const config = prompts.audioRepurpose.researchLinks[configKey];

    // Build template variables
    const vars: ResearchLinksVars = {
      label: insightLabel,
      context: insightContext
    };

    // Get system message and prompt from config
    const systemMessage = getSystemMessage(['audioRepurpose', 'researchLinks', configKey]);
    const { prompt } = getPrompt(['audioRepurpose', 'researchLinks', configKey], vars);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: systemMessage
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        search_domain_filter: [], // Allow all domains
        return_citations: config.params.return_citations,
        return_images: false,
        search_recency_filter: config.params.recency,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return {
        sources: [],
        cost_usd: 0,
        tokens_used: { input: 0, output: 0 }
      };
    }

    const data: PerplexityResponse = await response.json();

    // Extract sources from response
    const content = data.choices[0]?.message?.content || '';
    const parsed = parseResearchFromResponse(content, data.citations, category);

    // Calculate cost
    // Sonar Pro pricing: $3.00 per 1M input tokens, $15.00 per 1M output tokens
    const inputCost = (data.usage.prompt_tokens / 1_000_000) * 3.00;
    const outputCost = (data.usage.completion_tokens / 1_000_000) * 15.00;
    const totalCost = inputCost + outputCost;

    if (billing?.userId) {
      await trackPerplexityUsage({
        userId: billing.userId,
        projectId: billing.projectId,
        reservationId: billing.reservationId,
        modelName: config.model,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        purpose: 'Insight Research Links',
        metadata: {
          insightLabel,
          category,
        },
        shouldDebit: billing.reservationId ? false : true,
      }).catch((billingError) => {
        console.error('[PERPLEXITY] Billing tracking failed:', billingError);
      });
    }

    return {
      sources: parsed.sources,
      personProfile: parsed.personProfile,
      raw_content: content,
      cost_usd: totalCost,
      tokens_used: {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens
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
 * Parse sources from Perplexity's response content
 * Handles both structured JSON and citation-based responses
 */
function parseResearchFromResponse(
  content: string,
  citations: string[] | undefined,
  category: 'person' | 'concept' | 'tool'
): { sources: PerplexitySource[]; personProfile?: PersonResearchProfile } {
  const sources: PerplexitySource[] = [];

  // Try to parse as JSON first
  try {
    const jsonMatch = content.match(category === 'person' ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (category === 'person' && parsed && !Array.isArray(parsed)) {
        const parsedSources = Array.isArray(parsed.sources)
          ? parsed.sources.map((item: any) => ({
              title: item.title || '',
              url: item.url || '',
              description: item.description,
              type: item.type
            })).filter((item: PerplexitySource) => item.url)
          : [];

        return {
          sources: parsedSources,
          personProfile: parsed.profile && typeof parsed.profile === 'object'
            ? {
                summary: typeof parsed.profile.summary === 'string' ? parsed.profile.summary : undefined,
                current_work: typeof parsed.profile.current_work === 'string' ? parsed.profile.current_work : undefined,
                notable_background: typeof parsed.profile.notable_background === 'string' ? parsed.profile.notable_background : undefined,
              }
            : undefined,
        };
      }

      if (Array.isArray(parsed)) {
        return {
          sources: parsed.map(item => ({
          title: item.title || '',
          url: item.url || '',
          description: item.description,
          type: item.type
        })).filter((item: PerplexitySource) => item.url)
        };
      }
    }
  } catch {
    // If JSON parsing fails, try to extract from citations
  }

  // Fallback: Extract from citations array
  if (citations && citations.length > 0) {
    citations.slice(0, 3).forEach((url, index) => {
      const type = categorizeUrl(url);
      sources.push({
        title: `Source ${index + 1}`,
        url: url,
        description: `Reference from ${new URL(url).hostname}`,
        type
      });
    });
  }

  return { sources };
}

/**
 * Categorize a URL by its domain
 */
function categorizeUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('wikipedia.org')) return 'wikipedia';
    if (hostname.includes('github.com') || hostname.includes('docs.')) return 'documentation';
    if (hostname.includes('arxiv.org') || hostname.includes('scholar.')) return 'academic';
    return 'article';
  } catch {
    return 'article';
  }
}

/**
 * Batch generate research links for multiple insights
 * Processes in parallel with rate limiting
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

  // Process in batches to respect rate limits
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

    // Small delay between batches to be respectful of API limits
    if (i + maxConcurrent < insights.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
