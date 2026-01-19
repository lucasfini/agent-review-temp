// AI-powered podcast summary generation using GPT-4o
import OpenAI from 'openai';
import type { NarrativeMetadata } from './pre-processor';

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
  } = {}
): Promise<PodcastSummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { maxWords = 1000, speakerContext, narrativeMetadata } = options;

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

  const prompt = `You are an expert editorial writer for a high-end publication like The Atlantic or Wired. Your task is to write a deeply insightful, human-sounding summary of the provided transcript.

STRICT TONE GUIDELINES:

Kill the "AI Voice": Do NOT start with "In this episode," "The podcast discusses," or "The speakers explore." Start immediately with the most compelling idea or tension found in the conversation.

Vary Sentence Rhythm: Avoid consistent sentence lengths. Use a mix of short, punchy observations and longer, flowing explanatory sentences.

No Fluff: Avoid words like "delve," "tapestry," "comprehensive," "leverage," or "testament."

The "So What?" Factor: Don't just list what was said; explain why it matters or what the underlying conflict/insight was.

Third Person Only: Maintain a professional distance.

STRUCTURE REQUIREMENTS:

Length: 800 - 1000 words.

Format: 3-5 distinct paragraphs.

Separation: Use double newlines between paragraphs.

Prose Style: Write like Perplexity Discover—direct, clear, and highly scannable, but with a sophisticated vocabulary.

Bolding: You may bold one key phrase per paragraph if it represents a major "aha!" moment.

TRANSCRIPT CONTEXT:
${speakerInfo}${narrativeContext}
Transcription (Pre-processed to remove ads):
${sourceText.slice(0, 80000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: 'You are an expert editorial writer who produces natural, human-sounding summaries. Never use AI clichés or robotic language.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

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
