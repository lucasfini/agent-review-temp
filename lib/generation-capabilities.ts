import type { AnalysisOptionKey } from '@/lib/analysis-options';

export type GenerationCapabilityProject = {
  audio_file_name?: string | null;
  transcription_text?: string | null;
  transcription_segments?: unknown;
  speaker_data?: unknown;
  metadata?: any;
};

export type ProjectGenerationCapabilities = {
  hasTranscriptText: boolean;
  hasTimedSegments: boolean;
  hasSpeakerSegments: boolean;
  isTextOnlyImport: boolean;
  sourceLabel: string;
};

export type AnalysisCompatibility = {
  compatible: boolean;
  reason?: string;
};

const TEXT_ONLY_SOURCES = new Set(['notion', 'granola']);

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function getArray(value: unknown): unknown[] {
  const parsed = parseMaybeJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function getObject(value: unknown): Record<string, any> {
  const parsed = parseMaybeJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, any>
    : {};
}

function formatSourceLabel(source: unknown): string {
  if (typeof source !== 'string' || !source.trim()) return 'text import';
  const normalized = source.trim().replace(/[_-]+/g, ' ');
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} import`;
}

export function getProjectGenerationCapabilities(
  project: GenerationCapabilityProject | null | undefined
): ProjectGenerationCapabilities {
  const transcriptionText = typeof project?.transcription_text === 'string'
    ? project.transcription_text.trim()
    : '';
  const transcriptSegments = getArray(project?.transcription_segments);
  const speakerData = getObject(project?.speaker_data);
  const speakerSegments = getArray(speakerData.segments);
  const speakers = getObject(speakerData.speakers);

  const hasTimedSegments = transcriptSegments.length > 0;
  const hasSpeakerSegments = speakerSegments.length > 0 && Object.keys(speakers).length > 0;
  const hasTranscriptText = transcriptionText.length > 0;

  return {
    hasTranscriptText,
    hasTimedSegments,
    hasSpeakerSegments,
    isTextOnlyImport: hasTranscriptText && !hasTimedSegments && !hasSpeakerSegments,
    sourceLabel: formatSourceLabel(project?.metadata?.source),
  };
}

export function getAnalysisCompatibility(
  project: GenerationCapabilityProject | null | undefined,
  key: AnalysisOptionKey
): AnalysisCompatibility {
  const capabilities = getProjectGenerationCapabilities(project);

  if (!capabilities.hasTranscriptText) {
    return {
      compatible: false,
      reason: 'This project does not have transcript text available yet.',
    };
  }

  if (key === 'namedSpeakers' && !capabilities.hasSpeakerSegments) {
    return {
      compatible: false,
      reason: `${capabilities.sourceLabel} does not include diarized speaker segments. Upload audio to use Named speakers.`,
    };
  }

  if (key === 'chapters' && !capabilities.hasTimedSegments) {
    return {
      compatible: false,
      reason: 'Timestamped chapters need timed transcript segments. Upload audio or use a source with timestamps to generate chapters.',
    };
  }

  return { compatible: true };
}

export function getTextOnlyGenerationNotice(
  project: GenerationCapabilityProject | null | undefined
): string | null {
  const capabilities = getProjectGenerationCapabilities(project);
  if (!capabilities.isTextOnlyImport) return null;

  return `${capabilities.sourceLabel} has text only. Drafts can use the page text, but speaker attribution and timestamps are unavailable.`;
}

export function hasProjectPlayableAudio(
  project: GenerationCapabilityProject | null | undefined
): boolean {
  const fileName = typeof project?.audio_file_name === 'string'
    ? project.audio_file_name.trim()
    : '';
  if (!fileName) return false;

  const source = typeof project?.metadata?.source === 'string'
    ? project.metadata.source.trim().toLowerCase()
    : '';
  if (TEXT_ONLY_SOURCES.has(source)) return false;

  return !fileName.toLowerCase().endsWith('.txt');
}
