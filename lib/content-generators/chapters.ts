// AI-powered chapter detection for podcasts using Claude Sonnet 4.5
import Anthropic from '@anthropic-ai/sdk';
import { TranscriptionSegment } from '../types';

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
 * Detect and generate chapter markers using Claude Sonnet 4.5
 */
export async function detectPodcastChapters(
  transcriptionText: string,
  segments: TranscriptionSegment[],
  options: {
    speakerContext?: Record<string, { name: string; role?: string }>;
  } = {}
): Promise<ChaptersResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  console.log('[CHAPTERS] 📚 Detecting chapter markers...');

  const anthropic = new Anthropic({ apiKey });

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

  const prompt = `You are analyzing a podcast/interview transcription to identify natural chapter breaks and topic changes.

${speakerInfo}
Audio Duration: ${Math.round(totalDuration / 60)} minutes

Task: Identify 5-8 distinct chapters/sections based on topic changes, speaker introductions, or conversation shifts.

For each chapter, provide:
1. A concise, descriptive title (3-8 words)
2. Start and end timestamps (in seconds)
3. A brief description (1-2 sentences)
4. 2-4 key topics discussed in that chapter

Return ONLY a valid JSON array in this exact format:
[
  {
    "title": "Introduction and Guest Background",
    "startTime": 0,
    "endTime": 245,
    "description": "Host welcomes the guest and discusses their background in AI research.",
    "keyTopics": ["introductions", "guest background", "AI research overview"]
  }
]

Note: We will automatically convert startTime/endTime to start_time/end_time in the response.

Guidelines:
- Chapters should be roughly 3-10 minutes each
- Chapter breaks should occur at natural topic transitions
- Titles should be specific and descriptive
- Start time of first chapter should be 0
- End time of last chapter should be approximately ${Math.round(totalDuration)}
- Chapters must not overlap
- Return ONLY the JSON array, no other text

Transcription:
${transcriptionText.slice(0, 80000)}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Parse JSON response
    const chapters = parseChaptersResponse(responseText);

    console.log(`[CHAPTERS] ✅ Detected ${chapters.length} chapters`);
    console.log(`[CHAPTERS] 📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

    return {
      chapters,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[CHAPTERS] ❌ Detection failed:', error);
    throw new Error(`Chapter detection failed: ${error.message}`);
  }
}

/**
 * Parse and validate chapters response from Claude
 */
function parseChaptersResponse(content: string): PodcastChapter[] {
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

    // Validate and normalize each chapter
    return parsed.map((chapter, index) => ({
      title: typeof chapter.title === 'string' ? chapter.title.trim() : `Chapter ${index + 1}`,
      start_time: typeof chapter.startTime === 'number' ? chapter.startTime : 0,
      end_time: typeof chapter.endTime === 'number' ? chapter.endTime : 0,
      description: typeof chapter.description === 'string' ? chapter.description.trim() : '',
      keyTopics: Array.isArray(chapter.keyTopics)
        ? chapter.keyTopics.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0)
        : []
    })).filter(chapter => chapter.end_time > chapter.start_time);

  } catch (parseError: any) {
    console.error('[CHAPTERS] JSON parse error:', parseError);
    // Return empty chapters on parse failure
    return [];
  }
}
