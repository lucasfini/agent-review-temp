// AssemblyAI Speaker Diarization Integration
// Fast, cloud-based transcription + speaker diarization
// Processing: 2-hour podcast in ~2 minutes | Cost: $0.15/hour | Accuracy: 97%+

import { AssemblyAI, Transcript } from 'assemblyai';
import { promises as fs } from 'fs';
import { TranscriptionSegment, SpeakerSegment } from './types';

export interface AssemblyAIConfig {
  apiKey?: string;
  languageCode?: string;
  speakerLabels?: boolean;
  autoHighlights?: boolean;
  autoChapters?: boolean;
  entityDetection?: boolean;
  webhookUrl?: string;
  pollInterval?: number; // ms between status checks
}

export interface AssemblyAIResult {
  success: boolean;
  method: 'assemblyai';
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
  };
  error?: string;
}

/**
 * Initialize AssemblyAI client with API key
 */
function getAssemblyAIClient(apiKey?: string): AssemblyAI {
  // Accept both ASSEMBLYAI_API_KEY and ASSEMBLYAI_ACCESS_KEY for flexibility
  const key = apiKey || process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY;

  if (!key) {
    throw new Error('AssemblyAI API key not found. Set ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY environment variable.');
  }

  return new AssemblyAI({ apiKey: key });
}

/**
 * Check if AssemblyAI is available and configured
 */
export async function checkAssemblyAIAvailability(): Promise<boolean> {
  try {
    // Accept both ASSEMBLYAI_API_KEY and ASSEMBLYAI_ACCESS_KEY
    const apiKey = process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY;
    if (!apiKey) {
      console.log('[ASSEMBLYAI] ❌ API key not configured');
      console.log('[ASSEMBLYAI] Set ASSEMBLYAI_API_KEY or ASSEMBLYAI_ACCESS_KEY in your .env file');
      return false;
    }

    // Simple validation: check if key looks valid (minimum length)
    if (apiKey.length < 20) {
      console.log('[ASSEMBLYAI] ❌ API key too short (expected at least 20 characters)');
      return false;
    }

    console.log('[ASSEMBLYAI] ✅ API key configured');
    return true;
  } catch (error) {
    console.error('[ASSEMBLYAI] ❌ Availability check failed:', error);
    return false;
  }
}

/**
 * Upload audio file to AssemblyAI and get transcription with speaker diarization
 */
export async function transcribeWithAssemblyAI(
  audioFilePath: string,
  config: AssemblyAIConfig = {}
): Promise<AssemblyAIResult> {
  const startTime = Date.now();

  console.log(`[ASSEMBLYAI] 🚀 Starting transcription for: ${audioFilePath}`);

  const {
    languageCode = 'en',
    speakerLabels = true,
    autoHighlights = false,
    autoChapters = false,
    entityDetection = false,
    webhookUrl,
    pollInterval = 3000
  } = config;

  try {
    // Initialize client
    const client = getAssemblyAIClient(config.apiKey);

    // Get file stats for logging
    const stats = await fs.stat(audioFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`[ASSEMBLYAI] 📊 Audio file size: ${fileSizeMB.toFixed(2)}MB`);

    // Upload and transcribe
    console.log('[ASSEMBLYAI] ⬆️  Uploading audio file...');

    const transcriptParams: any = {
      audio: audioFilePath,
      speaker_labels: speakerLabels,
      language_code: languageCode,
    };

    // Optional features
    if (autoHighlights) transcriptParams.auto_highlights = true;
    if (autoChapters) transcriptParams.auto_chapters = true;
    if (entityDetection) transcriptParams.entity_detection = true;
    if (webhookUrl) transcriptParams.webhook_url = webhookUrl;

    console.log('[ASSEMBLYAI] 🔄 Submitting transcription job...');
    const transcript = await client.transcripts.transcribe(transcriptParams, {
      pollingInterval: pollInterval
    });

    const processingTime = (Date.now() - startTime) / 1000;

    if (transcript.status === 'error') {
      console.error('[ASSEMBLYAI] ❌ Transcription failed:', transcript.error);
      return {
        success: false,
        method: 'assemblyai',
        error: transcript.error || 'Transcription failed'
      };
    }

    console.log(`[ASSEMBLYAI] ✅ Transcription completed in ${processingTime.toFixed(1)}s`);

    // Get duration from transcript (in milliseconds)
    const durationMs = transcript.audio_duration || 0;
    const durationSeconds = durationMs / 1000;
    console.log(`[ASSEMBLYAI] 📊 Audio duration: ${durationSeconds.toFixed(1)}s (${durationMs}ms from API)`);
    console.log(`[ASSEMBLYAI] 📊 Confidence: ${(transcript.confidence! * 100).toFixed(1)}%`);

    // Fallback: If duration seems wrong (less than 1 second for a multi-MB file), estimate from file size
    let actualDuration = durationSeconds;
    if (durationSeconds < 1 && fileSizeMB > 0.5) {
      // Estimate duration from file size (assume ~128kbps bitrate)
      const estimatedDuration = (stats.size * 8) / (128 * 1000); // bytes * 8 bits/byte / bitrate
      console.log(`[ASSEMBLYAI] ⚠️ Duration seems incorrect (${durationSeconds}s for ${fileSizeMB.toFixed(2)}MB file)`);
      console.log(`[ASSEMBLYAI] 📊 Estimated duration from file size: ${estimatedDuration.toFixed(1)}s`);
      actualDuration = estimatedDuration;
    }

    // Convert to our format
    const result = convertAssemblyAIResponse(transcript, processingTime, actualDuration);

    console.log(`[ASSEMBLYAI] 📊 Detected ${result.metadata?.total_speakers} speakers in ${result.metadata?.total_segments} segments`);

    return result;

  } catch (error: any) {
    console.error('[ASSEMBLYAI] ❌ Error:', error);
    return {
      success: false,
      method: 'assemblyai',
      error: error.message || String(error)
    };
  }
}

/**
 * Convert AssemblyAI transcript to our standard format
 */
function convertAssemblyAIResponse(
  transcript: Transcript,
  processingTime: number,
  actualDuration?: number
): AssemblyAIResult {
  if (!transcript.words || !transcript.utterances) {
    return {
      success: false,
      method: 'assemblyai',
      error: 'No words or utterances in transcript'
    };
  }

  // Build transcription segments from utterances (speaker turns)
  const transcriptionSegments: TranscriptionSegment[] = transcript.utterances.map((utterance, index) => {
    // Extract words for this utterance
    const utteranceWords = transcript.words!.filter(
      word => word.start >= utterance.start && word.end <= utterance.end
    ).map(word => ({
      start: word.start / 1000, // Convert ms to seconds
      end: word.end / 1000,
      word: word.text
    }));

    return {
      id: index,
      seek: 0,
      start: utterance.start / 1000, // Convert ms to seconds
      end: utterance.end / 1000,
      text: utterance.text,
      tokens: [], // Not provided by AssemblyAI
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 0,
      no_speech_prob: 0,
      words: utteranceWords
    };
  });

  // Build speaker segments from utterances
  const speakerSegments: SpeakerSegment[] = transcript.utterances.map(utterance => ({
    speakerId: `Speaker_${utterance.speaker}`,
    startTime: utterance.start / 1000, // Convert ms to seconds
    endTime: utterance.end / 1000,
    text: utterance.text,
    confidence: utterance.confidence
  }));

  // Calculate metadata
  const uniqueSpeakers = new Set(transcript.utterances.map(u => u.speaker)).size;

  return {
    success: true,
    method: 'assemblyai',
    transcriptId: transcript.id,
    text: transcript.text || undefined,
    transcription_segments: transcriptionSegments,
    speaker_segments: speakerSegments,
    metadata: {
      audio_duration: actualDuration !== undefined ? actualDuration : (transcript.audio_duration || 0) / 1000,
      processing_time: processingTime,
      total_speakers: uniqueSpeakers,
      total_segments: speakerSegments.length,
      language_code: transcript.language_code || 'en',
      confidence: transcript.confidence || 0,
      cost_usd: actualDuration !== undefined
        ? (actualDuration / 3600) * 0.27  // $0.27 per hour
        : ((transcript.audio_duration || 0) / 1000 / 3600) * 0.27
    }
  };
}

/**
 * Get AssemblyAI setup instructions
 */
export function getAssemblyAISetupInstructions(): string {
  return `
To enable fast cloud-based transcription with AssemblyAI:

1. Sign up for AssemblyAI:
   https://www.assemblyai.com/

2. Get your API key from the dashboard:
   https://www.assemblyai.com/app

3. Add to your .env file:
   ASSEMBLYAI_API_KEY=your_api_key_here
   TRANSCRIPTION_PROVIDER=assemblyai

4. (Optional) Set provider fallback strategy:
   TRANSCRIPTION_FALLBACK_TO_LOCAL=true

Benefits of AssemblyAI:
- Speed: 2-hour podcast processed in ~2 minutes
- Accuracy: 97%+ speaker diarization accuracy
- Cost: $0.15/hour of audio ($0.30 for 2-hour podcast)
- Zero infrastructure: No Python, no GPU, no dependencies
- Word-level timestamps included automatically
- Supports 99 languages with diarization in 95

Pricing:
- Free tier: $50 credits + 60 minutes/month
- Pay as you go: $0.15/hour of audio
- No hidden costs, includes all features

Processing time:
- Typically completes in < 10% of audio duration
- 1-hour podcast: ~5 minutes processing
- 2-hour podcast: ~10 minutes processing
- Real-time factor: ~0.008x

For more information:
https://www.assemblyai.com/docs
  `.trim();
}

/**
 * Calculate estimated cost for audio duration
 */
export function estimateAssemblyAICost(audioDurationSeconds: number): {
  durationHours: number;
  costUSD: number;
  estimatedProcessingSeconds: number;
} {
  const durationHours = audioDurationSeconds / 3600;
  const costUSD = durationHours * 0.15; // $0.15/hour
  const estimatedProcessingSeconds = audioDurationSeconds * 0.008; // 0.008x RTF

  return {
    durationHours,
    costUSD,
    estimatedProcessingSeconds
  };
}
