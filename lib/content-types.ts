import { CONTENT_OUTPUT_PRICES } from '@/lib/pricing-config';

export type ContentCategory = 'social' | 'longform' | 'support';

// Database types (matching database-outputs.sql)
export type OutputType =
  | 'blog_post'
  | 'social_post'
  | 'email_newsletter'
  | 'audiogram_clip'
  | 'quote_graphic'
  | 'show_notes'
  | 'twitter_thread'
  | 'linkedin_post'
  | 'instagram_caption'
  | 'youtube_description'
  | 'podcast_episode_description'
  | 'short_form_video_script'
  | 'facebook_post';

export type PlatformType =
  | 'twitter'
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'email'
  | 'blog'
  | 'general';

export type OutputStatus = 'draft' | 'ready' | 'published' | 'archived';

export interface ContentLimits {
  min: number;
  max: number;
  unit: 'characters' | 'words';
  hardLimit: boolean; // If true, strictly enforce
}

export interface ContentType {
  id: string;
  name: string;
  description: string;
  count: number;
  estimatedTokens: number;
  platform: string;
  enabled: boolean;
  category: ContentCategory;
  badge?: string;
  // New fields for outputs integration
  outputType?: OutputType;
  platformType?: PlatformType;
  estimatedCostUSD?: number;
  // Strict content limits
  limits?: ContentLimits;
  attentionSpan?: string; // Human-readable attention span
  maxCount?: number; // Maximum quantity user can request in the modal
}

export const MAX_CUSTOM_GUIDANCE_LENGTH = 240;

export function normalizeCustomGuidance(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_CUSTOM_GUIDANCE_LENGTH);
}

export const CONTENT_TYPES: ContentType[] = [
  // ── SOCIAL ────────────────────────────────────────────────────────────────
  {
    id: 'twitter_threads',
    name: 'X Threads',
    description: 'Thread-format posts (6-8 posts each)',
    count: 4,
    estimatedTokens: 900,
    platform: 'twitter',
    enabled: true,
    category: 'social',
    badge: '𝕏',
    outputType: 'twitter_thread',
    platformType: 'twitter',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.twitter_threads,
    limits: {
      min: 100,
      max: 280, // Per post
      unit: 'characters',
      hardLimit: true
    },
    attentionSpan: '8 seconds per post',
    maxCount: 8
  },
  {
    id: 'linkedin_posts',
    name: 'LinkedIn Posts',
    description: 'Professional posts with insights and discussion prompts',
    count: 3,
    estimatedTokens: 500,
    platform: 'linkedin',
    enabled: true,
    category: 'social',
    badge: 'LinkedIn',
    outputType: 'linkedin_post',
    platformType: 'linkedin',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.linkedin_posts,
    limits: {
      min: 1200,
      max: 1500,
      unit: 'characters',
      hardLimit: true
    },
    attentionSpan: '3 minutes (professional browsing)',
    maxCount: 6
  },
  {
    id: 'instagram_content',
    name: 'Instagram Carousel',
    description: 'Multi-slide carousel with caption and hashtags',
    count: 1,
    estimatedTokens: 700,
    platform: 'instagram',
    enabled: true,
    category: 'social',
    badge: 'Instagram',
    outputType: 'instagram_caption',
    platformType: 'instagram',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.instagram_content,
    limits: {
      min: 300,
      max: 500,
      unit: 'characters',
      hardLimit: true
    },
    attentionSpan: '10 seconds per slide',
    maxCount: 3
  },
  {
    id: 'facebook_post',
    name: 'Facebook Post',
    description: 'Conversational post with engagement question and hashtags',
    count: 1,
    estimatedTokens: 600,
    platform: 'facebook',
    enabled: true,
    category: 'social',
    badge: 'Facebook',
    outputType: 'facebook_post',
    platformType: 'facebook',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.facebook_post,
    limits: {
      min: 150,
      max: 300,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '2 minutes (casual feed browsing)',
    maxCount: 4
  },
  // ── LONG-FORM ─────────────────────────────────────────────────────────────
  {
    id: 'blog_post',
    name: 'Blog Post',
    description: 'SEO-optimized article (1,200-1,800 words)',
    count: 1,
    estimatedTokens: 4500,
    platform: 'general',
    enabled: true,
    category: 'longform',
    badge: 'Blog',
    outputType: 'blog_post',
    platformType: 'blog',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.blog_post,
    limits: {
      min: 1200,
      max: 1800,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '6-8 minutes (committed reading)',
    maxCount: 3
  },
  {
    id: 'newsletter',
    name: 'Email Newsletter',
    description: 'Newsletter with subject line, content, and call-to-action',
    count: 1,
    estimatedTokens: 1200,
    platform: 'general',
    enabled: true,
    category: 'longform',
    badge: 'Email',
    outputType: 'email_newsletter',
    platformType: 'email',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.newsletter,
    limits: {
      min: 800,
      max: 1200,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '3-5 minutes (inbox environment)',
    maxCount: 2
  },
  // ── SUPPORT ───────────────────────────────────────────────────────────────
  {
    id: 'show_notes',
    name: 'Show Notes',
    description: 'Episode summary with timestamps, links, and key takeaways',
    count: 1,
    estimatedTokens: 1100,
    platform: 'general',
    enabled: true,
    category: 'support',
    badge: 'Show Notes',
    outputType: 'show_notes',
    platformType: 'general',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.show_notes,
    limits: {
      min: 500,
      max: 800,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '2-3 minutes (scanning for info)',
    maxCount: 1
  },
  {
    id: 'youtube_description',
    name: 'YouTube Description',
    description: '150-300 word description with timestamps and hashtags',
    count: 1,
    estimatedTokens: 900,
    platform: 'youtube',
    enabled: true,
    category: 'support',
    badge: 'YouTube',
    outputType: 'youtube_description',
    platformType: 'youtube',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.youtube_description,
    limits: {
      min: 150,
      max: 300,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '30 seconds (video discovery)',
    maxCount: 2
  },
  {
    id: 'podcast_episode_description',
    name: 'Podcast Description',
    description: '100-200 word episode description with guest names and CTA',
    count: 1,
    estimatedTokens: 600,
    platform: 'general',
    enabled: true,
    category: 'support',
    badge: 'Podcast',
    outputType: 'podcast_episode_description',
    platformType: 'general',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.podcast_episode_description,
    limits: {
      min: 100,
      max: 200,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '1 minute (podcast app browsing)',
    maxCount: 2
  },
  {
    id: 'short_form_video_script',
    name: 'Short-Form Video Script',
    description: '45-60 second script with hook, pattern interrupt, and CTA',
    count: 1,
    estimatedTokens: 700,
    platform: 'general',
    enabled: true,
    category: 'support',
    badge: 'Video Script',
    outputType: 'short_form_video_script',
    platformType: 'general',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.short_form_video_script,
    limits: {
      min: 120,
      max: 150,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '45-60 seconds',
    maxCount: 4
  },
  {
    id: 'quote_graphics',
    name: 'Quote Graphics',
    description: 'Quotable excerpts with speaker attribution',
    count: 2,
    estimatedTokens: 120,
    platform: 'instagram',
    enabled: true,
    category: 'support',
    badge: 'Quote Graphic',
    outputType: 'quote_graphic',
    platformType: 'general',
    estimatedCostUSD: CONTENT_OUTPUT_PRICES.quote_graphics,
    limits: {
      min: 10,
      max: 25,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '3-5 seconds (quick visual scan)',
    maxCount: 6
  }
];

// Individual content block interface
export interface ContentBlock {
  id: string; // e.g., "twitter_threads_1", "linkedin_posts_2"
  contentTypeId: string; // e.g., "twitter_threads"
  blockNumber: number; // 1-based index (1, 2, 3, 4)
  name: string; // e.g., "X Thread #1"
  enabled: boolean;
  theme: string; // Theme ID from content-themes.ts
  customGuidance?: string;
}

// Helper functions
export function getContentTypeById(id: string): ContentType | undefined {
  return CONTENT_TYPES.find(ct => ct.id === id);
}

export function estimateTotalCost(contentTypeIds: string[]): number {
  return contentTypeIds.reduce((total, id) => {
    const contentType = getContentTypeById(id);
    return total + (contentType?.estimatedCostUSD || 0);
  }, 0);
}

// Generate individual blocks from content types
export function generateContentBlocks(defaultTheme: string = 'professional'): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  CONTENT_TYPES.forEach(contentType => {
    for (let i = 1; i <= contentType.count; i++) {
      blocks.push({
        id: `${contentType.id}_${i}`,
        contentTypeId: contentType.id,
        blockNumber: i,
        name: `${contentType.name.replace(/s$/, '')} #${i}`, // Remove trailing 's' and add number
        enabled: false, // Default to disabled
        theme: defaultTheme
      });
    }
  });

  return blocks;
}

// Get all blocks for a specific content type
export function getBlocksByContentType(contentTypeId: string, allBlocks: ContentBlock[]): ContentBlock[] {
  return allBlocks.filter(block => block.contentTypeId === contentTypeId);
}

// Generate ContentBlock[] from a quantity map (used by the redesigned modal)
export function generateBlocksFromQuantities(
  quantities: Record<string, { count: number; theme: string }>
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const [typeId, { count, theme }] of Object.entries(quantities)) {
    const contentType = getContentTypeById(typeId);
    if (!contentType || count <= 0) continue;

    for (let i = 1; i <= count; i++) {
      blocks.push({
        id: `${typeId}_${i}`,
        contentTypeId: typeId,
        blockNumber: i,
        name: `${contentType.name.replace(/s$/, '')} #${i}`,
        enabled: true,
        theme
      });
    }
  }

  return blocks;
}

// Calculate cost for enabled blocks
export function calculateBlocksCost(blocks: ContentBlock[]): number {
  const enabledTypeIds = new Set(
    blocks.filter(b => b.enabled).map(b => b.contentTypeId)
  );

  let total = 0;
  enabledTypeIds.forEach(typeId => {
    const contentType = getContentTypeById(typeId);
    if (contentType) {
      const enabledCount = blocks.filter(b => b.contentTypeId === typeId && b.enabled).length;
      // Cost per block = total type cost / count
      const costPerBlock = (contentType.estimatedCostUSD || 0) / contentType.count;
      total += costPerBlock * enabledCount;
    }
  });

  return total;
}
