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
    estimatedCostUSD: 0.02
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
    estimatedCostUSD: 0.02
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
    estimatedCostUSD: 0.015
  },
  {
    id: 'blog_post',
    name: 'Blog Post',
    description: 'SEO-optimized long-form article (3,000+ words)',
    count: 1,
    estimatedTokens: 4500,
    platform: 'general',
    enabled: true,
    category: 'longform',
    badge: 'Blog',
    outputType: 'blog_post',
    platformType: 'blog',
    tier: 'pro',
    estimatedCostUSD: 0.08
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
    estimatedCostUSD: 0.03
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
    estimatedCostUSD: 0.04
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
    estimatedCostUSD: 0.015
  }
];

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
