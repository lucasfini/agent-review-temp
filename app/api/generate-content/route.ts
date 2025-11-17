import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  logConversationGeneration,
  logAnalysisResults,
  logContentGeneration,
  ConversationLogEntry
} from '@/lib/conversation-logger';
import { buildContentCacheKey, cacheGeneratedContent, getCachedGeneratedContent, hashTranscription } from '@/lib/content-cache';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { transcription, segments, selectedContentTypes, speakerData, forceRefresh, modelId, contentKeywords } = payload;

    if (!projectId || !transcription) {
      return NextResponse.json(
        { error: 'Project ID and transcription are required' },
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
      'gpt-4',
      'gpt-3.5-turbo'
    ]);
    const fallbackModel = 'gpt-4o'; // Updated to more modern default
    const modelToUse = modelId && supportedOpenAIModels.has(modelId) ? modelId : fallbackModel;
    
    if (modelId && modelToUse !== modelId) {
      warnings.push(`Requested model ${modelId} is not supported for OpenAI generation. Falling back to ${modelToUse}.`);
    }

    console.log(`Using AI model: ${modelToUse}`);

    // Default to all content types if none specified (backward compatibility)
    const contentTypes = selectedContentTypes || [
      'twitter_threads', 
      'linkedin_posts', 
      'instagram_content', 
      'blog_post', 
      'newsletter', 
      'show_notes', 
      'quote_graphics'
    ];

    console.log(`Starting content generation for project ${projectId}...`);
    console.log(`Selected content types:`, contentTypes);

    const transcriptionHash = hashTranscription(transcription);
    const keywordEntries = contentKeywords
      ? Object.entries(contentKeywords)
          .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''] as [string, string])
          .filter(([, value]) => value.length > 0)
      : [];

    const normalizedKeywordMap = keywordEntries.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value.trim();
      return acc;
    }, {});

    const keywordSignature = keywordEntries.length
      ? JSON.stringify(keywordEntries.sort(([a], [b]) => a.localeCompare(b)))
      : null;

    const cacheKey = buildContentCacheKey({ 
      projectId, 
      contentTypes, 
      transcriptionHash,
      modelId: modelToUse,
      keywordsSignature: keywordSignature
    });

    let analysis: ContentAnalysis | undefined;
    let generatedContent: any[] = [];
    let analysisTime = 0;
    let contentGenerationTime = 0;
    let fromCache = false;

    if (!forceRefresh) {
      const cached = await getCachedGeneratedContent(cacheKey);
      if (cached) {
        fromCache = true;
        analysis = cached.analysis as unknown as ContentAnalysis;
        generatedContent = cached.generatedContent || [];
        console.log(`[CONTENT CACHE] ✅ Hit for project ${projectId} (${contentTypes.join(', ')})`);
      }
    }

    if (!fromCache) {
      // Step 1: Analyze content for different categories
      const analysisStartTime = Date.now();
      analysis = await analyzeContent(transcription, modelToUse, userId, projectId);
      analysisTime = Date.now() - analysisStartTime;

      // Log analysis results
      await logAnalysisResults(projectId, transcription, analysis, analysisTime);

      // Step 2: Generate platform-specific content based on selection
      const contentStartTime = Date.now();
      generatedContent = await generatePlatformContentWithLogging(
        transcription,
        analysis,
        contentTypes,
        projectId,
        modelToUse,
        userId,
        Object.keys(normalizedKeywordMap).length ? normalizedKeywordMap : undefined
      );
      contentGenerationTime = Date.now() - contentStartTime;
    }

    // Ensure analysis is defined (should always be set by cache or generation)
    if (!analysis) {
      throw new Error('Analysis was not generated');
    }

    // Step 3: Save all generated content to database
    await saveGeneratedContent(projectId, generatedContent);

    if (!fromCache) {
      await cacheGeneratedContent({
        cacheKey,
        projectId,
        contentTypes,
        transcriptionHash,
        analysis: analysis as unknown as Record<string, unknown>,
        generatedContent
      });
    }

    const totalProcessingTime = Date.now() - startTime;
    
    // Step 4: Log the complete conversation generation process
    const conversationLog: ConversationLogEntry = {
      projectId,
      timestamp: new Date().toISOString(),
      transcriptionInfo: {
        originalLength: transcription.length,
        segmentCount: segments?.length || 0,
        speakerCount: speakerData?.speakers ? Object.keys(speakerData.speakers).length : 0,
        duration: segments ? Math.max(...segments.map((s: any) => s.endTime || s.end || 0)) : 0
      },
      speakerData: speakerData || { speakers: {}, segments: [] },
      analysis,
      generatedContent: generatedContent.map(content => ({
        ...content,
        generationTime: generatedContent.length > 0
          ? contentGenerationTime / generatedContent.length
          : 0
      })),
      processingMetadata: {
        totalProcessingTime,
        analysisTime,
        contentGenerationTime,
        errors,
        warnings
      }
    };
    
    await logConversationGeneration(conversationLog);

    console.log(`Content generation completed for project ${projectId} in ${totalProcessingTime}ms`);

    return NextResponse.json({
      success: true,
      projectId,
      analysis,
      contentPieces: generatedContent.length,
      processingTime: totalProcessingTime,
      cached: fromCache
    });

  } catch (error) {
    console.error('Content generation error:', error);
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    
    // Log the failed attempt
    try {
      const failedLog: ConversationLogEntry = {
        projectId: projectId || 'unknown',
        timestamp: new Date().toISOString(),
        transcriptionInfo: { originalLength: 0, segmentCount: 0, speakerCount: 0, duration: 0 },
        speakerData: { speakers: {}, segments: [] },
        analysis: { keyTopics: [], quotes: [], facts: [], opinions: [], humor: [], hooks: [], actionable_insights: [] },
        generatedContent: [],
        processingMetadata: {
          totalProcessingTime: Date.now() - startTime,
          analysisTime: 0,
          contentGenerationTime: 0,
          errors,
          warnings
        }
      };
      await logConversationGeneration(failedLog);
    } catch (logError) {
      console.error('Failed to log error state:', logError);
    }
    
    return NextResponse.json(
      { error: 'Content generation failed' },
      { status: 500 }
    );
  }
}

async function analyzeContent(
  transcription: string,
  model: string,
  userId?: string,
  projectId?: string
): Promise<ContentAnalysis> {
  const analysisPrompt = `
You are a content analysis expert. Analyze this podcast transcription and return ONLY a valid JSON object with this exact structure:

{
  "keyTopics": ["topic1", "topic2", "topic3"],
  "quotes": [{"text": "quote text", "speaker": "speaker name or unknown"}],
  "facts": [{"text": "fact statement", "context": "context"}],
  "opinions": [{"text": "opinion statement", "controversy_level": 5}],
  "humor": [{"text": "funny moment", "type": "joke"}],
  "hooks": [{"text": "attention grabbing statement", "hook_strength": 8}],
  "actionable_insights": [{"text": "practical advice", "value": 7}]
}

IMPORTANT:
- Return ONLY the JSON object, no other text
- If transcription is placeholder/demo content, create realistic sample data
- Rate controversy_level, hook_strength, and value from 1-10

Transcription:
${transcription}
`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{
      role: 'system',
      content: 'You are a JSON-only response generator. Return only valid JSON, no explanations or other text.'
    }, {
      role: 'user',
      content: analysisPrompt
    }],
    temperature: 0.3,
    max_tokens: 4000, // Increase token limit to prevent truncation
  });

  // Track usage and billing
  if (userId) {
    try {
      await trackOpenAIUsage({
        userId,
        projectId,
        response,
        modelName: model,
        purpose: 'Content Analysis',
        metadata: {
          transcriptLength: transcription.length,
        },
        shouldDebit: false, // Don't debit yet - will batch later
      });
    } catch (billingError) {
      console.error('[CONTENT GEN] Billing tracking failed for analysis:', billingError);
    }
  }

  let jsonContent = '';
  
  try {
    const content = response?.choices[0]?.message?.content || '{}';
    console.log('Raw OpenAI response length:', content.length);
    
    // Multiple strategies to extract and fix JSON
    jsonContent = content;
    
    // Strategy 1: Find JSON object boundaries
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }
    
    // Strategy 2: Try to fix common truncation issues
    if (!jsonContent.endsWith('}')) {
      console.log('JSON appears truncated, attempting to fix...');
      
      // Find the last complete field
      const lastCompleteField = jsonContent.lastIndexOf('"}');
      if (lastCompleteField > -1) {
        jsonContent = jsonContent.substring(0, lastCompleteField + 2) + ']}';
      }
      
      // Close any remaining open braces
      const openBraces = (jsonContent.match(/\{/g) || []).length;
      const closeBraces = (jsonContent.match(/\}/g) || []).length;
      const missingBraces = openBraces - closeBraces;
      
      for (let i = 0; i < missingBraces; i++) {
        jsonContent += '}';
      }
    }
    
    console.log('Attempting to parse JSON of length:', jsonContent.length);
    return JSON.parse(jsonContent);
    
  } catch (error) {
    console.error('Failed to parse analysis JSON:', error);
    console.log('Raw response:', response?.choices[0]?.message?.content);
    console.log('Processed JSON content:', jsonContent);
    
    // Try one more time with a simpler approach - extract individual fields
    try {
      const content = response?.choices[0]?.message?.content || '{}';
      const fallbackData: any = {
        keyTopics: [],
        quotes: [],
        facts: [],
        opinions: [],
        humor: [],
        hooks: [],
        actionable_insights: []
      };
      
      // Extract individual fields using regex (without 's' flag for broader compatibility)
      const topicsMatch = content.match(/"keyTopics":\s*\[([\s\S]*?)\]/);
      if (topicsMatch) {
        try {
          fallbackData.keyTopics = JSON.parse('[' + topicsMatch[1] + ']');
        } catch {}
      }
      
      const quotesMatch = content.match(/"quotes":\s*\[([\s\S]*?)\]/);
      if (quotesMatch) {
        try {
          fallbackData.quotes = JSON.parse('[' + quotesMatch[1] + ']');
        } catch {}
      }
      
      return fallbackData;
      
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);
      
      // Final fallback data
      return {
        keyTopics: ["podcast content", "discussion topics", "main themes"],
        quotes: [{"text": "This is an interesting point about the subject", "speaker": "host"}],
        facts: [{"text": "Important data point from the discussion", "context": "research findings"}],
        opinions: [{"text": "Strong viewpoint expressed in the podcast", "controversy_level": 5}],
        humor: [{"text": "Entertaining moment from the conversation", "type": "anecdote"}],
        hooks: [{"text": "Surprising revelation that catches attention", "hook_strength": 8}],
        actionable_insights: [{"text": "Practical advice listeners can implement", "value": 7}]
      };
    }
  }
}

async function generatePlatformContentWithLogging(
  transcription: string,
  analysis: ContentAnalysis,
  selectedTypes: string[],
  projectId: string,
  model: string,
  userId?: string,
  contentKeywords?: Record<string, string>
) {
  const contentPromises = [];

  // Only generate selected content types
  if (selectedTypes.includes('twitter_threads')) {
    contentPromises.push(
      generateTwitterThreadsWithLogging(
        transcription,
        analysis,
        projectId,
        model,
        userId,
        contentKeywords?.twitter_threads
      )
    );
  }
  
  if (selectedTypes.includes('linkedin_posts')) {
    contentPromises.push(
      generateLinkedInPostsWithLogging(
        transcription,
        analysis,
        projectId,
        model,
        userId,
        contentKeywords?.linkedin_posts
      )
    );
  }

  if (selectedTypes.includes('instagram_content')) {
    contentPromises.push(
      generateInstagramContentWithLogging(
        transcription,
        analysis,
        projectId,
        model,
        userId,
        contentKeywords?.instagram_content
      )
    );
  }

  if (selectedTypes.includes('blog_post')) {
    contentPromises.push(
      generateBlogPostWithLogging(
        transcription,
        analysis,
        projectId,
        model,
        userId,
        contentKeywords?.blog_post
      )
    );
  }

  if (selectedTypes.includes('newsletter')) {
    contentPromises.push(
      generateNewsletterContentWithLogging(
        transcription,
        analysis,
        projectId,
        model,
        userId,
        contentKeywords?.newsletter
      )
    );
  }

  if (selectedTypes.includes('show_notes')) {
    contentPromises.push(
      generateShowNotesWithLogging(
        transcription,
        analysis,
        projectId,
        model,
        userId,
        contentKeywords?.show_notes
      )
    );
  }

  if (selectedTypes.includes('quote_graphics')) {
    contentPromises.push(
      generateQuoteGraphicsWithLogging(
        analysis,
        projectId,
        contentKeywords?.quote_graphics
      )
    );
  }

  console.log(`Generating ${contentPromises.length} content types...`);
  
  try {
    const results = await Promise.all(contentPromises);
    const allContent = results.flat();
    console.log(`Content generation completed. Generated ${allContent.length} total pieces:`);
    
    // Log breakdown by platform
    const breakdown = allContent.reduce((acc, item) => {
      const platform = item.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('Content breakdown by platform:', breakdown);
    
    return allContent;
  } catch (error) {
    console.error('Error during content generation:', error);
    throw error;
  }
}

async function generateTwitterThreads(
  transcription: string,
  analysis: ContentAnalysis,
  model: string,
  userId?: string,
  projectId?: string,
  keywords?: string
) {
  const hooks = analysis.hooks.sort((a, b) => b.hook_strength - a.hook_strength).slice(0, 4);
  
  // Ensure we have at least 4 hooks by creating fallbacks if needed
  const allHooks = [...hooks];
  while (allHooks.length < 4) {
    allHooks.push({
      text: analysis.keyTopics[allHooks.length % analysis.keyTopics.length] || "Interesting podcast insights",
      hook_strength: 6
    });
  }
  
  const threads = [];
  console.log(`Generating 4 X threads (${hooks.length} from analysis, ${4 - hooks.length} fallbacks)...`);
  
  for (let i = 0; i < 4; i++) {
    const hook = allHooks[i];
    const keywordInstruction = keywords
      ? `\nFocus on incorporating these listener priorities or keywords when relevant: ${keywords}\n`
      : '';

    const prompt = `
Create a Twitter/X thread (6-8 tweets) starting with this hook: "${hook.text}"

${keywordInstruction}
Requirements:
- First tweet MUST be an attention-grabbing hook
- Each tweet under 280 characters
- Include relevant insights from the transcription
- End with a call-to-action
- Use thread format (1/8, 2/8, etc.)
- Include 2-3 relevant hashtags in the last tweet

Context from podcast: ${transcription.substring(0, 2000)}...
`;

    // Retry logic for OpenAI API calls
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1000,
        });

        // Track usage and billing
        if (userId && response) {
          try {
            await trackOpenAIUsage({
              userId,
              projectId,
              response,
              modelName: model,
              purpose: `Twitter Thread ${i + 1}`,
              metadata: {
                threadNumber: i + 1,
                hookStrength: hook.hook_strength,
              },
              shouldDebit: false, // Don't debit yet - will batch later
            });
          } catch (billingError) {
            console.error('[CONTENT GEN] Billing tracking failed for Twitter thread:', billingError);
          }
        }

        break; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        console.error(`Twitter thread ${i + 1} generation attempt ${retryCount} failed:`, error);
        
        if (retryCount >= maxRetries) {
          // Final fallback content
          response = {
            choices: [{
              message: {
                content: `🧵 Thread ${i + 1}/4: ${hook.text}\n\n2/8 This insight comes from a fascinating podcast discussion about ${analysis.keyTopics[0] || 'key topics'}.\n\n3/8 The conversation revealed important perspectives that challenge conventional thinking.\n\n4/8 What makes this particularly interesting is how it connects to broader trends we're seeing.\n\n5/8 The practical implications are significant for anyone in this space.\n\n6/8 Key takeaway: Implementation requires both strategy and execution.\n\n7/8 This reminds us that sustainable change happens incrementally.\n\n8/8 What's your experience with this topic? Share your thoughts below! 👇\n\n#Podcast #Insights #Discussion`
              }
            }]
          };
          break;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    threads.push({
      type: 'social_post',
      platform: 'twitter',
      title: `X Thread #${i + 1}: ${hook.text.substring(0, 50)}...`,
      content: response?.choices[0]?.message?.content || '',
      metadata: { hook_strength: hook.hook_strength, thread_number: i + 1 }
    });
  }
  
  return threads;
}

async function generateLinkedInPosts(
  transcription: string,
  analysis: ContentAnalysis,
  model: string,
  userId?: string,
  projectId?: string,
  keywords?: string
) {
  const insights = analysis.actionable_insights.sort((a, b) => b.value - a.value).slice(0, 3);
  
  // Ensure we have at least 3 insights
  const allInsights = [...insights];
  while (allInsights.length < 3) {
    allInsights.push({
      text: analysis.keyTopics[allInsights.length % analysis.keyTopics.length] || "Key insight from the discussion",
      value: 7
    });
  }
  
  const posts = [];
  console.log(`Generating 3 LinkedIn posts (${insights.length} from analysis, ${3 - insights.length} fallbacks)...`);
  
  for (let i = 0; i < 3; i++) {
    const insight = allInsights[i];
    const keywordInstruction = keywords
      ? `\nPrioritize weaving in these themes or keywords where natural: ${keywords}\n`
      : '';

    const prompt = `
Create a LinkedIn post based on this insight: "${insight.text}"

${keywordInstruction}
Requirements:
- Professional tone but engaging
- 1300-1500 characters (LinkedIn sweet spot)
- Include a compelling opening hook
- Provide actionable value
- End with a question to drive engagement
- Include 3-5 relevant professional hashtags

Context: ${transcription.substring(0, 2000)}...
`;

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    });

    // Track usage and billing
    if (userId) {
      try {
        await trackOpenAIUsage({
          userId,
          projectId,
          response,
          modelName: model,
          purpose: `LinkedIn Post ${i + 1}`,
          metadata: {
            postNumber: i + 1,
            insightValue: insight.value,
          },
          shouldDebit: false,
        });
      } catch (billingError) {
        console.error('[CONTENT GEN] Billing tracking failed for LinkedIn post:', billingError);
      }
    }

    posts.push({
      type: 'social_post',
      platform: 'linkedin',
      title: `LinkedIn Post #${i + 1}: ${insight.text.substring(0, 50)}...`,
      content: response?.choices[0]?.message?.content || '',
      metadata: { insight_value: insight.value, post_number: i + 1 }
    });
  }
  
  return posts;
}

async function generateInstagramContent(
  transcription: string, 
  analysis: ContentAnalysis, 
  model: string,
  keywords?: string
) {
  const content = [];
  
  // Carousel posts with key takeaways
  const topicsCarousel = analysis.keyTopics.slice(0, 5);
  
  const keywordInstruction = keywords
    ? `\nIncorporate these keywords into captions or slide copy when appropriate: ${keywords}\n`
    : '';

  const carouselPrompt = `
Create an Instagram carousel post with ${topicsCarousel.length} slides based on these topics: ${topicsCarousel.join(', ')}

${keywordInstruction}
Requirements:
- Slide 1: Eye-catching title slide with main benefit
- Slides 2-${topicsCarousel.length + 1}: One key point per slide with explanation
- Each slide should be concise (max 50 words)
- Include relevant emojis
- Engaging caption (300-500 characters)
- 10-15 relevant hashtags

Context: ${transcription.substring(0, 1500)}...
`;

  const carouselResponse = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: carouselPrompt }],
    temperature: 0.7,
  });

  content.push({
    type: 'social_post',
    platform: 'instagram',
    title: 'Instagram Carousel: Key Takeaways',
    content: carouselResponse.choices[0].message.content || '',
    metadata: { format: 'carousel', slides: topicsCarousel.length + 1 }
  });

  return content;
}

async function generateBlogPost(
  transcription: string, 
  analysis: ContentAnalysis, 
  model: string,
  keywords?: string
) {
  const keywordInstruction = keywords
    ? `\nBlend in these SEO or messaging keywords naturally: ${keywords}\n`
    : '';

  const prompt = `
Create a comprehensive blog post (3000+ words) based on this podcast transcription.

${keywordInstruction}
Structure:
1. SEO-optimized title
2. Compelling introduction with hook
3. Table of contents
4. Main sections covering key topics: ${analysis.keyTopics.join(', ')}
5. Key quotes and insights throughout
6. Actionable takeaways section
7. Conclusion with CTA
8. Meta description (160 characters)

Requirements:
- SEO-optimized with headers (H1, H2, H3)
- Include key statistics and facts
- Natural keyword integration
- Engaging, conversational tone
- Bullet points and numbered lists for readability

Transcription: ${transcription}
`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
  });

  return [{
    type: 'blog_post',
    platform: 'general',
    title: 'SEO Blog Post',
    content: response?.choices[0]?.message?.content || '',
    metadata: { word_count: response?.choices[0]?.message?.content?.split(' ').length || 0 }
  }];
}

async function generateNewsletterContent(
  transcription: string, 
  analysis: ContentAnalysis, 
  model: string,
  keywords?: string
) {
  const keywordInstruction = keywords
    ? `\nHighlight these strategic keywords in subject line or body copy when it makes sense: ${keywords}\n`
    : '';

  const prompt = `
Create newsletter content based on this podcast episode.

${keywordInstruction}
Structure:
1. Subject line (50 characters, high open rate)
2. Opening hook
3. Key insights (3-4 bullet points)
4. Featured quote
5. Actionable tip
6. CTA to listen to full episode
7. P.S. with additional value

Tone: Conversational, valuable, concise
Length: 500-700 words

Key insights to include: ${analysis.actionable_insights.slice(0, 4).map(i => i.text).join(', ')}
`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
  });

  return [{
    type: 'newsletter',
    platform: 'general',
    title: 'Newsletter Content',
    content: response?.choices[0]?.message?.content || '',
    metadata: { format: 'email_newsletter' }
  }];
}

async function generateShowNotes(
  transcription: string, 
  analysis: ContentAnalysis, 
  model: string,
  keywords?: string
) {
  const keywordInstruction = keywords
    ? `\nEnsure the summary references these focus keywords/topics where relevant: ${keywords}\n`
    : '';

  const prompt = `
Create detailed show notes for this podcast episode.

${keywordInstruction}
Structure:
1. Episode summary (2-3 sentences)
2. Key topics discussed with timestamps (estimate based on content)
3. Quotes and key insights
4. Resources mentioned
5. Guest information (if applicable)
6. Action items for listeners

Format: Clean, organized, easy to scan

Transcription: ${transcription.substring(0, 3000)}...
Key topics: ${analysis.keyTopics.join(', ')}
`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
  });

  return [{
    type: 'show_notes',
    platform: 'general',
    title: 'Episode Show Notes',
    content: response?.choices[0]?.message?.content || '',
    metadata: { format: 'show_notes' }
  }];
}

async function generateQuoteGraphics(analysis: ContentAnalysis, keywords?: string) {
  let topQuotes = analysis.quotes.slice(0, 2);
  if (keywords) {
    const keywordList = keywords.toLowerCase().split(' ').filter(Boolean);
    const matchedQuotes = analysis.quotes.filter(quote =>
      keywordList.some(keyword => quote.text.toLowerCase().includes(keyword))
    );
    if (matchedQuotes.length) {
      topQuotes = matchedQuotes.slice(0, 2);
    }
  }
  
  return topQuotes.map((quote, index) => ({
    type: 'quote_graphic',
    platform: 'instagram',
    title: `Quote Graphic #${index + 1}`,
    content: quote.text,
    metadata: { 
      quote_length: quote.text.length,
      speaker: quote.speaker || 'Unknown',
      graphic_style: 'minimal_modern'
    }
  }));
}

async function saveGeneratedContent(projectId: string, contentPieces: any[]) {
  // First, fetch the project to get user_id
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    throw new Error('Project not found');
  }

  const inserts = contentPieces.map(piece => ({
    project_id: projectId,
    user_id: project.user_id,
    type: piece.type,
    platform: piece.platform,
    title: piece.title,
    content: piece.content,
    metadata: piece.metadata,
    status: 'generated',
    word_count: piece.content ? piece.content.split(/\s+/).length : 0,
    character_count: piece.content ? piece.content.length : 0
  }));

  const { error } = await supabaseAdmin
    .from('outputs')
    .insert(inserts);

  if (error) {
    console.error('Failed to save generated content:', error);
    throw new Error('Failed to save content to database');
  }
}

// Logging wrapper functions for content generation

async function generateTwitterThreadsWithLogging(
  transcription: string,
  analysis: ContentAnalysis,
  projectId: string,
  model: string,
  userId?: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateTwitterThreads(transcription, analysis, model, userId, projectId, keywords);
    const processingTime = Date.now() - startTime;
    
    // Log each thread separately
    for (let i = 0; i < result.length; i++) {
      const thread = result[i];
      await logContentGeneration(
        projectId,
        'twitter',
        `thread_${i + 1}`,
        `X thread hook: ${analysis.hooks[i]?.text || 'Generated hook'}`,
        thread.content,
        thread.metadata,
        processingTime / result.length
      );
    }
    
    return result;
  } catch (error) {
    console.error('Twitter threads generation failed:', error);
    return [];
  }
}

async function generateLinkedInPostsWithLogging(
  transcription: string,
  analysis: ContentAnalysis,
  projectId: string,
  model: string,
  userId?: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateLinkedInPosts(transcription, analysis, model, userId, projectId, keywords);
    const processingTime = Date.now() - startTime;
    
    for (let i = 0; i < result.length; i++) {
      const post = result[i];
      await logContentGeneration(
        projectId,
        'linkedin',
        `post_${i + 1}`,
        `LinkedIn insight: ${analysis.actionable_insights[i]?.text || 'Generated insight'}`,
        post.content,
        post.metadata,
        processingTime / result.length
      );
    }
    
    return result;
  } catch (error) {
    console.error('LinkedIn posts generation failed:', error);
    return [];
  }
}

async function generateInstagramContentWithLogging(
  transcription: string, 
  analysis: ContentAnalysis, 
  projectId: string, 
  model: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateInstagramContent(transcription, analysis, model, keywords);
    const processingTime = Date.now() - startTime;
    
    await logContentGeneration(
      projectId,
      'instagram',
      'carousel_post',
      `Instagram carousel with topics: ${analysis.keyTopics.slice(0, 5).join(', ')}`,
      result[0]?.content || '',
      result[0]?.metadata || {},
      processingTime
    );
    
    return result;
  } catch (error) {
    console.error('Instagram content generation failed:', error);
    return [];
  }
}

async function generateBlogPostWithLogging(
  transcription: string, 
  analysis: ContentAnalysis, 
  projectId: string, 
  model: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateBlogPost(transcription, analysis, model, keywords);
    const processingTime = Date.now() - startTime;
    
    await logContentGeneration(
      projectId,
      'general',
      'blog_post',
      `Blog post covering: ${analysis.keyTopics.join(', ')}`,
      result[0]?.content || '',
      result[0]?.metadata || {},
      processingTime
    );
    
    return result;
  } catch (error) {
    console.error('Blog post generation failed:', error);
    return [];
  }
}

async function generateNewsletterContentWithLogging(
  transcription: string, 
  analysis: ContentAnalysis, 
  projectId: string, 
  model: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateNewsletterContent(transcription, analysis, model, keywords);
    const processingTime = Date.now() - startTime;
    
    await logContentGeneration(
      projectId,
      'general',
      'newsletter',
      `Newsletter with insights: ${analysis.actionable_insights.slice(0, 4).map(i => i.text).join(', ')}`,
      result[0]?.content || '',
      result[0]?.metadata || {},
      processingTime
    );
    
    return result;
  } catch (error) {
    console.error('Newsletter content generation failed:', error);
    return [];
  }
}

async function generateShowNotesWithLogging(
  transcription: string, 
  analysis: ContentAnalysis, 
  projectId: string, 
  model: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateShowNotes(transcription, analysis, model, keywords);
    const processingTime = Date.now() - startTime;
    
    await logContentGeneration(
      projectId,
      'general',
      'show_notes',
      `Show notes for topics: ${analysis.keyTopics.join(', ')}`,
      result[0]?.content || '',
      result[0]?.metadata || {},
      processingTime
    );
    
    return result;
  } catch (error) {
    console.error('Show notes generation failed:', error);
    return [];
  }
}

async function generateQuoteGraphicsWithLogging(
  analysis: ContentAnalysis, 
  projectId: string,
  keywords?: string
) {
  const startTime = Date.now();
  try {
    const result = await generateQuoteGraphics(analysis, keywords);
    const processingTime = Date.now() - startTime;
    
    for (let i = 0; i < result.length; i++) {
      const quote = result[i];
      await logContentGeneration(
        projectId,
        'instagram',
        `quote_graphic_${i + 1}`,
        'Quote graphic generation',
        quote.content,
        quote.metadata,
        processingTime / result.length
      );
    }
    
    return result;
  } catch (error) {
    console.error('Quote graphics generation failed:', error);
    return [];
  }
}
