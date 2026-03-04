// AI-powered social media quote extraction using GPT-4o
import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export interface SocialQuote {
  quote: string;
  speaker: string;
  startTime: number;
  endTime: number;
  category: string;
  platform: string[];
  characterCount: number;
}

export interface QuotesResult {
  quotes: SocialQuote[];
  tokensUsed: {
    input: number;
    output: number;
  };
  generatedAt: string;
}

/**
 * Extract best quotes for social sharing using GPT-4o
 */
export async function extractSocialQuotes(
  transcriptionText: string,
  options: {
    maxQuotes?: number;
    speakerContext?: Record<string, { name: string; role?: string }>;
    userId?: string;
    projectId?: string;
    apiKey?: string;
  } = {}
): Promise<QuotesResult> {
  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const { maxQuotes = 8, speakerContext, userId, projectId } = options;

  console.log('[QUOTES] 💬 Extracting high-impact social quotes with GPT-4o...');

  const openai = new OpenAI({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (speakerContext && Object.keys(speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  const prompt = `You are a world-class Social Media Manager specializing in "High-Signal" content. Your task is to find ${maxQuotes} quotes from this transcript that will stop a user's thumb mid-scroll.

WHAT MAKES A QUOTE SHAREABLE?

The "Vibe" Shift: Look for moments where the speaker drops their guard, uses a powerful metaphor, or challenges a common industry myth.

Self-Contained: The quote must make sense to someone who has NOT listened to the podcast.

Verbatim but Clean: You MUST use the speaker's exact words. You may only remove filler words (um, uh, like) if they distract from the core point.

STRICT PLATFORM GUIDES (2026 STANDARDS):

X (Twitter): Under 280 characters. Focus on "Contrarian" or "Punchy" insights.

LinkedIn: 100–300 characters. Focus on "Professional Growth" or "Frameworks."

Instagram: Under 125 characters (for the 'See More' cutoff). Focus on "Inspirational" or "Relatable" vibes.

SOCIAL SEO VERIFICATION:
Prioritize quotes that contain natural keywords related to the podcast's main topic. These keywords improve discoverability when shared on social platforms. Look for quotes that mention:
- Industry-specific terms
- Trending frameworks or methodologies
- Named tools or products
- Specific metrics or data points

OUTPUT FORMAT:
Return ONLY a valid JSON array:
[
  {
    "quote": "If you aren't embarrassed by the first version of your product, you launched too late.",
    "speaker": "Reid Hoffman",
    "category": "Growth Myth-Busting",
    "platform": ["twitter", "linkedin"]
  }
]

TRANSCRIPT DATA:
${speakerInfo}
Transcription:
${transcriptionText.slice(0, 80000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 16000,
      messages: [
        {
          role: 'system',
          content: 'You are a world-class social media strategist who identifies viral-worthy quotes. You prioritize authenticity, impact, and platform-specific optimization. Always return valid JSON arrays.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    if (userId) {
      await trackOpenAIUsage({
        userId,
        projectId,
        response,
        modelName: 'gpt-5-mini',
        purpose: 'Social Quotes',
        shouldDebit: true
      });
    }

    const responseText = response.choices[0]?.message?.content || '[]';

    // Parse JSON response
    const quotes = parseQuotesResponse(responseText);

    console.log(`[QUOTES] ✅ Extracted ${quotes.length} high-impact social quotes with GPT-4o`);
    console.log(`[QUOTES] 📊 Tokens: ${response.usage?.prompt_tokens || 0} in, ${response.usage?.completion_tokens || 0} out`);

    // Log platform distribution for analytics
    const platformCounts: Record<string, number> = {};
    quotes.forEach(q => {
      q.platform.forEach(p => {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      });
    });
    console.log(`[QUOTES] 📱 Platform distribution:`, platformCounts);

    return {
      quotes,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[QUOTES] ❌ Extraction failed:', error);
    throw new Error(`Quote extraction failed: ${error.message}`);
  }
}

/**
 * Parse and validate quotes response from GPT-4o
 */
function parseQuotesResponse(content: string): SocialQuote[] {
  // Strip markdown code blocks if present
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  }

  try {
    const parsed = JSON.parse(cleanContent);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    if (parsed.length === 0) {
      console.warn('[QUOTES] ⚠️ No quotes found in response');
      return [];
    }

    // Validate and normalize each quote
    const normalizedQuotes = parsed.map(item => {
      const quote = typeof item.quote === 'string' ? item.quote.trim() : '';
      const speaker = typeof item.speaker === 'string' ? item.speaker.trim() : 'Unknown';
      const category = typeof item.category === 'string' ? item.category.trim() : 'insight';
      const platform = Array.isArray(item.platform)
        ? item.platform.map((p: any) => String(p).toLowerCase()).filter((p: string) => ['twitter', 'linkedin', 'instagram', 'facebook'].includes(p))
        : ['twitter', 'linkedin', 'instagram'];

      // Extract timestamps if provided (optional feature)
      const startTime = typeof item.startTime === 'number' ? item.startTime : 0;
      const endTime = typeof item.endTime === 'number' ? item.endTime : 0;

      const characterCount = quote.length;

      return {
        quote,
        speaker,
        startTime,
        endTime,
        category,
        platform: platform.length > 0 ? platform : ['twitter', 'linkedin', 'instagram'],
        characterCount
      };
    }).filter(item => item.quote.length > 0 && item.quote.length <= 500);

    // Platform-specific validation and warnings
    normalizedQuotes.forEach((item, index) => {
      const charCount = item.characterCount;

      // X/Twitter validation (280 chars)
      if (item.platform.includes('twitter') && charCount > 280) {
        console.warn(`[QUOTES] ⚠️ Quote #${index + 1} exceeds Twitter limit (${charCount} > 280 chars), may be truncated`);
      }

      // LinkedIn optimal range (100-300 chars)
      if (item.platform.includes('linkedin')) {
        if (charCount < 100) {
          console.warn(`[QUOTES] ⚠️ Quote #${index + 1} may be too short for LinkedIn impact (${charCount} < 100 chars)`);
        } else if (charCount > 300) {
          console.warn(`[QUOTES] ⚠️ Quote #${index + 1} may be too long for LinkedIn (${charCount} > 300 chars)`);
        }
      }

      // Instagram 'See More' cutoff (125 chars)
      if (item.platform.includes('instagram') && charCount > 125) {
        console.warn(`[QUOTES] ⚠️ Quote #${index + 1} exceeds Instagram 'See More' cutoff (${charCount} > 125 chars)`);
      }
    });

    return normalizedQuotes;

  } catch (parseError: any) {
    console.error('[QUOTES] JSON parse error:', parseError);
    console.error('[QUOTES] Raw content:', content.substring(0, 500));
    // Return empty array on parse failure
    return [];
  }
}
