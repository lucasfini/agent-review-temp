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
  // Alias for initialSpeakerId when needed
  rawClusterId?: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  status?: 'confirmed' | 'tentative' | 'uncertain';
  confidenceReason?: string;
  // Optional embedding for acoustic profiling (if provider supports it)
  embedding?: number[];
}

export interface DetectedSpeaker {
  id: string;
  segments: SpeakerSegment[];
  totalDuration: number;
  segmentCount: number;
  fallbackName?: string | null;
  role?: SpeakerRole;
  roleConfidence?: number;
  source?: string;
  profile?: SpeakerIdentityProfile;
}

export type SpeakerRole =
  | 'host'
  | 'co_host'
  | 'candidate'
  | 'guest'
  | 'advertiser'
  | 'narrator'
  | 'quoted_audio'
  | 'unknown';

export const SPEAKER_ROLE_LABELS: Record<SpeakerRole, string> = {
  host: 'Host',
  co_host: 'Co-host',
  candidate: 'Candidate',
  guest: 'Guest',
  advertiser: 'Advertiser',
  narrator: 'Narrator',
  quoted_audio: 'Quoted Audio',
  unknown: 'Unknown',
};

export const SPEAKER_ROLES = Object.keys(SPEAKER_ROLE_LABELS) as SpeakerRole[];

export type SpeakerIdentityProfile = {
  acoustic?: {
    centrdEmbedding: number[];    // mean embedding
    variance: number;             // stability score
  };
  lexical?: {
    topPhrases: string[];
    greetingStyle?: string;
    pronounHints?: string[];
  };
  behavioral?: {
    avgTurnSeconds: number;
    handoffGivenCount: number;
    handoffReceivedCount: number;
    interruptLikeTurnRate: number; // short turns between others
  };
};

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
