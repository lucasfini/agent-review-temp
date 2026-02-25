// AI-powered key takeaways extraction using GPT-4o-mini
import OpenAI from 'openai';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

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
 * Extract key takeaways from podcast transcription using GPT-4o-mini
 */
export async function extractKeyTakeaways(
  transcriptionText: string,
  options: {
    maxTakeaways?: number;
    speakerContext?: Record<string, { name: string; role?: string }>;
    userId?: string;
    projectId?: string;
  } = {}
): Promise<TakeawaysResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Adaptive takeaway count: reduce for shorter transcripts to avoid fluff
  const transcriptLength = transcriptionText.length;
  const defaultTakeawayCount = transcriptLength < 5000 ? 4 : 8;
  const { maxTakeaways = defaultTakeawayCount, speakerContext, userId, projectId } = options;

  console.log('[TAKEAWAYS] 💎 Extracting action-first takeaways with GPT-4o-mini...');
  console.log(`[TAKEAWAYS] 📏 Transcript length: ${transcriptLength} chars, requesting ${maxTakeaways} takeaways`);

  const openai = new OpenAI({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (speakerContext && Object.keys(speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  const prompt = `You are an expert business analyst and high-performance coach. Your task is to extract the ${maxTakeaways} most valuable "Gold Nuggets" from this transcript.

WHAT MAKES A GOOD TAKEAWAY?

Actionable: Can the user do something with this information today?

Specific: No "vague advice." Use specific numbers, frameworks, or tools mentioned.

Contextual: Mention who said it and why it mattered in that specific part of the conversation.

STRICT CATEGORY SYSTEM:
Use only these categories:
- Strategic Pivot (High-level mindset or direction shifts)
- Tactical Tool (Specific apps, workflows, or scripts)
- Counter-Intuitive Truth (Something that goes against common wisdom)
- Growth Metric (Specific KPIs or numbers to track)
- Leadership Principle (People management or self-regulation)

OUTPUT FORMAT:
Return ONLY a valid JSON object with a "takeaways" array:
{
  "takeaways": [
    {
      "takeaway": "Implement a 'Negative Constraint' rule: stop doing one low-value task for every new project started.",
      "category": "Strategic Pivot",
      "context": "The guest discussed how they avoided burnout by auditing their calendar every Friday."
    }
  ]
}

TRANSCRIPT DATA:
${speakerInfo}
Transcription:
${transcriptionText.slice(0, 80000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      max_completion_tokens: 16000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'You are an expert business analyst who extracts actionable, high-signal insights. Always return valid JSON objects with specific, concrete takeaways.'
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
        modelName: 'gpt-5-nano',
        purpose: 'Key Takeaways',
        shouldDebit: true
      });
    }

    const responseText = response.choices[0]?.message?.content || '{}';

    // Parse JSON response
    const takeaways = parseTakeawaysResponse(responseText);

    console.log(`[TAKEAWAYS] ✅ Extracted ${takeaways.length} action-first takeaways with GPT-4o-mini`);
    console.log(`[TAKEAWAYS] 📊 Tokens: ${response.usage?.prompt_tokens || 0} in, ${response.usage?.completion_tokens || 0} out`);

    return {
      takeaways,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[TAKEAWAYS] ❌ Extraction failed:', error);
    throw new Error(`Takeaways extraction failed: ${error.message}`);
  }
}

/**
 * Parse and validate takeaways response from GPT-4o-mini
 */
function parseTakeawaysResponse(content: string): KeyTakeaway[] {
  // Strip markdown code blocks if present
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  }

  try {
    const parsed = JSON.parse(cleanContent);

    // Handle both direct array and object with takeaways property
    let takeawaysArray: any[] = [];
    if (Array.isArray(parsed)) {
      takeawaysArray = parsed;
    } else if (parsed.takeaways && Array.isArray(parsed.takeaways)) {
      takeawaysArray = parsed.takeaways;
    } else {
      throw new Error('Response does not contain a valid takeaways array');
    }

    if (takeawaysArray.length === 0) {
      console.warn('[TAKEAWAYS] ⚠️ No takeaways found in response');
      return [];
    }

    // Validate and normalize each takeaway (preserve category case)
    const normalizedTakeaways = takeawaysArray.map(item => ({
      takeaway: typeof item.takeaway === 'string' ? item.takeaway.trim() : '',
      category: typeof item.category === 'string' ? item.category.trim() : 'Strategic Pivot',
      context: typeof item.context === 'string' ? item.context.trim() : '',
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : undefined
    })).filter(item => item.takeaway.length > 0);

    // Validate categories against allowed list
    const allowedCategories = [
      'Strategic Pivot',
      'Tactical Tool',
      'Counter-Intuitive Truth',
      'Growth Metric',
      'Leadership Principle'
    ];

    normalizedTakeaways.forEach((item, index) => {
      // Check if category matches any allowed category (case-insensitive)
      const matchedCategory = allowedCategories.find(
        allowed => allowed.toLowerCase() === item.category.toLowerCase()
      );

      if (!matchedCategory) {
        console.warn(`[TAKEAWAYS] ⚠️ Takeaway #${index + 1} has invalid category "${item.category}", defaulting to "Strategic Pivot"`);
        item.category = 'Strategic Pivot';
      } else {
        // Use the properly cased version
        item.category = matchedCategory;
      }
    });

    return normalizedTakeaways;

  } catch (parseError: any) {
    console.error('[TAKEAWAYS] JSON parse error:', parseError);
    console.error('[TAKEAWAYS] Raw content:', content.substring(0, 500));
    // Return empty array on parse failure
    return [];
  }
}
