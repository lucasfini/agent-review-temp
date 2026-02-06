import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';
import type { ContentBlock, OutputType } from '@/lib/content-types';
import { getThemeById, type ContentTheme } from '@/lib/content-themes';
import { enforceContentLimit, PLATFORM_PSYCHOLOGY } from '@/lib/content-psychology';
import { preProcessTranscript, type NarrativeMetadata } from '@/lib/content-generators/pre-processor';
import {
  initializeGenerationProgress,
  updateGenerationProgress,
  completeBlock,
  completeGenerationProgress,
  failGenerationProgress
} from '@/lib/generation-progress';
import { getAICompletion, type AIMessage } from '@/lib/ai-providers/multi-provider';

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

/**
 * Get specific platform badge name (not "General")
 */
function getPlatformBadge(contentTypeId: string): string {
  const badges: Record<string, string> = {
    'twitter_threads': 'X Thread',
    'linkedin_posts': 'LinkedIn Post',
    'instagram_content': 'Instagram Carousel',
    'blog_post': 'Blog Post',
    'newsletter': 'Email Newsletter',
    'show_notes': 'Show Notes',
    'quote_graphics': 'Quote Graphic'
  };
  return badges[contentTypeId] || 'General';
}

/**
 * Get platform badge color for UI
 */
function getBadgeColor(contentTypeId: string): string {
  const colors: Record<string, string> = {
    'twitter_threads': '#000000',      // X (black)
    'linkedin_posts': '#0077B5',       // LinkedIn blue
    'instagram_content': '#E1306C',    // Instagram pink
    'blog_post': '#4F46E5',            // Blog indigo
    'newsletter': '#EA4335',           // Email red
    'show_notes': '#6366F1',           // Show Notes purple
    'quote_graphics': '#F59E0B'        // Quote Graphic amber/gold
  };
  return colors[contentTypeId] || '#6366F1';
}

/**
 * Build standardized UI metadata for frontend display
 */
function buildUIMetadata(contentTypeId: string, themeName: string): {
  platform_label: string;
  theme_label: string;
  badge_color: string;
} {
  return {
    platform_label: getPlatformBadge(contentTypeId),
    theme_label: themeName,
    badge_color: getBadgeColor(contentTypeId)
  };
}

/**
 * Validate output for forbidden terms (ads, generic labels, AI-isms)
 * Ad-Blocker Protocol: Blacklist specific sponsor brands and scam patterns
 */
function validateOutput(output: any): void {
  const contentString = JSON.stringify(output).toLowerCase();

  // BLACKLIST: Specific sponsor brands and ad patterns
  const forbiddenAdTerms = [
    // Generic ad terms
    'sponsor', 'advertisement', 'ad break', 'promo code', 'use code', 'visit our website',
    'brought to you by', 'special offer', 'discount code',
    // Specific blacklisted brands
    'darktrace',
    // Recruiter/scam patterns
    'recruiter scam', 'recruitment scam', 'job scam', 'hiring scam',
    'recruitment agency', 'staffing agency'
  ];
  const foundAds = forbiddenAdTerms.filter(term => contentString.includes(term.toLowerCase()));
  if (foundAds.length > 0) {
    console.warn(`[VALIDATION] ⚠️ Ad-related terms detected: ${foundAds.join(', ')}`);
  }

  // Check for forbidden AI vocabulary (Anti-AI Vocabulary)
  const forbiddenAITerms = ['unlock', 'delve', 'tapestry', 'game-changer', 'game changer', 'dive deep', 'shocker'];
  const foundAI = forbiddenAITerms.filter(term => contentString.includes(term.toLowerCase()));
  if (foundAI.length > 0) {
    console.warn(`[VALIDATION] ⚠️ AI-ism vocabulary detected: ${foundAI.join(', ')} - Consider regenerating for more human tone`);
  }

  // Check for generic newsletter salutations (forbidden for newsletters)
  const forbiddenSalutations = ['dear reader', 'hi there', 'hello friend', 'hey friend'];
  const foundSalutations = forbiddenSalutations.filter(term => contentString.includes(term.toLowerCase()));
  if (foundSalutations.length > 0) {
    console.warn(`[VALIDATION] ⚠️ Generic salutation detected: ${foundSalutations.join(', ')} - Newsletters should jump straight to the hook`);
  }

  // Check for "General" platform in metadata (should be specific)
  if (output.metadata?.platform === 'General') {
    console.warn('[VALIDATION] ⚠️ Generic "General" platform label detected - should be specific');
  }

  // Check for ui_metadata presence
  if (!output.metadata?.ui_metadata) {
    console.warn('[VALIDATION] ⚠️ Missing ui_metadata - frontend may not display properly');
  }
}

/**
 * Build Master Prompt for content generation
 * Universal prompt template with ad-blocking, single-angle enforcement, and platform requirements
 */
function buildMasterPrompt(params: {
  angle: string;
  themeName: string;
  cleanedSummary: string;
  platformLabel: string;
  badgeColor: string;
  platformStructure: string;
  outputSchema: string;
  additionalContext?: string;
}): string {
  const { angle, themeName, cleanedSummary, platformLabel, badgeColor, platformStructure, outputSchema, additionalContext } = params;

  return `You are an expert Content Strategist. Your task is to transform a transcript into high-performing, ad-free content assets.

=== STRICT ARCHITECTURAL RULES ===

1. Absolute Ad-Blocker Protocol:
   BLACKLISTED TERMS (NEVER include in any output):
   - Sponsor brands: "Darktrace", any company mentioned as "sponsor" or "brought to you by"
   - Ad patterns: "promo code", "use code", "special offer", "discount code", "visit our website"
   - Scam patterns: "recruiter scam", "recruitment scam", "job scam", "hiring scam", "recruitment agency", "staffing agency"

   You must identify and completely IGNORE all sponsor segments. No sponsor brand, link, or promotional content may EVER appear in any output.

2. Single-Angle Narrative: Pick ONE compelling story. Every asset generated must stick to this one angle: "${angle}"

3. Metadata Badging: Your output will be labeled as "${platformLabel}" with badge color ${badgeColor}

=== PLATFORM REQUIREMENTS TABLE ===

| Format | platform_label | badge_color | Structure |
|--------|---------------|-------------|-----------|
| 𝕏 Thread | X Thread | #000000 | 6-8 posts. Narrative arc: Hook → Evidence → Synthesis → CTA. |
| LinkedIn | LinkedIn Post | #0077B5 | Hook-Value-CTA. No more than 2 rhetorical questions. |
| Instagram | Instagram Carousel | #E1306C | Array of 7 Slide Objects. Each must have a Headline and Body. |
| Newsletter | Email Newsletter | #EA4335 | 1-2-1 Structure: 1 Big Idea, 2 Tactical Bullets, 1 Personal Question. |
| Blog Post | Blog Post | #4F46E5 | 1,200 words. H2/H3s must be bold claims, not generic labels. |
| Show Notes | Show Notes | #6366F1 | Executive Summary + 3 'Aha!' Moments + Ad-free Resources. |
| Quotes | Quote Graphic | #F59E0B | 100% Verbatim. Raw spoken words only. |

=== YOUR SPECIFIC TASK ===

Platform: ${platformLabel}
Structure: ${platformStructure}

=== WRITING STYLE ===

- No "AI-isms": FORBIDDEN words are "unlock," "delve," "tapestry," "game-changer," "dive deep," "shocker"
- Use ${themeName} persona for all tone and vocabulary
- Vary sentence length (Burstiness) for human readability
- Write like a real person sharing insights, not a corporate content bot

${additionalContext || ''}

=== OUTPUT FORMAT ===

Return ONLY a valid JSON object:
${outputSchema}

=== INPUT DATA ===

Angle: ${angle}
Theme: ${themeName}
Cleaned Summary (Ad-Free):
${cleanedSummary.slice(0, 15000)}`;
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

/**
 * Get counts of existing content by type for sequential numbering
 */
async function getExistingContentCounts(projectId: string): Promise<Record<string, number>> {
  try {
    // Query the database for all outputs for this project
    const { data: outputs, error } = await supabaseAdmin
      .from('outputs')
      .select('type, metadata')
      .eq('project_id', projectId);

    if (error) {
      console.error('[COUNTS] Error fetching existing outputs:', error);
      return {};
    }

    // Count by contentTypeId from metadata
    const counts: Record<string, number> = {};

    outputs?.forEach((output: any) => {
      // Get the original content type from metadata
      const metadata = output.metadata || {};

      // Try to determine content type from metadata
      // Check for originalOutputType first (for normalized types like social_post)
      let contentTypeId: string | null = null;

      if (metadata.originalOutputType === 'twitter_thread' || output.type === 'twitter_thread') {
        contentTypeId = 'twitter_threads';
      } else if (metadata.originalOutputType === 'linkedin_post' || output.type === 'linkedin_post') {
        contentTypeId = 'linkedin_posts';
      } else if (metadata.originalOutputType === 'instagram_caption' || output.type === 'instagram_caption') {
        contentTypeId = 'instagram_content';
      } else if (output.type === 'blog_post') {
        contentTypeId = 'blog_post';
      } else if (output.type === 'email_newsletter') {
        contentTypeId = 'newsletter';
      } else if (output.type === 'show_notes') {
        contentTypeId = 'show_notes';
      } else if (output.type === 'quote_graphic') {
        contentTypeId = 'quote_graphics';
      }

      if (contentTypeId) {
        counts[contentTypeId] = (counts[contentTypeId] || 0) + 1;
      }
    });

    return counts;
  } catch (error) {
    console.error('[COUNTS] Exception fetching existing outputs:', error);
    return {};
  }
}

/**
 * Topic Selector: Identify 3 distinct story angles from the cleaned summary
 * This ensures each thread is focused on ONE compelling narrative
 */
async function getStoryAngles(
  cleanedSummary: string,
  model: string,
  userId?: string,
  projectId?: string
): Promise<string[]> {
  console.log(`[STORY ANGLES] 🎯 Identifying distinct narrative angles using ${model}...`);

  try {
    const result = await getAICompletion({
      model,
      temperature: 0.2,
      maxTokens: 500,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'Identify the 3 most distinct and compelling narrative angles from this summary. Each angle should be specific enough to build an entire thread around. Return ONLY a JSON object with an "angles" array of 3 strings.'
        },
        {
          role: 'user',
          content: `Analyze this podcast summary and identify 3 distinct story angles:

${cleanedSummary.slice(0, 10000)}

Return JSON format:
{
  "angles": ["Angle 1 description", "Angle 2 description", "Angle 3 description"]
}`
        }
      ]
    });

    // Mock response for tracking
    const mockResponse = {
      id: `mock-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: result.model,
      choices: [{ message: { content: result.content } }],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens
      }
    };

    // Track usage
    if (userId) {
      await trackOpenAIUsage({
        userId,
        projectId,
        response: mockResponse,
        modelName: model,
        purpose: 'Story Angle Identification',
        metadata: { summaryLength: cleanedSummary.length },
        shouldDebit: false
      });
    }

    const content = result.content || '{"angles":[]}';
    const parsed = parseAIResponse(content);
    const angles = parsed.angles || [];

    console.log(`[STORY ANGLES] ✅ Identified ${angles.length} angles:`, angles);

    // Fallback if we don't get 3 angles
    if (angles.length < 3) {
      console.warn('[STORY ANGLES] ⚠️ Less than 3 angles found, using generic fallbacks');
      while (angles.length < 3) {
        angles.push(`Key Narrative ${angles.length + 1}`);
      }
    }

    return angles;

  } catch (error: any) {
    console.error('[STORY ANGLES] ❌ Failed to identify angles:', error);
    // Return generic fallbacks
    return ['Main Narrative', 'Key Debate', 'Critical Insight'];
  }
}

/**
 * Universal Content Engine: Builds the base prompt with theme + data structure
 */
// DEPRECATED: buildUniversalPrompt has been replaced by buildMasterPrompt
// All generators now use the new Master Prompt system

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
      .single() as { data: { user_id: string } | null };

    const userId = project?.user_id;
    if (!userId) {
      console.warn('[BILLING] Could not find user_id for project:', projectId);
    }

    // Use selected model or default to GPT-4o
    const modelToUse = modelId || 'gpt-4o';

    console.log(`[GENERATION] 🚀 Starting Universal Content Engine for project ${projectId}`);
    console.log(`[GENERATION] 📦 Processing ${blocks.length} blocks with ${modelToUse}`);

    // Initialize progress tracking
    await initializeGenerationProgress(projectId, blocks.length);

    // Step 1: Pre-process transcript to extract signal and filter noise
    const preProcessStartTime = Date.now();
    const preProcessResult = await preProcessTranscript(transcription, { speakerContext: speakerData });
    const narrativeMetadata = preProcessResult.metadata;
    const preProcessTime = Date.now() - preProcessStartTime;
    console.log(`[PRE-PROCESSOR] ✅ Completed in ${preProcessTime}ms`);

    // Step 2: Analyze content using cleaned narrative
    const analysisStartTime = Date.now();
    const analysis = await analyzeContent(
      narrativeMetadata.cleaned_narrative_summary || transcription,
      narrativeMetadata,
      modelToUse,
      userId,
      projectId
    );
    const analysisTime = Date.now() - analysisStartTime;
    console.log(`[ANALYSIS] ✅ Completed in ${analysisTime}ms`);

    // Step 3: Get existing content counts for sequential numbering
    const existingCounts = await getExistingContentCounts(projectId);
    console.log(`[COUNTS] 📊 Existing content counts:`, existingCounts);

    // Step 4: Generate content for each enabled block
    const contentStartTime = Date.now();
    const generatedContent: any[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      try {
        // Update progress: Starting this block
        await updateGenerationProgress(
          projectId,
          block.name,
          i + 1,
          blocks.length
        );

        // Calculate the actual block number based on existing content
        const existingCount = existingCounts[block.contentTypeId] || 0;
        const actualBlockNumber = existingCount + block.blockNumber;

        console.log(`[BLOCK] 🎨 Generating ${block.name} #${actualBlockNumber} with ${block.theme} theme`);
        const content = await generateBlockContent(
          { ...block, blockNumber: actualBlockNumber },
          transcription,
          analysis,
          narrativeMetadata,
          modelToUse,
          userId,
          projectId
        );
        generatedContent.push(...content);

        // Update progress: Block completed
        await completeBlock(projectId, i + 1);
      } catch (error) {
        console.error(`[BLOCK ERROR] ❌ Failed to generate ${block.name}:`, error);
        errors.push(`Failed to generate ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const contentGenerationTime = Date.now() - contentStartTime;
    console.log(`[GENERATION] ✅ Completed ${generatedContent.length} pieces in ${contentGenerationTime}ms`);

    // Step 5: Save to database
    await saveGeneratedContent(projectId, generatedContent);

    // Mark generation as complete
    await completeGenerationProgress(projectId, blocks.length);

    const totalProcessingTime = Date.now() - startTime;
    console.log(`[COMPLETE] 🎉 Total time: ${totalProcessingTime}ms`);

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

    // Mark generation as failed
    if (projectId) {
      await failGenerationProgress(
        projectId,
        error instanceof Error ? error.message : 'Content generation failed'
      );
    }

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
  narrativeMetadata: NarrativeMetadata,
  model: string,
  userId?: string,
  projectId?: string
): Promise<ContentAnalysis> {
  // Build context from pre-processor results
  let narrativeContext = '';
  if (narrativeMetadata.main_topic) {
    narrativeContext += `Main Topic: ${narrativeMetadata.main_topic}\n\n`;
  }
  if (narrativeMetadata.key_tensions && narrativeMetadata.key_tensions.length > 0) {
    narrativeContext += `Key Tensions:\n${narrativeMetadata.key_tensions.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n`;
  }
  if (narrativeMetadata.ad_segments_found && narrativeMetadata.ad_segments_found.length > 0) {
    narrativeContext += `⚠️ IGNORE THESE AD SEGMENTS: ${narrativeMetadata.ad_segments_found.join(', ')}\n\n`;
  }

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

NARRATIVE CONTEXT (Pre-Processed):
${narrativeContext}

Cleaned Transcription (Ad-free):
${transcription.slice(0, 80000)}`;

  const result = await getAICompletion({
    model,
    messages: [{
      role: 'system',
      content: 'You are a JSON-only response generator. Return only valid JSON.'
    }, {
      role: 'user',
      content: analysisPrompt
    }],
    temperature: 0.3,
    maxTokens: 4000,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  // Track usage
  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: 'Content Analysis',
      metadata: { transcriptLength: transcription.length },
      shouldDebit: false
    });
  }

  const content = result.content || '{}';
  return parseAIResponse(content);
}

// Generate content for a single block
async function generateBlockContent(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
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
      return await generateTwitterThread(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId);
    case 'linkedin_posts':
      return await generateLinkedInPost(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId);
    case 'instagram_content':
      return await generateInstagramCarousel(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId);
    case 'blog_post':
      return await generateBlogPost(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId);
    case 'newsletter':
      return await generateNewsletter(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId);
    case 'show_notes':
      return await generateShowNotes(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId);
    case 'quote_graphics':
      return await generateQuoteGraphic(block, analysis, theme, model, userId, projectId);
    default:
      throw new Error(`Unknown content type: ${block.contentTypeId}`);
  }
}

// Twitter Thread Generator with Topic Selector
async function generateTwitterThread(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  // Step 1: Get 3 distinct story angles from cleaned summary
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription.substring(0, 10000);
  const storyAngles = await getStoryAngles(cleanedSummary, model, userId, projectId);

  // Step 2: Select angle based on block number (cycle through angles)
  const angleIndex = (block.blockNumber - 1) % storyAngles.length;
  const selectedAngle = storyAngles[angleIndex];

  console.log(`[TWITTER THREAD] 🎯 Focusing on angle #${angleIndex + 1}: "${selectedAngle}"`);

  // Step 3: Build Master Prompt
  const outputSchema = `{
  "tweets": [
    {"tweet": "Tweet text here", "position": 1},
    {"tweet": "Tweet text here", "position": 2}
  ]
}`;

  const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== TECHNICAL CONSTRAINTS ===
- 6-8 tweets total
- EACH TWEET: Maximum 280 characters (HARD LIMIT)
- Include 2-3 hashtags ONLY in last tweet
- Use line breaks within tweets for readability
- One-sentence paragraphs for mobile readability`;

  const prompt = buildMasterPrompt({
    angle: selectedAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'X Thread',
    badgeColor: '#000000',
    platformStructure: '6-8 posts. Narrative arc: Hook → Evidence → Synthesis → CTA.',
    outputSchema,
    additionalContext
  });

  const result = await getAICompletion({
    model,
    messages: [
      {
        role: 'system',
        content: `You are an expert Content Strategist and Ghostwriter specializing in single-storyline narrative threads. You transform complex discussions into focused, high-impact stories that resonate with real people.`
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 1500,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `X Thread (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = result.content || '{"tweets":[]}';
  const parsed = parseAIResponse(content);
  let tweets = parsed.tweets || [];

  // Enforce 280 character limit
  tweets = tweets.map((t: any) => {
    const limited = enforceContentLimit(t.tweet, 'twitter_tweet', true);
    return {
      ...t,
      tweet: limited.content,
      wasTruncated: limited.wasTruncated
    };
  });

  // Format thread with clear post separators
  const formattedContent = tweets
    .map((t: any, index: number) => `[Post ${index + 1}/${tweets.length}]\n${t.tweet}`)
    .join('\n\n---\n\n');

  return [{
    type: 'twitter_thread',
    platform: 'twitter',
    title: `X Thread #${block.blockNumber}: ${selectedAngle}`,
    content: formattedContent,
    metadata: {
      ui_metadata: buildUIMetadata('twitter_threads', theme.name),
      platform: 'X Thread',  // Specific platform badge
      theme: theme.name,
      angle: selectedAngle,  // Main narrative angle
      tweets,
      tweetCount: tweets.length,
      storyAngle: selectedAngle,  // Keep for backward compatibility
      angleIndex: angleIndex + 1,
      allAngles: storyAngles,
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
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const insights = analysis.actionable_insights.sort((a, b) => b.value - a.value);
  const insightIndex = (block.blockNumber - 1) % insights.length;
  const insight = insights[insightIndex] || { text: analysis.keyTopics[0], value: 5 };

  const topInsights = insights.slice(0, 3).map(i => i.text);
  const topQuote = analysis.quotes[0]?.text || '';

  const linkedinAngle = narrativeMetadata.single_angle || insight.text || narrativeMetadata.main_topic;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  const outputSchema = `{
  "post": "LinkedIn post content with paragraphs separated by double newlines",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

  const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== TECHNICAL CONSTRAINTS ===
- Length: 1,300-1,500 characters (HARD LIMIT)
- First 2 lines: Hook visible in collapsed view (must compel "see more" click)
- Use short paragraphs (1-2 sentences each)
- Professional but show personality
- End with engaging question to drive comments (max 2 rhetorical questions total)
- Include 3-5 relevant hashtags
- Use line breaks for scannability`;

  const prompt = buildMasterPrompt({
    angle: linkedinAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'LinkedIn Post',
    badgeColor: '#0077B5',
    platformStructure: 'Hook-Value-CTA. No more than 2 rhetorical questions.',
    outputSchema,
    additionalContext
  });

  const result = await getAICompletion({
    model,
    messages: [
      {
        role: 'system',
        content: `You are a ${theme.name} professional content strategist who creates compelling LinkedIn posts that drive engagement and comments.`
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 800,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `LinkedIn Post (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = result.content || '{"post":"","hashtags":[]}';
  const parsed = parseAIResponse(content);

  // Enforce character limit
  const limited = enforceContentLimit(parsed.post, 'linkedin_post', true);

  return [{
    type: 'linkedin_post',
    platform: 'linkedin',
    title: `LinkedIn Post #${block.blockNumber}: ${theme.name}`,
    content: limited.content,
    metadata: {
      ui_metadata: buildUIMetadata('linkedin_posts', theme.name),
      platform: 'LinkedIn',  // Specific platform badge
      theme: theme.name,
      angle: insight.text || narrativeMetadata.main_topic || 'Professional Insight',  // Main narrative angle
      hashtags: parsed.hashtags || [],
      insight: insight.text,  // Keep for backward compatibility
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
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  // Step 1: Extract angle from narrative metadata
  const instagramAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  console.log(`[INSTAGRAM] 🎯 Focusing on angle: "${instagramAngle}"`);

  // Step 2: Build output schema
  const outputSchema = `{
  "angle": "The single narrative focus for this carousel",
  "slides": [
    {"number": 1, "headline": "Hook headline", "text": "Slide 1 content"},
    {"number": 2, "headline": "Point 1", "text": "Slide 2 content"},
    {"number": 3, "headline": "Point 2", "text": "Slide 3 content"},
    {"number": 4, "headline": "Point 3", "text": "Slide 4 content"},
    {"number": 5, "headline": "Point 4", "text": "Slide 5 content"},
    {"number": 6, "headline": "Point 5", "text": "Slide 6 content"},
    {"number": 7, "headline": "CTA", "text": "Slide 7 content"}
  ],
  "caption": "Instagram caption text",
  "hashtags": ["hashtag1", "hashtag2"]
}`;

  // Step 3: Build additional context
  const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== TECHNICAL CONSTRAINTS ===
- EXACTLY 7 slides (no more, no less)
- Slide 1: Hook headline (5-10 words max)
- Slides 2-6: Single-angle story points (30-40 words each)
- Slide 7: Call to Action (engagement question or save prompt)
- Each slide max 50 words
- Caption: 300-500 characters
- 10-15 relevant hashtags
- Use 1-2 emojis per slide for visual appeal
- All slides must follow ONE narrative thread (no topic-jumping)`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: instagramAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Instagram Carousel',
    badgeColor: '#E1306C',
    platformStructure: 'Array of 7 Slide Objects. Each must have a Headline and Body.',
    outputSchema,
    additionalContext
  });

  const result = await getAICompletion({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert Content Strategist specializing in Instagram Carousel posts.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 1000,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Instagram Carousel (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = result.content || '{"angle":"","slides":[],"caption":"","hashtags":[]}';
  const parsed = parseAIResponse(content);

  // Enforce exactly 7 slides
  let slides = parsed.slides || [];
  if (slides.length !== 7) {
    console.warn(`[INSTAGRAM] ⚠️ Expected 7 slides, got ${slides.length}. Adjusting...`);
    // Ensure we have exactly 7 slides
    while (slides.length < 7) {
      slides.push({ number: slides.length + 1, headline: 'Slide', text: 'Content here' });
    }
    slides = slides.slice(0, 7);
  }

  // Enforce slide word limits
  slides = slides.map((slide: any, index: number) => {
    const limited = enforceContentLimit(slide.text, 'instagram_slide', true);
    return {
      number: index + 1,
      headline: slide.headline || `Slide ${index + 1}`,
      text: limited.content,
      wasTruncated: limited.wasTruncated
    };
  });

  // Enforce caption limit
  const captionLimited = enforceContentLimit(parsed.caption || '', 'instagram_caption', true);

  const carouselAngle = parsed.angle || instagramAngle;

  return [{
    type: 'instagram_caption',
    platform: 'instagram',
    title: `Instagram Carousel #${block.blockNumber}: ${carouselAngle}`,
    content: captionLimited.content,
    metadata: {
      ui_metadata: buildUIMetadata('instagram_content', theme.name),
      platform: 'Instagram',  // Specific platform badge
      theme: theme.name,
      angle: carouselAngle,  // Main narrative angle for carousel
      slides: slides,  // Exactly 7 slides
      slideCount: slides.length,
      hashtags: parsed.hashtags || [],
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
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  // Step 1: Extract angle from narrative metadata
  const blogAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  console.log(`[BLOG POST] 🎯 Focusing on angle: "${blogAngle}"`);

  // Step 2: Build output schema
  const outputSchema = `{
  "title": "SEO-optimized blog title",
  "content": "Full blog post with ## H2 and ### H3 markdown headings",
  "metaDescription": "SEO meta description (150-160 chars)"
}`;

  // Step 3: Build additional context
  const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== H2/H3 BOLD CLAIMS RULE ===
- ❌ WRONG: "Benefits", "Overview", "Conclusion"
- ✅ RIGHT: "Why Traditional Marketing Is Dead", "The $10M Mistake Most Founders Make"

=== TECHNICAL CONSTRAINTS ===
- 1,200-1,800 words
- H2/H3 every 200-300 words
- Short paragraphs (2-3 sentences)
- Include "Tactical Framework" table
- SEO-optimized naturally
- Compelling introduction and strong conclusion
- Actionable takeaways throughout`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: blogAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Blog Post',
    badgeColor: '#4F46E5',
    platformStructure: '1,200 words. H2/H3s must be bold claims, not generic labels.',
    outputSchema,
    additionalContext
  });

  const result = await getAICompletion({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert Content Strategist specializing in Blog Posts.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 3000,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Blog Post (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = result.content || '{"title":"","content":"","metaDescription":""}';
  const parsed = parseAIResponse(content);

  // Enforce word limit
  const limited = enforceContentLimit(parsed.content || '', 'blog_post', true);

  const finalBlogAngle = parsed.title || blogAngle;

  return [{
    type: 'blog_post',
    platform: 'general',  // Using 'general' instead of 'blog' for platform constraint compatibility
    title: parsed.title || `Blog Post #${block.blockNumber}`,
    content: limited.content,
    metadata: {
      ui_metadata: buildUIMetadata('blog_post', theme.name),
      platform: 'Blog Post',  // Specific platform badge
      theme: theme.name,
      angle: finalBlogAngle,  // Main narrative angle (blog title or topic)
      metaDescription: parsed.metaDescription || '',
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
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  // Step 1: Extract angle from narrative metadata
  const newsletterAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  console.log(`[NEWSLETTER] 🎯 Focusing on angle: "${newsletterAngle}"`);

  // Step 2: Build output schema
  const outputSchema = `{
  "subject": "Email subject line",
  "previewText": "Preview text for inbox",
  "content": "Newsletter body content",
  "cta": "Call to action text",
  "ps": "P.S. message"
}`;

  // Step 3: Build additional context
  const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== 1-2-1 STRUCTURE ===
1. ONE Big Idea (opening paragraph)
2. TWO Tactical Bullets (actionable insights)
3. ONE Personal Question (engagement driver)

=== FORBIDDEN PATTERNS ===
- NEVER use "Dear Reader" or any generic salutation
- NEVER start with "Hi there" or "Hello friend"
- Jump straight into the hook/big idea

=== TECHNICAL CONSTRAINTS ===
- 800-1,200 words
- Subject line: 40-50 characters
- Preheader: <100 characters
- Single clear CTA
- P.S. section
- Conversational, personal tone
- Scannable format (bullets, short paragraphs)
- Mobile-optimized`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: newsletterAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Email Newsletter',
    badgeColor: '#EA4335',
    platformStructure: '1-2-1 Structure: 1 Big Idea, 2 Tactical Bullets, 1 Personal Question.',
    outputSchema,
    additionalContext
  });

  const result = await getAICompletion({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert Content Strategist specializing in Email Newsletters.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 2000,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Newsletter (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = result.content || '{"subject":"","previewText":"","content":"","cta":"","ps":""}';
  const parsed = parseAIResponse(content);

  const limited = enforceContentLimit(parsed.content || '', 'newsletter', true);

  const finalNewsletterAngle = parsed.subject || newsletterAngle;

  return [{
    type: 'email_newsletter',
    platform: 'general',  // Using 'general' instead of 'email' for platform constraint compatibility
    title: parsed.subject || `Newsletter #${block.blockNumber}`,
    content: limited.content,
    metadata: {
      ui_metadata: buildUIMetadata('newsletter', theme.name),
      platform: 'Email Newsletter',  // Specific platform badge
      theme: theme.name,
      angle: finalNewsletterAngle,  // Main narrative angle (subject line or topic)
      subject: parsed.subject || '',
      previewText: parsed.previewText || '',
      cta: parsed.cta || '',
      ps: parsed.ps || '',
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
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  // Step 1: Extract angle from narrative metadata
  const showNotesAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || 'Episode Summary';
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  console.log(`[SHOW NOTES] 🎯 Focusing on angle: "${showNotesAngle}"`);

  // Step 2: Build output schema
  const outputSchema = `{
  "summary": "Brief episode summary",
  "topics": [{"topic": "Topic name", "timestamp": "0:00"}],
  "quotes": ["Quote 1", "Quote 2"],
  "resources": ["Resource 1", "Resource 2"]
}`;

  // Step 3: Build additional context
  const additionalContext = `=== THEME ADAPTATION (${theme.name}) ===
${theme.description}
${theme.promptModifier}

=== EXECUTIVE BRIEF FORMAT ===
- One-sentence hook (episode thesis)
- 3 "Aha!" Moments (key insights)
- Ad-free Resources mentioned (IMPORTANT: If a resource is a sponsor or ad, omit it entirely)
- Chapter timestamps

=== AD-BLOCKER REMINDER ===
CRITICAL: If the "Resources" list would only contain sponsor/ad content after filtering, OMIT the "resources" field entirely.
Valid resources: books, tools, studies, frameworks mentioned organically in conversation.
FORBIDDEN: Darktrace, recruitment agencies, sponsor websites, promo codes.

=== TECHNICAL CONSTRAINTS ===
- 500-800 words
- Scannable bullet format
- Search-friendly keywords
- Episode summary: 100 words max
- 2-3 quotable moments with speaker attribution`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: showNotesAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Show Notes',
    badgeColor: '#6366F1',
    platformStructure: "Executive Summary + 3 'Aha!' Moments + Ad-free Resources.",
    outputSchema,
    additionalContext
  });

  const result = await getAICompletion({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert Content Strategist specializing in Show Notes.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 1500,
    responseFormat: { type: "json_object" }
  });

  // Mock response for tracking
  const mockResponse = {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens
    }
  };

  if (userId) {
    await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Show Notes (${theme.name})`,
      shouldDebit: true
    });
  }

  const content = result.content || '{"summary":"","topics":[],"quotes":[],"resources":[]}';
  const parsed = parseAIResponse(content);

  // Filter out ad-related resources (Ad-Blocker Protocol for Show Notes)
  // ONLY allow: books, tools, studies, frameworks mentioned organically
  let cleanedResources = parsed.resources || [];
  if (Array.isArray(cleanedResources)) {
    const forbiddenResourceTerms = [
      // Specific blacklisted brands
      'darktrace',
      // Generic ad patterns
      'sponsor', 'promo', 'code', 'discount', 'offer', 'ad',
      // Recruiter/scam patterns
      'recruitment', 'recruiter', 'staffing', 'hiring agency', 'job scam'
    ];
    cleanedResources = cleanedResources.filter((resource: string) => {
      const lowerResource = resource.toLowerCase();
      return !forbiddenResourceTerms.some(term => lowerResource.includes(term));
    });
  }

  const finalShowNotesAngle = parsed.summary?.split('.')[0] || showNotesAngle;

  return [{
    type: 'show_notes',
    platform: 'general',
    title: 'Show Notes',
    content: JSON.stringify({ ...parsed, resources: cleanedResources }, null, 2),
    metadata: {
      ui_metadata: buildUIMetadata('show_notes', theme.name),
      platform: 'Show Notes',  // Specific platform badge
      theme: theme.name,
      angle: finalShowNotesAngle,  // Main narrative angle (first sentence of summary or topic)
      ...parsed,
      resources: cleanedResources,  // Use cleaned resources
      themeId: theme.id,
      blockNumber: block.blockNumber
    }
  }];
}

// Quote Graphic Generator
// Rule: No "Quote #1" indexing. Output is ONLY verbatim quote text + speaker name.
async function generateQuoteGraphic(
  block: ContentBlock,
  analysis: ContentAnalysis,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string
): Promise<any[]> {
  const quotes = analysis.quotes.slice(0, 10);
  const quoteIndex = (block.blockNumber - 1) % quotes.length;
  const selectedQuote = quotes[quoteIndex];

  // Enforce word limit on quote (10-25 words for quote graphics)
  const limited = enforceContentLimit(selectedQuote?.text || 'No quote available', 'quote_graphic', true);

  const speaker = selectedQuote?.speaker || 'Unknown';

  // Quote Graphic output: ONLY the verbatim quote and speaker name
  // No "Quote #X" indexing - the title IS the quote itself
  return [{
    type: 'quote_graphic',
    platform: 'general',
    title: speaker,  // Title is just the speaker name
    content: limited.content,  // Content is the verbatim quote
    metadata: {
      ui_metadata: buildUIMetadata('quote_graphics', theme.name),
      platform: 'Quote Graphic',  // Specific platform badge
      theme: theme.name,
      speaker: speaker,  // Speaker attribution as sub-field
      quote_text: limited.content,  // Verbatim quote text
      themeId: theme.id,
      wasTruncated: limited.wasTruncated
    }
  }];
}

// Save generated content to database
const LEGACY_OUTPUT_TYPES = new Set<OutputType>([
  'blog_post',
  'social_post',
  // 'email_newsletter',  // Removed: Database doesn't support this type, use fallback instead
  'audiogram_clip',
  'quote_graphic',
  'show_notes'
]);

const OUTPUT_TYPE_FALLBACKS: Record<string, OutputType> = {
  twitter_thread: 'social_post',
  linkedin_post: 'social_post',
  instagram_caption: 'social_post',
  email_newsletter: 'social_post'  // Database doesn't allow email_newsletter, fallback to social_post
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
    .single() as { data: { user_id: string } | null };

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

  // Validate outputs before saving
  outputs.forEach((output, index) => {
    console.log(`[VALIDATION] Checking output #${index + 1}: ${output.type} (${output.metadata?.platform || 'no platform'})`);
    validateOutput(output);
  });

  const { error } = await supabaseAdmin
    .from('outputs')
    .insert(outputs as any);

  if (error) {
    console.error('[SAVE ERROR]:', error);
    throw new Error(`Failed to save content: ${error.message}`);
  }

  console.log(`[SAVE] 💾 Saved ${outputs.length} outputs to database`);
}
