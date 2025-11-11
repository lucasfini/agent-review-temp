export type ContentCategory = 'social' | 'longform' | 'support';

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
}

export const CONTENT_TYPES: ContentType[] = [
  {
    id: 'twitter_threads',
    name: 'X Threads',
    description: '4 high-signal X threads (6-8 tweets) built from your strongest hooks',
    count: 4,
    estimatedTokens: 900,
    platform: 'twitter',
    enabled: true,
    category: 'social',
    badge: 'Social'
  },
  {
    id: 'linkedin_posts',
    name: 'LinkedIn Posts',
    description: '3 polished LinkedIn posts with leadership insights and calls to discussion',
    count: 3,
    estimatedTokens: 500,
    platform: 'linkedin',
    enabled: true,
    category: 'social',
    badge: 'Social'
  },
  {
    id: 'instagram_content',
    name: 'Instagram Carousel',
    description: '1 multi-slide carousel with caption + hashtag pack for Instagram',
    count: 1,
    estimatedTokens: 700,
    platform: 'instagram',
    enabled: true,
    category: 'social',
    badge: 'Social'
  },
  {
    id: 'blog_post',
    name: 'SEO Blog Post',
    description: '1 long-form blog post (3,000+ words) with on-page SEO structure',
    count: 1,
    estimatedTokens: 4500,
    platform: 'general',
    enabled: true,
    category: 'longform',
    badge: 'Long form'
  },
  {
    id: 'newsletter',
    name: 'Newsletter Issue',
    description: '1 email-ready newsletter with subject line, hook, insights, and CTA',
    count: 1,
    estimatedTokens: 1200,
    platform: 'general',
    enabled: true,
    category: 'longform',
    badge: 'Long form'
  },
  {
    id: 'show_notes',
    name: 'Episode Show Notes',
    description: '1 detailed show-notes doc with summary, timestamps, links, and takeaways',
    count: 1,
    estimatedTokens: 1100,
    platform: 'general',
    enabled: true,
    category: 'support',
    badge: 'Utility'
  },
  {
    id: 'quote_graphics',
    name: 'Quote Graphics',
    description: '2 pull quotes optimized for square graphics with speaker attribution',
    count: 2,
    estimatedTokens: 120,
    platform: 'instagram',
    enabled: true,
    category: 'support',
    badge: 'Utility'
  }
];
