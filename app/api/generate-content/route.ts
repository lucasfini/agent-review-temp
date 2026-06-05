import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { aiRatelimit } from '@/lib/rate-limit';
import { normalizeCustomGuidance, type ContentBlock, type OutputType } from '@/lib/content-types';
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
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { createReservation, failReservation, settleReservationAmount } from '@/lib/billing/credit';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import { estimateContentBlocksCostAsync } from '@/lib/billing/cost-map';
import { isDemoUser } from '@/lib/demo-mode';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import {
  runEntitlementGuard,
  shouldEnforceSubscriptionEntitlements,
} from '@/lib/billing/entitlement-guards';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';

/**
 * Parse JSON response from AI, stripping markdown code fences and conversational filler
 */
function parseAIResponse(content: string): any {
  let cleaned = content.trim();

  // 1. Try to find JSON block if conversational text exists
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  // Determine which structure starts first (object or array)
  let start = -1;
  let end = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = lastBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = lastBracket;
  }

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  // 2. Strip markdown code fences if still present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[PARSE] Failed to parse JSON:', error);
    console.error('[PARSE] Raw content preview:', content.substring(0, 500));
    throw error;
  }
}

/**
 * Robustly extract a field from a parsed JSON object even if the key is slightly different
 */
function resilientGet(obj: any, preferredKey: string, synonyms: string[] = []): any {
  if (!obj || typeof obj !== 'object') return undefined;

  // 1. Try preferred key
  if (obj[preferredKey] !== undefined) return obj[preferredKey];

  // 2. Try synonyms
  for (const synonym of synonyms) {
    if (obj[synonym] !== undefined) return obj[synonym];
  }

  // 3. Try case-insensitive search
  const lowerPreferred = preferredKey.toLowerCase();
  const lowerSynonyms = synonyms.map(s => s.toLowerCase());

  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerPreferred || lowerSynonyms.includes(lowerKey)) {
      return obj[key];
    }
  }

  return undefined;
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
    'quote_graphics': 'Quote Graphic',
    'facebook_post': 'Facebook Post',
    'youtube_description': 'YouTube Description',
    'podcast_episode_description': 'Podcast Description',
    'short_form_video_script': 'Video Script'
  };
  return badges[contentTypeId] || 'General';
}

/**
 * Get platform badge color for UI
 */
function getBadgeColor(contentTypeId: string): string {
  const colors: Record<string, string> = {
    'twitter_threads': '#000000',              // X (black)
    'linkedin_posts': '#0077B5',               // LinkedIn blue
    'instagram_content': '#E1306C',            // Instagram pink
    'blog_post': '#4F46E5',                    // Blog indigo
    'newsletter': '#EA4335',                   // Email red
    'show_notes': '#6366F1',                   // Show Notes purple
    'quote_graphics': '#F59E0B',               // Quote Graphic amber/gold
    'facebook_post': '#1877F2',                // Facebook blue
    'youtube_description': '#FF0000',          // YouTube red
    'podcast_episode_description': '#8B5CF6',  // Podcast violet
    'short_form_video_script': '#EC4899'       // Video Script pink
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
  // Check for empty content
  if (!output.content || (typeof output.content === 'string' && output.content.trim().length === 0)) {
    console.error('[VALIDATION] ❌ Empty content detected for output type:', output.type);
    throw new Error(`Generated content for ${output.type} is empty.`);
  }

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

function buildThemeGuidance(theme: ContentTheme, platformLabel: string): string {
  const examplePhrases = theme.examplePhrases?.length
    ? theme.examplePhrases.slice(0, 3).map((phrase) => `"${phrase}"`).join(', ')
    : '';
  const psychologyTriggers = theme.psychologyTriggers?.length
    ? theme.psychologyTriggers.join(', ')
    : '';

  return `=== THEME ADAPTATION (${theme.name}) ===
Theme position: ${theme.description}
Primary instruction: ${theme.promptModifier}
Execution guidelines: ${theme.contentGuidelines}
Desired reader response: ${psychologyTriggers || 'Clarity and engagement'}
Keep the ${platformLabel} unmistakably in this voice from the opening line through the CTA.
${examplePhrases ? `Use phrasing energy similar to: ${examplePhrases}` : ''}

=== THEME QUALITY BAR ===
- The theme must change diction, rhythm, framing, and CTA style, not just swap a few adjectives
- Keep the platform-native format intact while expressing the selected voice
- If the selected theme conflicts with the platform, preserve platform structure but adapt tone within it`;
}

function formatList(items: string[], bullet: string = '-'): string {
  return items
    .map((item) => item?.trim())
    .filter(Boolean)
    .map((item) => `${bullet} ${item}`)
    .join('\n');
}

function buildDocument(sections: Array<{ heading: string; body?: string | string[] }>): string {
  return sections
    .map((section) => {
      if (!section.body) return '';
      const body = Array.isArray(section.body)
        ? formatList(section.body)
        : section.body.trim();
      if (!body) return '';
      return `${section.heading}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatHashtags(rawHashtags: any, fallbackContent: string = ''): string[] {
  const values = Array.isArray(rawHashtags) ? rawHashtags : [];
  const tags = values
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`);

  if (tags.length > 0) return tags;

  return fallbackContent
    .split(/\s+/)
    .filter((part) => part.startsWith('#'))
    .map((part) => part.replace(/[^\w#]/g, ''))
    .filter(Boolean);
}

interface MasterPromptParams {
  angle: string;
  themeName: string;
  cleanedSummary: string;
  platformLabel: string;
  badgeColor: string;
  platformStructure: string;
  outputSchema: string;
  additionalContext?: string;
  customGuidance?: string;
  outputStyleModifier?: string;
}

function buildCustomGuidanceSection(customGuidance?: string, platformLabel?: string): string {
  const normalized = normalizeCustomGuidance(customGuidance);
  if (!normalized) return '';

  return `=== USER GUIDANCE ===
User request for this ${platformLabel || 'output'}:
${normalized}

Follow this guidance as a high-priority instruction when it is compatible with the transcript, platform format, and quality bar.
- Keep all claims grounded in the transcript
- Do not invent facts, quotes, names, or outcomes
- Do not break required structure or length limits
- If this guidance conflicts with the selected theme, preserve the theme where possible but prioritize the user's request`;
}

/**
 * Build Master Prompt for content generation
 * Universal prompt template with ad-blocking, single-angle enforcement, and platform requirements
 */
function buildMasterPrompt(params: MasterPromptParams): string {
  const { angle, themeName, cleanedSummary, platformLabel, badgeColor, platformStructure, outputSchema, additionalContext, customGuidance, outputStyleModifier } = params;

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
- Make the piece feel complete on first read: strong opening, clean middle structure, specific close

${additionalContext || ''}
${buildCustomGuidanceSection(customGuidance, platformLabel)}
${outputStyleModifier ? `\n=== OUTPUT STYLE MODIFIER ===\n${outputStyleModifier}\n` : ''}

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
      } else if (metadata.originalOutputType === 'facebook_post' || output.type === 'facebook_post') {
        contentTypeId = 'facebook_post';
      } else if (metadata.originalOutputType === 'youtube_description' || output.type === 'youtube_description') {
        contentTypeId = 'youtube_description';
      } else if (metadata.originalOutputType === 'podcast_episode_description' || output.type === 'podcast_episode_description') {
        contentTypeId = 'podcast_episode_description';
      } else if (metadata.originalOutputType === 'short_form_video_script' || output.type === 'short_form_video_script') {
        contentTypeId = 'short_form_video_script';
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
  projectId?: string,
  openaiApiKey?: string
): Promise<string[]> {
  console.log(`[STORY ANGLES] 🎯 Identifying distinct narrative angles using ${model}...`);

  try {
    const result = await getAICompletion({
      model,
      temperature: 0.2,
      maxTokens: 8000,
      responseFormat: { type: "json_object" },
      openaiApiKey,
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

    // Use resilientGet to find the angles array even if the key is slightly different
    const angles = resilientGet(parsed, 'angles', ['narrative_angles', 'stories', 'narratives', 'topics']) || [];

    console.log(`[STORY ANGLES] ✅ Identified ${angles.length} angles:`, angles);

    // Fallback if we don't get 3 angles
    if (angles.length < 3) {
      console.warn('[STORY ANGLES] ⚠️ Less than 3 angles found, using generic fallbacks');
      while (angles.length < 3) {
        // Only push if not already present
        const fallback = [`Key Narrative ${angles.length + 1}`, 'Main Narrative', 'Key Debate', 'Critical Insight'][angles.length];
        angles.push(fallback);
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
  let contentReservationId: string | undefined;
  let savedOutputIds: string[] = [];

  try {
    // Auth: internal maintenance requests or authenticated users only
    const isMaintenance = isAuthorizedMaintenanceRequest(request);

    if (!isMaintenance) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const { data: { user } } = await supabaseAdmin.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await request.json();
    projectId = payload.projectId;
    const { transcription, segments, blocks, speakerData, modelId, outputStyleModifier } = payload;

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

    let userId: string;
    let projectOrganizationId: string | null = null;
    if (!isMaintenance) {
      try {
        const ownership = await requireProjectOwner<{
          user_id: string;
          organization_id: string | null;
        }>(
          request,
          projectId,
          'id, user_id, organization_id'
        );
        userId = ownership.project.user_id;
        projectOrganizationId = ownership.project.organization_id;
      } catch (error) {
        if (error instanceof RouteAccessError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    } else {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('user_id, organization_id')
        .eq('id', projectId)
        .single() as { data: { user_id: string; organization_id: string | null } | null };

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
      userId = project.user_id;
      projectOrganizationId = project.organization_id;
    }

    if (!isMaintenance && userId) {
      const { success } = await aiRatelimit.limit(userId);
      if (!success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded for AI operations. Please wait a moment.' },
          { status: 429 }
        );
      }
    }

    const openaiApiKey = await getOpenAIApiKeyForUser(userId || undefined);

    // Demo account guard
    if (userId) {
      const { data: { user: projectUser } } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (isDemoUser(projectUser)) {
        return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
      }
    }

    if (!projectOrganizationId && !isMaintenance && shouldEnforceSubscriptionEntitlements()) {
      projectOrganizationId = await resolveOrganizationIdForWrite(userId);
    }

    const estimatedGenerationCost = await estimateContentBlocksCostAsync(
      blocks
        .filter((block: ContentBlock) => block.enabled !== false)
        .map((block: ContentBlock) => block.contentTypeId)
    );
    if (userId && estimatedGenerationCost > 0) {
      const entitlementGuard = await runEntitlementGuard({
        organizationId: projectOrganizationId || null,
        legacyUserId: userId,
        action: 'content_generation',
        requestedAmount: blocks.filter((block: ContentBlock) => block.enabled !== false).length,
        allowHardBlock: !isMaintenance,
        logContext: {
          route: 'app/api/generate-content',
          userId,
          projectId,
          metadata: {
            estimatedGenerationCost,
            blockCount: blocks.length,
            isMaintenance,
          },
        },
      });
      if (entitlementGuard.response) {
        return entitlementGuard.response;
      }

      const estimatedHold = estimateReservationAmount(estimatedGenerationCost, 'content_generation');
      await requireCredits(userId, estimatedHold);
      const reservation = await createReservation({
        userId,
        projectId,
        workflowType: 'content_generation',
        amount: estimatedHold,
        metadata: {
          estimatedCost: estimatedGenerationCost,
          blockIds: blocks.map((block: ContentBlock) => block.contentTypeId),
          blockCount: blocks.length,
        },
        expiresAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
      });
      contentReservationId = reservation.id;
    }

    // Use selected model or default to GPT-5 mini
    const modelToUse = modelId || 'gpt-5-mini';
    if (!modelToUse.startsWith('gpt-') && !modelToUse.startsWith('o1-')) {
      return NextResponse.json(
        { error: `Model ${modelToUse} is not enabled for billable content generation` },
        { status: 400 }
      );
    }

    console.log(`[GENERATION] 🚀 Starting Universal Content Engine for project ${projectId}`);
    console.log(`[GENERATION] 📦 Processing ${blocks.length} blocks with ${modelToUse}`);

    // Initialize progress tracking
    await initializeGenerationProgress(projectId, blocks.length);

    // Step 1: Pre-process transcript to extract signal and filter noise
    const preProcessStartTime = Date.now();
    const preProcessResult = await preProcessTranscript(transcription, {
      speakerContext: speakerData,
      userId,
      projectId,
      apiKey: openaiApiKey || undefined,
    });
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
      projectId,
      openaiApiKey || undefined
    );
    const analysisTime = Date.now() - analysisStartTime;
    console.log(`[ANALYSIS] ✅ Completed in ${analysisTime}ms`);

    // Step 3: Get existing content counts for sequential numbering
    const existingCounts = await getExistingContentCounts(projectId);
    console.log(`[COUNTS] 📊 Existing content counts:`, existingCounts);

    // Step 4: Generate content for each enabled block
    const contentStartTime = Date.now();
    const generatedContent: any[] = [];
    const usageEventIds: string[] = [];
    let totalBilledCost = 0;
    let savedContentCount = 0;

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
        const blockResult = await generateBlockContent(
          { ...block, blockNumber: actualBlockNumber },
          transcription,
          analysis,
          narrativeMetadata,
          modelToUse,
          userId,
          projectId,
          openaiApiKey || undefined,
          outputStyleModifier || undefined
        );
        generatedContent.push(...blockResult.content);

        // Persist each completed block immediately so realtime output updates
        // can populate the content tab before the full run finishes.
        const savedIds = await saveGeneratedContent(projectId, blockResult.content);
        savedOutputIds.push(...savedIds);
        savedContentCount += savedIds.length;

        // Track usage and cost
        if (blockResult.usageEventId) {
          usageEventIds.push(blockResult.usageEventId);
        }
        if (blockResult.billedCost > 0) {
          totalBilledCost += blockResult.billedCost;
        }

        // Update progress: Block completed
        await completeBlock(projectId, i + 1);
      } catch (error) {
        console.error(`[BLOCK ERROR] ❌ Failed to generate ${block.name}:`, error);
        errors.push(`Failed to generate ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const contentGenerationTime = Date.now() - contentStartTime;
    console.log(`[GENERATION] ✅ Completed ${generatedContent.length} pieces in ${contentGenerationTime}ms`);

    // Check if we actually generated anything
    if (generatedContent.length === 0) {
      const errorMsg = errors.length > 0 ? errors.join(' | ') : 'No content was generated.';
      console.error(`[GENERATION] ❌ FAILED: ${errorMsg}`);
      throw new Error(`Generation failed: ${errorMsg}`);
    }

    // Step 5: Debit credits now that we are sure block outputs were saved successfully
    if (contentReservationId) {
      try {
        await settleReservationAmount(contentReservationId, totalBilledCost, usageEventIds);
        console.log(`[BILLING] ✅ Settled reservation for $${totalBilledCost.toFixed(4)} across ${generatedContent.length} pieces of content`);
      } catch (billingError) {
        console.error('[BILLING ERROR] ❌ Failed to settle content reservation:', billingError);
        if (savedOutputIds.length > 0) {
          await supabaseAdmin
            .from('outputs')
            .delete()
            .in('id', savedOutputIds);
        }
        await failReservation(contentReservationId, 'Content generation settlement failed').catch((failError) => {
          console.error('[BILLING ERROR] ❌ Failed to fail content reservation after settlement error:', failError);
        });
        throw billingError;
      }
    }

    if (userId && savedContentCount > 0) {
      const outputIdempotencyKey = savedOutputIds.length
        ? `content_generation:outputs:${savedOutputIds.slice(0, 10).join(':')}`
        : `content_generation:project:${projectId}:${startTime}`;
      await recordSubscriptionUsage({
        organizationId: projectOrganizationId,
        userId,
        counterKey: 'content_generation',
        quantity: savedContentCount,
        idempotencyKey: contentReservationId
          ? `content_generation:reservation:${contentReservationId}`
          : outputIdempotencyKey,
        metadata: {
          source: 'generate_content',
          projectId,
          blockCount: blocks.length,
          savedContentCount,
          usageEventIds,
          reservationId: contentReservationId,
        },
        logContext: {
          route: 'app/api/generate-content',
          userId,
          projectId,
          source: 'content_generation',
        },
      });
    }

    // Mark generation as complete
    await completeGenerationProgress(projectId, blocks.length);

    const totalProcessingTime = Date.now() - startTime;
    console.log(`[COMPLETE] 🎉 Total time: ${totalProcessingTime}ms`);

    return NextResponse.json({
      success: true,
      projectId,
      contentPieces: savedContentCount,
      processingTime: totalProcessingTime,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    if (contentReservationId) {
      await failReservation(contentReservationId, error instanceof Error ? error.message : 'Content generation failed').catch((failError) => {
        console.error('[BILLING ERROR] ❌ Failed to fail content reservation after route error:', failError);
      });
    }
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) {
      return billingResponse;
    }
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
  projectId?: string,
  openaiApiKey?: string
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
    responseFormat: { type: "json_object" },
    openaiApiKey
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
  const parsed = parseAIResponse(content);

  // Use resilientGet for all analysis fields
  return {
    keyTopics: resilientGet(parsed, 'keyTopics', ['topics', 'main_topics', 'subjects']) || [],
    quotes: resilientGet(parsed, 'quotes', ['quotations', 'notable_quotes']) || [],
    facts: resilientGet(parsed, 'facts', ['data_points', 'information']) || [],
    opinions: resilientGet(parsed, 'opinions', ['perspectives', 'debates']) || [],
    humor: resilientGet(parsed, 'humor', ['jokes', 'funny_moments']) || [],
    hooks: resilientGet(parsed, 'hooks', ['angles', 'attention_grabbers']) || [],
    actionable_insights: resilientGet(parsed, 'actionable_insights', ['takeaways', 'insights', 'tips']) || []
  };
}

// Generate content for a single block
async function generateBlockContent(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
  model: string,
  userId?: string,
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  const theme = getThemeById(block.theme);
  if (!theme) {
    throw new Error(`Theme not found: ${block.theme}`);
  }

  let result: { content: any[], usageEventId?: string, billedCost: number };

  switch (block.contentTypeId) {
    case 'twitter_threads':
      result = await generateTwitterThread(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'linkedin_posts':
      result = await generateLinkedInPost(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'instagram_content':
      result = await generateInstagramCarousel(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'blog_post':
      result = await generateBlogPost(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'newsletter':
      result = await generateNewsletter(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'show_notes':
      result = await generateShowNotes(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'quote_graphics':
      result = await generateQuoteGraphic(block, analysis, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'facebook_post':
      result = await generateFacebookPost(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'youtube_description':
      result = await generateYoutubeDescription(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'podcast_episode_description':
      result = await generatePodcastEpisodeDescription(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    case 'short_form_video_script':
      result = await generateShortFormVideoScript(block, transcription, analysis, narrativeMetadata, theme, model, userId, projectId, openaiApiKey, outputStyleModifier);
      break;
    default:
      throw new Error(`Unknown content type: ${block.contentTypeId}`);
  }

  const customGuidance = normalizeCustomGuidance(block.customGuidance);
  if (customGuidance) {
    result.content = result.content.map((item) => ({
      ...item,
      metadata: {
        ...(item.metadata || {}),
        customGuidance,
      },
    }));
  }

  return result;
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
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  // Step 1: Get 3 distinct story angles from cleaned summary
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription.substring(0, 10000);
  const storyAngles = await getStoryAngles(cleanedSummary, model, userId, projectId, openaiApiKey);

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

  const additionalContext = `${buildThemeGuidance(theme, 'X Thread')}

=== TECHNICAL CONSTRAINTS ===
- 6-8 tweets total
- EACH TWEET: Maximum 280 characters (HARD LIMIT)
- Include 2-3 hashtags ONLY in last tweet
- Use line breaks within tweets for readability
- One-sentence paragraphs for mobile readability

=== QUALITY TARGET ===
- Thread must feel publish-ready with escalating momentum from post 1 to final CTA
- Each post should carry one clear job: hook, proof, contrast, implication, action`;

  const prompt = buildMasterPrompt({
    angle: selectedAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'X Thread',
    badgeColor: '#000000',
    platformStructure: '6-8 posts. Narrative arc: Hook → Evidence → Synthesis → CTA.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
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
    maxTokens: 16000,
    responseFormat: { type: "json_object" },
    openaiApiKey
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

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `X Thread (${theme.name})`,
      shouldDebit: false, // Save first
      strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"tweets":[]}';
  const parsed = parseAIResponse(content);

  // Use resilientGet for the tweets array even if keys are different
  let rawTweets = resilientGet(parsed, 'tweets', ['thread', 'posts', 'tweet_list', 'content']) || [];

  // Robust extraction of tweet content from individual objects
  let tweets = Array.isArray(rawTweets) ? rawTweets.map((t: any, index: number) => {
    if (typeof t === 'string') return { tweet: t, position: index + 1 };
    return {
      tweet: resilientGet(t, 'tweet', ['text', 'content', 'post']) || '',
      position: t.position || index + 1
    };
  }) : [];

  // Enforce 280 character limit
  tweets = tweets.map((t: any) => {
    const limited = enforceContentLimit(t.tweet || '', 'twitter_tweet', true);
    return {
      ...t,
      tweet: limited.content,
      wasTruncated: limited.wasTruncated
    };
  }).filter(t => t.tweet.trim().length > 0);

  if (tweets.length === 0) {
    console.error('[TWITTER THREAD] ❌ No valid tweets found in AI response:', content);
    throw new Error('AI failed to generate any valid tweets for the thread.');
  }

  // Format thread with clear post separators
  const formattedContent = tweets
    .map((t: any, index: number) => `[Post ${index + 1}/${tweets.length}]\n${t.tweet}`)
    .join('\n\n---\n\n');

  return {
    content: [{
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
    }],
    usageEventId,
    billedCost
  };
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
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
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

  const additionalContext = `${buildThemeGuidance(theme, 'LinkedIn Post')}

=== TECHNICAL CONSTRAINTS ===
- Length: 1,300-1,500 characters (HARD LIMIT)
- First 2 lines: Hook visible in collapsed view (must compel "see more" click)
- Use short paragraphs (1-2 sentences each)
- Professional but show personality
- End with engaging question to drive comments (max 2 rhetorical questions total)
- Include 3-5 relevant hashtags
- Use line breaks for scannability

=== QUALITY TARGET ===
- The post should read like a finished point of view, not notes pasted from a transcript
- Lead with tension or surprise, then deliver a clear takeaway readers can repeat`;

  const prompt = buildMasterPrompt({
    angle: linkedinAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'LinkedIn Post',
    badgeColor: '#0077B5',
    platformStructure: 'Hook-Value-CTA. No more than 2 rhetorical questions.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
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
    maxTokens: 16000,
    responseFormat: { type: "json_object" },
    openaiApiKey
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

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `LinkedIn Post (${theme.name})`,
      shouldDebit: false, // Save first
      strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"post":"","hashtags":[]}';
  const parsed = parseAIResponse(content);

  // Use resilientGet for the post content and hashtags
  const rawPost = resilientGet(parsed, 'post', ['content', 'text', 'post_body', 'body']) || '';
  const hashtags = formatHashtags(resilientGet(parsed, 'hashtags', ['tags', 'labels']) || [], rawPost);

  if (!rawPost || rawPost.trim().length === 0) {
    console.error('[LINKEDIN POST] ❌ No valid post content found in AI response:', content);
    throw new Error('AI failed to generate any valid content for the LinkedIn post.');
  }

  // Enforce character limit
  const limited = enforceContentLimit(rawPost, 'linkedin_post', true);

  return {
    content: [{
      type: 'linkedin_post',
      platform: 'linkedin',
      title: `LinkedIn Post #${block.blockNumber}: ${theme.name}`,
      content: buildDocument([
        { heading: 'OPENING', body: limited.content },
        { heading: 'HASHTAGS', body: hashtags.length ? hashtags.join(' ') : undefined }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('linkedin_posts', theme.name),
        platform: 'LinkedIn',  // Specific platform badge
        theme: theme.name,
        angle: insight.text || narrativeMetadata.main_topic || 'Professional Insight',  // Main narrative angle
        hashtags,
        insight: insight.text,  // Keep for backward compatibility
        themeId: theme.id,
        blockNumber: block.blockNumber,
        wasTruncated: limited.wasTruncated
      }
    }],
    usageEventId,
    billedCost
  };
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
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
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
  const additionalContext = `${buildThemeGuidance(theme, 'Instagram Carousel')}

=== TECHNICAL CONSTRAINTS ===
- EXACTLY 7 slides (no more, no less)
- Slide 1: Hook headline (5-10 words max)
- Slides 2-6: Single-angle story points (30-40 words each)
- Slide 7: Call to Action (engagement question or save prompt)
- Each slide max 50 words
- Caption: 300-500 characters
- 10-15 relevant hashtags
- Use 1-2 emojis per slide for visual appeal
- All slides must follow ONE narrative thread (no topic-jumping)

=== QUALITY TARGET ===
- The carousel should feel storyboarded, with each slide earning the swipe to the next
- Headlines should be specific and visually punchy, not generic placeholders`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: instagramAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Instagram Carousel',
    badgeColor: '#E1306C',
    platformStructure: 'Array of 7 Slide Objects. Each must have a Headline and Body.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
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
    maxTokens: 16000,
    responseFormat: { type: "json_object" },
    openaiApiKey
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

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Instagram Carousel (${theme.name})`,
      shouldDebit: false, // Save first
      strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"angle":"","slides":[],"caption":"","hashtags":[]}';
  const parsed = parseAIResponse(content);

  // Use resilientGet for carousel components
  const carouselAngle = resilientGet(parsed, 'angle', ['focus', 'topic', 'narrative']) || instagramAngle;
  let rawSlides = resilientGet(parsed, 'slides', ['carousel', 'slideshow', 'content']) || [];
  const rawCaption = resilientGet(parsed, 'caption', ['text', 'description', 'body']) || '';
  const hashtags = formatHashtags(resilientGet(parsed, 'hashtags', ['tags', 'labels']) || [], rawCaption);

  if (!Array.isArray(rawSlides) || rawSlides.length === 0) {
    console.error('[INSTAGRAM] ❌ No valid slides found in AI response:', content);
    throw new Error('AI failed to generate any valid slides for the Instagram carousel.');
  }

  // Enforce exactly 7 slides
  let slides = rawSlides;
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
    const slideText = resilientGet(slide, 'text', ['body', 'content', 'message']) || '';
    const limited = enforceContentLimit(slideText, 'instagram_slide', true);
    return {
      number: index + 1,
      headline: resilientGet(slide, 'headline', ['title', 'hook']) || `Slide ${index + 1}`,
      text: limited.content,
      wasTruncated: limited.wasTruncated
    };
  });

  // Enforce caption limit
  const captionLimited = enforceContentLimit(rawCaption, 'instagram_caption', true);

  const formattedCarousel = buildDocument([
    { heading: 'ANGLE', body: carouselAngle },
    {
      heading: 'SLIDES',
      body: slides.map((slide: any) => `Slide ${slide.number}: ${slide.headline}\n${slide.text}`)
    },
    { heading: 'CAPTION', body: captionLimited.content },
    { heading: 'HASHTAGS', body: hashtags.length ? hashtags.join(' ') : undefined }
  ]);

  return {
    content: [{
      type: 'instagram_caption',
      platform: 'instagram',
      title: `Instagram Carousel #${block.blockNumber}: ${carouselAngle}`,
      content: formattedCarousel,
      metadata: {
        ui_metadata: buildUIMetadata('instagram_content', theme.name),
        platform: 'Instagram',  // Specific platform badge
        theme: theme.name,
        angle: carouselAngle,  // Main narrative angle for carousel
        slides: slides,  // Exactly 7 slides
        slideCount: slides.length,
        caption: captionLimited.content,
        hashtags,
        themeId: theme.id,
        blockNumber: block.blockNumber
      }
    }],
    usageEventId,
    billedCost
  };
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
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
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
  const additionalContext = `${buildThemeGuidance(theme, 'Blog Post')}

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
- Actionable takeaways throughout

=== QUALITY TARGET ===
- The article should read like a publishable editorial draft, not a transcript summary
- Every section should advance the central claim with specificity`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: blogAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Blog Post',
    badgeColor: '#4F46E5',
    platformStructure: '1,200 words. H2/H3s must be bold claims, not generic labels.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
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
    maxTokens: 16000,
    responseFormat: { type: "json_object" },
    openaiApiKey
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

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Blog Post (${theme.name})`,
      shouldDebit: false, // Save first
      strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"title":"","content":"","metaDescription":""}';
  const parsed = parseAIResponse(content);

  // Use resilientGet for blog components
  const blogTitle = resilientGet(parsed, 'title', ['headline', 'name', 'subject']) || `Blog Post #${block.blockNumber}`;
  const blogBody = resilientGet(parsed, 'content', ['body', 'markdown', 'text', 'markdown_body']) || '';
  const metaDescription = resilientGet(parsed, 'metaDescription', ['description', 'summary', 'meta']) || '';

  if (!blogBody || blogBody.trim().length === 0) {
    console.error('[BLOG POST] ❌ No valid content found in AI response:', content);
    throw new Error('AI failed to generate any valid content for the blog post.');
  }

  // Enforce word limit
  const limited = enforceContentLimit(blogBody, 'blog_post', true);

  return {
    content: [{
      type: 'blog_post',
      platform: 'general',  // Using 'general' instead of 'blog' for platform constraint compatibility
      title: blogTitle,
      content: buildDocument([
        { heading: 'META DESCRIPTION', body: metaDescription || undefined },
        { heading: 'ARTICLE', body: limited.content }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('blog_post', theme.name),
        platform: 'Blog Post',  // Specific platform badge
        theme: theme.name,
        angle: blogTitle,  // Main narrative angle (blog title or topic)
        metaDescription: metaDescription,
        articleBody: limited.content,
        themeId: theme.id,
        blockNumber: block.blockNumber,
        wasTruncated: limited.wasTruncated
      }
    }],
    usageEventId,
    billedCost
  };
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
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
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
  const additionalContext = `${buildThemeGuidance(theme, 'Email Newsletter')}

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
- Mobile-optimized

=== QUALITY TARGET ===
- The newsletter should feel inbox-ready with a strong point of view and a clean CTA
- The body should be easy to skim without losing narrative flow`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: newsletterAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Email Newsletter',
    badgeColor: '#EA4335',
    platformStructure: '1-2-1 Structure: 1 Big Idea, 2 Tactical Bullets, 1 Personal Question.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
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
    maxTokens: 16000,
    responseFormat: { type: "json_object" },
    openaiApiKey
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

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Newsletter (${theme.name})`,
      shouldDebit: false, // Save first
      strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"subject":"","previewText":"","content":"","cta":"","ps":""}';
  const parsed = parseAIResponse(content);

  // Use resilientGet for newsletter components
  const subject = resilientGet(parsed, 'subject', ['subject_line', 'title', 'headline']) || `Newsletter #${block.blockNumber}`;
  const body = resilientGet(parsed, 'content', ['body', 'text', 'message', 'newsletter_body']) || '';
  const previewText = resilientGet(parsed, 'previewText', ['preview', 'teaser', 'preheader']) || '';
  const cta = resilientGet(parsed, 'cta', ['call_to_action', 'link_text']) || '';
  const ps = resilientGet(parsed, 'ps', ['post_script', 'p_s']) || '';

  if (!body || body.trim().length === 0) {
    console.error('[NEWSLETTER] ❌ No valid content found in AI response:', content);
    throw new Error('AI failed to generate any valid content for the newsletter.');
  }

  const limited = enforceContentLimit(body, 'newsletter', true);

  return {
    content: [{
      type: 'email_newsletter',
      platform: 'general',  // Using 'general' instead of 'email' for platform constraint compatibility
      title: subject,
      content: buildDocument([
        { heading: 'PREVIEW TEXT', body: previewText || undefined },
        { heading: 'NEWSLETTER', body: limited.content },
        { heading: 'CTA', body: cta || undefined },
        { heading: 'P.S.', body: ps || undefined }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('newsletter', theme.name),
        platform: 'Email Newsletter',  // Specific platform badge
        theme: theme.name,
        angle: subject,  // Main narrative angle (subject line or topic)
        subject: subject,
        previewText: previewText,
        cta: cta,
        ps: ps,
        newsletterBody: limited.content,
        themeId: theme.id,
        blockNumber: block.blockNumber
      }
    }],
    usageEventId,
    billedCost
  };
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
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
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
  const additionalContext = `${buildThemeGuidance(theme, 'Show Notes')}

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
- 2-3 quotable moments with speaker attribution

=== QUALITY TARGET ===
- Show notes must look clean enough to paste directly into a podcast CMS
- Timestamps and resources should be easy to scan at a glance`;

  // Step 4: Build Master Prompt
  const prompt = buildMasterPrompt({
    angle: showNotesAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Show Notes',
    badgeColor: '#6366F1',
    platformStructure: "Executive Summary + 3 'Aha!' Moments + Ad-free Resources.",
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
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
    maxTokens: 16000,
    responseFormat: { type: "json_object" },
    openaiApiKey
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

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId,
      projectId,
      response: mockResponse,
      modelName: model,
      purpose: `Show Notes (${theme.name})`,
      shouldDebit: false, // Save first
      strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"summary":"","topics":[],"quotes":[],"resources":[]}';
  const parsed = parseAIResponse(content);

  // Use resilientGet for show notes components
  const summary = resilientGet(parsed, 'summary', ['description', 'overview', 'brief']) || '';
  const topics = resilientGet(parsed, 'topics', ['timestamps', 'chapters', 'sections']) || [];
  const quotes = resilientGet(parsed, 'quotes', ['highlights', 'moments']) || [];
  const resources = resilientGet(parsed, 'resources', ['links', 'tools', 'references']) || [];

  if (!summary || summary.trim().length === 0) {
    console.error('[SHOW NOTES] ❌ No valid summary found in AI response:', content);
    throw new Error('AI failed to generate any valid summary for the show notes.');
  }

  // Filter out ad-related resources (Ad-Blocker Protocol for Show Notes)
  // ONLY allow: books, tools, studies, frameworks mentioned organically
  let cleanedResources = resources || [];
  if (Array.isArray(cleanedResources)) {
    const forbiddenResourceTerms = [
      // Specific blacklisted brands
      'darktrace',
      // Generic ad patterns
      'sponsor', 'promo', 'code', 'discount', 'offer', 'ad',
      // Recruiter/scam patterns
      'recruitment', 'recruiter', 'staffing', 'hiring agency', 'job scam'
    ];
    cleanedResources = cleanedResources.filter((resource: any) => {
      const resourceText = typeof resource === 'string' ? resource : JSON.stringify(resource);
      const lowerResource = resourceText.toLowerCase();
      return !forbiddenResourceTerms.some(term => lowerResource.includes(term));
    });
  }

  const finalShowNotesAngle = summary.split('.')[0] || showNotesAngle;

  const formattedTopics = Array.isArray(topics)
    ? topics.map((topic: any) => {
        if (typeof topic === 'string') return topic;
        const label = resilientGet(topic, 'topic', ['title', 'label', 'name']) || 'Topic';
        const timestamp = resilientGet(topic, 'timestamp', ['time', 'start']) || '';
        return timestamp ? `${timestamp} — ${label}` : label;
      })
    : [];
  const formattedQuotes = Array.isArray(quotes)
    ? quotes.map((quote: any) => typeof quote === 'string' ? quote : JSON.stringify(quote))
    : [];
  const formattedResources = Array.isArray(cleanedResources)
    ? cleanedResources.map((resource: any) => typeof resource === 'string' ? resource : JSON.stringify(resource))
    : [];

  return {
    content: [{
      type: 'show_notes',
      platform: 'general',
      title: 'Show Notes',
      content: buildDocument([
        { heading: 'EPISODE SUMMARY', body: summary },
        { heading: 'TIMESTAMPS', body: formattedTopics },
        { heading: 'QUOTABLE MOMENTS', body: formattedQuotes },
        { heading: 'RESOURCES', body: formattedResources.length ? formattedResources : undefined }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('show_notes', theme.name),
        platform: 'Show Notes',  // Specific platform badge
        theme: theme.name,
        angle: finalShowNotesAngle,  // Main narrative angle (first sentence of summary or topic)
        summary,
        topics,
        quotes,
        resources: cleanedResources,  // Use cleaned resources
        themeId: theme.id,
        blockNumber: block.blockNumber
      }
    }],
    usageEventId,
    billedCost
  };
}

// Quote Graphic Generator
// Rule: No "Quote #1" indexing. Output is ONLY verbatim quote text + speaker name.
async function generateQuoteGraphic(
  block: ContentBlock,
  analysis: ContentAnalysis,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string,
  _openaiApiKey?: string,
  _outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  const quotes = analysis.quotes.slice(0, 10);
  const quoteIndex = (block.blockNumber - 1) % quotes.length;
  const selectedQuote = quotes[quoteIndex];

  // Enforce word limit on quote (10-25 words for quote graphics)
  const limited = enforceContentLimit(selectedQuote?.text || 'No quote available', 'quote_graphic', true);

  const speaker = selectedQuote?.speaker || 'Unknown';

  // Quote Graphic output: ONLY the verbatim quote and speaker name
  // No "Quote #X" indexing - the title IS the quote itself
  return {
    content: [{
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
    }],
    usageEventId: undefined,
    billedCost: 0
  };
}

// Facebook Post Generator
async function generateFacebookPost(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  const fbAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  const outputSchema = `{
  "post": "Facebook post content",
  "hashtags": ["hashtag1", "hashtag2"]
}`;

  const additionalContext = `${buildThemeGuidance(theme, 'Facebook Post')}

=== TECHNICAL CONSTRAINTS ===
- 150-300 words
- Conversational and warm — NOT corporate or jargon-heavy
- Storytelling-focused, more personal than LinkedIn
- ONE engaging question to drive comments
- 2-3 relevant hashtags only
- No clickbait

=== QUALITY TARGET ===
- It should read like a complete social post someone would publish without editing
- The emotional tone should clearly reflect the selected theme`;

  const prompt = buildMasterPrompt({
    angle: fbAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Facebook Post',
    badgeColor: '#1877F2',
    platformStructure: 'Personal story or insight + engagement question + 2-3 hashtags.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
  });

  const result = await getAICompletion({
    model,
    messages: [
      { role: 'system', content: 'You are an expert Content Strategist specializing in Facebook Posts.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 16000,
    responseFormat: { type: 'json_object' },
    openaiApiKey
  });

  const mockResponse = {
    id: `mock-${Date.now()}`, object: 'chat.completion', created: Date.now(), model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens }
  };

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId, projectId, response: mockResponse, modelName: model,
      purpose: `Facebook Post (${theme.name})`, shouldDebit: false, strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"post":"","hashtags":[]}';
  const parsed = parseAIResponse(content);
  const rawPost = resilientGet(parsed, 'post', ['content', 'text', 'body']) || '';
  const hashtags = formatHashtags(resilientGet(parsed, 'hashtags', ['tags']) || [], rawPost);

  if (!rawPost || rawPost.trim().length === 0) {
    throw new Error('AI failed to generate any valid content for the Facebook post.');
  }

  const limited = enforceContentLimit(rawPost, 'facebook_post', true);

  return {
    content: [{
      type: 'facebook_post',
      platform: 'facebook',
      title: `Facebook Post #${block.blockNumber}: ${theme.name}`,
      content: buildDocument([
        { heading: 'POST', body: limited.content },
        { heading: 'HASHTAGS', body: hashtags.length ? hashtags.join(' ') : undefined }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('facebook_post', theme.name),
        platform: 'Facebook Post',
        theme: theme.name,
        angle: fbAngle,
        hashtags,
        postBody: limited.content,
        themeId: theme.id,
        blockNumber: block.blockNumber,
        wasTruncated: limited.wasTruncated
      }
    }],
    usageEventId,
    billedCost
  };
}

// YouTube Description Generator
async function generateYoutubeDescription(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  const ytAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  const outputSchema = `{
  "description": "Full YouTube description",
  "timestamps": [{"time": "0:00", "label": "Introduction"}],
  "hashtags": ["hashtag1", "hashtag2"]
}`;

  const additionalContext = `${buildThemeGuidance(theme, 'YouTube Description')}

=== TECHNICAL CONSTRAINTS ===
- 150-300 words total
- First 2-3 lines must be compelling before 'Show More'
- Include 3-5 timestamp sections
- 3-5 relevant hashtags
- SEO-friendly language — not keyword-stuffed
- End with soft CTA (subscribe, like, share)

=== QUALITY TARGET ===
- The first lines should feel clickable and complete before the fold
- Timestamps should read like intentional chapters, not rough notes`;

  const prompt = buildMasterPrompt({
    angle: ytAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'YouTube Description',
    badgeColor: '#FF0000',
    platformStructure: 'Compelling opener + episode overview + timestamps + hashtags + CTA.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
  });

  const result = await getAICompletion({
    model,
    messages: [
      { role: 'system', content: 'You are an expert Content Strategist specializing in YouTube Descriptions.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 16000,
    responseFormat: { type: 'json_object' },
    openaiApiKey
  });

  const mockResponse = {
    id: `mock-${Date.now()}`, object: 'chat.completion', created: Date.now(), model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens }
  };

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId, projectId, response: mockResponse, modelName: model,
      purpose: `YouTube Description (${theme.name})`, shouldDebit: false, strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"description":"","timestamps":[],"hashtags":[]}';
  const parsed = parseAIResponse(content);
  const rawDescription = resilientGet(parsed, 'description', ['content', 'text', 'body']) || '';
  const rawTimestamps = resilientGet(parsed, 'timestamps', ['chapters', 'sections']) || [];
  const hashtags = formatHashtags(resilientGet(parsed, 'hashtags', ['tags']) || [], rawDescription);
  const timestamps = Array.isArray(rawTimestamps)
    ? rawTimestamps.map((entry: any) => {
        if (typeof entry === 'string') return entry;
        const time = resilientGet(entry, 'time', ['timestamp', 'start']) || '';
        const label = resilientGet(entry, 'label', ['title', 'chapter', 'topic']) || 'Section';
        return time ? `${time} — ${label}` : label;
      })
    : [];

  if (!rawDescription || rawDescription.trim().length === 0) {
    throw new Error('AI failed to generate any valid content for the YouTube description.');
  }

  const limited = enforceContentLimit(rawDescription, 'youtube_description', true);

  return {
    content: [{
      type: 'youtube_description',
      platform: 'youtube',
      title: `YouTube Description #${block.blockNumber}: ${theme.name}`,
      content: buildDocument([
        { heading: 'DESCRIPTION', body: limited.content },
        { heading: 'TIMESTAMPS', body: timestamps },
        { heading: 'HASHTAGS', body: hashtags.length ? hashtags.join(' ') : undefined }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('youtube_description', theme.name),
        platform: 'YouTube Description',
        theme: theme.name,
        angle: ytAngle,
        timestamps,
        hashtags,
        descriptionBody: limited.content,
        themeId: theme.id,
        blockNumber: block.blockNumber,
        wasTruncated: limited.wasTruncated
      }
    }],
    usageEventId,
    billedCost
  };
}

// Podcast Episode Description Generator
async function generatePodcastEpisodeDescription(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  const podAngle = narrativeMetadata.single_angle || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  const outputSchema = `{
  "description": "Podcast episode description",
  "topics": ["Topic 1", "Topic 2", "Topic 3"]
}`;

  const additionalContext = `${buildThemeGuidance(theme, 'Podcast Description')}

=== TECHNICAL CONSTRAINTS ===
- 100-200 words total
- Mention guest name(s) if available; use 'guest' generically if not
- Summarize 3 key topics discussed
- End with specific CTA (subscribe, leave a review, share)
- Written for podcast app description fields (Spotify, Apple Podcasts, etc.)
- No hashtags
- Conversational but informative

=== QUALITY TARGET ===
- The copy should feel ready for Spotify or Apple Podcasts, not like internal notes
- Topic bullets should make the episode feel tangible and specific`;

  const prompt = buildMasterPrompt({
    angle: podAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Podcast Description',
    badgeColor: '#8B5CF6',
    platformStructure: 'Episode hook + 3 key topics + CTA.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
  });

  const result = await getAICompletion({
    model,
    messages: [
      { role: 'system', content: 'You are an expert Content Strategist specializing in Podcast Episode Descriptions.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 16000,
    responseFormat: { type: 'json_object' },
    openaiApiKey
  });

  const mockResponse = {
    id: `mock-${Date.now()}`, object: 'chat.completion', created: Date.now(), model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens }
  };

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId, projectId, response: mockResponse, modelName: model,
      purpose: `Podcast Description (${theme.name})`, shouldDebit: false, strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"description":"","topics":[]}';
  const parsed = parseAIResponse(content);
  const rawDescription = resilientGet(parsed, 'description', ['content', 'text', 'body']) || '';
  const rawTopics = resilientGet(parsed, 'topics', ['key_topics', 'subjects']) || [];

  if (!rawDescription || rawDescription.trim().length === 0) {
    throw new Error('AI failed to generate any valid content for the podcast episode description.');
  }

  const limited = enforceContentLimit(rawDescription, 'podcast_episode_description', true);

  return {
    content: [{
      type: 'podcast_episode_description',
      platform: 'general',
      title: `Podcast Description #${block.blockNumber}: ${theme.name}`,
      content: buildDocument([
        { heading: 'DESCRIPTION', body: limited.content },
        { heading: 'KEY TOPICS', body: Array.isArray(rawTopics) ? rawTopics.map((topic: any) => String(topic)) : undefined }
      ]),
      metadata: {
        ui_metadata: buildUIMetadata('podcast_episode_description', theme.name),
        platform: 'Podcast Description',
        theme: theme.name,
        angle: podAngle,
        topics: Array.isArray(rawTopics) ? rawTopics : [],
        descriptionBody: limited.content,
        themeId: theme.id,
        blockNumber: block.blockNumber,
        wasTruncated: limited.wasTruncated
      }
    }],
    usageEventId,
    billedCost
  };
}

// Short-Form Video Script Generator
async function generateShortFormVideoScript(
  block: ContentBlock,
  transcription: string,
  analysis: ContentAnalysis,
  narrativeMetadata: NarrativeMetadata,
  theme: ContentTheme,
  model: string,
  userId?: string,
  projectId?: string,
  openaiApiKey?: string,
  outputStyleModifier?: string
): Promise<{ content: any[], usageEventId?: string, billedCost: number }> {
  const scriptAngle = narrativeMetadata.single_angle || analysis.hooks[0]?.text || analysis.keyTopics[0] || theme.name;
  const cleanedSummary = narrativeMetadata.cleaned_narrative_summary || transcription;

  const outputSchema = `{
  "hook": "3-second opening hook (max 20 words)",
  "body": "Core insight with pattern interrupt",
  "cta": "Specific call-to-action",
  "source_moment": "Brief description of transcript moment used"
}`;

  const additionalContext = `${buildThemeGuidance(theme, 'Short-Form Video Script')}

=== TECHNICAL CONSTRAINTS ===
- 120-150 spoken words TOTAL (45-60 seconds at 2.5 words/sec)
- Hook: 3-second opener that creates a loop the viewer must close (max 20 words)
- Body: One clear insight with supporting context + pattern interrupt
- CTA: Direct specific action (follow, comment with a specific thing, share)
- Written for spoken delivery — contractions, short sentences, natural rhythm

=== QUALITY TARGET ===
- The script should feel shoot-ready, with a real opening pattern and a clean finish
- Voice should be distinct enough that theme changes are obvious when read aloud`;

  const prompt = buildMasterPrompt({
    angle: scriptAngle,
    themeName: theme.name,
    cleanedSummary,
    platformLabel: 'Short-Form Video Script',
    badgeColor: '#EC4899',
    platformStructure: 'Hook (3 sec) → Body with pattern interrupt → Direct CTA.',
    outputSchema,
    additionalContext,
    customGuidance: block.customGuidance,
    outputStyleModifier
  });

  const result = await getAICompletion({
    model,
    messages: [
      { role: 'system', content: 'You are an expert Content Strategist specializing in Short-Form Video Scripts for TikTok, Reels, and YouTube Shorts.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    maxTokens: 16000,
    responseFormat: { type: 'json_object' },
    openaiApiKey
  });

  const mockResponse = {
    id: `mock-${Date.now()}`, object: 'chat.completion', created: Date.now(), model: result.model,
    choices: [{ message: { content: result.content } }],
    usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens }
  };

  let usageEventId: string | undefined;
  let billedCost = 0;

  if (userId) {
    const tracking = await trackOpenAIUsage({
      userId, projectId, response: mockResponse, modelName: model,
      purpose: `Short-Form Video Script (${theme.name})`, shouldDebit: false, strictBilling: true
    });
    usageEventId = tracking.usageEventId;
    billedCost = tracking.billedCost;
  }

  const content = result.content || '{"hook":"","body":"","cta":"","source_moment":""}';
  const parsed = parseAIResponse(content);
  const hook = resilientGet(parsed, 'hook', ['opening', 'intro']) || '';
  const body = resilientGet(parsed, 'body', ['content', 'main', 'insight']) || '';
  const cta = resilientGet(parsed, 'cta', ['call_to_action', 'ending']) || '';
  const sourceMoment = resilientGet(parsed, 'source_moment', ['source', 'moment']) || '';

  if (!hook && !body) {
    throw new Error('AI failed to generate any valid content for the short-form video script.');
  }

  // Combine into a readable script format
  const fullScript = buildDocument([
    { heading: 'HOOK', body: hook || undefined },
    { heading: 'BODY', body: body || undefined },
    { heading: 'CTA', body: cta || undefined },
    { heading: 'SOURCE MOMENT', body: sourceMoment || undefined }
  ]);

  const limited = enforceContentLimit(fullScript, 'short_form_video_script', true);

  return {
    content: [{
      type: 'short_form_video_script',
      platform: 'general',
      title: `Video Script #${block.blockNumber}: ${theme.name}`,
      content: limited.content,
      metadata: {
        ui_metadata: buildUIMetadata('short_form_video_script', theme.name),
        platform: 'Video Script',
        theme: theme.name,
        angle: scriptAngle,
        hook,
        body,
        cta,
        sourceMoment,
        themeId: theme.id,
        blockNumber: block.blockNumber,
        wasTruncated: limited.wasTruncated
      }
    }],
    usageEventId,
    billedCost
  };
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
  email_newsletter: 'social_post',  // Database doesn't allow email_newsletter, fallback to social_post
  youtube_description: 'social_post',
  podcast_episode_description: 'social_post',
  short_form_video_script: 'social_post',
  facebook_post: 'social_post'
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

async function saveGeneratedContent(projectId: string, generatedContent: any[]): Promise<string[]> {
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('user_id, organization_id')
    .eq('id', projectId)
    .single() as { data: { user_id: string; organization_id: string | null } | null };

  const userId = project?.user_id;
  if (!userId) {
    throw new Error('User ID not found for project');
  }
  const organizationId = project.organization_id || await resolveOrganizationIdForWrite(userId);

  const outputs = generatedContent.map(content => {
    const normalizedType = normalizeOutputTypeForInsert(content.type);

    return {
      project_id: projectId,
      user_id: userId,
      organization_id: organizationId,
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

  const { data, error } = await supabaseAdmin
    .from('outputs')
    .insert(outputs as any)
    .select('id');

  if (error) {
    console.error('[SAVE ERROR]:', error);
    throw new Error(`Failed to save content: ${error.message}`);
  }

  console.log(`[SAVE] 💾 Saved ${outputs.length} outputs to database`);
  return ((data || []) as Array<{ id: string }>).map((row) => row.id);
}
