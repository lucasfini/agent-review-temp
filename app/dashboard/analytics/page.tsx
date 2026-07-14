'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronDown,
  X,
  Target,
  Lightbulb,
  BookOpen,
  Upload,
  BarChart3,
  CalendarDays,
  Download,
  AlertCircle,
  Loader2,
  FileText,
  DollarSign
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { supabase } from '@/lib/supabase/client';
import { useCoverageProgress } from '@/lib/context/coverage-progress';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/confirm-modal';
import { CONTENT_TYPES } from '@/lib/content-types';

// New analytics components
import { KPIGrid, type AnalyticsKpiCard } from '@/components/analytics/KPIGrid';
import { GoalsSection } from '@/components/analytics/GoalsSection';
import { InsightsGrid } from '@/components/analytics/InsightsGrid';
import { InsightsHeader } from '@/components/analytics/InsightsHeader';
import { ProjectAnalysisSection } from '@/components/analytics/ProjectAnalysisSection';
import { RunAnalysisSection } from '@/components/analytics/RunAnalysisSection';
import { FeatureHelp } from '@/components/ui/feature-help';
import { DashboardHeaderAction, DashboardPageHeader } from '@/components/dashboard/shell';
import { getDashboardErrorMessage, logDashboardLoad } from '@/lib/dashboard-load-state';
import { withOrganizationId } from '@/lib/organizations/current-organization';

// ============================================================================
// TYPES
// ============================================================================

interface CoverageSnapshotRecord {
  id: string;
  project_id: string;
  project_title?: string | null;
  coverage_window?: string | null;
  topics: Array<any>;
  ctas: Array<any>;
  opportunities: Array<any>;
  ai_usage?: {
    costUsd?: number;
    provider?: string;
    model?: string;
  };
  ai_cost_usd?: number;
  analytics?: Record<string, any>;
  created_at: string;
}

interface NarrativeGoalRecord {
  id: string;
  topic_label: string;
  topic_id?: string | null;
  goal_type: string;
  target_mentions?: number | null;
  cadence_days?: number | null;
  status: string;
  updated_at: string;
}

interface CoverageSummary {
  totalAnalyses: number;
  spendLast30: number;
  avgTopics: number;
  goalsTracked: number;
  latestOpportunities: Array<{
    id: string;
    label: string;
    type: string;
    severity: 'high' | 'medium' | 'low';
    summary: string;
    recommendedAction: string;
    projectTitle?: string | null;
    created_at: string;
  }>;
}

interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  created_at: string;
  performance_level?: string | null;
  transcription_text?: string | null;
}

const OUTPUT_TYPE_TO_CONTENT_TYPE: Record<string, string> = {
  twitter_thread: 'twitter_threads',
  linkedin_post: 'linkedin_posts',
  instagram_caption: 'instagram_content',
  blog_post: 'blog_post',
  email_newsletter: 'newsletter',
  show_notes: 'show_notes',
  quote_graphic: 'quote_graphics',
  facebook_post: 'facebook_post',
  youtube_description: 'youtube_description',
  podcast_episode_description: 'podcast_episode_description',
  short_form_video_script: 'short_form_video_script',
};

function formatFallbackOutputLabel(type?: string): string {
  if (!type) return 'Unknown';
  return type
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getAnalyticsContentLabel(output: { type?: string | null; metadata?: any }): string {
  const originalType = typeof output.metadata?.originalOutputType === 'string'
    ? output.metadata.originalOutputType
    : null;
  const mappedType = (originalType && OUTPUT_TYPE_TO_CONTENT_TYPE[originalType])
    || (output.type && OUTPUT_TYPE_TO_CONTENT_TYPE[output.type])
    || null;

  if (mappedType) {
    const contentType = CONTENT_TYPES.find((item) => item.id === mappedType);
    if (contentType) return contentType.name;
  }

  return formatFallbackOutputLabel(output.type || undefined);
}

interface InsightRecord {
  id: string;
  project_id: string;
  entity_id: string;
  label: string;
  category: 'person' | 'concept';
  confidence: number;
  cost_usd: number;
  created_at: string;
}

interface InsightsSummary {
  totalInsights: number;
  insightsByCategory: {
    person: number;
    concept: number;
  };
  totalCost: number;
  avgConfidence: number;
}

interface AnalyticsData {
  totalProjects: number;
  totalOutputs: number;
  totalProcessingTime: number;
  estimatedCosts: number;
  totalAiSpend: number;
  recentActivity: Array<{
    id: string;
    title: string;
    action: string;
    timestamp: string;
    status: string;
  }>;
  contentBreakdown: Record<string, number>;
  monthlyStats: Array<{
    month: string;
    projects: number;
    outputs: number;
  }>;
  platformStats: Record<string, number>;
  coverage: {
    snapshots: CoverageSnapshotRecord[];
    goals: NarrativeGoalRecord[];
    summary: CoverageSummary;
  };
  projectsSummary: ProjectSummary[];
  insights: {
    records: InsightRecord[];
    summary: InsightsSummary;
  };
  rawOutputs: Array<{
    id: string;
    project_id: string;
    ai_cost_usd: number;
    created_at: string;
    type: string;
    metadata?: any;
    content_category: string;
  }>;
  // Real computed data
  trends: {
    spend: TrendData;
  };
  sparklines: {
    spend: SparklinePoint[];
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EMPTY_COVERAGE_SUMMARY: CoverageSummary = {
  totalAnalyses: 0,
  spendLast30: 0,
  avgTopics: 0,
  goalsTracked: 0,
  latestOpportunities: []
};

const EXAMPLE_NARRATIVE_GOALS = [
  {
    category: 'Product CTAs',
    description: 'Promote your offerings and drive conversions',
    examples: [
      { label: 'Mention coaching program', type: 'cta', target: 2, cadence: 14, description: 'Promote coaching twice per bi-weekly episode' },
      { label: 'Book launch announcement', type: 'cta', target: 3, cadence: 7, description: 'Weekly mentions during launch period' },
      { label: 'Newsletter signup reminder', type: 'cta', target: 1, cadence: 30, description: 'Monthly reminder to join newsletter' },
    ]
  },
  {
    category: 'Recurring Topics',
    description: 'Core themes you want to cover regularly',
    examples: [
      { label: 'AI and automation', type: 'include', target: 3, cadence: 30, description: 'Core theme - discuss monthly' },
      { label: 'Productivity tips', type: 'include', target: 2, cadence: 14, description: 'Regular tactical advice' },
    ]
  },
  {
    category: 'Content Guardrails',
    description: 'Topics to avoid or limit',
    examples: [
      { label: 'Political discussions', type: 'avoid', target: 0, cadence: null, description: 'Keep podcast non-political' },
      { label: 'Competitor mentions', type: 'avoid', target: 1, cadence: 90, description: 'Limit competitive references' },
    ]
  }
];

const CURATED_GOAL_PRESETS = [
  { label: 'Promote newsletter CTA', type: 'cta', target: 2, cadence: 7 },
  { label: 'Mention sponsor name', type: 'cta', target: 1, cadence: 7 },
  { label: 'AI safety', type: 'include', target: 1, cadence: 30 },
  { label: 'Future of work', type: 'include', target: 1, cadence: 30 },
  { label: 'Avoid off-topic politics', type: 'avoid', target: 0, cadence: null },
  { label: 'Highlight guest brand', type: 'mention', target: 1, cadence: null }
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ============================================================================
// SPARKLINE / TREND / GOAL-PROGRESS HELPERS
// ============================================================================

interface SparklinePoint {
  value: number;
}

interface TrendData {
  value: number;
  direction: 'up' | 'down' | 'neutral';
  label: string;
}

interface GoalProgressEntry {
  goalId: string;
  currentMentions: number;
  targetMentions: number;
  progressPercent: number;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const LEGACY_GAP_TYPES = new Set(['underrepresented', 'debt', 'cta-gap', 'overindexed', 'new']);
const LEGACY_STRENGTH_TYPES = new Set(['balanced']);
const COACHING_IMPROVEMENT_TYPES = new Set([
  'hook',
  'clarity',
  'structure',
  'pacing',
  'depth',
  'follow_up',
  'audience_fit',
  'cta',
  'speaker_balance'
]);

function getOpportunityType(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function isStrengthOpportunity(opportunity: { type?: unknown; severity?: unknown }) {
  const type = getOpportunityType(opportunity.type);
  return type === 'strength' || LEGACY_STRENGTH_TYPES.has(type);
}

function isImprovementOpportunity(opportunity: { type?: unknown; severity?: unknown }) {
  const type = getOpportunityType(opportunity.type);
  if (COACHING_IMPROVEMENT_TYPES.has(type) || LEGACY_GAP_TYPES.has(type)) return true;
  if (type === 'strength' || LEGACY_STRENGTH_TYPES.has(type)) return false;
  return String(opportunity.severity || '').toLowerCase() !== 'low';
}

function isGapOpportunity(opportunity: { type?: unknown; severity?: unknown }) {
  const type = getOpportunityType(opportunity.type);
  if (LEGACY_GAP_TYPES.has(type)) return true;
  if (COACHING_IMPROVEMENT_TYPES.has(type)) {
    return String(opportunity.severity || '').toLowerCase() === 'high';
  }
  return false;
}

/**
 * Bucket records by created_at and sum a numeric field per bucket.
 */
function computeSparklineFromValues(
  records: Array<{ created_at: string; value: number }>,
  timeRange: '7d' | '30d' | '90d'
): SparklinePoint[] {
  const buckets = 6;
  const now = Date.now();
  const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
  const bucketSize = rangeMs / buckets;

  const sums = new Array(buckets).fill(0);
  for (const record of records) {
    const age = now - new Date(record.created_at).getTime();
    if (age > rangeMs || age < 0) continue;
    const idx = Math.min(buckets - 1, Math.floor((rangeMs - age) / bucketSize));
    sums[idx] += record.value;
  }
  return sums.map(value => ({ value }));
}

/**
 * Period-over-period comparison: returns { value (%), direction, label }.
 */
function computeTrend(current: number, previous: number): TrendData {
  if (previous === 0 && current === 0) {
    return { value: 0, direction: 'neutral', label: 'no change' };
  }
  if (previous === 0) {
    return { value: 100, direction: 'up', label: 'vs last period' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { value: 0, direction: 'neutral', label: 'no change' };
  return {
    value: Math.abs(pct),
    direction: pct > 0 ? 'up' : 'down',
    label: 'vs last period'
  };
}

function computeMetricTrend(
  current: number,
  previous: number,
  betterWhen: 'higher' | 'lower'
): TrendData & { tone: 'positive' | 'negative' | 'neutral' } {
  const base = computeTrend(current, previous);
  if (base.direction === 'neutral') {
    return { ...base, tone: 'neutral' };
  }

  const improved =
    betterWhen === 'higher'
      ? current >= previous
      : current <= previous;

  return {
    ...base,
    tone: improved ? 'positive' : 'negative'
  };
}

function deriveSnapshotCoverageScore(snapshot: CoverageSnapshotRecord | null): number {
  if (!snapshot) return 0;
  const analyticsScore = Number(snapshot.analytics?.coverageScore);
  if (Number.isFinite(analyticsScore) && analyticsScore > 0) {
    return Math.round(analyticsScore);
  }

  const topics = Array.isArray(snapshot.topics) ? snapshot.topics : [];
  if (!topics.length) return 0;

  const totalMentions = topics.reduce((sum, topic) => sum + Number(topic.mentionCount || 0), 0) || 1;
  const evennessBase =
    -topics.reduce((acc, topic) => {
      const share = typeof topic.shareOfVoice === 'number'
        ? Number(topic.shareOfVoice)
        : Number(topic.mentionCount || 0) / totalMentions;
      return acc + (share > 0 ? share * Math.log(share) : 0);
    }, 0) / Math.log(topics.length || 1);
  const evenness = Number.isFinite(evennessBase) ? evennessBase : 0;
  const topicDepth = Math.min(topics.length / 6, 1);
  return Math.round(((evenness * 0.65) + (topicDepth * 0.35)) * 100);
}

function buildSnapshotSparkline(
  snapshots: CoverageSnapshotRecord[],
  metric: (snapshot: CoverageSnapshotRecord) => number
): SparklinePoint[] {
  const ordered = [...snapshots]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-6);

  if (ordered.length === 0) {
    return Array.from({ length: 6 }, () => ({ value: 0 }));
  }

  const points = ordered.map((snapshot) => ({ value: metric(snapshot) }));
  while (points.length < 6) {
    points.unshift({ value: 0 });
  }
  return points;
}

function sumOutputSpendForWindow(
  outputs: Array<{ created_at: string; ai_cost_usd: number }>,
  start: Date,
  end: Date
) {
  return outputs.reduce((sum, output) => {
    const created = new Date(output.created_at);
    if (created >= start && created < end) {
      return sum + Number(output.ai_cost_usd || 0);
    }
    return sum;
  }, 0);
}

/**
 * Cross-reference goals against coverage snapshot topics/CTAs to compute real mention counts.
 */
function computeAllGoalProgress(
  goals: NarrativeGoalRecord[],
  snapshots: CoverageSnapshotRecord[]
): GoalProgressEntry[] {
  return goals.map(goal => {
    const label = (goal.topic_label || '').toLowerCase();
    let mentions = 0;

    for (const snap of snapshots) {
      const topics = Array.isArray(snap.topics) ? snap.topics : [];
      const ctas = Array.isArray(snap.ctas) ? snap.ctas : [];

      for (const topic of topics) {
        const topicLabel = String(topic.label || topic.id || '').toLowerCase();
        if (topicLabel === label || topicLabel.includes(label) || label.includes(topicLabel)) {
          mentions += Number(topic.mentionCount || 1);
        }
      }

      for (const cta of ctas) {
        const ctaLabel = String(cta.label || cta.id || '').toLowerCase();
        if (ctaLabel === label || ctaLabel.includes(label) || label.includes(ctaLabel)) {
          mentions += Number(cta.mentionCount || 1);
        }
      }
    }

    const target = goal.target_mentions || 1;
    return {
      goalId: goal.id,
      currentMentions: mentions,
      targetMentions: target,
      progressPercent: Math.min(100, Math.round((mentions / target) * 100))
    };
  });
}

function summarizeInsights(insightRecords: InsightRecord[]): InsightsSummary {
  if (!insightRecords || insightRecords.length === 0) {
    return {
      totalInsights: 0,
      insightsByCategory: { person: 0, concept: 0 },
      totalCost: 0,
      avgConfidence: 0
    };
  }

  const categoryBreakdown = insightRecords.reduce((acc, insight) => {
    acc[insight.category] = (acc[insight.category] || 0) + 1;
    return acc;
  }, { person: 0, concept: 0 } as { person: number; concept: number });

  const totalCost = insightRecords.reduce((sum, insight) => sum + Number(insight.cost_usd || 0), 0);
  const avgConfidence = insightRecords.reduce((sum, insight) => sum + Number(insight.confidence || 0), 0) / insightRecords.length;

  return {
    totalInsights: insightRecords.length,
    insightsByCategory: categoryBreakdown,
    totalCost: Number(totalCost.toFixed(4)),
    avgConfidence: Number(avgConfidence.toFixed(2))
  };
}

function summarizeCoverage(
  snapshots: CoverageSnapshotRecord[],
  goals: NarrativeGoalRecord[],
  projectIds?: string[]
): CoverageSummary {
  let filteredSnapshots = snapshots;
  if (projectIds && projectIds.length > 0) {
    filteredSnapshots = snapshots.filter(s => projectIds.includes(s.project_id));
  }

  if (!filteredSnapshots.length) {
    return {
      ...EMPTY_COVERAGE_SUMMARY,
      goalsTracked: goals.length
    };
  }

  const last30Cutoff = new Date();
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);

  const spendLast30 = filteredSnapshots.reduce((sum, snapshot) => {
    const created = new Date(snapshot.created_at);
    if (created >= last30Cutoff) {
      return sum + Number(snapshot.ai_cost_usd || snapshot.ai_usage?.costUsd || 0);
    }
    return sum;
  }, 0);

  const totalTopics = filteredSnapshots.reduce(
    (sum, snapshot) => sum + ((snapshot.topics || []).length || 0),
    0
  );

  const latestOpportunities = filteredSnapshots
    .flatMap(snapshot => (snapshot.opportunities || []).map((op: any, index: number) => ({
      id: `${snapshot.id}-${index}`,
      label: op.label || 'Opportunity',
      type: op.type || 'balanced',
      severity: (op.severity || 'medium') as 'high' | 'medium' | 'low',
      summary: op.summary || '',
      recommendedAction: op.recommendedAction || '',
      projectTitle: snapshot.project_title,
      created_at: snapshot.created_at
    })))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  return {
    totalAnalyses: filteredSnapshots.length,
    spendLast30: Number(spendLast30.toFixed(4)),
    avgTopics: Number(((totalTopics / filteredSnapshots.length) || 0).toFixed(1)),
    goalsTracked: goals.length,
    latestOpportunities
  };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Project Switcher Dropdown */
function ProjectSwitcher({
  projects,
  selectedProjectId,
  onSelect
}: {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId)
    : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Selected project: ${selectedProject ? selectedProject.title : 'Select project'}`}
        className="inline-flex w-full max-w-[min(100%,28rem)] items-center gap-2 rounded-lg border border-slate-300 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 dark:active:bg-slate-800 sm:w-auto sm:min-w-[20rem]"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selectedProject ? selectedProject.title : 'Select project'}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            role="listbox"
            aria-label="Select project"
            className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto text-slate-900 dark:text-slate-50"
          >
            {projects.map(project => (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={selectedProjectId === project.id}
                onClick={() => {
                  onSelect(project.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selectedProjectId === project.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-600 dark:text-slate-300'
                  }`}
              >
                <span className="block truncate">{project.title || 'Untitled'}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Example Goals Modal */
function ExampleGoalsModal({
  isOpen,
  onClose,
  onAddGoal
}: {
  isOpen: boolean;
  onClose: () => void;
  onAddGoal: (goal: { label: string; type: string; target: number; cadence: number | null }) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="example-goals-title">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/30" onClick={onClose} />
        <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-300 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <h2 id="example-goals-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">Example Goals Library</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close example goals"
            >
              <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)] space-y-4">
            {EXAMPLE_NARRATIVE_GOALS.map((category, idx) => (
              <div key={idx} className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-1">{category.category}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{category.description}</p>
                <div className="space-y-2">
                  {category.examples.map((example, exIdx) => (
                    <div
                      key={exIdx}
                      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 p-3 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{example.label}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{example.description}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="uppercase font-semibold text-indigo-600">
                              {example.type === 'include'
                                ? 'Repeat this theme'
                                : example.type === 'cta'
                                  ? 'Remember this CTA'
                                  : example.type === 'avoid'
                                    ? 'Avoid this pattern'
                                    : 'Improve this habit'}
                            </span>
                            <span>•</span>
                            <span>{example.target} mention{example.target !== 1 ? 's' : ''}</span>
                            {example.cadence && (
                              <>
                                <span>•</span>
                                <span>every {example.cadence}d</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onAddGoal({
                              label: example.label,
                              type: example.type,
                              target: example.target,
                              cadence: example.cadence
                            });
                          }}
                          className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:hover:text-indigo-300"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, isDemoMode } = useAuth();
  const { organizationId } = useCurrentOrganization();

  // URL-based project filter
  const projectIdFromUrl = searchParams.get('projectId');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Tab state
  const [activeTab, setActiveTab] = useState<'insights' | 'goals'>('insights');

  // Goal form state
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [pendingArchiveGoal, setPendingArchiveGoal] = useState<{ id: string; label: string } | null>(null);
  const [exampleGoalsModalOpen, setExampleGoalsModalOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const { runningCoverageIds, startCoverage, stopCoverage } = useCoverageProgress();

  const patchCoverageGoals = useCallback((updater: (goals: NarrativeGoalRecord[]) => NarrativeGoalRecord[]) => {
    setAnalytics((current) => {
      if (!current) return current;
      return {
        ...current,
        coverage: {
          ...current.coverage,
          goals: updater(current.coverage.goals || [])
        }
      };
    });
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setAnalyticsError(null);

      if (!user?.id) {
        setLoading(false);
        return;
      }

      logDashboardLoad('analytics', 'start', { userId: user.id, range: timeRange });

      const now = new Date();
      const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
      const prevStartDate = new Date(startDate.getTime() - rangeDays * 24 * 60 * 60 * 1000);

      const response = await fetch(withOrganizationId('/api/dashboard/analytics', organizationId), {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'We could not load your analytics right now. Please try again.' }));
        throw new Error(payload.error || 'We could not load your analytics right now. Please try again.');
      }
      const payload = await response.json() as {
        projects?: any[];
        outputs?: any[];
        coverageSnapshots?: any[];
        coverageGoals?: any[];
        insights?: any[];
      };
      const projects = payload.projects || [];
      const outputs = payload.outputs || [];
      const coverageSnapshots = payload.coverageSnapshots || [];
      const coverageGoals = payload.coverageGoals || [];
      const insights = payload.insights || [];

      // ---- Compute real values ----
      const safeProjects = projects;
      const safeOutputs = outputs;
      const totalProjects = safeProjects.length;
      const totalOutputs = safeOutputs.length;
      const totalProcessingTime = safeProjects.reduce((sum: number, p: any) => sum + (p.processing_time_seconds || 0), 0);

      // Real AI spend: sum output ai_cost_usd + coverage snapshot costs + insight costs
      const outputAiCost = safeOutputs.reduce((sum: number, o: any) => sum + Number(o.ai_cost_usd || 0), 0);
      const coverageSnapshotData = coverageSnapshots;
      const snapshotAiCost = coverageSnapshotData.reduce(
        (sum: number, s: any) => sum + Number(s.ai_cost_usd || s.ai_usage?.costUsd || 0), 0
      );
      const insightRecords = insights;
      const insightAiCost = insightRecords.reduce((sum: number, i: any) => sum + Number(i.cost_usd || 0), 0);
      const realAiSpend = outputAiCost + snapshotAiCost + insightAiCost;
      // Fallback to flat estimate only if all real costs are 0
      const totalAiSpend = realAiSpend > 0 ? realAiSpend : safeOutputs.length * 0.05;

      const currentSpend = sumOutputSpendForWindow(
        safeOutputs.map((o: any) => ({ created_at: o.created_at, ai_cost_usd: Number(o.ai_cost_usd || 0) })),
        startDate,
        now
      );
      const previousSpend = sumOutputSpendForWindow(
        safeOutputs.map((o: any) => ({ created_at: o.created_at, ai_cost_usd: Number(o.ai_cost_usd || 0) })),
        prevStartDate,
        startDate
      );

      const trends = {
        spend: computeTrend(currentSpend, previousSpend)
      };

      const sparklines = {
        spend: computeSparklineFromValues(
          safeOutputs.map((o: any) => ({ created_at: o.created_at, value: Number(o.ai_cost_usd || 0) })),
          timeRange
        )
      };

      // Content breakdown
      const contentBreakdown: Record<string, number> = {};
      safeOutputs.forEach((output: any) => {
        const label = getAnalyticsContentLabel(output);
        contentBreakdown[label] = (contentBreakdown[label] || 0) + 1;
      });

      // Platform stats
      const platformStats: Record<string, number> = {};
      safeOutputs.forEach((output: any) => {
        const platform = output.platform || 'general';
        platformStats[platform] = (platformStats[platform] || 0) + 1;
      });

      // Recent activity
      const recentActivity = safeProjects.slice(0, 10).map((project: any) => ({
        id: project.id,
        title: project.title,
        action: project.status === 'completed' ? 'Completed transcription' :
          project.status === 'processing' ? 'Processing audio' : 'Uploaded',
        timestamp: project.created_at,
        status: project.status
      }));

      const coverageGoalData = coverageGoals;
      const coverageSummary = summarizeCoverage(coverageSnapshotData, coverageGoalData);

      // Real goal progress
      const projectSummaries: ProjectSummary[] = safeProjects.map((project: any) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        created_at: project.created_at,
        performance_level: project.performance_level,
        transcription_text: project.transcription_text
      }));

      const insightsSummary = summarizeInsights(insightRecords);

      setAnalytics({
        totalProjects,
        totalOutputs,
        totalProcessingTime,
        estimatedCosts: totalAiSpend,
        totalAiSpend,
        recentActivity,
        contentBreakdown,
        monthlyStats: [],
        platformStats,
        coverage: {
          snapshots: coverageSnapshotData,
          goals: coverageGoalData,
          summary: coverageSummary
        },
        projectsSummary: projectSummaries,
        insights: {
          records: insightRecords,
          summary: insightsSummary
        },
        trends,
        sparklines,
        rawOutputs: safeOutputs.map((o: any) => ({
          id: o.id,
          project_id: o.project_id,
          ai_cost_usd: Number(o.ai_cost_usd || 0),
          created_at: o.created_at,
          type: o.type || 'unknown',
          metadata: o.metadata || null,
          content_category: getAnalyticsContentLabel(o)
        }))
      });
      logDashboardLoad('analytics', 'success', {
        userId: user.id,
        range: timeRange,
        projects: totalProjects,
        outputs: totalOutputs,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      const message = getDashboardErrorMessage(error, 'We could not load your analytics right now. Please try again.');
      setAnalyticsError(message);
      logDashboardLoad('analytics', 'error', { userId: user?.id, range: timeRange, message });
    } finally {
      setLoading(false);
    }
  }, [organizationId, session?.access_token, timeRange, user?.id]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, user]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const coverageGoals = analytics?.coverage?.goals || [];
  const demoGoalsFallback = [
    { id: 'demo-ai-healthcare', topic_id: 'ai-healthcare', topic_label: 'AI in Healthcare', goal_type: 'include', target_mentions: 3, cadence_days: 30, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'demo-leadership-mindset', topic_id: 'leadership-mindset', topic_label: 'Leadership Mindset', goal_type: 'include', target_mentions: 2, cadence_days: 30, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'demo-cta-newsletter', topic_id: 'cta-newsletter', topic_label: 'Subscribe to Newsletter', goal_type: 'cta', target_mentions: 1, cadence_days: 30, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ];
  const effectiveGoals = isDemoMode && coverageGoals.length === 0 ? demoGoalsFallback : coverageGoals;

  const projectTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of (analytics?.projectsSummary || [])) {
      map[p.id] = p.title;
    }
    return map;
  }, [analytics?.projectsSummary]);

  const selectedProject = useMemo(
    () => analytics?.projectsSummary.find((project) => project.id === projectIdFromUrl) || null,
    [analytics?.projectsSummary, projectIdFromUrl]
  );

  const projectSnapshots = useMemo(() => {
    if (!analytics || !projectIdFromUrl) return [];
    return analytics.coverage.snapshots.filter((snapshot) => snapshot.project_id === projectIdFromUrl);
  }, [analytics, projectIdFromUrl]);

  const latestSnapshot = projectSnapshots[0] || null;
  const previousSnapshot = projectSnapshots[1] || null;

  const selectedSnapshot = useMemo(() => {
    if (!selectedSnapshotId) return latestSnapshot;
    return projectSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || latestSnapshot;
  }, [selectedSnapshotId, projectSnapshots, latestSnapshot]);

  const selectedProjectOutputs = useMemo(() => {
    if (!analytics || !projectIdFromUrl) return [];
    return analytics.rawOutputs.filter((output) => output.project_id === projectIdFromUrl);
  }, [analytics, projectIdFromUrl]);

  const selectedProjectInsights = useMemo(() => {
    if (!analytics || !projectIdFromUrl) return [];
    return analytics.insights.records.filter((insight) => insight.project_id === projectIdFromUrl);
  }, [analytics, projectIdFromUrl]);

  const selectedProjectHasTranscript = Boolean(selectedProject?.transcription_text && selectedProject.transcription_text.length > 0);
  const selectedProjectHasSnapshot = projectSnapshots.length > 0;

  const selectedGoalProgress = useMemo(
    () => computeAllGoalProgress(effectiveGoals, projectSnapshots),
    [effectiveGoals, projectSnapshots]
  );

  const suggestedGoals = useMemo(() => {
    const suggestions: { label: string; type: string; target: number; cadence: number | null }[] = [];
    const seen = new Set<string>();
    const normalize = (val: any) => String(val || '').trim();

    projectSnapshots.slice(0, 5).forEach((snapshot) => {
      (snapshot.topics || []).forEach((topic: any) => {
        const label = normalize(topic.label || topic.name || topic.title || topic.id);
        if (!label) return;
        const key = `include-${label.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        suggestions.push({ label, type: 'include', target: 1, cadence: 30 });
      });
      (snapshot.ctas || []).forEach((cta: any) => {
        const label = normalize(cta.label || cta.name || cta.title || cta.id);
        if (!label) return;
        const key = `cta-${label.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        suggestions.push({ label, type: 'cta', target: 1, cadence: 7 });
      });
    });

    if (suggestions.length > 0) return suggestions.slice(0, 6);
    return CURATED_GOAL_PRESETS.slice(0, 6) as { label: string; type: string; target: number; cadence: number | null }[];
  }, [projectSnapshots]);

  const coverageTimeline = useMemo(() => projectSnapshots.slice(0, 10), [projectSnapshots]);

  const displayedOpportunities = useMemo(() => {
    const snapshot = selectedSnapshot;
    if (!snapshot) return [];
    return (snapshot.opportunities || []).map((op: any, index: number) => ({
      id: `${snapshot.id}-${index}`,
      label: op.label || 'Opportunity',
      type: op.type || 'balanced',
      severity: op.severity || 'medium',
      summary: op.summary || '',
      recommendedAction: op.recommendedAction || '',
      projectTitle: snapshot.project_title,
      created_at: snapshot.created_at,
      topicId: op.topicId
    }));
  }, [selectedSnapshot]);

  const topicHeat = useMemo(() => {
    const topics = Array.isArray(selectedSnapshot?.topics) ? selectedSnapshot.topics : [];
    return topics
      .map((topic: any) => ({
        label: String(topic.label || topic.id || 'Topic'),
        shareOfVoice: typeof topic.shareOfVoice === 'number' ? Number(topic.shareOfVoice) : 0,
        mentionCount: Number(topic.mentionCount || 0)
      }))
      .sort((a, b) => b.shareOfVoice - a.shareOfVoice || b.mentionCount - a.mentionCount);
  }, [selectedSnapshot]);

  const selectedProjectContentBreakdown = useMemo(() => {
    return selectedProjectOutputs.reduce((acc, output) => {
      const key = output.content_category || getAnalyticsContentLabel(output);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [selectedProjectOutputs]);

  const currentRangeStart = useMemo(() => {
    const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    return new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  }, [timeRange]);

  const previousRangeStart = useMemo(() => {
    const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    return new Date(currentRangeStart.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  }, [currentRangeStart, timeRange]);

  const filteredAiSpend = useMemo(() => {
    const now = new Date();
    const outputCost = sumOutputSpendForWindow(selectedProjectOutputs, currentRangeStart, now);
    const snapshotCost = projectSnapshots.reduce((sum, snapshot) => {
      const created = new Date(snapshot.created_at);
      if (created >= currentRangeStart && created < now) {
        return sum + Number(snapshot.ai_cost_usd || snapshot.ai_usage?.costUsd || 0);
      }
      return sum;
    }, 0);
    const insightCost = selectedProjectInsights.reduce((sum, insight) => {
      const created = new Date(insight.created_at);
      if (created >= currentRangeStart && created < now) {
        return sum + Number(insight.cost_usd || 0);
      }
      return sum;
    }, 0);
    return outputCost + snapshotCost + insightCost;
  }, [selectedProjectOutputs, projectSnapshots, selectedProjectInsights, currentRangeStart]);

  const previousAiSpend = useMemo(() => {
    const outputCost = sumOutputSpendForWindow(selectedProjectOutputs, previousRangeStart, currentRangeStart);
    const snapshotCost = projectSnapshots.reduce((sum, snapshot) => {
      const created = new Date(snapshot.created_at);
      if (created >= previousRangeStart && created < currentRangeStart) {
        return sum + Number(snapshot.ai_cost_usd || snapshot.ai_usage?.costUsd || 0);
      }
      return sum;
    }, 0);
    const insightCost = selectedProjectInsights.reduce((sum, insight) => {
      const created = new Date(insight.created_at);
      if (created >= previousRangeStart && created < currentRangeStart) {
        return sum + Number(insight.cost_usd || 0);
      }
      return sum;
    }, 0);
    return outputCost + snapshotCost + insightCost;
  }, [selectedProjectOutputs, projectSnapshots, selectedProjectInsights, previousRangeStart, currentRangeStart]);

  const aiSpendSparkline = useMemo(() => {
    const spendRecords = [
      ...selectedProjectOutputs.map((output) => ({ created_at: output.created_at, value: Number(output.ai_cost_usd || 0) })),
      ...projectSnapshots.map((snapshot) => ({ created_at: snapshot.created_at, value: Number(snapshot.ai_cost_usd || snapshot.ai_usage?.costUsd || 0) })),
      ...selectedProjectInsights.map((insight) => ({ created_at: insight.created_at, value: Number(insight.cost_usd || 0) })),
    ];
    return computeSparklineFromValues(spendRecords, timeRange);
  }, [selectedProjectOutputs, projectSnapshots, selectedProjectInsights, timeRange]);

  const analysisMetrics = useMemo(() => {
    const topicCoverageCurrent = deriveSnapshotCoverageScore(latestSnapshot);
    const topicCoveragePrevious = deriveSnapshotCoverageScore(previousSnapshot);
    const coachingGapCurrent = (latestSnapshot?.opportunities || []).filter((op: any) => isGapOpportunity(op)).length;
    const coachingGapPrevious = (previousSnapshot?.opportunities || []).filter((op: any) => isGapOpportunity(op)).length;
    const missedOpportunityCurrent = (latestSnapshot?.opportunities || []).filter((op: any) => isImprovementOpportunity(op)).length;
    const missedOpportunityPrevious = (previousSnapshot?.opportunities || []).filter((op: any) => isImprovementOpportunity(op)).length;

    const cards: AnalyticsKpiCard[] = [
      {
        title: 'Topic Coverage',
        value: selectedProjectHasSnapshot ? `${topicCoverageCurrent}%` : '--',
        note: 'Share of voice mapped across recurring themes.',
        helpDescription: 'A supporting signal that estimates how evenly the episode covered its main themes.',
        helpBestFor: 'understanding topic balance, not replacing the creator coaching feedback',
        trend: {
          ...computeMetricTrend(topicCoverageCurrent, topicCoveragePrevious, 'higher'),
          label: 'vs previous run'
        },
        sparkline: buildSnapshotSparkline(projectSnapshots, deriveSnapshotCoverageScore),
        icon: <FileText className="h-5 w-5" />,
        iconBg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-300',
        sparklineColor: '#38bdf8'
      },
      {
        title: 'Coaching Gaps',
        value: selectedProjectHasSnapshot ? `${coachingGapCurrent} ${coachingGapCurrent === 1 ? 'gap' : 'gaps'}` : '--',
        note: 'High-priority issues to fix in this or the next episode.',
        helpDescription: 'Counts the highest-priority weaknesses or missing elements the analysis thinks are worth fixing first.',
        helpBestFor: 'deciding what to improve before publishing or in the next recording',
        trend: {
          ...computeMetricTrend(coachingGapCurrent, coachingGapPrevious, 'lower'),
          label: 'vs previous run'
        },
        sparkline: buildSnapshotSparkline(projectSnapshots, (snapshot) => (snapshot.opportunities || []).filter((op: any) => isGapOpportunity(op)).length),
        icon: <Target className="h-5 w-5" />,
        iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
        sparklineColor: '#f59e0b'
      },
      {
        title: 'Missed Opportunities',
        value: selectedProjectHasSnapshot ? `${missedOpportunityCurrent}` : '--',
        note: 'Moments where the episode could have been clearer, deeper, or stronger.',
        helpDescription: 'Counts the places where the episode could have gone deeper, clearer, or stronger even if it was not a critical gap.',
        helpBestFor: 'finding good-but-not-great moments you can improve over time',
        trend: {
          ...computeMetricTrend(missedOpportunityCurrent, missedOpportunityPrevious, 'lower'),
          label: 'vs previous run'
        },
        sparkline: buildSnapshotSparkline(projectSnapshots, (snapshot) => (snapshot.opportunities || []).filter((op: any) => isImprovementOpportunity(op)).length),
        icon: <Lightbulb className="h-5 w-5" />,
        iconBg: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-300',
        sparklineColor: '#a855f7'
      },
      {
        title: 'AI Spend',
        value: formatCurrency(filteredAiSpend),
        note: `${timeRange.toUpperCase()} spend across outputs and analysis runs.`,
        trend: {
          ...computeTrend(filteredAiSpend, previousAiSpend),
          tone: filteredAiSpend <= previousAiSpend ? 'positive' : 'negative',
          label: 'vs last period'
        },
        sparkline: aiSpendSparkline,
        icon: <DollarSign className="h-5 w-5" />,
        iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300',
        sparklineColor: '#3b82f6'
      }
    ];

    return { cards };
  }, [latestSnapshot, previousSnapshot, selectedProjectHasSnapshot, projectSnapshots, filteredAiSpend, previousAiSpend, aiSpendSparkline, timeRange]);

  const isStale = useMemo(() => {
    if (!projectSnapshots.length || !analytics?.coverage.goals.length) return false;
    const lastAnalysisTime = Math.max(...projectSnapshots.map(s => new Date(s.created_at).getTime()));
    const lastGoalChange = Math.max(...analytics.coverage.goals.map(g => new Date(g.updated_at).getTime()));
    return lastGoalChange > lastAnalysisTime;
  }, [analytics, projectSnapshots]);

  const goalsLastModified = useMemo(() => {
    if (!analytics?.coverage?.goals?.length) return null;
    const timestamps = analytics.coverage.goals
      .map(g => g.updated_at ? new Date(g.updated_at).getTime() : 0)
      .filter(t => t > 0);

    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [analytics?.coverage?.goals]);

  // Projects with transcription but no coverage snapshot
  useEffect(() => {
    if (!analytics?.projectsSummary?.length) return;

    const hasValidSelection = projectIdFromUrl && analytics.projectsSummary.some((project) => project.id === projectIdFromUrl);
    if (hasValidSelection) return;

    const latestAnalyzedProjectId = analytics.coverage.snapshots[0]?.project_id || null;
    const latestTranscribedProjectId = analytics.projectsSummary.find((project) => project.transcription_text)?.id || null;
    const fallbackProjectId = latestAnalyzedProjectId || latestTranscribedProjectId || analytics.projectsSummary[0]?.id;

    if (fallbackProjectId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('projectId', fallbackProjectId);
      router.replace(`/dashboard/analytics?${params.toString()}`);
    }
  }, [analytics, projectIdFromUrl, router, searchParams]);

  useEffect(() => {
    if (selectedSnapshotId && !projectSnapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) {
      setSelectedSnapshotId(null);
    }
  }, [projectSnapshots, selectedSnapshotId]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleProjectSelect = useCallback((projectId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('projectId', projectId);
    router.push(`/dashboard/analytics?${params.toString()}`);
  }, [router, searchParams]);

  const formatRelativeDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 1) return `${diffDays}d ago`;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours >= 1) return `${diffHours}h ago`;
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMinutes}m ago`;
  };

  const saveGoal = async (params: { label: string; type: string; target: number; cadence: number | null }) => {
    if (!user) return;
    const trimmedLabel = (params.label || '').trim();
    if (!trimmedLabel) {
      setGoalError('Enter a topic or CTA label.');
      return;
    }

    try {
      setGoalSaving(true);
      setGoalError('');
      const { data, error } = await supabase
        .from('narrative_goals')
        .insert({
          user_id: user.id,
          topic_label: trimmedLabel,
          goal_type: params.type,
          target_mentions: Math.max(0, Number(params.target) || 0),
          cadence_days: params.cadence ? Math.max(1, Number(params.cadence)) : null,
          status: 'active'
        } as any)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      if (data) {
        patchCoverageGoals((goals) => [...goals, data as NarrativeGoalRecord]);
      }
    } catch (err: any) {
      setGoalError(err.message || 'Failed to create goal.');
    } finally {
      setGoalSaving(false);
    }
  };

  const handleToggleGoalStatus = async (goalId: string, currentStatus: string) => {
    if (!goalId) return;
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const { data, error } = await supabase
        .from('narrative_goals')
        // @ts-ignore - Supabase types issue
        .update({ status: nextStatus })
        .eq('id', goalId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      patchCoverageGoals((goals) =>
        goals.map((goal) => (
          goal.id === goalId
            ? { ...goal, ...(data as NarrativeGoalRecord | null || {}), status: nextStatus }
            : goal
        ))
      );
    } catch (err) {
      console.error('Failed to update goal status:', err);
      toast.error('Failed to update goal status. Please try again.');
    }
  };

  const handleArchiveGoal = async (goalId: string, goalLabel: string) => {
    if (!user?.id) return;
    setPendingArchiveGoal({ id: goalId, label: goalLabel });
  };

  const confirmArchiveGoal = async () => {
    if (!pendingArchiveGoal || !user?.id) return;
    const { id: goalId, label: goalLabel } = pendingArchiveGoal;
    try {
      const { data, error } = await supabase
        .from('narrative_goals')
        // @ts-ignore - Supabase types issue
        .update({ status: 'archived' })
        .eq('id', goalId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      patchCoverageGoals((goals) =>
        goals.map((goal) => (
          goal.id === goalId
            ? { ...goal, ...(data as NarrativeGoalRecord | null || {}), status: 'archived' }
            : goal
        ))
      );
      toast.success(`Goal "${goalLabel}" archived`);
    } catch (error: any) {
      toast.error(`Failed to archive goal: ${error.message}`);
    } finally {
      setPendingArchiveGoal(null);
    }
  };

  const handleRunCoverage = async (projectId: string) => {
    if (isDemoMode) {
      toast.error('Demo account is read-only.');
      return;
    }

    if (!user?.id || !session?.access_token) {
      toast.error('You need to be signed in to run analysis.');
      return;
    }

    const title = projectTitleMap[projectId] || projectId;
    startCoverage(projectId, title);
    try {
      const response = await fetch(`/api/projects/${projectId}/run-coverage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user.id, force: true })
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Failed to run coverage analysis');
      }

      // Refresh analytics data to show new snapshot
      await fetchAnalytics();
    } catch (error: any) {
      console.error('Error running coverage:', error);
      toast.error(error?.message || 'Coverage analysis could not be started. Please try again.');
    } finally {
      stopCoverage(projectId);
    }
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-28 bg-slate-100 dark:bg-slate-700 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="h-64 bg-slate-100 dark:bg-slate-700 rounded-xl" />
              <div className="h-64 bg-slate-100 dark:bg-slate-700 rounded-xl" />
            </div>
            <div className="h-80 bg-slate-100 dark:bg-slate-700 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (analyticsError && !analytics) {
    return (
      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 min-h-screen">
        <div className="max-w-lg mx-auto text-center pt-20">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-900/20 flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-3">Analytics unavailable</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8">{analyticsError}</p>
          <button
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Loader2 className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!analytics || analytics.totalProjects === 0) {
    return (
      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 min-h-screen">
        <div className="max-w-lg mx-auto text-center pt-20">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-900/20 flex items-center justify-center mb-6">
            <BarChart3 className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-3">No analytics yet</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            Upload and transcribe your first podcast or audio file to unlock analytics.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            You&apos;ll see real KPI trends, content breakdowns, topic coverage, narrative goal tracking, and AI-driven insights — all computed from your actual data.
          </p>
          <button
            onClick={() => router.push('/dashboard/upload')}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload your first project
          </button>
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6 dark:bg-[#061126]">
      {analyticsError && (
        <div className="max-w-7xl mx-auto mb-4 rounded-lg border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {analyticsError}
        </div>
      )}
      <ConfirmModal
        isOpen={!!pendingArchiveGoal}
        onClose={() => setPendingArchiveGoal(null)}
        onConfirm={confirmArchiveGoal}
        title="Archive Goal"
        description={pendingArchiveGoal ? `Archive "${pendingArchiveGoal.label}"? It will stop affecting active tracking and move into archived goal history.` : undefined}
        confirmText="Archive"
        isDestructive={false}
      />
      <div className="max-w-7xl mx-auto space-y-6">

        <DashboardPageHeader
          icon={BarChart3}
          title="Analytics"
          description="Track performance, usage trends, and content activity."
          actions={(
            <>
              <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-1">
                <CalendarDays className="ml-2 h-4 w-4 text-slate-400" />
                {(['7d', '30d', '90d'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                      timeRange === range
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {range.toUpperCase()}
                  </button>
                ))}
              </div>
              <DashboardHeaderAction type="button" icon={Download} variant="primary">Export Report</DashboardHeaderAction>
            </>
          )}
        />

        <div className="flex flex-wrap items-center gap-3">
          <ProjectSwitcher
            projects={analytics.projectsSummary}
            selectedProjectId={projectIdFromUrl}
            onSelect={handleProjectSelect}
          />
          <div className="ml-auto flex items-center gap-3">
            <RunAnalysisSection
              selectedProject={selectedProject}
              selectedHasTranscript={selectedProjectHasTranscript}
              selectedHasSnapshot={selectedProjectHasSnapshot}
              runningCoverageIds={runningCoverageIds}
              onRunAnalysis={handleRunCoverage}
            />
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {selectedProjectHasSnapshot ? 'Analyzed' : selectedProjectHasTranscript ? 'Ready to analyze' : 'Transcript required'}
              </span>
              <FeatureHelp
                title="Analysis status"
                description="Analyzed means this project already has creator coaching. Ready to analyze means the transcript exists but coaching has not been run yet. Transcript required means analysis cannot run until transcription exists."
                bestFor="understanding why the analysis button is or is not ready"
              />
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* ROW 1: KPI Cards */}
        {/* ================================================================== */}
        <div data-tour="analytics-kpis">
          <KPIGrid cards={analysisMetrics.cards} />
        </div>

        {/* ================================================================== */}
        {/* ROW 2: Project Analysis */}
        {/* ================================================================== */}
        <div data-tour="analytics-content-mix">
          <ProjectAnalysisSection
            contentBreakdown={selectedProjectContentBreakdown}
            topics={topicHeat}
            hasSnapshot={selectedProjectHasSnapshot}
          />
        </div>

        {/* ================================================================== */}
        {/* ROW 3: Tab Section (Insights & Goals) */}
        {/* ================================================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800" role="region" aria-label="Insights and goals">
          {/* Tab Header */}
          <div className="border-b border-slate-200 dark:border-slate-800 p-1">
            <nav className="flex gap-1" role="tablist" aria-label="Analytics sections">
              <button
                id="tab-insights"
                role="tab"
                aria-selected={activeTab === 'insights'}
                aria-controls="tabpanel-insights"
                onClick={() => setActiveTab('insights')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'insights'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
              >
                <Lightbulb className="h-4 w-4" />
                Creator Coaching
              </button>
              <button
                id="tab-goals"
                data-tour="analytics-goals"
                role="tab"
                aria-selected={activeTab === 'goals'}
                aria-controls="tabpanel-goals"
                onClick={() => setActiveTab('goals')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'goals'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
              >
                <Target className="h-4 w-4" />
                Goals
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'insights' && (
            <div id="tabpanel-insights" data-tour="analytics-coverage" role="tabpanel" aria-labelledby="tab-insights" className="p-6">
              <InsightsHeader
                snapshots={coverageTimeline}
                selectedSnapshotId={selectedSnapshotId}
                onSelectSnapshot={setSelectedSnapshotId}
                isStale={isStale}
                goalsLastModified={goalsLastModified}
                onRerunAnalysis={() => {
                  const latest = coverageTimeline[0];
                  if (latest) handleRunCoverage(latest.project_id);
                }}
              />
              <InsightsGrid
                opportunities={displayedOpportunities}
                projectIdFilter={selectedProject.id}
                formatRelativeDate={formatRelativeDate}
                goals={effectiveGoals}
              />
            </div>
          )}

          {activeTab === 'goals' && (
            <div id="tabpanel-goals" role="tabpanel" aria-labelledby="tab-goals" className="p-6" data-tour="analytics-goals-panel">
              <GoalsSection
                goals={effectiveGoals}
                goalProgress={selectedGoalProgress}
                onSaveGoal={saveGoal}
                onToggleStatus={handleToggleGoalStatus}
                onArchive={handleArchiveGoal}
                onOpenExamples={() => setExampleGoalsModalOpen(true)}
                suggestedGoals={suggestedGoals}
                isSaving={goalSaving}
                error={goalError}
                readOnly={isDemoMode}
              />
            </div>
          )}
        </div>

        {/* Example Goals Modal */}
        <ExampleGoalsModal
          isOpen={exampleGoalsModalOpen}
          onClose={() => setExampleGoalsModalOpen(false)}
          onAddGoal={(goal) => {
            saveGoal(goal);
            setExampleGoalsModalOpen(false);
          }}
        />
      </div>
    </div>
  );
}
