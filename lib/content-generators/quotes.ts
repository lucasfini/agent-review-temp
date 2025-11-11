// AI-powered social media quote extraction using Claude Sonnet 4.5
import Anthropic from '@anthropic-ai/sdk';

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
 * Extract best quotes for social sharing using Claude Sonnet 4.5
 */
export async function extractSocialQuotes(
  transcriptionText: string,
  options: {
    maxQuotes?: number;
    speakerContext?: Record<string, { name: string; role?: string }>;
  } = {}
): Promise<QuotesResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const { maxQuotes = 8, speakerContext } = options;

  console.log('[QUOTES] 💬 Extracting social media quotes...');

  const anthropic = new Anthropic({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (speakerContext && Object.keys(speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  const prompt = `You are analyzing a podcast/interview transcription to find the best quotes for social media sharing.

${speakerInfo}

Task: Identify ${maxQuotes} highly shareable quotes that are:
- Insightful, inspiring, or thought-provoking
- Self-contained and understandable without context
- Concise (ideally under 280 characters)
- Memorable and quotable
- Suitable for social media platforms

For each quote, provide:
1. The exact quote (word-for-word from transcription)
2. Who said it (speaker name)
3. Category (e.g., "wisdom", "advice", "insight", "humor", "motivation")
4. Platforms it's suitable for (twitter, linkedin, instagram)

Return ONLY a valid JSON array in this exact format:
[
  {
    "quote": "The best time to plant a tree was 20 years ago. The second best time is now.",
    "speaker": "John Smith",
    "category": "wisdom",
    "platform": ["twitter", "linkedin", "instagram"]
  }
]

Guidelines:
- Extract ${maxQuotes} MOST shareable quotes
- Quotes should be verbatim from the transcription
- Each quote should stand alone without needing context
- Prioritize impactful, memorable statements
- Consider character limits: Twitter (280), Instagram (2200), LinkedIn (3000)
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.slice(0, 80000)}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Parse JSON response
    const quotes = parseQuotesResponse(responseText);

    console.log(`[QUOTES] ✅ Extracted ${quotes.length} social media quotes`);
    console.log(`[QUOTES] 📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

    return {
      quotes,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[QUOTES] ❌ Extraction failed:', error);
    throw new Error(`Quote extraction failed: ${error.message}`);
  }
}

/**
 * Parse and validate quotes response from Claude
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

    // Validate and normalize each quote
    return parsed.map(item => {
      const quote = typeof item.quote === 'string' ? item.quote.trim() : '';
      const speaker = typeof item.speaker === 'string' ? item.speaker.trim() : 'Unknown';
      const category = typeof item.category === 'string' ? item.category.trim().toLowerCase() : 'insight';
      const platform = Array.isArray(item.platform)
        ? item.platform.map((p: any) => String(p).toLowerCase())
        : ['twitter', 'linkedin', 'instagram'];

      // Extract timestamps if provided (optional feature)
      const startTime = typeof item.startTime === 'number' ? item.startTime : 0;
      const endTime = typeof item.endTime === 'number' ? item.endTime : 0;

      return {
        quote,
        speaker,
        startTime,
        endTime,
        category,
        platform,
        characterCount: quote.length
      };
    }).filter(item => item.quote.length > 0 && item.quote.length <= 500);

  } catch (parseError: any) {
    console.error('[QUOTES] JSON parse error:', parseError);
    // Return empty array on parse failure
    return [];
  }
}
