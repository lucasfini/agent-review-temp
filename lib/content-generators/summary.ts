// AI-powered podcast summary generation using Claude Sonnet 4.5
import Anthropic from '@anthropic-ai/sdk';

export interface PodcastSummary {
  summary: string;
  wordCount: number;
  tokensUsed: {
    input: number;
    output: number;
  };
  generatedAt: string;
}

/**
 * Generate podcast summary using Claude Sonnet 4.5
 */
export async function generatePodcastSummary(
  transcriptionText: string,
  options: {
    maxWords?: number;
    speakerContext?: Record<string, { name: string; role?: string }>;
  } = {}
): Promise<PodcastSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const { maxWords = 1000, speakerContext } = options;

  console.log('[SUMMARY] 📝 Generating podcast summary...');

  const anthropic = new Anthropic({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (speakerContext && Object.keys(speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  const prompt = `You are analyzing a podcast/interview transcription. Generate a comprehensive summary that captures the key topics, insights, and takeaways.

${speakerInfo}

Guidelines:
- Write in clear, engaging prose (approximately ${maxWords} words)
- Focus on the main topics and key insights discussed
- Include specific examples or anecdotes mentioned
- Highlight any actionable advice or key takeaways
- Use proper paragraph structure
- Write in third person (avoid "I" or "we")
- Do not include a title or heading, just the summary text

Transcription:
${transcriptionText.slice(0, 80000)}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const summaryText = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    const wordCount = summaryText.split(/\s+/).filter(w => w.length > 0).length;

    console.log(`[SUMMARY] ✅ Generated ${wordCount} word summary`);
    console.log(`[SUMMARY] 📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

    return {
      summary: summaryText,
      wordCount,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[SUMMARY] ❌ Generation failed:', error);
    throw new Error(`Summary generation failed: ${error.message}`);
  }
}
