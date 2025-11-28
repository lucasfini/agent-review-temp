import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';
import type { ContentBlock, OutputType } from '@/lib/content-types';
import { getThemeById } from '@/lib/content-themes';
import { enforceContentLimit, PLATFORM_PSYCHOLOGY } from '@/lib/content-psychology';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Parse JSON response from OpenAI, stripping markdown code fences if present
 */
function parseAIResponse(content: string): any {
  let cleaned = content.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return JSON.parse(cleaned);
}

interface ContentAnalysis {
  keyTopics: string[];
  quotes: Array<{ text: string; timestamp?: number; speaker?: string }>;
  facts: Array<{ text: string; context: string }>;
  opinions: Array<{ text: string; controversy_level: number }>;
  humor: Array<{ text: string; type: string }>;
  hooks: Array<{ text: string; hook_strength: number }>;
  actionable_insights: Array<{ text: string; value: number }>;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  let projectId: string | undefined;

  try {
    const payload = await request.json();
    projectId = payload.projectId;
    const { transcription, segments, blocks, speakerData, modelId } = payload;

    if (!projectId || !transcription) {
      return NextResponse.json(
        { error: 'Project ID and transcription are required' },
        { status: 400 }
      );
    }

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json(
        { error: 'At least one content block must be selected' },
        { status: 400 }
      );
    }

    // Get user_id for billing tracking
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    const userId = project?.user_id;
    if (!userId) {
      console.warn('[BILLING] Could not find user_id for project:', projectId);
    }

    const supportedOpenAIModels = new Set([
      'gpt-4o',
      'gpt-4o-mini',
      'o1-preview',
      'o1-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo'
    ]);
    const fallbackModel = 'gpt-4o';
    const modelToUse = modelId && supportedOpenAIModels.has(modelId) ? modelId : fallbackModel;

    if (modelId && modelToUse !== modelId) {
      warnings.push(`Requested model ${modelId} not supported. Using ${modelToUse}.`);
    }

    console.log(`[GENERATION] Starting for project ${projectId} with ${blocks.length} blocks`);
    console.log(`[GENERATION] Using model: ${modelToUse}`);

    // Step 1: Analyze content
    const analysisStartTime = Date.now();
    const analysis = await analyzeContent(transcription, modelToUse, userId, projectId);
    const analysisTime = Date.now() - analysisStartTime;
    console.log(`[ANALYSIS] Completed in ${analysisTime}ms`);

    // Step 2: Generate content for each enabled block
    const contentStartTime = Date.now();
    const generatedContent: any[] = [];

    for (const block of blocks) {
      try {
        console.log(`[BLOCK] Generating ${block.name} with theme: ${block.theme}`);
        const content = await generateBlockContent(
          block,
          transcription,
          analysis,
          modelToUse,
          userId,
          projectId
        );
        generatedContent.push(...content);
      } catch (error) {
        console.error(`[BLOCK ERROR] Failed to generate ${block.name}:`, error);
        errors.push(`Failed to generate ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const contentGenerationTime = Date.now() - contentStartTime;
    console.log(`[GENERATION] Completed ${generatedContent.length} pieces in ${contentGenerationTime}ms`);

    // Step 3: Save to database
    await saveGeneratedContent(projectId, generatedContent);

    const totalProcessingTime = Date.now() - startTime;
    console.log(`[COMPLETE] Total time: ${totalProcessingTime}ms`);

    return NextResponse.json({
      success: true,
      projectId,
      contentPieces: generatedContent.length,
      processingTime: totalProcessingTime,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[GENERATION ERROR]:', error);
    errors.push(error instanceof Error ? error.message : 'Unknown error');

    return NextResponse.json(
      {
        error: 'Content generation failed',
        details: errors
      },
      { status: 500 }
    );
  }
}

// Analyze transcription to extract hooks, insights, quotes, etc.
async function analyzeContent(
  transcription: string,
  model: string,
  userId?: string,
  projectId?: string
): Promise<ContentAnalysis> {
  const analysisPrompt = `Analyze this podcast transcription and return ONLY a valid JSON object:

{
  "keyTopics": ["topic1", "topic2", "topic3"],
  "quotes": [{"text": "quote", "speaker": "name"}],
  "facts": [{"text": "fact", "context": "context"}],
  "opinions": [{"text": "opinion", "controversy_level": 5}],
  "humor": [{"text": "funny moment", "type": "joke"}],
  "hooks": [{"text": "attention grabber", "hook_strength": 8}],
  "actionable_insights": [{"text": "practical advice", "value": 7}]
}

Rate controversy_level, hook_strength, and value from 1-10.

Transcription:
${transcription.slice(0, 80000)}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{
      role: 'system',
      content: 'You are a JSON-only response generator. Return only valid JSON.'
    }, {
      role: 'user',
      content: analysisPrompt
    }],
    temperature: 0.3,
    max_tokens: 4000,
  });

  // Track usage
  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: 'Content Analysis',
      metadata: { transcriptLength: transcription.length },
      shouldDebit: false
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  return parseAIResponse(content);
}

// Generate content for a single block
async function generateBlockContent(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const theme = getThemeById(block.theme);
  if (!theme) {
    throw new Error(`Theme not found: ${block.theme}`);
  }

  switch (block.contentTypeId) {
    case 'twitter_threads':
      return await generateTwitterThread(block, transcription, analysis, theme, model, userId, projectId);
    case 'linkedin_posts':
      return await generateLinkedInPost(block, transcription, analysis, theme, model, userId, projectId);
    case 'instagram_content':
      return await generateInstagramCarousel(block, transcription, analysis, theme, model, userId, projectId);
    case 'blog_post':
      return await generateBlogPost(block, transcription, analysis, theme, model, userId, projectId);
    case 'newsletter':
      return await generateNewsletter(block, transcription, analysis, theme, model, userId, projectId);
    case 'show_notes':
      return await generateShowNotes(block, transcription, analysis, theme, model, userId, projectId);
    case 'quote_graphics':
      return await generateQuoteGraphic(block, analysis, theme, model, userId, projectId);
    default:
      throw new Error(`Unknown content type: ${block.contentTypeId}`);
  }
}

// Twitter Thread Generator
async function generateTwitterThread(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  // Get a strong hook from analysis
  const hooks = analysis.hooks.sort((a, b) => b.hook_strength - a.hook_strength);
  const hookIndex = (block.blockNumber - 1) % hooks.length;
  const hook = hooks[hookIndex] || { text: analysis.keyTopics[0], hook_strength: 5 };

  const prompt = `You are a ${theme.name} content creator. ${theme.promptModifier}

Create a Twitter/X thread that embodies a ${theme.name} tone.

THEME GUIDELINES:
${theme.contentGuidelines}

STRICT REQUIREMENTS:
- First tweet: Hook in <15 words, must stop scrolling in 8 seconds
- 6-8 tweets total
- EACH TWEET: Maximum 280 characters (HARD LIMIT - will be truncated)
- Tone: ${theme.description}
- Use pattern interrupts every 2-3 tweets
- Psychology: ${PLATFORM_PSYCHOLOGY.twitter.psychologicalTriggers.join(', ')}
- End with clear CTA
- Include 2-3 hashtags ONLY in last tweet

Hook to expand: "${hook.text}"

Context from podcast:
${transcription.substring(0, 2000)}

Return ONLY a JSON array of tweet objects:
[{"tweet": "text", "position": 1}, {"tweet": "text", "position": 2}, ...]`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a JSON-only response generator specialized in social media content.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1500
  });

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: `Twitter Thread (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = response.choices[0]?.message?.content || '[]';
  let tweets = parseAIResponse(content);

  // Enforce 280 character limit
  tweets = tweets.map((t: any) => {
    const result = enforceContentLimit(t.tweet, 'twitter_tweet', true);
    return {
      ...t,
      tweet: result.content,
      wasTruncated: result.wasTruncated
    };
  });

  return [{
    type: 'twitter_thread',
    platform: 'twitter',
    title: `X Thread #${block.blockNumber}: ${theme.name}`,
    content: tweets.map((t: any) => t.tweet).join('\n\n'),
    metadata: {
      tweets,
      tweetCount: tweets.length,
      hook: hook.text,
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber
    }
  }];
}

// LinkedIn Post Generator
async function generateLinkedInPost(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const insights = analysis.actionable_insights.sort((a, b) => b.value - a.value);
  const insightIndex = (block.blockNumber - 1) % insights.length;
  const insight = insights[insightIndex] || { text: analysis.keyTopics[0], value: 5 };

  const prompt = `You are a ${theme.name} content creator. ${theme.promptModifier}

Create a LinkedIn post that embodies a ${theme.name} tone.

THEME GUIDELINES:
${theme.contentGuidelines}

STRICT REQUIREMENTS:
- Length: 1,300-1,500 characters (HARD LIMIT)
- First 2 lines: Hook visible in collapsed view
- Use short paragraphs (1-2 sentences each)
- Professional but show personality
- Attention span: ${PLATFORM_PSYCHOLOGY.linkedin.averageAttentionSpan}
- Psychology: ${PLATFORM_PSYCHOLOGY.linkedin.psychologicalTriggers.join(', ')}
- End with engaging question
- Include 3-5 relevant hashtags

Based on this insight: "${insight.text}"

Context:
${transcription.substring(0, 2000)}

Return a JSON object:
{"post": "content here with paragraphs separated by double newlines", "hashtags": ["hashtag1", "hashtag2"]}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a professional LinkedIn content strategist.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 800
  });

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: `LinkedIn Post (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  const result = parseAIResponse(content);

  // Enforce character limit
  const limited = enforceContentLimit(result.post, 'linkedin_post', true);

  return [{
    type: 'linkedin_post',
    platform: 'linkedin',
    title: `LinkedIn Post #${block.blockNumber}: ${theme.name}`,
    content: limited.content,
    metadata: {
      hashtags: result.hashtags,
      insight: insight.text,
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber,
      wasTruncated: limited.wasTruncated
    }
  }];
}

// Instagram Carousel Generator
async function generateInstagramCarousel(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const topics = analysis.keyTopics.slice(0, 7);

  const prompt = `You are a ${theme.name} content creator. ${theme.promptModifier}

Create an Instagram carousel that embodies a ${theme.name} tone.

THEME GUIDELINES:
${theme.contentGuidelines}

STRICT REQUIREMENTS:
- Slide 1: Title with main benefit (stop the scroll)
- Slides 2-7: One key point per slide
- Each slide: Maximum 50 words (HARD LIMIT)
- Use 2-3 emojis per slide
- Caption: 300-500 characters
- Attention span: ${PLATFORM_PSYCHOLOGY.instagram.averageAttentionSpan}
- 10-15 hashtags

Topics to cover: ${topics.join(', ')}

Return JSON:
{"slides": [{"number": 1, "text": "content", "emojis": "🎯"}], "caption": "text", "hashtags": ["tag1"]}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are an Instagram content specialist.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1000
  });

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: `Instagram Carousel (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  const result = parseAIResponse(content);

  // Enforce slide word limits
  result.slides = result.slides.map((slide: any) => {
    const limited = enforceContentLimit(slide.text, 'instagram_slide', true);
    return { ...slide, text: limited.content, wasTruncated: limited.wasTruncated };
  });

  // Enforce caption limit
  const captionLimited = enforceContentLimit(result.caption, 'instagram_caption', true);

  return [{
    type: 'instagram_caption',
    platform: 'instagram',
    title: `Instagram Carousel #${block.blockNumber}: ${theme.name}`,
    content: captionLimited.content,
    metadata: {
      slides: result.slides,
      hashtags: result.hashtags,
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber
    }
  }];
}

// Blog Post Generator
async function generateBlogPost(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const prompt = `You are a ${theme.name} content creator. ${theme.promptModifier}

Write a blog post that embodies a ${theme.name} tone.

THEME GUIDELINES:
${theme.contentGuidelines}

STRICT REQUIREMENTS:
- Length: 1,200-1,800 words (HARD LIMIT)
- Clear H2/H3 structure
- Subheading every 200-300 words
- Short paragraphs (2-3 sentences)
- Attention span: ${PLATFORM_PSYCHOLOGY.blog.averageAttentionSpan}
- SEO-optimized
- Include introduction and conclusion
- Actionable takeaways

Topics: ${analysis.keyTopics.join(', ')}

Context:
${transcription.substring(0, 3000)}

Return JSON:
{"title": "title", "content": "markdown formatted content with ## headings", "metaDescription": "SEO description"}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a professional blog content writer.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 3000
  });

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: `Blog Post (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  const result = parseAIResponse(content);

  // Enforce word limit
  const limited = enforceContentLimit(result.content, 'blog_post', true);

  return [{
    type: 'blog_post',
    platform: 'blog',
    title: result.title,
    content: limited.content,
    metadata: {
      metaDescription: result.metaDescription,
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber,
      wasTruncated: limited.wasTruncated
    }
  }];
}

// Newsletter Generator
async function generateNewsletter(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const prompt = `You are a ${theme.name} content creator. ${theme.promptModifier}

Write an email newsletter that embodies a ${theme.name} tone.

THEME GUIDELINES:
${theme.contentGuidelines}

STRICT REQUIREMENTS:
- Length: 800-1,200 words (HARD LIMIT)
- Subject line: 40-50 characters
- Personal greeting
- Scannable format (bullets, short paragraphs)
- Single clear CTA
- P.S. section
- Attention span: ${PLATFORM_PSYCHOLOGY.newsletter.averageAttentionSpan}

Topics: ${analysis.keyTopics.join(', ')}

Return JSON:
{"subject": "subject line", "previewText": "preview", "content": "email body", "cta": "call to action", "ps": "P.S. message"}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are an email newsletter specialist.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: `Newsletter (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  const result = parseAIResponse(content);

  const limited = enforceContentLimit(result.content, 'newsletter', true);

  return [{
    type: 'email_newsletter',
    platform: 'email',
    title: result.subject,
    content: limited.content,
    metadata: {
      subject: result.subject,
      previewText: result.previewText,
      cta: result.cta,
      ps: result.ps,
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber
    }
  }];
}

// Show Notes Generator
async function generateShowNotes(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const prompt = `Create show notes in a ${theme.name} style.

REQUIREMENTS:
- Length: 500-800 words (HARD LIMIT)
- Episode summary (100 words)
- Key topics with timestamps
- 2-3 quotable moments
- Resources mentioned
- Scannable bullet points

Topics: ${analysis.keyTopics.join(', ')}

Return JSON:
{"summary": "brief summary", "topics": [{"topic": "name", "timestamp": "0:00"}], "quotes": ["quote 1"], "resources": ["resource 1"]}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a podcast show notes specialist.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1500
  });

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response,
      modelName: model,
      purpose: `Show Notes (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = response.choices[0]?.message?.content || '{}';
  const result = parseAIResponse(content);

  return [{
    type: 'show_notes',
    platform: 'general',
    title: 'Show Notes',
    content: JSON.stringify(result, null, 2),
    metadata: {
      ...result,
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber
    }
  }];
}

// Quote Graphic Generator
async function generateQuoteGraphic(
  block: ContentBlock,
  analysis: ContentAnalysis,
  theme: any,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const quotes = analysis.quotes.slice(0, 10);
  const quoteIndex = (block.blockNumber - 1) % quotes.length;
  const selectedQuote = quotes[quoteIndex];

  // Enforce word limit on quote
  const limited = enforceContentLimit(selectedQuote?.text || 'No quote available', 'quote_graphic', true);

  return [{
    type: 'quote_graphic',
    platform: 'general',
    title: `Quote #${block.blockNumber}`,
    content: limited.content,
    metadata: {
      speaker: selectedQuote?.speaker || 'Unknown',
      theme: theme.name,
      themeId: theme.id,
      blockNumber: block.blockNumber,
      wasTruncated: limited.wasTruncated
    }
  }];
}

// Save generated content to database
const LEGACY_OUTPUT_TYPES = new Set<OutputType>([
  'blog_post',
  'social_post',
  'email_newsletter',
  'audiogram_clip',
  'quote_graphic',
  'show_notes'
]);

const OUTPUT_TYPE_FALLBACKS: Record<string, OutputType> = {
  twitter_thread: 'social_post',
  linkedin_post: 'social_post',
  instagram_caption: 'social_post'
};

function normalizeOutputTypeForInsert(type?: string): OutputType {
  if (type && LEGACY_OUTPUT_TYPES.has(type as OutputType)) {
    return type as OutputType;
  }

  if (type && OUTPUT_TYPE_FALLBACKS[type]) {
    return OUTPUT_TYPE_FALLBACKS[type];
  }

  return 'social_post';
}

function buildMetadataForInsert(metadata: any, originalType?: string, normalizedType?: string) {
  const baseMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
  const result = { ...baseMetadata };

  if (originalType && normalizedType && originalType !== normalizedType) {
    result.originalOutputType = result.originalOutputType || originalType;
  }

  return result;
}

async function saveGeneratedContent(projectId: string, generatedContent: any[]) {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single();

  const userId = project?.user_id;
  if (!userId) {
    throw new Error('User ID not found for project');
  }

  const outputs = generatedContent.map(content => {
    const normalizedType = normalizeOutputTypeForInsert(content.type);

    return {
      project_id: projectId,
      user_id: userId,
      type: normalizedType,
      platform: content.platform,
      title: content.title,
      content: content.content,
      metadata: buildMetadataForInsert(content.metadata, content.type, normalizedType),
      status: 'generated',
      created_at: new Date().toISOString()
    };
  });

  const { error } = await supabaseAdmin
    .from('outputs')
    .insert(outputs);

  if (error) {
    console.error('[SAVE ERROR]:', error);
    throw new Error(`Failed to save content: ${error.message}`);
  }

  console.log(`[SAVE] Saved ${outputs.length} outputs to database`);
}
