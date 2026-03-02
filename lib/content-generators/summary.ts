// AI-powered podcast summary generation using GPT-4o
import OpenAI from 'openai';
import type { NarrativeMetadata } from './pre-processor';
import { trackOpenAIUsage } from '@/lib/billing/track-usage';

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
 * Generate podcast summary using GPT-4o
 * Uses cleaned narrative from pre-processor to avoid sponsor hallucinations
 */
export async function generatePodcastSummary(
  transcriptionText: string,
  options: {
    maxWords?: number;
    speakerContext?: Record<string, { name: string; role?: string }>;
    narrativeMetadata?: NarrativeMetadata;
    userId?: string;
    projectId?: string;
    apiKey?: string;
  } = {}
): Promise<PodcastSummary> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { maxWords = 1000, speakerContext, narrativeMetadata, userId, projectId } = options;

  console.log('[SUMMARY] 📝 Generating podcast summary with GPT-4o...');

  const openai = new OpenAI({ apiKey });

  // Use cleaned narrative if available (prevents sponsor hallucinations)
  const sourceText = narrativeMetadata?.cleaned_narrative_summary || transcriptionText;
  const isCleanedNarrative = !!narrativeMetadata?.cleaned_narrative_summary;

  if (isCleanedNarrative) {
    console.log('[SUMMARY] 🔍 Using cleaned narrative (ad-free) from pre-processor');
  }

  // Build context about speakers if available
  let speakerInfo = '';
  if (speakerContext && Object.keys(speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  // Add narrative context from pre-processor
  let narrativeContext = '';
  if (narrativeMetadata) {
    if (narrativeMetadata.main_topic) {
      narrativeContext += `\nMain Topic: ${narrativeMetadata.main_topic}\n`;
    }
    if (narrativeMetadata.key_tensions && narrativeMetadata.key_tensions.length > 0) {
      narrativeContext += `\nKey Tensions:\n${narrativeMetadata.key_tensions.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`;
    }
    if (narrativeMetadata.ad_segments_found && narrativeMetadata.ad_segments_found.length > 0) {
      narrativeContext += `\n⚠️ CRITICAL: The following are AD SEGMENTS to IGNORE: ${narrativeMetadata.ad_segments_found.join(', ')}\n`;
      narrativeContext += `DO NOT mention these brands or sponsor segments in your summary.\n`;
    }
  }

  const prompt = `Write an unbiased, factual summary of this transcript. Think of it as cliff notes — a reader should walk away knowing exactly what was discussed, what positions were stated, and what conclusions were reached, without any narrative framing or storytelling.

RULES:

1. Be FACTUAL and NEUTRAL. Report what was said, not a story about what was said.
2. NEVER start with "In a world," "In this episode," "The podcast explores," or any scene-setting intro. Start with the first substantive point.
3. NO narrative language: avoid "journey," "tapestry," "delve," "unpack," "landscape," "navigate," "comprehensive," "leverage," "testament," "realm," "paradigm."
4. NO editorializing. Do not add your own opinion, moral judgments, or dramatic framing. If speakers disagreed, state both positions neutrally.
5. Use PLAIN, DIRECT language. Write like a Wikipedia article or a meeting minutes document, not a magazine feature.
6. Attribute claims to speakers by name when possible. "Smith argued X. Jones countered with Y."
7. Third person only. No "we" or "you."

STRUCTURE:

- Length: 600–900 words.
- Format: 3–5 paragraphs, each covering a distinct topic or segment of the conversation.
- Double newlines between paragraphs.
- No bolding. No bullet points. Just clean prose.

TRANSCRIPT CONTEXT:
${speakerInfo}${narrativeContext}
Transcript:
${sourceText.slice(0, 80000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 8000,
      messages: [
        {
          role: 'system',
          content: 'You produce factual, unbiased summaries. Write like cliff notes — concise, neutral, informative. Never use narrative framing, AI clichés, or dramatic language. Report what was said, attribute it to speakers, and move on.'
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
        purpose: 'Podcast Summary',
        shouldDebit: true
      });
    }

    const summaryText = response.choices[0]?.message?.content || '';

    const wordCount = summaryText.split(/\s+/).filter(w => w.length > 0).length;

    console.log(`[SUMMARY] ✅ Generated ${wordCount} word summary with GPT-4o`);
    console.log(`[SUMMARY] 📊 Tokens: ${response.usage?.prompt_tokens || 0} in, ${response.usage?.completion_tokens || 0} out`);

    return {
      summary: summaryText,
      wordCount,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[SUMMARY] ❌ Generation failed:', error);
    throw new Error(`Summary generation failed: ${error.message}`);
  }
}
