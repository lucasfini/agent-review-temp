// AI-powered chapter detection for podcasts using GPT-4o-mini
import OpenAI from 'openai';
import { getOpenAIApiKeyForUser } from '@/lib/openai/consent';
import { TranscriptionSegment } from '../types';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

export interface PodcastChapter {
  title: string;
  start_time: number;
  end_time: number;
  description: string;
  keyTopics: string[];
}

export interface ChaptersResult {
  chapters: PodcastChapter[];
  tokensUsed: {
    input: number;
    output: number;
  };
  generatedAt: string;
}

/**
 * Detect and generate chapter markers using GPT-4o-mini
 */
export async function detectPodcastChapters(
  transcriptionText: string,
  segments: TranscriptionSegment[],
  options: {
    speakerContext?: Record<string, { name: string; role?: string }>;
    userId?: string;
    projectId?: string;
    apiKey?: string;
  } = {}
): Promise<ChaptersResult> {
  const apiKey = options.apiKey ?? await getOpenAIApiKeyForUser(options.userId);
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('[CHAPTERS] 📚 Detecting chapter markers with GPT-4o-mini...');

  const openai = new OpenAI({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (options.speakerContext && Object.keys(options.speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(options.speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  // Calculate total duration
  const totalDuration = segments.length > 0
    ? segments[segments.length - 1].end
    : 0;

  const durationMinutes = Math.round(totalDuration / 60);

  const prompt = `You are an expert content producer. Analyze the podcast transcript to identify 5-8 natural thematic shifts.

GOAL: Create a navigation menu that helps a listener find specific, high-value moments.

STRICT CHAPTER RULES:

Title: Must be punchy and "curiosity-gap" driven (3-8 words). Avoid generic titles like "Introduction" or "Closing Thoughts."

Description: Do NOT repeat the title. Each description must explain the specific perspective or surprising fact shared in that segment.

Bad: "The guest discusses their history in AI."

Good: "The guest reveals why their early failures in neural networks actually led to their current breakthrough in LLM efficiency."

Timestamps: Ensure startTime and endTime are accurate based on the text.

Key Topics: Provide 2-4 granular tags per chapter.

OUTPUT FORMAT:
Return ONLY a valid JSON object with a "chapters" array:
{
  "chapters": [
    {
      "title": "The Hidden Cost of Rapid Scaling",
      "startTime": 0,
      "endTime": 450,
      "description": "A deep dive into why most Series A startups fail by over-hiring before finding product-market fit.",
      "keyTopics": ["scaling", "hiring strategy", "startup failure"]
    }
  ]
}

TRANSCRIPT DATA:
Audio Duration: ${durationMinutes} minutes
${speakerInfo}
Transcription:
${transcriptionText.slice(0, 80000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      max_completion_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'You are an expert content producer who creates engaging chapter markers. Always return valid JSON objects.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    if (options.userId) {
      await trackOpenAIUsage({
        userId: options.userId,
        projectId: options.projectId,
        response,
        modelName: 'gpt-5-nano',
        purpose: 'Chapter Detection',
        shouldDebit: true
      });
    }

    const responseText = response.choices[0]?.message?.content || '{}';

    // Parse JSON response
    const chapters = parseChaptersResponse(responseText, totalDuration);

    console.log(`[CHAPTERS] ✅ Detected ${chapters.length} chapters with GPT-4o-mini`);
    console.log(`[CHAPTERS] 📊 Tokens: ${response.usage?.prompt_tokens || 0} in, ${response.usage?.completion_tokens || 0} out`);

    return {
      chapters,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[CHAPTERS] ❌ Detection failed:', error);
    throw new Error(`Chapter detection failed: ${error.message}`);
  }
}

/**
 * Parse and validate chapters response from GPT-4o-mini
 */
function parseChaptersResponse(content: string, totalDuration: number): PodcastChapter[] {
  // Strip markdown code blocks if present
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  }

  try {
    const parsed = JSON.parse(cleanContent);

    // Handle both direct array and object with chapters property
    let chaptersArray: any[] = [];
    if (Array.isArray(parsed)) {
      chaptersArray = parsed;
    } else if (parsed.chapters && Array.isArray(parsed.chapters)) {
      chaptersArray = parsed.chapters;
    } else {
      throw new Error('Response does not contain a valid chapters array');
    }

    if (chaptersArray.length === 0) {
      console.warn('[CHAPTERS] ⚠️ No chapters found in response');
      return [];
    }

    // Validate and normalize each chapter
    const normalizedChapters = chaptersArray.map((chapter, index) => ({
      title: typeof chapter.title === 'string' ? chapter.title.trim() : `Chapter ${index + 1}`,
      start_time: typeof chapter.startTime === 'number' ? chapter.startTime : 0,
      end_time: typeof chapter.endTime === 'number' ? chapter.endTime : 0,
      description: typeof chapter.description === 'string' ? chapter.description.trim() : '',
      keyTopics: Array.isArray(chapter.keyTopics)
        ? chapter.keyTopics.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0)
        : []
    })).filter(chapter => chapter.end_time > chapter.start_time);

    // Validation: Ensure first chapter starts at 0
    if (normalizedChapters.length > 0 && normalizedChapters[0].start_time !== 0) {
      console.warn(`[CHAPTERS] ⚠️ First chapter doesn't start at 0 (starts at ${normalizedChapters[0].start_time}), adjusting...`);
      normalizedChapters[0].start_time = 0;
    }

    // Validation: Ensure last chapter ends near total duration (within 10% tolerance)
    if (normalizedChapters.length > 0 && totalDuration > 0) {
      const lastChapter = normalizedChapters[normalizedChapters.length - 1];
      const tolerance = totalDuration * 0.1; // 10% tolerance
      const expectedEnd = Math.round(totalDuration);

      if (Math.abs(lastChapter.end_time - expectedEnd) > tolerance) {
        console.warn(`[CHAPTERS] ⚠️ Last chapter ends at ${lastChapter.end_time}s, expected ~${expectedEnd}s, adjusting...`);
        lastChapter.end_time = expectedEnd;
      }
    }

    return normalizedChapters;

  } catch (parseError: any) {
    console.error('[CHAPTERS] JSON parse error:', parseError);
    console.error('[CHAPTERS] Raw content:', content.substring(0, 500));
    // Return empty chapters on parse failure
    return [];
  }
}
