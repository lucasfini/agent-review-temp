import {
  ANALYSIS_OPTION_CONFIG,
  normalizeAnalysisOptions,
  type AnalysisOptionKey,
  type AnalysisOptions,
} from '@/lib/analysis-options';
import { CONTENT_TYPES } from '@/lib/content-types';

const ANALYSIS_LABELS = new Map(
  ANALYSIS_OPTION_CONFIG.map((option) => [option.key, option.label])
);

function toSentenceList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function formatAnalysisSelectionSummary(options?: Partial<AnalysisOptions> | null): string {
  const normalized = normalizeAnalysisOptions(options);
  const selected = Object.entries(normalized)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => ANALYSIS_LABELS.get(key as AnalysisOptionKey))
    .filter((value): value is string => Boolean(value));

  if (selected.length === 0) {
    return 'Transcript only';
  }

  return `Transcript + ${toSentenceList(selected)}`;
}

export function formatAnalysisTargetLabel(targetKey?: string | null): string {
  if (!targetKey) return 'Analysis';
  return ANALYSIS_LABELS.get(targetKey as AnalysisOptionKey) || targetKey;
}

export function formatContentSelectionSummary(blockIds?: unknown): string {
  const ids = Array.isArray(blockIds) ? blockIds : [];
  const labels = ids
    .map((id) => CONTENT_TYPES.find((item) => item.id === id)?.name || String(id || '').trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return 'Generated content';
  }

  return toSentenceList(labels);
}

export function formatWorkflowReason(params: {
  workflowType?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const { workflowType, metadata } = params;

  switch (workflowType) {
    case 'upload_processing':
      return `Audio upload - ${formatAnalysisSelectionSummary(metadata?.analysisOptions as Partial<AnalysisOptions> | null | undefined)}`;
    case 'content_generation':
      return `Content generation - ${formatContentSelectionSummary(metadata?.blockIds)}`;
    case 'analysis_job': {
      const targetLabel = formatAnalysisTargetLabel(typeof metadata?.targetKey === 'string' ? metadata.targetKey : undefined);
      return `${targetLabel} generated`;
    }
    case 'coverage_analysis':
      return 'Creator coaching run';
    case 'segment_touchup':
      return 'Transcript touch-up';
    default:
      return 'Workflow charge';
  }
}

function cleanPurposeLabel(purpose: string): string {
  const normalized = purpose.trim();
  const lower = normalized.toLowerCase();

  const exactLabels: Record<string, string> = {
    'podcast summary': 'Summary',
    'key takeaways': 'Takeaways',
    'social quotes': 'Quotes',
    'chapter detection': 'Chapters',
    'transcript pre-processing': 'Transcript prep',
    'content analysis': 'Content analysis',
    'story angle identification': 'Story angles',
    'speaker intelligence (pass 1)': 'Speaker analysis',
    'legacy speaker intelligence': 'Speaker analysis',
    'speaker name extraction': 'Named speakers',
    'name extraction': 'Named speakers',
    'speaker role classification': 'Speaker roles',
    'speaker verification': 'Speaker verification',
    'segment mapping (pass 2)': 'Speaker segment mapping',
    'legacy segment reassignment': 'Speaker reassignment',
    'legacy transcript reassignment': 'Transcript reassignment',
    'dirty cluster resolution (pass 2c)': 'Speaker cleanup',
    'insight extraction': 'Insights',
    'insight research links': 'Insight research links',
    'narrative coverage analysis': 'Creator coaching',
    'project type classification': 'Project type',
    'segment touchup': 'Transcript touch-up',
    'strict json content generation (all 4 types)': 'Content bundle',
    'show notes generation': 'Show notes',
    'email newsletter generation': 'Newsletter',
    'blog post generation': 'Blog post',
    'quote graphic generation': 'Quote graphic',
  };

  if (exactLabels[lower]) return exactLabels[lower];

  const themedContentMatch = normalized.match(/^(.+?)\s*\(/);
  if (themedContentMatch?.[1]) {
    return themedContentMatch[1].trim();
  }

  return normalized.replace(/\bjson\b/gi, 'JSON');
}

export function formatUsageEventReason(params: {
  serviceName?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
  workflowType?: string | null;
}): string {
  const { serviceName, provider, metadata, workflowType } = params;
  const purpose = typeof metadata?.purpose === 'string' ? metadata.purpose : null;
  if (purpose) return cleanPurposeLabel(purpose);

  const service = (serviceName || '').trim();
  const serviceLower = service.toLowerCase();

  if (serviceLower.includes('transcription') || provider === 'assemblyai') {
    return 'Transcription';
  }

  if (
    serviceLower.startsWith('openai ') ||
    serviceLower.startsWith('claude ') ||
    serviceLower.startsWith('perplexity ') ||
    serviceLower.includes('gpt-') ||
    serviceLower.includes('tokens')
  ) {
    switch (workflowType) {
      case 'upload_processing':
        return 'Project analysis';
      case 'content_generation':
        return 'Generated content';
      case 'analysis_job':
        return 'Analysis';
      case 'coverage_analysis':
        return 'Creator coaching';
      case 'segment_touchup':
        return 'Transcript touch-up';
      default:
        return 'AI processing';
    }
  }

  return service || formatWorkflowReason({ workflowType, metadata });
}
