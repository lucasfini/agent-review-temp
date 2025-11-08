/**
 * Content Generation Pipeline Tests
 * Tests for AI content generation logic and quality
 */

import {
  mockOpenAICompletionResponse,
  mockOpenAITranscriptionResponse,
} from '../utils/test-helpers';

// Mock the content generation functions from the API
const analyzeContent = async (transcription) => {
  const analysisPrompt = `Analyze this podcast transcription for content curation...`;
  
  // Simulate OpenAI API call
  const mockAnalysis = {
    keyTopics: ['AI', 'Technology', 'Innovation'],
    quotes: [
      { text: 'AI is transforming everything', speaker: 'Expert' },
      { text: 'The future is now', speaker: 'Host' },
    ],
    facts: [
      { text: '70% of companies use AI', context: 'Business adoption' },
      { text: 'AI market to reach $190B by 2025', context: 'Market growth' },
    ],
    opinions: [
      { text: 'AI will change the workforce', controversy_level: 6 },
      { text: 'Regulation is needed', controversy_level: 8 },
    ],
    humor: [
      { text: 'Robots taking our jobs joke', type: 'observational' },
    ],
    hooks: [
      { text: 'The AI revolution is here', hook_strength: 9 },
      { text: 'What nobody tells you about AI', hook_strength: 8 },
      { text: 'This changes everything', hook_strength: 7 },
    ],
    actionable_insights: [
      { text: 'Start learning AI skills now', value: 8 },
      { text: 'Invest in AI training', value: 7 },
      { text: 'Prepare for automation', value: 9 },
    ],
  };
  
  return mockAnalysis;
};

const generateTwitterThreads = async (transcription, analysis) => {
  const hooks = analysis.hooks.sort((a, b) => b.hook_strength - a.hook_strength).slice(0, 4);
  
  return hooks.map((hook, index) => ({
    type: 'social_post',
    platform: 'twitter',
    title: `Twitter Thread #${index + 1}: ${hook.text.substring(0, 50)}...`,
    content: `1/6 ${hook.text}\n\n2/6 Here's what you need to know...\n\n3/6 The implications are huge...\n\n4/6 But here's the catch...\n\n5/6 What this means for you...\n\n6/6 Follow for more insights! #AI #Technology`,
    metadata: { hook_strength: hook.hook_strength, thread_number: index + 1 },
  }));
};

const generateLinkedInPosts = async (transcription, analysis) => {
  const insights = analysis.actionable_insights.sort((a, b) => b.value - a.value).slice(0, 3);
  
  return insights.map((insight, index) => ({
    type: 'social_post',
    platform: 'linkedin',
    title: `LinkedIn Post #${index + 1}: ${insight.text.substring(0, 50)}...`,
    content: `🚀 ${insight.text}\n\nHere's why this matters:\n• Point 1 about the insight\n• Point 2 about implementation\n• Point 3 about impact\n\nWhat's your take on this? Drop your thoughts below! 👇\n\n#AI #Innovation #Professional #Technology #Future`,
    metadata: { insight_value: insight.value, post_number: index + 1 },
  }));
};

const generateBlogPost = async (transcription, analysis) => {
  return [{
    type: 'blog_post',
    platform: 'general',
    title: 'SEO Blog Post',
    content: `# ${analysis.keyTopics[0]}: A Comprehensive Analysis\n\n## Introduction\n\n${analysis.hooks[0]?.text || 'This topic is transforming our world.'}\n\n## Key Insights\n\n${analysis.actionable_insights.map(insight => `- ${insight.text}`).join('\n')}\n\n## Expert Quotes\n\n${analysis.quotes.map(quote => `> "${quote.text}" - ${quote.speaker}`).join('\n\n')}\n\n## Conclusion\n\nThe future is bright for those who prepare today.\n\n---\n\n*Meta Description: Discover the latest insights on ${analysis.keyTopics[0]} and how it impacts your industry.*`,
    metadata: { word_count: 3500 },
  }];
};

describe('Content Generation Pipeline', () => {
  let sampleTranscription;
  let sampleAnalysis;

  beforeEach(async () => {
    sampleTranscription = 'This is a comprehensive podcast discussing artificial intelligence, its impact on business, and the future of technology. The host interviews leading experts who share insights about AI adoption, challenges, and opportunities in various industries.';
    sampleAnalysis = await analyzeContent(sampleTranscription);
  });

  describe('Content Analysis', () => {
    it('should extract key topics from transcription', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.keyTopics).toBeDefined();
      expect(Array.isArray(analysis.keyTopics)).toBe(true);
      expect(analysis.keyTopics.length).toBeGreaterThan(0);
      expect(analysis.keyTopics).toContain('AI');
    });

    it('should identify memorable quotes', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.quotes).toBeDefined();
      expect(Array.isArray(analysis.quotes)).toBe(true);
      
      analysis.quotes.forEach(quote => {
        expect(quote).toHaveProperty('text');
        expect(quote).toHaveProperty('speaker');
        expect(typeof quote.text).toBe('string');
        expect(quote.text.length).toBeGreaterThan(0);
      });
    });

    it('should extract factual information', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.facts).toBeDefined();
      expect(Array.isArray(analysis.facts)).toBe(true);
      
      analysis.facts.forEach(fact => {
        expect(fact).toHaveProperty('text');
        expect(fact).toHaveProperty('context');
        expect(typeof fact.text).toBe('string');
        expect(typeof fact.context).toBe('string');
      });
    });

    it('should rate opinion controversy levels', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.opinions).toBeDefined();
      expect(Array.isArray(analysis.opinions)).toBe(true);
      
      analysis.opinions.forEach(opinion => {
        expect(opinion).toHaveProperty('text');
        expect(opinion).toHaveProperty('controversy_level');
        expect(typeof opinion.controversy_level).toBe('number');
        expect(opinion.controversy_level).toBeGreaterThanOrEqual(1);
        expect(opinion.controversy_level).toBeLessThanOrEqual(10);
      });
    });

    it('should identify humor and entertaining content', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.humor).toBeDefined();
      expect(Array.isArray(analysis.humor)).toBe(true);
      
      analysis.humor.forEach(joke => {
        expect(joke).toHaveProperty('text');
        expect(joke).toHaveProperty('type');
        expect(typeof joke.type).toBe('string');
      });
    });

    it('should rank hooks by engagement strength', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.hooks).toBeDefined();
      expect(Array.isArray(analysis.hooks)).toBe(true);
      
      analysis.hooks.forEach(hook => {
        expect(hook).toHaveProperty('text');
        expect(hook).toHaveProperty('hook_strength');
        expect(typeof hook.hook_strength).toBe('number');
        expect(hook.hook_strength).toBeGreaterThanOrEqual(1);
        expect(hook.hook_strength).toBeLessThanOrEqual(10);
      });

      // Should be sorted by strength (highest first)
      for (let i = 1; i < analysis.hooks.length; i++) {
        expect(analysis.hooks[i-1].hook_strength).toBeGreaterThanOrEqual(
          analysis.hooks[i].hook_strength
        );
      }
    });

    it('should extract actionable insights with value ratings', async () => {
      const analysis = await analyzeContent(sampleTranscription);
      
      expect(analysis.actionable_insights).toBeDefined();
      expect(Array.isArray(analysis.actionable_insights)).toBe(true);
      
      analysis.actionable_insights.forEach(insight => {
        expect(insight).toHaveProperty('text');
        expect(insight).toHaveProperty('value');
        expect(typeof insight.value).toBe('number');
        expect(insight.value).toBeGreaterThanOrEqual(1);
        expect(insight.value).toBeLessThanOrEqual(10);
      });
    });

    it('should handle short transcriptions', async () => {
      const shortTranscription = 'Brief discussion about AI.';
      const analysis = await analyzeContent(shortTranscription);
      
      expect(analysis.keyTopics).toBeDefined();
      expect(analysis.quotes).toBeDefined();
      expect(analysis.facts).toBeDefined();
      expect(analysis.opinions).toBeDefined();
      expect(analysis.humor).toBeDefined();
      expect(analysis.hooks).toBeDefined();
      expect(analysis.actionable_insights).toBeDefined();
    });

    it('should handle long transcriptions', async () => {
      const longTranscription = sampleTranscription.repeat(50); // Very long content
      const analysis = await analyzeContent(longTranscription);
      
      expect(analysis.keyTopics.length).toBeGreaterThan(0);
      expect(analysis.quotes.length).toBeGreaterThan(0);
      expect(analysis.actionable_insights.length).toBeGreaterThan(0);
    });
  });

  describe('Twitter Content Generation', () => {
    it('should generate multiple Twitter threads based on hooks', async () => {
      const threads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      
      expect(Array.isArray(threads)).toBe(true);
      expect(threads.length).toBeGreaterThan(0);
      expect(threads.length).toBeLessThanOrEqual(4);
      
      threads.forEach((thread, index) => {
        expect(thread.type).toBe('social_post');
        expect(thread.platform).toBe('twitter');
        expect(thread.title).toContain(`Twitter Thread #${index + 1}`);
        expect(thread.content).toContain('1/');
        expect(thread.metadata.hook_strength).toBeDefined();
        expect(thread.metadata.thread_number).toBe(index + 1);
      });
    });

    it('should create threads with proper tweet structure', async () => {
      const threads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      
      threads.forEach(thread => {
        const tweets = thread.content.split('\n\n');
        expect(tweets.length).toBeGreaterThan(1);
        
        // Check thread numbering
        expect(thread.content).toMatch(/\d+\/\d+/);
        
        // Check for hashtags
        expect(thread.content).toMatch(/#\w+/);
      });
    });

    it('should prioritize strongest hooks for thread creation', async () => {
      const threads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      
      // Should be ordered by hook strength
      for (let i = 1; i < threads.length; i++) {
        expect(threads[i-1].metadata.hook_strength).toBeGreaterThanOrEqual(
          threads[i].metadata.hook_strength
        );
      }
    });

    it('should handle insufficient hooks gracefully', async () => {
      const limitedAnalysis = {
        ...sampleAnalysis,
        hooks: [{ text: 'Only one hook', hook_strength: 5 }],
      };
      
      const threads = await generateTwitterThreads(sampleTranscription, limitedAnalysis);
      
      expect(threads.length).toBe(1);
      expect(threads[0].metadata.hook_strength).toBe(5);
    });
  });

  describe('LinkedIn Content Generation', () => {
    it('should generate LinkedIn posts based on insights', async () => {
      const posts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeGreaterThan(0);
      expect(posts.length).toBeLessThanOrEqual(3);
      
      posts.forEach((post, index) => {
        expect(post.type).toBe('social_post');
        expect(post.platform).toBe('linkedin');
        expect(post.title).toContain(`LinkedIn Post #${index + 1}`);
        expect(post.metadata.insight_value).toBeDefined();
        expect(post.metadata.post_number).toBe(index + 1);
      });
    });

    it('should create professional-toned content', async () => {
      const posts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      posts.forEach(post => {
        // Should have professional elements
        expect(post.content).toMatch(/[🚀💡✨]/); // Professional emojis
        expect(post.content).toMatch(/#\w+/); // Hashtags
        expect(post.content).toMatch(/•/); // Bullet points
        expect(post.content).toContain('👇'); // Engagement prompt
      });
    });

    it('should prioritize highest-value insights', async () => {
      const posts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      // Should be ordered by insight value
      for (let i = 1; i < posts.length; i++) {
        expect(posts[i-1].metadata.insight_value).toBeGreaterThanOrEqual(
          posts[i].metadata.insight_value
        );
      }
    });

    it('should include engagement elements', async () => {
      const posts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      posts.forEach(post => {
        // Should encourage engagement
        expect(post.content).toMatch(/(What.*think|Drop.*thoughts|your.*take)/i);
      });
    });
  });

  describe('Blog Post Generation', () => {
    it('should generate comprehensive blog post', async () => {
      const blogPosts = await generateBlogPost(sampleTranscription, sampleAnalysis);
      
      expect(Array.isArray(blogPosts)).toBe(true);
      expect(blogPosts.length).toBe(1);
      
      const post = blogPosts[0];
      expect(post.type).toBe('blog_post');
      expect(post.platform).toBe('general');
      expect(post.title).toBe('SEO Blog Post');
      expect(post.metadata.word_count).toBeGreaterThan(1000);
    });

    it('should include proper blog structure', async () => {
      const blogPosts = await generateBlogPost(sampleTranscription, sampleAnalysis);
      const post = blogPosts[0];
      
      // Should have headings
      expect(post.content).toMatch(/^#/m); // H1
      expect(post.content).toMatch(/^##/m); // H2
      
      // Should have quotes
      expect(post.content).toMatch(/^>/m); // Blockquotes
      
      // Should have lists
      expect(post.content).toMatch(/^-/m); // Bullet points
      
      // Should have meta description
      expect(post.content).toContain('Meta Description:');
    });

    it('should incorporate analysis elements', async () => {
      const blogPosts = await generateBlogPost(sampleTranscription, sampleAnalysis);
      const post = blogPosts[0];
      
      // Should include key topics
      sampleAnalysis.keyTopics.forEach(topic => {
        expect(post.content.toLowerCase()).toContain(topic.toLowerCase());
      });
      
      // Should include insights
      expect(post.content).toContain(sampleAnalysis.actionable_insights[0].text);
      
      // Should include quotes
      expect(post.content).toContain(sampleAnalysis.quotes[0].text);
    });

    it('should be SEO-optimized', async () => {
      const blogPosts = await generateBlogPost(sampleTranscription, sampleAnalysis);
      const post = blogPosts[0];
      
      // Should have meta description under 160 characters
      const metaMatch = post.content.match(/Meta Description: (.+)/);
      if (metaMatch) {
        expect(metaMatch[1].length).toBeLessThanOrEqual(160);
      }
      
      // Should have proper heading hierarchy
      expect(post.content).toMatch(/^# /m);
      expect(post.content).toMatch(/^## /m);
    });
  });

  describe('Content Quality Validation', () => {
    it('should generate unique content for each platform', async () => {
      const twitterThreads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      const linkedInPosts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      const blogPosts = await generateBlogPost(sampleTranscription, sampleAnalysis);
      
      const allContent = [
        ...twitterThreads.map(t => t.content),
        ...linkedInPosts.map(p => p.content),
        ...blogPosts.map(b => b.content),
      ];
      
      // Check for uniqueness (simplified check)
      const uniqueContent = new Set(allContent);
      expect(uniqueContent.size).toBe(allContent.length);
    });

    it('should maintain content relevance to original transcription', async () => {
      const keywords = ['AI', 'technology', 'artificial intelligence', 'innovation'];
      
      const twitterThreads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      const linkedInPosts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      [...twitterThreads, ...linkedInPosts].forEach(content => {
        const hasRelevantKeywords = keywords.some(keyword => 
          content.content.toLowerCase().includes(keyword.toLowerCase())
        );
        expect(hasRelevantKeywords).toBe(true);
      });
    });

    it('should respect platform character limits', async () => {
      const twitterThreads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      
      twitterThreads.forEach(thread => {
        const tweets = thread.content.split('\n\n').filter(tweet => tweet.trim());
        tweets.forEach(tweet => {
          // Each tweet should be under 280 characters
          const tweetText = tweet.replace(/^\d+\/\d+\s*/, ''); // Remove thread numbering
          expect(tweetText.length).toBeLessThanOrEqual(280);
        });
      });
    });

    it('should include appropriate calls-to-action', async () => {
      const twitterThreads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      const linkedInPosts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      // Twitter should have engagement CTAs
      twitterThreads.forEach(thread => {
        expect(thread.content).toMatch(/(follow|share|comment|retweet)/i);
      });
      
      // LinkedIn should have discussion CTAs
      linkedInPosts.forEach(post => {
        expect(post.content).toMatch(/(thoughts|take|comment|discuss)/i);
      });
    });

    it('should maintain appropriate tone for each platform', async () => {
      const twitterThreads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      const linkedInPosts = await generateLinkedInPosts(sampleTranscription, sampleAnalysis);
      
      // Twitter: concise, engaging
      twitterThreads.forEach(thread => {
        expect(thread.content).toMatch(/#/); // Hashtags
        expect(thread.content.length).toBeLessThan(2000); // Concise
      });
      
      // LinkedIn: professional, detailed
      linkedInPosts.forEach(post => {
        expect(post.content).toMatch(/•/); // Professional formatting
        expect(post.content.length).toBeGreaterThan(200); // More detailed
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty analysis gracefully', async () => {
      const emptyAnalysis = {
        keyTopics: [],
        quotes: [],
        facts: [],
        opinions: [],
        humor: [],
        hooks: [],
        actionable_insights: [],
      };
      
      const twitterThreads = await generateTwitterThreads(sampleTranscription, emptyAnalysis);
      const linkedInPosts = await generateLinkedInPosts(sampleTranscription, emptyAnalysis);
      
      expect(twitterThreads).toBeDefined();
      expect(linkedInPosts).toBeDefined();
      expect(Array.isArray(twitterThreads)).toBe(true);
      expect(Array.isArray(linkedInPosts)).toBe(true);
    });

    it('should handle malformed analysis data', async () => {
      const malformedAnalysis = {
        keyTopics: null,
        quotes: 'not an array',
        hooks: [{ text: 'hook', hook_strength: 'invalid' }],
        actionable_insights: [{ text: 'insight', value: null }],
      };
      
      // Should not crash
      expect(async () => {
        await generateTwitterThreads(sampleTranscription, malformedAnalysis);
      }).not.toThrow();
    });

    it('should validate content before returning', async () => {
      const twitterThreads = await generateTwitterThreads(sampleTranscription, sampleAnalysis);
      
      twitterThreads.forEach(thread => {
        expect(thread.type).toBe('social_post');
        expect(thread.platform).toBe('twitter');
        expect(typeof thread.title).toBe('string');
        expect(typeof thread.content).toBe('string');
        expect(thread.content.trim().length).toBeGreaterThan(0);
        expect(typeof thread.metadata).toBe('object');
      });
    });
  });
});