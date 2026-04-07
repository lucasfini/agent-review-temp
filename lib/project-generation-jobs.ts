import { CONTENT_TYPES, type ContentBlock } from '@/lib/content-types';
import type { AnalysisOptionKey } from '@/lib/analysis-options';

export type ProjectGenerationJobKind = 'analysis' | 'content';
export type ProjectGenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ContentSubtabId =
  | 'summary'
  | 'insights'
  | 'chapters'
  | 'takeaways'
  | 'quotes'
  | 'namedSpeakers'
  | string;

export interface ProjectGenerationJob {
  id: string;
  project_id: string;
  user_id: string;
  kind: ProjectGenerationJobKind;
  target_key: string;
  theme_id?: string | null;
  status: ProjectGenerationJobStatus;
  error_message?: string | null;
  failure_notified_at?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export const ANALYSIS_JOB_KEYS: AnalysisOptionKey[] = [
  'namedSpeakers',
  'summary',
  'insights',
  'chapters',
  'takeaways',
  'quotes',
];

export function isAnalysisJobKey(value: string): value is AnalysisOptionKey {
  return ANALYSIS_JOB_KEYS.includes(value as AnalysisOptionKey);
}

export type ReconcileAnalysisTarget =
  | 'nameExtraction'
  | 'summary'
  | 'insights'
  | 'chapters'
  | 'takeaways'
  | 'quotes';

export function mapAnalysisJobKeyToReconcileTarget(key: AnalysisOptionKey): ReconcileAnalysisTarget {
  switch (key) {
    case 'namedSpeakers':
      return 'nameExtraction';
    case 'summary':
    case 'insights':
    case 'chapters':
    case 'takeaways':
    case 'quotes':
      return key;
    default: {
      const exhaustiveCheck: never = key;
      return exhaustiveCheck;
    }
  }
}

export function buildContentBlockForJob(contentTypeId: string, themeId: string): ContentBlock {
  const contentType = CONTENT_TYPES.find((item) => item.id === contentTypeId);
  if (!contentType) {
    throw new Error(`Unknown content type: ${contentTypeId}`);
  }

  return {
    id: `${contentTypeId}_1`,
    contentTypeId,
    blockNumber: 1,
    name: contentType.name,
    enabled: true,
    theme: themeId,
  };
}

export function getJobSubtabId(job: Pick<ProjectGenerationJob, 'kind' | 'target_key'>): ContentSubtabId {
  return job.target_key;
}
