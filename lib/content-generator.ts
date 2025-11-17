/**
 * Content Generator
 * Purpose: Generate AI-powered content from podcast transcripts using Claude
 */

import Anthropic from '@anthropic-ai/sdk';
import type { OutputType, PlatformType } from './content-types';
import { getContentTypeById } from './content-types';
import { getPrompt, prompts } from '@/lib/prompts/loader';
import type { ContentGenerationVars } from '@/lib/prompts/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Get configuration from centralized config
const baseConfig = prompts.audioRepurpose.contentGeneration.baseContext;
const CLAUDE_MODEL = baseConfig.model;

export interface GenerationInput {
  transcriptionText: string;
  speakerData?: any;
  projectTitle: string;
  outputType: OutputType;
  platform: PlatformType;
  count?: number; // For multiple pieces (e.g., 4 tweets)
}

export interface GenerationResult {
  content: string;
  title?: string;
  metadata: Record<string, any>;
  wordCount: number;
  characterCount: number;
  costUSD: number;
  tokensUsed: {
    input: number;
    output: number;
  };
}

/**
 * Generate content based on type
 */
export async function generateContent(input: GenerationInput): Promise<GenerationResult> {
  const contentTypeDef = getContentTypeById(
    // Map outputType to content type ID
    input.outputType === 'twitter_thread' ? 'twitter_threads' :
    input.outputType === 'linkedin_post' ? 'linkedin_posts' :
    input.outputType === 'instagram_caption' ? 'instagram_content' :
    input.outputType === 'blog_post' ? 'blog_post' :
    input.outputType === 'email_newsletter' ? 'newsletter' :
    input.outputType === 'show_notes' ? 'show_notes' :
    input.outputType === 'quote_graphic' ? 'quote_graphics' :
    'social_post'
  );

  const count = input.count || contentTypeDef?.count || 1;
  const prompt = buildPrompt(input, count);

  console.log(`[Content Generator] Generating ${input.outputType} for project "${input.projectTitle}"`);

  const startTime = Date.now();

  const response = await anthropic.messages.create({
    model: baseConfig.model,
    max_tokens: baseConfig.max_tokens,
    temperature: baseConfig.temperature,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const generationTimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  const content = response.content[0].type === 'text' ? response.content[0].text : '';

  // Calculate cost (Sonnet 3.5 pricing: $3/1M input, $15/1M output)
  const inputCost = (response.usage.input_tokens / 1_000_000) * 3.00;
  const outputCost = (response.usage.output_tokens / 1_000_000) * 15.00;
  const totalCost = inputCost + outputCost;

  const wordCount = content.split(/\s+/).length;
  const characterCount = content.length;

  console.log(`[Content Generator] Generated ${wordCount} words in ${generationTimeSeconds}s for $${totalCost.toFixed(4)}`);

  return {
    content,
    metadata: {
      generationTimeSeconds,
      model: CLAUDE_MODEL,
      platform: input.platform
    },
    wordCount,
    characterCount,
    costUSD: totalCost,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens
    }
  };
}

/**
 * Build prompts for different content types using centralized config
 */
function buildPrompt(input: GenerationInput, count: number): string {
  const { transcriptionText, speakerData, projectTitle, outputType } = input;

  // Extract speaker names if available
  const speakerNames = speakerData?.speakers?.map((s: any) => s.name || s.label).filter(Boolean).join(', ') || 'the speakers';

  // Build template variables
  const vars: ContentGenerationVars = {
    projectTitle,
    speakerNames,
    transcriptionText,
    count
  };

  // Get base context prompt
  const { prompt: baseContext } = getPrompt(
    ['audioRepurpose', 'contentGeneration', 'baseContext'],
    vars
  );

  // Map outputType to config key
  const contentTypeKeyMap: Record<OutputType, string> = {
    'twitter_thread': 'twitterThreads',
    'linkedin_post': 'linkedInPosts',
    'instagram_caption': 'instagramCaptions',
    'blog_post': 'blogPost',
    'email_newsletter': 'emailNewsletter',
    'show_notes': 'showNotes',
    'quote_graphic': 'quoteGraphics',
    'social_post': 'twitterThreads', // default fallback
    'audiogram_clip': 'quoteGraphics' // fallback
  };

  const contentTypeKey = contentTypeKeyMap[outputType] || 'twitterThreads';

  // Get content-specific instructions
  const contentConfig = (prompts.audioRepurpose.contentGeneration as any)[contentTypeKey];
  const instructions = contentConfig?.instructions || '';

  // Substitute variables in instructions
  const finalInstructions = instructions
    .replace(/\$\{count\}/g, String(count))
    .replace(/\$\{count > 1 \? 'S' : ''\}/g, count > 1 ? 'S' : '')
    .replace(/\$\{count > 1 \? 's' : ''\}/g, count > 1 ? 's' : '');

  return `${baseContext}\n\n${finalInstructions}`;
}

/**
 * Generate multiple content pieces in batch
 */
export async function generateBatchContent(
  inputs: GenerationInput[]
): Promise<GenerationResult[]> {
  const results: GenerationResult[] = [];

  for (const input of inputs) {
    try {
      const result = await generateContent(input);
      results.push(result);

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Content Generator] Failed to generate ${input.outputType}:`, error);
      // Continue with other generations even if one fails
    }
  }

  return results;
}
