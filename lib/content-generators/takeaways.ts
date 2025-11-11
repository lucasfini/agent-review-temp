// AI-powered key takeaways extraction using Claude Sonnet 4.5
import Anthropic from '@anthropic-ai/sdk';

export interface KeyTakeaway {
  takeaway: string;
  category: string;
  context: string;
  timestamp?: number;
}

export interface TakeawaysResult {
  takeaways: KeyTakeaway[];
  tokensUsed: {
    input: number;
    output: number;
  };
  generatedAt: string;
}

/**
 * Extract key takeaways from podcast transcription using Claude Sonnet 4.5
 */
export async function extractKeyTakeaways(
  transcriptionText: string,
  options: {
    maxTakeaways?: number;
    speakerContext?: Record<string, { name: string; role?: string }>;
  } = {}
): Promise<TakeawaysResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const { maxTakeaways = 8, speakerContext } = options;

  console.log('[TAKEAWAYS] 💎 Extracting key takeaways...');

  const anthropic = new Anthropic({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (speakerContext && Object.keys(speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  const prompt = `You are analyzing a podcast/interview transcription to extract the most valuable insights and takeaways.

${speakerInfo}

Task: Identify ${maxTakeaways} key takeaways from this conversation. Focus on:
- Actionable advice or recommendations
- Important insights or revelations
- Surprising facts or statistics
- Key lessons or principles discussed
- Memorable quotes or ideas

For each takeaway, provide:
1. The core takeaway (concise, 1-2 sentences)
2. Category (e.g., "strategy", "mindset", "tactics", "insight", "research", "advice")
3. Context (who said it and in what context)

Return ONLY a valid JSON array in this exact format:
[
  {
    "takeaway": "Focusing on one core metric early helps startups prioritize effectively.",
    "category": "strategy",
    "context": "Guest discussed how successful startups identify their north star metric"
  }
]

Guidelines:
- Extract the ${maxTakeaways} MOST valuable takeaways
- Make each takeaway actionable or insightful
- Keep takeaway text concise but complete
- Provide enough context to understand the takeaway
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
    const takeaways = parseTakeawaysResponse(responseText);

    console.log(`[TAKEAWAYS] ✅ Extracted ${takeaways.length} key takeaways`);
    console.log(`[TAKEAWAYS] 📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

    return {
      takeaways,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[TAKEAWAYS] ❌ Extraction failed:', error);
    throw new Error(`Takeaways extraction failed: ${error.message}`);
  }
}

/**
 * Parse and validate takeaways response from Claude
 */
function parseTakeawaysResponse(content: string): KeyTakeaway[] {
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

    // Validate and normalize each takeaway
    return parsed.map(item => ({
      takeaway: typeof item.takeaway === 'string' ? item.takeaway.trim() : '',
      category: typeof item.category === 'string' ? item.category.trim().toLowerCase() : 'insight',
      context: typeof item.context === 'string' ? item.context.trim() : '',
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : undefined
    })).filter(item => item.takeaway.length > 0);

  } catch (parseError: any) {
    console.error('[TAKEAWAYS] JSON parse error:', parseError);
    // Return empty array on parse failure
    return [];
  }
}
