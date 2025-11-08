// Cost estimation utility for content generation

export interface ContentType {
  id: string;
  name: string;
  description: string;
  count: number;
  estimatedTokens: number;
  costPerPiece: number;
  platform: string;
  enabled: boolean;
}

export interface CostEstimate {
  totalPieces: number;
  totalTokens: number;
  totalCost: number;
  breakdown: Array<{
    type: string;
    pieces: number;
    tokens: number;
    cost: number;
  }>;
}

// OpenAI pricing (as of 2024)
const GPT4_INPUT_COST_PER_1K = 0.03;   // $0.03 per 1K input tokens
const GPT4_OUTPUT_COST_PER_1K = 0.06;  // $0.06 per 1K output tokens

// Estimated token usage per content type
export const CONTENT_TYPES: ContentType[] = [
  {
    id: 'twitter_threads',
    name: 'Twitter Threads',
    description: '4 engaging Twitter threads (6-8 tweets each)',
    count: 4,
    estimatedTokens: 800, // ~200 tokens per thread
    costPerPiece: 0.05,
    platform: 'twitter',
    enabled: true
  },
  {
    id: 'linkedin_posts',
    name: 'LinkedIn Posts',
    description: '3 professional LinkedIn posts with engagement hooks',
    count: 3,
    estimatedTokens: 450, // ~150 tokens per post
    costPerPiece: 0.04,
    platform: 'linkedin',
    enabled: true
  },
  {
    id: 'instagram_content',
    name: 'Instagram Content',
    description: '3 carousel posts with captions and hashtags',
    count: 3,
    estimatedTokens: 600, // ~200 tokens per carousel
    costPerPiece: 0.06,
    platform: 'instagram',
    enabled: true
  },
  {
    id: 'blog_post',
    name: 'SEO Blog Post',
    description: '1 comprehensive blog post (3000+ words)',
    count: 1,
    estimatedTokens: 4000, // Large blog post
    costPerPiece: 0.25,
    platform: 'general',
    enabled: true
  },
  {
    id: 'newsletter',
    name: 'Newsletter Content',
    description: '1 email newsletter with key insights',
    count: 1,
    estimatedTokens: 800,
    costPerPiece: 0.08,
    platform: 'general',
    enabled: true
  },
  {
    id: 'show_notes',
    name: 'Episode Show Notes',
    description: '1 detailed show notes with timestamps',
    count: 1,
    estimatedTokens: 600,
    costPerPiece: 0.06,
    platform: 'general',
    enabled: true
  },
  {
    id: 'quote_graphics',
    name: 'Quote Graphics',
    description: '2 social media quote graphics',
    count: 2,
    estimatedTokens: 100, // Simple quotes
    costPerPiece: 0.02,
    platform: 'instagram',
    enabled: true
  }
];

/**
 * Calculate cost estimate based on selected content types
 */
export function calculateCostEstimate(
  selectedTypes: string[],
  transcriptionLength: number = 0
): CostEstimate {
  // Base analysis cost (always included)
  const analysisTokens = Math.min(transcriptionLength * 0.1, 2000); // ~10% of transcription
  const analysisCost = (analysisTokens / 1000) * GPT4_INPUT_COST_PER_1K;

  let totalPieces = 0;
  let totalTokens = analysisTokens;
  let totalCost = analysisCost;
  const breakdown: Array<{type: string; pieces: number; tokens: number; cost: number}> = [];

  // Add analysis to breakdown
  breakdown.push({
    type: 'Content Analysis',
    pieces: 1,
    tokens: analysisTokens,
    cost: analysisCost
  });

  // Calculate cost for each selected content type
  CONTENT_TYPES.forEach(contentType => {
    if (selectedTypes.includes(contentType.id)) {
      const inputTokens = Math.min(transcriptionLength * 0.3, 3000); // Context for each generation
      const outputTokens = contentType.estimatedTokens;
      
      const inputCost = (inputTokens / 1000) * GPT4_INPUT_COST_PER_1K * contentType.count;
      const outputCost = (outputTokens / 1000) * GPT4_OUTPUT_COST_PER_1K;
      
      const typeCost = inputCost + outputCost;
      const typeTokens = (inputTokens + outputTokens) * contentType.count;

      totalPieces += contentType.count;
      totalTokens += typeTokens;
      totalCost += typeCost;

      breakdown.push({
        type: contentType.name,
        pieces: contentType.count,
        tokens: typeTokens,
        cost: typeCost
      });
    }
  });

  return {
    totalPieces,
    totalTokens: Math.round(totalTokens),
    totalCost: Math.round(totalCost * 100) / 100, // Round to 2 decimal places
    breakdown: breakdown.map(item => ({
      ...item,
      tokens: Math.round(item.tokens),
      cost: Math.round(item.cost * 100) / 100
    }))
  };
}

/**
 * Get content type by ID
 */
export function getContentType(id: string): ContentType | undefined {
  return CONTENT_TYPES.find(type => type.id === id);
}

/**
 * Get all content types for a specific platform
 */
export function getContentTypesByPlatform(platform: string): ContentType[] {
  return CONTENT_TYPES.filter(type => type.platform === platform);
}

/**
 * Calculate total if all content types are selected
 */
export function getMaxCostEstimate(transcriptionLength: number = 0): CostEstimate {
  const allTypeIds = CONTENT_TYPES.map(type => type.id);
  return calculateCostEstimate(allTypeIds, transcriptionLength);
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`;
  return `${(tokens / 1000).toFixed(1)}K tokens`;
}