/**
 * Perplexity API Client
 * Purpose: Generate research links with citations for podcast insights
 * Model: Sonar Pro (2x more citations, real-time web access)
 * Cost: ~$0.02 per insight (5 insights × $0.004 each)
 */

import { getPrompt, getSystemMessage, prompts } from '@/lib/prompts/loader';
import type { ResearchLinksVars } from '@/lib/prompts/types';

export interface PerplexitySource {
  title: string;
  url: string;
  description?: string;
  type?: string; // 'wikipedia' | 'documentation' | 'article' | 'academic'
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
  raw_content?: string;
  cost_usd: number;
  tokens_used: {
    input: number;
    output: number;
  };
}

/**
 * Generate research links for a given insight using Perplexity Sonar Pro
 */
export async function generateResearchLinks(
  insightLabel: string,
  insightContext: string,
  category: 'person' | 'concept'
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
    // Get config based on category
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
    const sources = parseSourcesFromResponse(content, data.citations);

    // Calculate cost
    // Sonar Pro pricing: $3.00 per 1M input tokens, $15.00 per 1M output tokens
    const inputCost = (data.usage.prompt_tokens / 1_000_000) * 3.00;
    const outputCost = (data.usage.completion_tokens / 1_000_000) * 15.00;
    const totalCost = inputCost + outputCost;

    return {
      sources,
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
function parseSourcesFromResponse(
  content: string,
  citations?: string[]
): PerplexitySource[] {
  const sources: PerplexitySource[] = [];

  // Try to parse as JSON first
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          title: item.title || '',
          url: item.url || '',
          description: item.description,
          type: item.type
        })).filter(item => item.url);
      }
    }
  } catch (e) {
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

  return sources;
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
    category: 'person' | 'concept';
  }>,
  maxConcurrent: number = 3
): Promise<Map<string, ResearchLinksResult>> {
  const results = new Map<string, ResearchLinksResult>();

  // Process in batches to respect rate limits
  for (let i = 0; i < insights.length; i += maxConcurrent) {
    const batch = insights.slice(i, i + maxConcurrent);

    const batchPromises = batch.map(async (insight) => {
      const result = await generateResearchLinks(
        insight.label,
        insight.context,
        insight.category
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
