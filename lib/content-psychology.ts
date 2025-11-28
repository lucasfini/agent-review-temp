// Content psychology and attention span optimization
// Based on research into platform-specific user behavior and cognitive psychology

export interface PlatformPsychology {
  platform: string;
  averageAttentionSpan: string;
  optimalLength: {
    min: number;
    max: number;
    unit: 'characters' | 'words' | 'minutes';
  };
  scrollSpeed: string;
  consumptionPattern: string;
  psychologicalTriggers: string[];
  bestPractices: string[];
  structureRules: string[];
}

export const PLATFORM_PSYCHOLOGY: Record<string, PlatformPsychology> = {
  twitter: {
    platform: 'Twitter/X',
    averageAttentionSpan: '8 seconds per tweet',
    optimalLength: {
      min: 150,
      max: 280,
      unit: 'characters'
    },
    scrollSpeed: 'Very fast (0.5-1 second per tweet)',
    consumptionPattern: 'Scanning mode - users scroll rapidly, stop only for hooks',
    psychologicalTriggers: [
      'Pattern interrupts (unexpected statements)',
      'Curiosity gaps (incomplete information)',
      'Controversy and strong opinions',
      'Numbers and specific data',
      'Emotional triggers (anger, joy, surprise)',
      'Social proof (engagement metrics)'
    ],
    bestPractices: [
      'First 5 words are critical - must hook immediately',
      'Use line breaks to improve scannability',
      'One idea per tweet maximum',
      'End threads with clear CTA',
      'Use 2-3 hashtags max (only in last tweet)',
      'Thread structure: Hook → Value → Proof → CTA'
    ],
    structureRules: [
      'Tweet 1: MUST be pure hook (question, bold claim, or shocking stat)',
      'Tweets 2-3: Expand on hook with value',
      'Tweets 4-6: Provide proof, examples, or tactics',
      'Tweet 7-8: Summarize and CTA',
      'Pattern interrupt every 2-3 tweets to maintain attention'
    ]
  },

  linkedin: {
    platform: 'LinkedIn',
    averageAttentionSpan: '3 minutes for feed posts',
    optimalLength: {
      min: 1300,
      max: 1500,
      unit: 'characters'
    },
    scrollSpeed: 'Moderate (2-3 seconds per post preview)',
    consumptionPattern: 'Professional browsing - seeking value and insights',
    psychologicalTriggers: [
      'Career advancement opportunities',
      'Industry insights and trends',
      'Professional credibility signals',
      'Actionable business advice',
      'Success stories and case studies',
      'Thought leadership and expertise'
    ],
    bestPractices: [
      'First 2 lines visible in feed - must compel click to "see more"',
      'Use short paragraphs (1-2 sentences)',
      'Include line breaks for readability',
      'Add personal credibility markers',
      'End with engaging question',
      'Professional but not corporate - show personality',
      '3-5 relevant hashtags'
    ],
    structureRules: [
      'Lines 1-2: Hook that\'s visible in collapsed view',
      'Paragraph 1: Expand hook with context or story',
      'Paragraph 2-3: Core value/insight/lesson',
      'Paragraph 4: Actionable takeaway or application',
      'Final line: Question to drive comments',
      'Include credibility markers throughout (years of experience, results, credentials)'
    ]
  },

  instagram: {
    platform: 'Instagram',
    averageAttentionSpan: '10 seconds per carousel slide',
    optimalLength: {
      min: 300,
      max: 500,
      unit: 'characters'
    },
    scrollSpeed: 'Medium (visual-first, text secondary)',
    consumptionPattern: 'Visual browsing - text supports imagery',
    psychologicalTriggers: [
      'Visual appeal and aesthetics',
      'Aspirational content',
      'Behind-the-scenes and authenticity',
      'Transformation and results',
      'Community and belonging',
      'Quick wins and tips'
    ],
    bestPractices: [
      'Visual hierarchy: Title slide must be eye-catching',
      'Keep slide text to 30-50 words maximum',
      'One concept per slide',
      'Use emojis strategically (2-3 per slide)',
      'Caption should complement, not repeat slides',
      '10-15 hashtags for reach',
      'Save-worthy content (educational value)'
    ],
    structureRules: [
      'Slide 1: Title with clear benefit (stop the scroll)',
      'Slides 2-6: One key point per slide',
      'Slide 7: Summary or CTA',
      'Each slide: Large text, minimal words, single focus',
      'Caption: Expand on content, add context, include CTA'
    ]
  },

  blog: {
    platform: 'Blog Post',
    averageAttentionSpan: '6-8 minutes (1,200-1,800 words)',
    optimalLength: {
      min: 1200,
      max: 1800,
      unit: 'words'
    },
    scrollSpeed: 'Slow (actual reading, not scanning)',
    consumptionPattern: 'Intentional reading - user committed to consuming',
    psychologicalTriggers: [
      'SEO and search intent fulfillment',
      'Comprehensive information',
      'Authority and expertise signals',
      'Actionable steps and frameworks',
      'Long-term value and depth',
      'Internal and external credibility (links, sources)'
    ],
    bestPractices: [
      'Clear H2/H3 structure for scannability',
      'Subheading every 200-300 words',
      'Short paragraphs (2-3 sentences)',
      'Bullet points and numbered lists',
      'Include examples and case studies',
      'Strong introduction and conclusion',
      'Clear CTAs throughout',
      'Internal links to related content'
    ],
    structureRules: [
      'Introduction: Hook + promise of value (150-200 words)',
      'Body: 3-5 main sections with clear H2s',
      'Each section: Topic sentence → explanation → examples → transition',
      'Use "you" language to engage reader',
      'Conclusion: Summary + clear next steps',
      'Include at least 2-3 visual elements (images, charts, quotes)'
    ]
  },

  newsletter: {
    platform: 'Email Newsletter',
    averageAttentionSpan: '3-5 minutes (800-1,200 words)',
    optimalLength: {
      min: 800,
      max: 1200,
      unit: 'words'
    },
    scrollSpeed: 'Moderate (committed but busy)',
    consumptionPattern: 'Dedicated attention in inbox environment',
    psychologicalTriggers: [
      'Exclusivity and insider information',
      'Personal connection with sender',
      'Direct value delivery',
      'Timely and relevant content',
      'Actionable insights',
      'Curiosity and anticipation'
    ],
    bestPractices: [
      'Subject line: 40-50 characters, create curiosity',
      'Preview text: Complement subject, add context',
      'Personal greeting and tone',
      'Scannable format (headers, bullets, short paragraphs)',
      'Single clear CTA',
      'P.S. section for secondary message',
      'Mobile-optimized (40% open on mobile)'
    ],
    structureRules: [
      'Opening: Personal greeting + context',
      'Hook: Why this matters now',
      'Body: 2-3 key insights or stories',
      'Value: Actionable takeaways',
      'CTA: Clear single next step',
      'P.S.: Personality, tease next email, or bonus',
      'Signature: Personal sign-off'
    ]
  },

  shownotes: {
    platform: 'Show Notes',
    averageAttentionSpan: '2-3 minutes (500-800 words)',
    optimalLength: {
      min: 500,
      max: 800,
      unit: 'words'
    },
    scrollSpeed: 'Fast scanning (looking for specific info)',
    consumptionPattern: 'Reference and navigation - not full consumption',
    psychologicalTriggers: [
      'Quick information access',
      'Timestamps for navigation',
      'Key takeaways and highlights',
      'Resource links',
      'Searchability',
      'Completeness'
    ],
    bestPractices: [
      'Summary at top (2-3 sentences)',
      'Timestamp every major topic',
      'Bullet points for key takeaways',
      'Clear section headers',
      'Link to resources mentioned',
      'Guest bio and links',
      'Quotable moments highlighted',
      'Easy to scan and search'
    ],
    structureRules: [
      'Episode summary (100 words max)',
      'Guest information and links',
      'Key topics with timestamps',
      'Memorable quotes (2-3)',
      'Resources and links mentioned',
      'Next episode tease',
      'Subscribe/follow CTAs'
    ]
  }
};

// Character/word count enforcement
export interface ContentLimits {
  hardMax: number;
  softMax: number; // Warning threshold
  min: number;
  unit: 'characters' | 'words';
  truncationStrategy: 'hard' | 'smart'; // Hard = cut at limit, Smart = find sentence break
}

export const STRICT_CONTENT_LIMITS: Record<string, ContentLimits> = {
  twitter_tweet: {
    hardMax: 280,
    softMax: 270,
    min: 50,
    unit: 'characters',
    truncationStrategy: 'hard'
  },
  twitter_thread: {
    hardMax: 280, // Per tweet
    softMax: 270,
    min: 100,
    unit: 'characters',
    truncationStrategy: 'hard'
  },
  linkedin_post: {
    hardMax: 1500,
    softMax: 1400,
    min: 1200,
    unit: 'characters',
    truncationStrategy: 'smart'
  },
  instagram_slide: {
    hardMax: 50,
    softMax: 45,
    min: 20,
    unit: 'words',
    truncationStrategy: 'smart'
  },
  instagram_caption: {
    hardMax: 500,
    softMax: 450,
    min: 300,
    unit: 'characters',
    truncationStrategy: 'smart'
  },
  blog_post: {
    hardMax: 1800,
    softMax: 1700,
    min: 1200,
    unit: 'words',
    truncationStrategy: 'smart'
  },
  newsletter: {
    hardMax: 1200,
    softMax: 1100,
    min: 800,
    unit: 'words',
    truncationStrategy: 'smart'
  },
  show_notes: {
    hardMax: 800,
    softMax: 750,
    min: 500,
    unit: 'words',
    truncationStrategy: 'smart'
  },
  quote_graphic: {
    hardMax: 25,
    softMax: 22,
    min: 10,
    unit: 'words',
    truncationStrategy: 'smart'
  }
};

// Truncation function with smart sentence breaking
export function enforceContentLimit(
  content: string,
  limitType: string,
  strict: boolean = true
): { content: string; wasTruncated: boolean; originalLength: number } {
  const limit = STRICT_CONTENT_LIMITS[limitType];
  if (!limit) {
    return { content, wasTruncated: false, originalLength: content.length };
  }

  const originalLength = limit.unit === 'characters'
    ? content.length
    : content.split(/\s+/).filter(w => w.length > 0).length;

  // Check if within limits
  if (originalLength <= limit.hardMax) {
    return { content, wasTruncated: false, originalLength };
  }

  // Needs truncation
  if (!strict) {
    // Just return with warning
    return { content, wasTruncated: true, originalLength };
  }

  // Perform truncation
  let truncatedContent = content;

  if (limit.unit === 'characters') {
    if (limit.truncationStrategy === 'hard') {
      truncatedContent = content.substring(0, limit.hardMax - 3) + '...';
    } else {
      // Smart truncation - find last sentence or period
      const cutPoint = content.lastIndexOf('.', limit.hardMax - 10);
      if (cutPoint > limit.hardMax * 0.8) {
        truncatedContent = content.substring(0, cutPoint + 1);
      } else {
        truncatedContent = content.substring(0, limit.hardMax - 3) + '...';
      }
    }
  } else {
    // Word-based truncation
    const words = content.split(/\s+/);
    if (limit.truncationStrategy === 'hard') {
      truncatedContent = words.slice(0, limit.hardMax).join(' ') + '...';
    } else {
      // Smart truncation - find last sentence
      let wordCount = 0;
      let lastSentenceEnd = 0;
      const sentences = content.split(/[.!?]+/);

      for (let i = 0; i < sentences.length; i++) {
        const sentenceWords = sentences[i].split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount + sentenceWords <= limit.hardMax) {
          wordCount += sentenceWords;
          lastSentenceEnd = i;
        } else {
          break;
        }
      }

      truncatedContent = sentences.slice(0, lastSentenceEnd + 1).join('.') + '.';
    }
  }

  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLength
  };
}

// Attention span optimization helpers
export function getOptimalThreadLength(theme: string): number {
  // Shorter threads for casual/funny themes, longer for educational/deep
  const shortThemes = ['funny', 'sarcastic', 'casual'];
  const longThemes = ['educational', 'academic', 'technical', 'storytelling'];

  if (shortThemes.includes(theme)) return 6;
  if (longThemes.includes(theme)) return 8;
  return 7; // Default
}

export function shouldIncludePatternInterrupt(tweetIndex: number, totalTweets: number): boolean {
  // Add pattern interrupt every 2-3 tweets in longer threads
  if (totalTweets <= 5) return false;
  return tweetIndex === Math.floor(totalTweets / 2);
}

export function getHookIntensity(platform: string): string {
  // Different platforms require different hook intensities
  const intensityMap: Record<string, string> = {
    twitter: 'EXTREME - Must stop scroll in <1 second',
    linkedin: 'HIGH - Must compel "see more" click',
    instagram: 'MEDIUM - Visual supports text hook',
    blog: 'LOW - Title and intro work together',
    newsletter: 'HIGH - Subject line + preview text critical'
  };

  return intensityMap[platform] || 'MEDIUM';
}
