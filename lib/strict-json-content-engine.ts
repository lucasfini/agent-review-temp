/**
 * Strict JSON Content Engine
 *
 * Generates structured JSON content with strict ui_metadata schema.
 * Supports: Show Notes, Email Newsletter, Blog Post, Quote Graphics
 *
 * Features:
 * - Ad-Blocker Protocol (removes sponsors, recruitment scams)
 * - Single-Angle Narrative (one arc per output)
 * - Strict JSON Output (no markdown, no prose)
 */

import Anthropic from '@anthropic-ai/sdk';
import { trackAnthropicUsage } from '@/lib/billing/track-usage';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface UIMetadata {
  platform_label: string;
  theme_label: string;
  badge_color: string;
}

export interface ShowNotesContent {
  title: string;
  summary: string;
  timestamps: Array<{ time: string; topic: string }>;
  resources: Array<{ title: string; url?: string; type?: string }>;
}

export interface ShowNotesOutput {
  ui_metadata: UIMetadata;
  content: ShowNotesContent;
}

export interface EmailNewsletterContent {
  subject_line: string;
  preview_text: string;
  body_sections: {
    big_idea: string;
    bullet_points: string[];
    personal_question: string;
  };
}

export interface EmailNewsletterOutput {
  ui_metadata: UIMetadata;
  content: EmailNewsletterContent;
}

export interface BlogPostContent {
  title: string;
  markdown_body: string;
}

export interface BlogPostOutput {
  ui_metadata: UIMetadata;
  content: BlogPostContent;
}

export interface QuoteGraphicContent {
  quote_text: string;
  speaker_name: string;
}

export interface QuoteGraphicOutput {
  ui_metadata: UIMetadata;
  content: QuoteGraphicContent;
}

export interface StrictJSONEngineInput {
  theme_name: string;
  angle: string;
  cleaned_narrative_summary: string;
  transcript?: string;
  speaker_data?: Record<string, { name: string; role?: string }>;
  userId?: string;
  projectId?: string;
}

export interface StrictJSONEngineOutput {
  show_notes: ShowNotesOutput;
  email_newsletter: EmailNewsletterOutput;
  blog_post: BlogPostOutput;
  quote_graphic: QuoteGraphicOutput;
  tokens_used: {
    input: number;
    output: number;
  };
  generated_at: string;
}

// ============================================================================
// AD-BLOCKER PROTOCOL
// ============================================================================

const AD_BLACKLIST = {
  // Sponsor keywords
  sponsors: [
    'sponsored by',
    'brought to you by',
    'thanks to',
    'special thanks to',
    'partnered with',
    'promo code',
    'discount code',
    'use code',
    'coupon code',
    'affiliate link',
    'sponsored content',
    'paid partnership'
  ],
  // Recruitment scam patterns
  recruitment: [
    'staffing agency',
    'recruitment agency',
    'hiring agency',
    'job placement',
    'career services sponsor'
  ],
  // Known brand blacklist (add as needed)
  brands: [
    'darktrace',
    'betterhelp',
    'athletic greens',
    'ag1',
    'squarespace',
    'mailchimp',
    'hubspot sponsor'
  ]
};

/**
 * Detect and flag ad-related content
 */
export function detectAdContent(text: string): {
  hasAds: boolean;
  flaggedTerms: string[];
} {
  const lowerText = text.toLowerCase();
  const flaggedTerms: string[] = [];

  // Check all blacklist categories
  for (const category of Object.values(AD_BLACKLIST)) {
    for (const term of category) {
      if (lowerText.includes(term.toLowerCase())) {
        flaggedTerms.push(term);
      }
    }
  }

  return {
    hasAds: flaggedTerms.length > 0,
    flaggedTerms: [...new Set(flaggedTerms)] // Deduplicate
  };
}

// ============================================================================
// BADGE COLOR MAPPING
// ============================================================================

const BADGE_COLORS: Record<string, string> = {
  show_notes: '#6366F1',      // Indigo
  email_newsletter: '#EA4335', // Red (Gmail-like)
  blog_post: '#4F46E5',       // Purple
  quote_graphic: '#F59E0B'    // Amber
};

// ============================================================================
// MASTER PROMPT BUILDER
// ============================================================================

function buildStrictJSONPrompt(input: StrictJSONEngineInput): string {
  const { theme_name, angle, cleaned_narrative_summary, transcript, speaker_data } = input;

  // Build speaker context if available
  let speakerContext = '';
  if (speaker_data && Object.keys(speaker_data).length > 0) {
    speakerContext = '\n\nSPEAKER CONTEXT:\n';
    for (const [id, info] of Object.entries(speaker_data)) {
      speakerContext += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  return `You are a Strict JSON Content Engine. Your output must be STRICT JSON ONLY.

CRITICAL RULES:
1. Output ONLY valid JSON objects - no markdown, no prose, no explanations
2. Each JSON object must have the exact structure specified
3. Never include content from sponsors or ads (see AD-BLOCKER below)
4. Stick to ONE narrative arc: "${angle}"
5. Every output must have a ui_metadata block

AD-BLOCKER PROTOCOL:
BLACKLISTED TERMS (never include): ${[...AD_BLACKLIST.sponsors, ...AD_BLACKLIST.recruitment, ...AD_BLACKLIST.brands].join(', ')}
- If the transcript mentions sponsors, recruitment agencies, or promo codes, OMIT them entirely
- Do not include any promotional content in summaries or resources
- If no real resources exist (excluding ads), return an empty array []

THEME: ${theme_name}
ANGLE: ${angle}
${speakerContext}

NARRATIVE SUMMARY (Ad-Free):
${cleaned_narrative_summary}

${transcript ? `\nFULL TRANSCRIPT (Reference for verbatim quotes):\n${transcript.slice(0, 50000)}` : ''}

---

Generate exactly 4 JSON objects. Output each object on its own, separated by a line containing only "---JSON_SEPARATOR---".

OBJECT 1 - SHOW NOTES:
{
  "ui_metadata": {
    "platform_label": "Show Notes",
    "theme_label": "${theme_name}",
    "badge_color": "${BADGE_COLORS.show_notes}"
  },
  "content": {
    "title": "[Episode title that captures the ${angle}]",
    "summary": "[Executive briefing, 150-200 words, ad-free, focused on ${angle}]",
    "timestamps": [
      { "time": "00:00", "topic": "[Topic A]" },
      { "time": "05:30", "topic": "[Topic B]" }
    ],
    "resources": [
      { "title": "[REAL book/article mentioned]", "type": "book" }
    ]
  }
}

OBJECT 2 - EMAIL NEWSLETTER:
{
  "ui_metadata": {
    "platform_label": "Email Newsletter",
    "theme_label": "${theme_name}",
    "badge_color": "${BADGE_COLORS.email_newsletter}"
  },
  "content": {
    "subject_line": "[Punchy subject line, 6-10 words, creates curiosity]",
    "preview_text": "[Short teaser, 40-90 characters]",
    "body_sections": {
      "big_idea": "[The main insight from ${angle}, 150-200 words, 'Smart Friend' tone - no 'Dear Reader']",
      "bullet_points": [
        "[Tactical takeaway 1]",
        "[Tactical takeaway 2]",
        "[Tactical takeaway 3]"
      ],
      "personal_question": "[Engagement question that prompts reflection]"
    }
  }
}

OBJECT 3 - BLOG POST:
{
  "ui_metadata": {
    "platform_label": "Blog Post",
    "theme_label": "${theme_name}",
    "badge_color": "${BADGE_COLORS.blog_post}"
  },
  "content": {
    "title": "[SEO-optimized title targeting ${angle}]",
    "markdown_body": "[Full article, 1000-1200 words, using ## for H2 headers that are BOLD ARGUMENTS, include one framework table in Markdown format, focus on ${angle}]"
  }
}

OBJECT 4 - QUOTE GRAPHIC:
{
  "ui_metadata": {
    "platform_label": "Quote Graphic",
    "theme_label": "${theme_name}",
    "badge_color": "${BADGE_COLORS.quote_graphic}"
  },
  "content": {
    "quote_text": "[VERBATIM spoken words from transcript - exact quote, no paraphrasing]",
    "speaker_name": "[Speaker's full name]"
  }
}

IMPORTANT:
- Resources array: ONLY include REAL books/articles/tools actually mentioned. If none exist (excluding ads), use empty array [].
- Quote: Must be EXACT verbatim text from the transcript. Do not paraphrase.
- Do NOT index outputs (no "Quote #1", just the content)
- All text must follow the ${theme_name} theme voice

OUTPUT NOW (4 JSON objects separated by ---JSON_SEPARATOR---):`;
}

// ============================================================================
// JSON PARSER
// ============================================================================

function parseStrictJSON<T>(content: string, objectName: string): T {
  let cleanContent = content.trim();

  // Strip markdown code blocks if present
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  }

  try {
    return JSON.parse(cleanContent) as T;
  } catch (error: any) {
    console.error(`[STRICT-JSON] Failed to parse ${objectName}:`, error.message);
    console.error(`[STRICT-JSON] Content preview:`, cleanContent.substring(0, 300));
    throw new Error(`Invalid JSON for ${objectName}: ${error.message}`);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateUIMetadata(metadata: any, expectedLabel: string): UIMetadata {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`Missing ui_metadata for ${expectedLabel}`);
  }

  const required = ['platform_label', 'theme_label', 'badge_color'];
  for (const field of required) {
    if (!metadata[field] || typeof metadata[field] !== 'string') {
      throw new Error(`Missing or invalid ${field} in ui_metadata for ${expectedLabel}`);
    }
  }

  return {
    platform_label: metadata.platform_label,
    theme_label: metadata.theme_label,
    badge_color: metadata.badge_color
  };
}

function validateShowNotes(obj: any): ShowNotesOutput {
  const ui_metadata = validateUIMetadata(obj.ui_metadata, 'Show Notes');

  if (!obj.content || typeof obj.content !== 'object') {
    throw new Error('Missing content in Show Notes');
  }

  const content: ShowNotesContent = {
    title: typeof obj.content.title === 'string' ? obj.content.title : 'Untitled Episode',
    summary: typeof obj.content.summary === 'string' ? obj.content.summary : '',
    timestamps: Array.isArray(obj.content.timestamps)
      ? obj.content.timestamps.filter((t: any) => t.time && t.topic)
      : [],
    resources: Array.isArray(obj.content.resources)
      ? obj.content.resources.filter((r: any) => r.title)
      : []
  };

  return { ui_metadata, content };
}

function validateEmailNewsletter(obj: any): EmailNewsletterOutput {
  const ui_metadata = validateUIMetadata(obj.ui_metadata, 'Email Newsletter');

  if (!obj.content || typeof obj.content !== 'object') {
    throw new Error('Missing content in Email Newsletter');
  }

  const bodySections = obj.content.body_sections || {};

  const content: EmailNewsletterContent = {
    subject_line: typeof obj.content.subject_line === 'string' ? obj.content.subject_line : '',
    preview_text: typeof obj.content.preview_text === 'string' ? obj.content.preview_text : '',
    body_sections: {
      big_idea: typeof bodySections.big_idea === 'string' ? bodySections.big_idea : '',
      bullet_points: Array.isArray(bodySections.bullet_points)
        ? bodySections.bullet_points.filter((b: any) => typeof b === 'string')
        : [],
      personal_question: typeof bodySections.personal_question === 'string' ? bodySections.personal_question : ''
    }
  };

  return { ui_metadata, content };
}

function validateBlogPost(obj: any): BlogPostOutput {
  const ui_metadata = validateUIMetadata(obj.ui_metadata, 'Blog Post');

  if (!obj.content || typeof obj.content !== 'object') {
    throw new Error('Missing content in Blog Post');
  }

  const content: BlogPostContent = {
    title: typeof obj.content.title === 'string' ? obj.content.title : '',
    markdown_body: typeof obj.content.markdown_body === 'string' ? obj.content.markdown_body : ''
  };

  return { ui_metadata, content };
}

function validateQuoteGraphic(obj: any): QuoteGraphicOutput {
  const ui_metadata = validateUIMetadata(obj.ui_metadata, 'Quote Graphic');

  if (!obj.content || typeof obj.content !== 'object') {
    throw new Error('Missing content in Quote Graphic');
  }

  const content: QuoteGraphicContent = {
    quote_text: typeof obj.content.quote_text === 'string' ? obj.content.quote_text : '',
    speaker_name: typeof obj.content.speaker_name === 'string' ? obj.content.speaker_name : 'Unknown'
  };

  return { ui_metadata, content };
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Generate all 4 content types using Claude
 */
export async function generateStrictJSONContent(
  input: StrictJSONEngineInput
): Promise<StrictJSONEngineOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  console.log(`[STRICT-JSON] 🚀 Generating content for theme: ${input.theme_name}, angle: ${input.angle}`);

  // Check for ads in input
  const adCheck = detectAdContent(input.cleaned_narrative_summary);
  if (adCheck.hasAds) {
    console.log(`[STRICT-JSON] ⚠️ Ad content detected, will be filtered: ${adCheck.flaggedTerms.join(', ')}`);
  }

  const anthropic = new Anthropic({ apiKey });
  const prompt = buildStrictJSONPrompt(input);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    console.log(`[STRICT-JSON] 📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

    // Track usage (fire-and-forget)
    if (input.userId) {
      trackAnthropicUsage({
        userId: input.userId,
        projectId: input.projectId,
        response,
        modelName: 'sonnet-4.5',
        purpose: 'strict JSON content generation (all 4 types)',
      }).catch(err => console.error('[STRICT-JSON] Failed to track usage:', err));
    }

    // Split response by separator
    const parts = responseText.split('---JSON_SEPARATOR---').map(p => p.trim()).filter(p => p.length > 0);

    if (parts.length < 4) {
      console.warn(`[STRICT-JSON] ⚠️ Expected 4 JSON objects, got ${parts.length}. Attempting recovery...`);
    }

    // Parse and validate each part
    const showNotes = validateShowNotes(parseStrictJSON(parts[0] || '{}', 'Show Notes'));
    const emailNewsletter = validateEmailNewsletter(parseStrictJSON(parts[1] || '{}', 'Email Newsletter'));
    const blogPost = validateBlogPost(parseStrictJSON(parts[2] || '{}', 'Blog Post'));
    const quoteGraphic = validateQuoteGraphic(parseStrictJSON(parts[3] || '{}', 'Quote Graphic'));

    console.log(`[STRICT-JSON] ✅ Successfully generated all 4 content types`);

    return {
      show_notes: showNotes,
      email_newsletter: emailNewsletter,
      blog_post: blogPost,
      quote_graphic: quoteGraphic,
      tokens_used: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      generated_at: new Date().toISOString()
    };

  } catch (error: any) {
    console.error(`[STRICT-JSON] ❌ Generation failed:`, error.message);
    throw new Error(`Strict JSON generation failed: ${error.message}`);
  }
}

// ============================================================================
// INDIVIDUAL GENERATORS (for selective generation)
// ============================================================================

/**
 * Generate only Show Notes
 */
export async function generateShowNotes(input: StrictJSONEngineInput): Promise<ShowNotesOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Generate a Show Notes JSON object. Output ONLY valid JSON, no markdown.

Theme: ${input.theme_name}
Angle: ${input.angle}
Summary: ${input.cleaned_narrative_summary}

AD-BLOCKER: Exclude all sponsors, promo codes, and recruitment content.
RESOURCES: Only include REAL resources mentioned. If none exist, use empty array [].

Output format:
{
  "ui_metadata": {
    "platform_label": "Show Notes",
    "theme_label": "${input.theme_name}",
    "badge_color": "${BADGE_COLORS.show_notes}"
  },
  "content": {
    "title": "Episode title",
    "summary": "150-200 word executive briefing, ad-free",
    "timestamps": [{ "time": "00:00", "topic": "Topic" }],
    "resources": []
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  if (input.userId) {
    trackAnthropicUsage({
      userId: input.userId,
      projectId: input.projectId,
      response,
      modelName: 'sonnet-4.5',
      purpose: 'show notes generation',
    }).catch(err => console.error('[STRICT-JSON] Failed to track show notes usage:', err));
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return validateShowNotes(parseStrictJSON(text, 'Show Notes'));
}

/**
 * Generate only Email Newsletter
 */
export async function generateEmailNewsletter(input: StrictJSONEngineInput): Promise<EmailNewsletterOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Generate an Email Newsletter JSON object. Output ONLY valid JSON, no markdown.

Theme: ${input.theme_name}
Angle: ${input.angle}
Summary: ${input.cleaned_narrative_summary}

TONE: "The Smart Friend" - conversational but insightful. NO "Dear Reader" or generic salutations.
AD-BLOCKER: Exclude all sponsors, promo codes, and recruitment content.

Output format:
{
  "ui_metadata": {
    "platform_label": "Email Newsletter",
    "theme_label": "${input.theme_name}",
    "badge_color": "${BADGE_COLORS.email_newsletter}"
  },
  "content": {
    "subject_line": "Punchy 6-10 word subject",
    "preview_text": "40-90 character teaser",
    "body_sections": {
      "big_idea": "150-200 word main insight",
      "bullet_points": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
      "personal_question": "Engagement question"
    }
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  if (input.userId) {
    trackAnthropicUsage({
      userId: input.userId,
      projectId: input.projectId,
      response,
      modelName: 'sonnet-4.5',
      purpose: 'email newsletter generation',
    }).catch(err => console.error('[STRICT-JSON] Failed to track email newsletter usage:', err));
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return validateEmailNewsletter(parseStrictJSON(text, 'Email Newsletter'));
}

/**
 * Generate only Blog Post
 */
export async function generateBlogPost(input: StrictJSONEngineInput): Promise<BlogPostOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Generate a Blog Post JSON object. Output ONLY valid JSON, no markdown outside the markdown_body field.

Theme: ${input.theme_name}
Angle: ${input.angle}
Summary: ${input.cleaned_narrative_summary}

REQUIREMENTS:
- H2 headers must be BOLD ARGUMENTS (not generic labels)
- Include ONE framework table in Markdown format
- 1000-1200 words total
- SEO-optimized title
- AD-BLOCKER: Exclude all sponsors

Output format:
{
  "ui_metadata": {
    "platform_label": "Blog Post",
    "theme_label": "${input.theme_name}",
    "badge_color": "${BADGE_COLORS.blog_post}"
  },
  "content": {
    "title": "SEO Title",
    "markdown_body": "## Bold Argument Header\\n\\nParagraph...\\n\\n| Column | Column |\\n|--------|--------|\\n| Data | Data |"
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  if (input.userId) {
    trackAnthropicUsage({
      userId: input.userId,
      projectId: input.projectId,
      response,
      modelName: 'sonnet-4.5',
      purpose: 'blog post generation',
    }).catch(err => console.error('[STRICT-JSON] Failed to track blog post usage:', err));
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return validateBlogPost(parseStrictJSON(text, 'Blog Post'));
}

/**
 * Generate only Quote Graphic
 */
export async function generateQuoteGraphic(
  input: StrictJSONEngineInput & { transcript: string }
): Promise<QuoteGraphicOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const anthropic = new Anthropic({ apiKey });

  const prompt = `Generate a Quote Graphic JSON object. Output ONLY valid JSON, no markdown.

Theme: ${input.theme_name}
Angle: ${input.angle}

CRITICAL: The quote_text must be VERBATIM from the transcript below. Exact words only, no paraphrasing.
Do NOT label it "Quote #1" or similar. Just the content.

Transcript:
${input.transcript.slice(0, 30000)}

Output format:
{
  "ui_metadata": {
    "platform_label": "Quote Graphic",
    "theme_label": "${input.theme_name}",
    "badge_color": "${BADGE_COLORS.quote_graphic}"
  },
  "content": {
    "quote_text": "Exact verbatim quote from transcript",
    "speaker_name": "Speaker Name"
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  if (input.userId) {
    trackAnthropicUsage({
      userId: input.userId,
      projectId: input.projectId,
      response,
      modelName: 'sonnet-4.5',
      purpose: 'quote graphic generation',
    }).catch(err => console.error('[STRICT-JSON] Failed to track quote graphic usage:', err));
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return validateQuoteGraphic(parseStrictJSON(text, 'Quote Graphic'));
}
