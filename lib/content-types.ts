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
  | 'instagram_caption';

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
  tier?: 'basic' | 'pro' | 'premium';
  estimatedCostUSD?: number;
  // Strict content limits
  limits?: ContentLimits;
  attentionSpan?: string; // Human-readable attention span
}

export const CONTENT_TYPES: ContentType[] = [
  {
    id: 'twitter_threads',
    name: 'X Threads',
    description: 'Thread-format posts (6-8 tweets each)',
    count: 4,
    estimatedTokens: 900,
    platform: 'twitter',
    enabled: true,
    category: 'social',
    badge: 'Twitter/X',
    outputType: 'twitter_thread',
    platformType: 'twitter',
    tier: 'basic',
    estimatedCostUSD: 0.02,
    limits: {
      min: 100,
      max: 280, // Per tweet
      unit: 'characters',
      hardLimit: true
    },
    attentionSpan: '8 seconds per tweet'
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
    tier: 'basic',
    estimatedCostUSD: 0.02,
    limits: {
      min: 1200,
      max: 1500,
      unit: 'characters',
      hardLimit: true
    },
    attentionSpan: '3 minutes (professional browsing)'
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
    tier: 'basic',
    estimatedCostUSD: 0.015,
    limits: {
      min: 300,
      max: 500,
      unit: 'characters',
      hardLimit: true
    },
    attentionSpan: '10 seconds per slide'
  },
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
    tier: 'pro',
    estimatedCostUSD: 0.08,
    limits: {
      min: 1200,
      max: 1800,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '6-8 minutes (committed reading)'
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
    tier: 'pro',
    estimatedCostUSD: 0.03,
    limits: {
      min: 800,
      max: 1200,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '3-5 minutes (inbox environment)'
  },
  {
    id: 'show_notes',
    name: 'Show Notes',
    description: 'Episode summary with timestamps, links, and key takeaways',
    count: 1,
    estimatedTokens: 1100,
    platform: 'general',
    enabled: true,
    category: 'support',
    badge: 'Documentation',
    outputType: 'show_notes',
    platformType: 'general',
    tier: 'premium',
    estimatedCostUSD: 0.04,
    limits: {
      min: 500,
      max: 800,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '2-3 minutes (scanning for info)'
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
    badge: 'Graphics',
    outputType: 'quote_graphic',
    platformType: 'general',
    tier: 'pro',
    estimatedCostUSD: 0.015,
    limits: {
      min: 10,
      max: 25,
      unit: 'words',
      hardLimit: true
    },
    attentionSpan: '3-5 seconds (quick visual scan)'
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
}

// Helper functions
export function getContentTypeById(id: string): ContentType | undefined {
  return CONTENT_TYPES.find(ct => ct.id === id);
}

export function getContentTypesByTier(tier: 'basic' | 'pro' | 'premium'): ContentType[] {
  const tierOrder = { basic: 1, pro: 2, premium: 3 };
  const userTierLevel = tierOrder[tier];

  return CONTENT_TYPES.filter(ct => {
    const ctTier = ct.tier || 'basic';
    return tierOrder[ctTier] <= userTierLevel;
  });
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
