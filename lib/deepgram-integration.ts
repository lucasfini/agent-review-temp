// Deepgram Transcription Integration
// High-speed, high-accuracy transcription with Nova-2 model
// Pricing: ~$0.0043/min (~$0.26/hour) | Speed: ~30x real-time

import { promises as fs } from 'fs';
import { TranscriptionSegment, SpeakerSegment } from './types';

export interface DeepgramConfig {
  apiKey?: string;
  languageCode?: string;
  diarize?: boolean;
  smartFormat?: boolean;
  model?: string;
}

export interface DeepgramResult {
  success: boolean;
  method: 'deepgram';
  transcriptId?: string;
  text?: string;
  transcription_segments?: TranscriptionSegment[];
  speaker_segments?: SpeakerSegment[];
  metadata?: {
    audio_duration: number;
    processing_time: number;
    total_speakers: number;
    total_segments: number;
    language_code: string;
    confidence: number;
    cost_usd?: number;
    model: string;
  };
  error?: string;
}

/**
 * Check if Deepgram is available
 */
export async function checkDeepgramAvailability(): Promise<boolean> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.log('[DEEPGRAM] ❌ API key not configured');
    return false;
  }
  return true;
}

/**
 * Transcribe audio using Deepgram API
 */
export async function transcribeWithDeepgram(
  audioFilePath: string,
  config: DeepgramConfig = {}
): Promise<DeepgramResult> {
  const startTime = Date.now();
  const apiKey = config.apiKey || process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return { success: false, method: 'deepgram', error: 'Deepgram API key not found' };
  }

  console.log(`[DEEPGRAM] 🚀 Starting transcription for: ${audioFilePath}`);

  try {
    const isUrl = audioFilePath.startsWith('http://') || audioFilePath.startsWith('https://');
    let response;

    // Deepgram API URL
    const url = new URL('https://api.deepgram.com/v1/listen');
    url.searchParams.append('model', config.model || 'nova-2');
    url.searchParams.append('diarize', config.diarize !== false ? 'true' : 'false');
    url.searchParams.append('smart_format', config.smartFormat !== false ? 'true' : 'false');
    url.searchParams.append('language', config.languageCode || 'en');
    url.searchParams.append('punctuate', 'true');
    url.searchParams.append('utterances', 'true');

    if (isUrl) {
      console.log('[DEEPGRAM] 🔗 Submitting remote URL...');
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioFilePath }),
      });
    } else {
      const fileBuffer = await fs.readFile(audioFilePath);
      console.log('[DEEPGRAM] ⬆️ Uploading local audio file...');
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/octet-stream', // Raw audio
        },
        body: fileBuffer,
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepgram API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const processingTime = (Date.now() - startTime) / 1000;

    console.log(`[DEEPGRAM] ✅ Transcription completed in ${processingTime.toFixed(1)}s`);

    return convertDeepgramResponse(data, processingTime);

  } catch (error: any) {
    console.error('[DEEPGRAM] ❌ Error:', error);
    return {
      success: false,
      method: 'deepgram',
      error: error.message || String(error)
    };
  }
}

/**
 * Convert Deepgram response to our standard format
 */
function convertDeepgramResponse(
  data: any,
  processingTime: number
): DeepgramResult {
  const result = data.results;
  if (!result) {
    return { success: false, method: 'deepgram', error: 'Invalid response format' };
  }

  const channel = result.channels[0];
  const alternatives = channel.alternatives[0];
  const words = alternatives.words || [];
  const fullText = alternatives.transcript;

  // Calculate duration from the last word end time or metadata
  const audioDuration = data.metadata?.duration || words[words.length - 1]?.end || 0;

  // Build transcription segments (words with timestamps)
  // Deepgram provides word-level data. We can group them into sentences or use "utterances" if enabled.
  // Using 'utterances' feature from Deepgram which provides segmented speech.
  const utterances = data.results.utterances || [];

  const transcriptionSegments: TranscriptionSegment[] = utterances.map((u: any, index: number) => ({
    id: index,
    start: u.start,
    end: u.end,
    text: u.transcript,
    seek: 0,
    tokens: [],
    temperature: 0,
    avg_logprob: u.confidence,
    compression_ratio: 0,
    no_speech_prob: 0,
    words: u.words.map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end
    }))
  }));

  // Build speaker segments
  // Deepgram utterances already split by speaker change if diarization is on.
  const speakerSegments: SpeakerSegment[] = utterances.map((u: any) => ({
    speakerId: `Speaker_${u.speaker || 0}`,
    startTime: u.start,
    endTime: u.end,
    text: u.transcript,
    confidence: u.confidence
  }));

  const uniqueSpeakers = new Set(utterances.map((u: any) => u.speaker)).size;

  return {
    success: true,
    method: 'deepgram',
    transcriptId: data.metadata?.request_id,
    text: fullText,
    transcription_segments: transcriptionSegments,
    speaker_segments: speakerSegments,
    metadata: {
      audio_duration: audioDuration,
      processing_time: processingTime,
      total_speakers: uniqueSpeakers,
      total_segments: speakerSegments.length,
      language_code: 'en',
      confidence: alternatives.confidence,
      cost_usd: (audioDuration / 60) * 0.0043, // ~$0.0043/min for Nova-2
      model: data.metadata?.model_info?.name || 'nova-2'
    }
  };
}

/**
 * Get Deepgram setup instructions
 */
export function getDeepgramSetupInstructions(): string {
  return `
To enable high-accuracy diarization with Deepgram:

1. Sign up for Deepgram:
   https://console.deepgram.com/signup

2. Create an API Key.

3. Add to your .env file:
   DEEPGRAM_API_KEY=your_api_key_here

Benefits of Deepgram Nova-2:
- Extremely fast (30x real-time)
- Excellent speaker diarization accuracy (lower DER)
- Cost effective (~$0.26/hour)
`.trim();
}
