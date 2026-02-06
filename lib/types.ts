// Shared types for transcription and speaker detection

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

export interface SpeakerSegment {
  speakerId: string;
  // Authoritative assignment after attribution pipeline
  finalSpeakerId?: string;
  // Original diarization cluster ID (pre-attribution)
  initialSpeakerId?: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  status?: 'confirmed' | 'tentative' | 'uncertain';
}

export interface DetectedSpeaker {
  id: string;
  segments: SpeakerSegment[];
  totalDuration: number;
  segmentCount: number;
  fallbackName?: string | null;
}

export interface SpeakerProfile {
  id: string;
  name?: string;
  fallbackName?: string | null;
  role?: string;
  displayName?: string;
  totalDuration: number;
  segmentCount: number;
  confidence?: number;
  summary?: string;
  evidence?: string[];
}
