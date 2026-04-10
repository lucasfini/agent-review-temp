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
