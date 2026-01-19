// Pre-processing "Signal-Only" Engine using GPT-4o-mini
// Cleans transcript and extracts main narrative arc before content generation
import OpenAI from 'openai';

export interface NarrativeMetadata {
  main_topic: string;
  single_angle: string;  // The ONE most compelling story angle
  cleaned_narrative_summary: string;
  key_tensions: string[];
  ad_segments_found: string[];
}

export interface PreProcessResult {
  metadata: NarrativeMetadata;
  tokensUsed: {
    input: number;
    output: number;
  };
  generatedAt: string;
}

/**
 * Pre-process transcript to extract "Signal" and filter out "Noise"
 * Uses GPT-4o-mini for cost-effective, zero-creativity extraction
 */
export async function preProcessTranscript(
  transcriptionText: string,
  options: {
    speakerContext?: Record<string, { name: string; role?: string }>;
  } = {}
): Promise<PreProcessResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  console.log('[PRE-PROCESSOR] 🔍 Analyzing transcript for signal extraction...');
  console.log(`[PRE-PROCESSOR] 📏 Transcript length: ${transcriptionText.length} chars`);

  const openai = new OpenAI({ apiKey });

  // Build context about speakers if available
  let speakerInfo = '';
  if (options.speakerContext && Object.keys(options.speakerContext).length > 0) {
    speakerInfo = '\n\nSpeakers:\n';
    for (const [id, info] of Object.entries(options.speakerContext)) {
      speakerInfo += `- ${info.name}${info.role ? ` (${info.role})` : ''}\n`;
    }
  }

  const prompt = `You are an expert transcript editor. Your task is to analyze the raw podcast transcript and separate the "Signal" (The actual discussion) from the "Noise" (Sponsor reads, Ad breaks, Intros).

=== THE AD-BLOCKER PROTOCOL ===

This is a UNIVERSAL AD-FILTER. You must identify and ignore ANY content that is a sponsor read or advertisement, regardless of brand name.

TRIGGER PATTERNS (Heuristic Detection):
- "Brought to you by [X]"
- "This episode is sponsored by [X]"
- "Thanks to [X] for supporting the show"
- "Use code [X]" or "Promo code [X]"
- "Visit [URL] for a discount/offer"
- "Special offer for listeners"
- "Get [X]% off when you use..."
- Any segment where a speaker shifts from discussion to promoting a product/service
- Phrases like "I've been using [Product]" when it sounds promotional
- URLs or website mentions with clear commercial intent
- Any explicit call-to-action to purchase, sign up, or visit a sponsor

SPECIFIC BLACKLIST (Always flag these):
- "Darktrace" (cybersecurity sponsor)
- "Recruiter scam" or "Recruitment scam" mentions (unless discussing the topic)
- Any recruitment agency or staffing agency promotions
- "Job posting" or "hiring" segments that sound promotional

ZERO-AD OUTPUT REQUIREMENT:
It is FORBIDDEN to include any ad-related brands, promo codes, sponsors, or promotional segments in your cleaned narrative summary. When you detect an ad segment, log the brand/topic in "ad_segments_found" and completely exclude it from the cleaned narrative.

YOUR GOALS:

1. Identify and Blacklist Ads: Use the trigger patterns above to detect ALL advertisements
2. Define the Narrative Arc: Identify the 3-4 core "Movements" of the actual conversation
3. Identify Key Tensions: What were the speakers actually debating or agreeing on?
4. Extract the Single Most Compelling Angle: What is the ONE main story or insight?

OUTPUT SCHEMA (Strict JSON):
{
  "main_topic": "A 1-sentence summary of the actual episode topic.",
  "single_angle": "The ONE most compelling story angle or insight from the conversation.",
  "cleaned_narrative_summary": "A 500-word dense summary of the ACTUAL conversation, excluding ALL sponsor/ad content.",
  "key_tensions": ["Point 1", "Point 2", "Point 3"],
  "ad_segments_found": ["List ALL brands, products, or promotional segments identified as ads"]
}

TRANSCRIPT DATA:
${speakerInfo}
Transcription:
${transcriptionText.slice(0, 100000)}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      temperature: 0.1, // Zero creativity - strict extraction only
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'You are an expert transcript editor who separates signal from noise. Always return valid JSON objects with precise, factual content extraction. Never hallucinate or add information not present in the transcript.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = response.choices[0]?.message?.content || '{}';

    // Parse JSON response
    const metadata = parsePreProcessResponse(responseText);

    console.log(`[PRE-PROCESSOR] ✅ Extracted narrative metadata`);
    console.log(`[PRE-PROCESSOR] 📌 Main Topic: ${metadata.main_topic}`);
    console.log(`[PRE-PROCESSOR] 🎯 Key Tensions: ${metadata.key_tensions.length}`);
    console.log(`[PRE-PROCESSOR] 🚫 Ad Segments Found: ${metadata.ad_segments_found.length}`);
    console.log(`[PRE-PROCESSOR] 📊 Tokens: ${response.usage?.prompt_tokens || 0} in, ${response.usage?.completion_tokens || 0} out`);

    if (metadata.ad_segments_found.length > 0) {
      console.log(`[PRE-PROCESSOR] 🛑 Filtering out ads: ${metadata.ad_segments_found.join(', ')}`);
    }

    return {
      metadata,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error('[PRE-PROCESSOR] ❌ Pre-processing failed:', error);
    throw new Error(`Pre-processing failed: ${error.message}`);
  }
}

/**
 * Parse and validate pre-processor response from GPT-4o-mini
 */
function parsePreProcessResponse(content: string): NarrativeMetadata {
  // Strip markdown code blocks if present
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  }

  try {
    const parsed = JSON.parse(cleanContent);

    // Validate required fields
    if (!parsed.main_topic || typeof parsed.main_topic !== 'string') {
      throw new Error('Missing or invalid main_topic');
    }

    if (!parsed.cleaned_narrative_summary || typeof parsed.cleaned_narrative_summary !== 'string') {
      throw new Error('Missing or invalid cleaned_narrative_summary');
    }

    // Normalize and validate structure
    const metadata: NarrativeMetadata = {
      main_topic: parsed.main_topic.trim(),
      single_angle: parsed.single_angle ? String(parsed.single_angle).trim() : parsed.main_topic.trim(),
      cleaned_narrative_summary: parsed.cleaned_narrative_summary.trim(),
      key_tensions: Array.isArray(parsed.key_tensions)
        ? parsed.key_tensions.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0)
        : [],
      ad_segments_found: Array.isArray(parsed.ad_segments_found)
        ? parsed.ad_segments_found.map((a: any) => String(a).trim()).filter((a: string) => a.length > 0)
        : []
    };

    // Validation warnings
    if (metadata.key_tensions.length === 0) {
      console.warn('[PRE-PROCESSOR] ⚠️ No key tensions identified');
    }

    if (metadata.cleaned_narrative_summary.length < 200) {
      console.warn('[PRE-PROCESSOR] ⚠️ Cleaned narrative summary seems too short');
    }

    return metadata;

  } catch (parseError: any) {
    console.error('[PRE-PROCESSOR] JSON parse error:', parseError);
    console.error('[PRE-PROCESSOR] Raw content:', content.substring(0, 500));

    // Return minimal valid structure on parse failure
    return {
      main_topic: 'Unable to extract main topic',
      single_angle: 'Unable to extract single angle',
      cleaned_narrative_summary: '',
      key_tensions: [],
      ad_segments_found: []
    };
  }
}
