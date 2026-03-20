import { normalizeTier, type TierFeatures, type TierLevel } from '@/lib/tier-config';

export type AnalysisOptionKey =
  | 'namedSpeakers'
  | 'summary'
  | 'insights'
  | 'chapters'
  | 'takeaways'
  | 'quotes';

export type AnalysisOptions = Record<AnalysisOptionKey, boolean>;

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  namedSpeakers: false,
  summary: false,
  insights: false,
  chapters: false,
  takeaways: false,
  quotes: false,
};

export const ANALYSIS_OPTION_CONFIG: Array<{
  key: AnalysisOptionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'namedSpeakers',
    label: 'Named speakers',
    description: 'Extract speaker names and classify host / guest roles.',
  },
  {
    key: 'summary',
    label: 'Summary',
    description: 'Generate a concise episode summary.',
  },
  {
    key: 'insights',
    label: 'Insights',
    description: 'Extract concepts, people, and research-backed insights.',
  },
  {
    key: 'chapters',
    label: 'Chapters',
    description: 'Break the episode into timestamped sections.',
  },
  {
    key: 'takeaways',
    label: 'Takeaways',
    description: 'Pull out the most important ideas.',
  },
  {
    key: 'quotes',
    label: 'Quotes',
    description: 'Find notable quotes worth reusing.',
  },
];

export function normalizeAnalysisOptions(input?: Partial<Record<string, unknown>> | null): AnalysisOptions {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_ANALYSIS_OPTIONS };
  }

  return {
    namedSpeakers: Boolean(input.namedSpeakers),
    summary: Boolean(input.summary),
    insights: Boolean(input.insights),
    chapters: Boolean(input.chapters),
    takeaways: Boolean(input.takeaways),
    quotes: Boolean(input.quotes),
  };
}

function hasExplicitAnalysisOptions(input?: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false;
  }

  return ANALYSIS_OPTION_CONFIG.some((option) =>
    Object.prototype.hasOwnProperty.call(input, option.key)
  );
}

function legacyTierToOptions(tier?: string | null): AnalysisOptions {
  const normalizedTier = normalizeTier(tier);

  if (normalizedTier === 'transcript') {
    return { ...DEFAULT_ANALYSIS_OPTIONS };
  }

  return {
    namedSpeakers: true,
    summary: true,
    insights: true,
    chapters: true,
    takeaways: true,
    quotes: true,
  };
}

export function getProjectAnalysisOptions(project?: { metadata?: any; performance_level?: string | null } | null): AnalysisOptions {
  const rawMetadataOptions = project?.metadata?.analysis_options;
  if (hasExplicitAnalysisOptions(rawMetadataOptions)) {
    return normalizeAnalysisOptions(rawMetadataOptions);
  }

  return legacyTierToOptions(project?.performance_level);
}

export function getSelectedAnalysisKeys(options: AnalysisOptions): AnalysisOptionKey[] {
  return ANALYSIS_OPTION_CONFIG
    .map((option) => option.key)
    .filter((key) => options[key]);
}

export function hasAnyAnalysisOption(options: AnalysisOptions): boolean {
  return getSelectedAnalysisKeys(options).length > 0;
}

export function getProcessingTierForAnalysis(options: AnalysisOptions): TierLevel {
  return hasAnyAnalysisOption(options) ? 'content_kit' : 'transcript';
}

export function getFeaturesFromAnalysisOptions(options: AnalysisOptions): TierFeatures {
  const analysisEnabled = hasAnyAnalysisOption(options);

  return {
    transcription: true,
    speakerDiarization: true,
    wordTimestamps: true,
    nameExtraction: options.namedSpeakers,
    aiSummary: options.summary,
    roleClassification: options.namedSpeakers,
    chapterDetection: options.chapters,
    keyTakeaways: options.takeaways,
    quotesExtraction: options.quotes,
    insights: options.insights,
    contentGeneration: false,
    autoGenerateContent: false,
    speakerLabels: options.namedSpeakers ? 'named-with-roles' : 'generic',
  };
}
