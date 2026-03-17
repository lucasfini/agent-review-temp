/**
 * Multi-Provider AI Utility
 * Supports OpenAI, Anthropic (Claude), Google (Gemini), and Perplexity
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  responseFormat?: { type: 'json_object' | 'text' };
  openaiApiKey?: string;
}

export interface AICompletionResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

/**
 * Get AI completion from any supported provider with automatic fallback for missing models
 */
export async function getAICompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const provider = getProviderFromModel(options.model);

  try {
    switch (provider) {
      case 'openai':
        return await getOpenAICompletion(options);
      case 'anthropic':
        return await getAnthropicCompletion(options);
      case 'google':
        return await getGoogleCompletion(options);
      case 'perplexity':
        return await getPerplexityCompletion(options);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error: any) {
    // Check for model not found errors to provide fallback
    const errorMessage = error.message || '';
    const isModelNotFound = 
      errorMessage.includes('model_not_found') || 
      errorMessage.includes('not_found') || 
      errorMessage.includes('does not exist');

    if (isModelNotFound && options.model.startsWith('gpt-')) {
      const fallbackModel = options.model.includes('mini') || options.model.includes('nano') 
        ? 'gpt-4o-mini' 
        : 'gpt-4o';
      
      if (options.model !== fallbackModel) {
        console.warn(`[AI] Model ${options.model} not found. Falling back to ${fallbackModel}`);
        return await getOpenAICompletion({ ...options, model: fallbackModel });
      }
    }
    
    // Fallback for futuristic Anthropic models
    if (isModelNotFound && options.model.startsWith('claude-')) {
      const fallbackModel = 'claude-3-5-sonnet-20240620';
      if (options.model !== fallbackModel) {
        console.warn(`[AI] Model ${options.model} not found. Falling back to ${fallbackModel}`);
        return await getAnthropicCompletion({ ...options, model: fallbackModel });
      }
    }

    throw error;
  }
}

/**
 * Determine provider from model ID
 */
function getProviderFromModel(modelId: string): string {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1-')) return 'openai';
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.includes('sonar')) return 'perplexity';
  return 'openai'; // default fallback
}

/**
 * OpenAI completion
 */
async function getOpenAICompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const apiKey = options.openaiApiKey || process.env.OPENAI_API_KEY_OPTIN;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_OPTIN is not configured');
  }
  const openai = new OpenAI({ apiKey });

  const isGpt5Family = options.model.startsWith('gpt-5');
  const completion = await openai.chat.completions.create({
    model: options.model,
    messages: options.messages as any,
    ...(isGpt5Family ? {} : { temperature: options.temperature ?? 0.7 }),
    max_completion_tokens: options.maxTokens ?? 4096,
    top_p: options.topP ?? 1,
    response_format: options.responseFormat,
  });

  return {
    content: completion.choices[0]?.message?.content || '',
    usage: {
      inputTokens: completion.usage?.prompt_tokens || 0,
      outputTokens: completion.usage?.completion_tokens || 0,
      totalTokens: completion.usage?.total_tokens || 0,
    },
    model: completion.model,
    provider: 'openai',
  };
}

/**
 * Anthropic (Claude) completion
 */
async function getAnthropicCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Convert messages format (Anthropic doesn't use system role in messages array)
  const systemMessage = options.messages.find(m => m.role === 'system')?.content || '';
  const messages = options.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const completion = await anthropic.messages.create({
    model: options.model,
    system: systemMessage,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    top_p: options.topP ?? 1,
  });

  const content = completion.content[0]?.type === 'text'
    ? completion.content[0].text
    : '';

  return {
    content,
    usage: {
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
      totalTokens: completion.usage.input_tokens + completion.usage.output_tokens,
    },
    model: completion.model,
    provider: 'anthropic',
  };
}

/**
 * Google (Gemini) completion
 */
async function getGoogleCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  // Convert messages to Gemini format
  const systemMessage = options.messages.find(m => m.role === 'system')?.content || '';
  const contents = options.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  // Add system message as first user message if present
  if (systemMessage) {
    contents.unshift({
      role: 'user',
      parts: [{ text: systemMessage }],
    });
  }

  const generationConfig: any = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 4096,
    topP: options.topP ?? 1,
  };

  // Enable JSON mode if requested
  if (options.responseFormat?.type === 'json_object') {
    generationConfig.responseMimeType = 'application/json';
  }

  const requestBody = {
    contents,
    generationConfig,
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${error}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    content,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
    model: options.model,
    provider: 'google',
  };
}

/**
 * Perplexity completion (OpenAI-compatible API)
 */
async function getPerplexityCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured');
  }

  const requestBody = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    top_p: options.topP ?? 1,
  };

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Perplexity API error: ${error}`);
  }

  const data = await response.json();

  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    model: data.model || options.model,
    provider: 'perplexity',
  };
}
