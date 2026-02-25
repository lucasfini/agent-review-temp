'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronDown,
  X,
  Target,
  Calendar,
  Lightbulb,
  BookOpen,
  Upload,
  BarChart3,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import { useCoverageProgress } from '@/lib/context/coverage-progress';

// New analytics components
import { KPIGrid } from '@/components/analytics/KPIGrid';
import { ContentMixSection } from '@/components/analytics/ContentCharts';
import { GoalsSection } from '@/components/analytics/GoalsSection';
import { InsightsGrid } from '@/components/analytics/InsightsGrid';
import { InsightsHeader } from '@/components/analytics/InsightsHeader';

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
  rawOutputs: Array<{ id: string; project_id: string; ai_cost_usd: number; created_at: string }>;
  // Real computed data
  trends: {
    projects: TrendData;
    outputs: TrendData;
    processing: TrendData;
    spend: TrendData;
  };
  sparklines: {
    projects: SparklinePoint[];
    outputs: SparklinePoint[];
    processing: SparklinePoint[];
    spend: SparklinePoint[];
  };
  goalProgress: GoalProgressEntry[];
}

interface TopicHeatEntry {
  id: string;
  label: string;
  mentions: number;
  avgShare: number;
  goalAligned: boolean;
  lastMention: string | null;
  status: 'Under' | 'Balanced' | 'Over';
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

/**
 * Bucket records by created_at into 6 time periods and count per bucket.
 */
function computeSparklineFromDates(
  records: Array<{ created_at: string }>,
  timeRange: '7d' | '30d' | '90d'
): SparklinePoint[] {
  const buckets = 6;
  const now = Date.now();
  const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
  const bucketSize = rangeMs / buckets;

  const counts = new Array(buckets).fill(0);
  for (const record of records) {
    const age = now - new Date(record.created_at).getTime();
    if (age > rangeMs || age < 0) continue;
    const idx = Math.min(buckets - 1, Math.floor((rangeMs - age) / bucketSize));
    counts[idx]++;
  }
  return counts.map(value => ({ value }));
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

function buildTopicHeat(
  snapshots: CoverageSnapshotRecord[],
  goals: NarrativeGoalRecord[],
  projectIds?: string[]
): TopicHeatEntry[] {
  let filteredSnapshots = snapshots;
  if (projectIds && projectIds.length > 0) {
    filteredSnapshots = snapshots.filter(s => projectIds.includes(s.project_id));
  }

  if (!filteredSnapshots.length) return [];

  const goalMatchers = new Set(
    goals.map(goal => (goal.topic_id || goal.topic_label || '').toLowerCase())
  );

  const topicMap = new Map<string, {
    id: string;
    label: string;
    mentions: number;
    shareTotal: number;
    samples: number;
    goalAligned: boolean;
    lastMention: string | null;
  }>();

  filteredSnapshots.forEach(snapshot => {
    const topics = Array.isArray(snapshot.topics) ? snapshot.topics : [];
    topics.forEach((topic: any) => {
      const key = String(topic.id || topic.label || 'topic');
      const label = String(topic.label || topic.id || 'Topic');
      const entry = topicMap.get(key) || {
        id: key,
        label,
        mentions: 0,
        shareTotal: 0,
        samples: 0,
        goalAligned: false,
        lastMention: null
      };

      entry.mentions += Number(topic.mentionCount || 0);
      entry.shareTotal += Number(topic.shareOfVoice || 0);
      entry.samples += 1;
      entry.goalAligned =
        entry.goalAligned ||
        goalMatchers.has(key.toLowerCase()) ||
        goalMatchers.has(label.toLowerCase());
      if (!entry.lastMention || new Date(snapshot.created_at) > new Date(entry.lastMention)) {
        entry.lastMention = snapshot.created_at;
      }

      topicMap.set(key, entry);
    });
  });

  return Array.from(topicMap.values())
    .map(entry => {
      const avgShare = entry.samples ? (entry.shareTotal / entry.samples) : 0;
      let status: TopicHeatEntry['status'] = 'Balanced';
      if (avgShare > 0.4) status = 'Over';
      else if (avgShare < 0.12) status = 'Under';

      return {
        id: entry.id,
        label: entry.label,
        mentions: entry.mentions,
        avgShare: Number(avgShare.toFixed(2)),
        goalAligned: entry.goalAligned,
        lastMention: entry.lastMention,
        status
      };
    })
    .sort((a, b) => b.mentions - a.mentions);
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
  onSelect: (projectId: string | null) => void;
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
        aria-label={`Filter projects: ${selectedProject ? selectedProject.title : 'All Projects'}`}
        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          selectedProject
            ? 'bg-blue-900/20 text-blue-400'
            : 'text-slate-400 hover:text-slate-50 hover:bg-slate-800/50'
        }`}
      >
        <span className="max-w-[200px] truncate">
          {selectedProject ? selectedProject.title : 'All Projects'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            role="listbox"
            aria-label="Select project"
            className="absolute left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto"
          >
            <button
              type="button"
              role="option"
              aria-selected={!selectedProjectId}
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800/50 ${
                !selectedProjectId ? 'bg-blue-900/20 text-blue-400 font-medium' : 'text-slate-300'
              }`}
            >
              All Projects
            </button>
            <div className="border-t border-slate-800" />
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
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800/50 ${
                  selectedProjectId === project.id ? 'bg-blue-900/20 text-blue-400 font-medium' : 'text-slate-300'
                }`}
              >
                <span className="block truncate">{project.title || 'Untitled'}</span>
                <span className="text-xs text-slate-400">
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
        <div className="relative bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <h2 id="example-goals-title" className="text-lg font-semibold text-slate-50">Example Goals Library</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-800"
              aria-label="Close example goals"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)] space-y-4">
            {EXAMPLE_NARRATIVE_GOALS.map((category, idx) => (
              <div key={idx} className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-50 mb-1">{category.category}</h3>
                <p className="text-xs text-slate-400 mb-3">{category.description}</p>
                <div className="space-y-2">
                  {category.examples.map((example, exIdx) => (
                    <div
                      key={exIdx}
                      className="bg-slate-900 rounded-lg border border-slate-700 p-3 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-50">{example.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{example.description}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                            <span className="uppercase font-semibold text-indigo-600">{example.type}</span>
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
                          className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-300"
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
  const { user } = useAuth();

  // URL-based project filter
  const projectIdFromUrl = searchParams.get('projectId');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Tab state
  const [activeTab, setActiveTab] = useState<'insights' | 'goals'>('insights');

  // Goal form state
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [archivingGoal, setArchivingGoal] = useState<string | null>(null);
  const [exampleGoalsModalOpen, setExampleGoalsModalOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { runningCoverageIds, startCoverage, stopCoverage } = useCoverageProgress();

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      if (!user?.id) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
      const prevStartDate = new Date(startDate.getTime() - rangeDays * 24 * 60 * 60 * 1000);

      // Fetch current period projects
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

      if (projectsError) {
        console.error('Error fetching projects:', projectsError);
        return;
      }

      // Fetch current period outputs
      const { data: outputs, error: outputsError } = await supabase
        .from('outputs')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

      if (outputsError) {
        console.error('Error fetching outputs:', outputsError);
        return;
      }

      // Fetch previous period projects (lightweight — just for trend comparison)
      const { data: prevProjects } = await supabase
        .from('projects')
        .select('id, created_at, processing_time_seconds')
        .eq('user_id', user.id)
        .gte('created_at', prevStartDate.toISOString())
        .lt('created_at', startDate.toISOString()) as { data: any[] | null; error: any };

      // Fetch previous period outputs (lightweight)
      const { data: prevOutputs } = await supabase
        .from('outputs')
        .select('id, ai_cost_usd, created_at')
        .eq('user_id', user.id)
        .gte('created_at', prevStartDate.toISOString())
        .lt('created_at', startDate.toISOString()) as { data: any[] | null; error: any };

      // Fetch coverage snapshots
      const { data: coverageSnapshots, error: coverageError } = await supabase
        .from('narrative_coverage_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30) as { data: any[] | null; error: any };

      if (coverageError) {
        console.error('Error fetching coverage snapshots:', coverageError);
      }

      // Fetch narrative goals (exclude archived)
      const { data: coverageGoals, error: goalsError } = await supabase
        .from('narrative_goals')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: true }) as { data: any[] | null; error: any };

      if (goalsError) {
        console.error('Error fetching coverage goals:', goalsError);
      }

      // Fetch insights
      let insights: any[] | null = null;
      if (projects && projects.length > 0) {
        const projectIds = projects.map((p: any) => p.id);
        const { data: insightsData, error: insightsError } = await supabase
          .from('insights')
          .select('id, project_id, entity_id, label, category, confidence, cost_usd, created_at')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }) as { data: any[] | null; error: any };

        if (insightsError) {
          console.error('Error fetching insights:', insightsError);
        } else {
          insights = insightsData;
        }
      }

      // ---- Compute real values ----
      const safeProjects = projects || [];
      const safeOutputs = outputs || [];
      const safePrevProjects = prevProjects || [];
      const safePrevOutputs = prevOutputs || [];

      const totalProjects = safeProjects.length;
      const totalOutputs = safeOutputs.length;
      const totalProcessingTime = safeProjects.reduce((sum: number, p: any) => sum + (p.processing_time_seconds || 0), 0);

      // Real AI spend: sum output ai_cost_usd + coverage snapshot costs + insight costs
      const outputAiCost = safeOutputs.reduce((sum: number, o: any) => sum + Number(o.ai_cost_usd || 0), 0);
      const coverageSnapshotData = coverageSnapshots || [];
      const snapshotAiCost = coverageSnapshotData.reduce(
        (sum: number, s: any) => sum + Number(s.ai_cost_usd || s.ai_usage?.costUsd || 0), 0
      );
      const insightRecords = insights || [];
      const insightAiCost = insightRecords.reduce((sum: number, i: any) => sum + Number(i.cost_usd || 0), 0);
      const realAiSpend = outputAiCost + snapshotAiCost + insightAiCost;
      // Fallback to flat estimate only if all real costs are 0
      const totalAiSpend = realAiSpend > 0 ? realAiSpend : safeOutputs.length * 0.05;

      // Previous period totals for trends
      const prevTotalProjects = safePrevProjects.length;
      const prevTotalOutputs = safePrevOutputs.length;
      const prevProcessingTime = safePrevProjects.reduce((sum: number, p: any) => sum + (p.processing_time_seconds || 0), 0);
      const prevAiSpend = safePrevOutputs.reduce((sum: number, o: any) => sum + Number(o.ai_cost_usd || 0), 0);

      // Real trends
      const trends = {
        projects: computeTrend(totalProjects, prevTotalProjects),
        outputs: computeTrend(totalOutputs, prevTotalOutputs),
        processing: computeTrend(totalProcessingTime, prevProcessingTime),
        spend: computeTrend(totalAiSpend, prevAiSpend || (safePrevOutputs.length * 0.05))
      };

      // Real sparklines
      const sparklines = {
        projects: computeSparklineFromDates(safeProjects, timeRange),
        outputs: computeSparklineFromDates(safeOutputs, timeRange),
        processing: computeSparklineFromValues(
          safeProjects.map((p: any) => ({ created_at: p.created_at, value: p.processing_time_seconds || 0 })),
          timeRange
        ),
        spend: computeSparklineFromValues(
          safeOutputs.map((o: any) => ({ created_at: o.created_at, value: Number(o.ai_cost_usd || 0.05) })),
          timeRange
        )
      };

      // Content breakdown
      const contentBreakdown: Record<string, number> = {};
      safeOutputs.forEach((output: any) => {
        const type = output.type || 'unknown';
        contentBreakdown[type] = (contentBreakdown[type] || 0) + 1;
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

      const coverageGoalData = coverageGoals || [];
      const coverageSummary = summarizeCoverage(coverageSnapshotData, coverageGoalData);

      // Real goal progress
      const goalProgress = computeAllGoalProgress(coverageGoalData, coverageSnapshotData);

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
        goalProgress,
        rawOutputs: safeOutputs.map((o: any) => ({
          id: o.id,
          project_id: o.project_id,
          ai_cost_usd: Number(o.ai_cost_usd || 0),
          created_at: o.created_at
        }))
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const selectedProjectIds = useMemo(() => {
    if (!projectIdFromUrl) return undefined;
    return [projectIdFromUrl];
  }, [projectIdFromUrl]);

  const filteredCoverageSummary = useMemo(() => {
    if (!analytics?.coverage) return analytics?.coverage?.summary;
    return summarizeCoverage(analytics.coverage.snapshots, analytics.coverage.goals, selectedProjectIds);
  }, [analytics, selectedProjectIds]);

  const allTopics = useMemo(() => {
    if (!analytics?.coverage) return [];
    return buildTopicHeat(analytics.coverage.snapshots, analytics.coverage.goals, selectedProjectIds);
  }, [analytics, selectedProjectIds]);

  const coverageGoals = analytics?.coverage?.goals || [];

  const suggestedGoals = useMemo(() => {
    const suggestions: { label: string; type: string; target: number; cadence: number | null }[] = [];
    const seen = new Set<string>();
    const snapshots = (analytics?.coverage?.snapshots || []).slice(0, 5);
    const normalize = (val: any) => String(val || '').trim();

    snapshots.forEach(snapshot => {
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
  }, [analytics]);

  const coverageTimeline = useMemo(() => {
    const snapshots = analytics?.coverage?.snapshots || [];
    if (!selectedProjectIds) return snapshots.slice(0, 10);
    return snapshots.filter(s => selectedProjectIds.includes(s.project_id)).slice(0, 10);
  }, [analytics, selectedProjectIds]);

  const projectTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of (analytics?.projectsSummary || [])) {
      map[p.id] = p.title;
    }
    return map;
  }, [analytics?.projectsSummary]);

  const filteredAiSpend = useMemo(() => {
    if (!analytics) return 0;
    const filteredOutputs = projectIdFromUrl
      ? analytics.rawOutputs.filter(o => o.project_id === projectIdFromUrl)
      : analytics.rawOutputs;
    const filteredSnapshots = projectIdFromUrl
      ? analytics.coverage.snapshots.filter(s => s.project_id === projectIdFromUrl)
      : analytics.coverage.snapshots;
    const filteredInsights = projectIdFromUrl
      ? analytics.insights.records.filter(i => i.project_id === projectIdFromUrl)
      : analytics.insights.records;
    const outputCost = filteredOutputs.reduce((sum, o) => sum + o.ai_cost_usd, 0);
    const snapshotCost = filteredSnapshots.reduce((sum, s) => sum + Number(s.ai_cost_usd || s.ai_usage?.costUsd || 0), 0);
    const insightCost = filteredInsights.reduce((sum, i) => sum + Number(i.cost_usd || 0), 0);
    const realSpend = outputCost + snapshotCost + insightCost;
    return realSpend > 0 ? realSpend : filteredOutputs.length * 0.05;
  }, [analytics, projectIdFromUrl]);

  // Stale detection logic
  const isStale = useMemo(() => {
    if (!analytics?.coverage?.snapshots?.length) return false;
    
    // Get latest analysis timestamp (respecting filter if active)
    let snapshots = analytics.coverage.snapshots;
    if (selectedProjectIds && selectedProjectIds.length > 0) {
      snapshots = snapshots.filter(s => selectedProjectIds.includes(s.project_id));
    }
    
    if (!snapshots.length) return false;
    
    const lastAnalysisTime = Math.max(...snapshots.map(s => new Date(s.created_at).getTime()));
    
    // Get latest goal modification
    if (!analytics.coverage.goals.length) return false;
    const goalsLastModified = Math.max(...analytics.coverage.goals.map(g => new Date(g.updated_at).getTime()));
    
    return goalsLastModified > lastAnalysisTime;
  }, [analytics, selectedProjectIds]);

  const goalsLastModified = useMemo(() => {
    if (!analytics?.coverage?.goals?.length) return null;
    const timestamps = analytics.coverage.goals
      .map(g => g.updated_at ? new Date(g.updated_at).getTime() : 0)
      .filter(t => t > 0);
    
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [analytics?.coverage?.goals]);

  // Projects with transcription but no coverage snapshot
  const unanalyzedProjects = useMemo(() => {
    if (!analytics?.projectsSummary || !analytics?.coverage?.snapshots) return [];
    const analyzedProjectIds = new Set(analytics.coverage.snapshots.map(s => s.project_id));
    return analytics.projectsSummary.filter(
      p => p.transcription_text && p.transcription_text.length > 0 && !analyzedProjectIds.has(p.id)
    );
  }, [analytics]);

  const displayedOpportunities = useMemo(() => {
    if (selectedSnapshotId && analytics?.coverage?.snapshots) {
      const snapshot = analytics.coverage.snapshots.find(s => s.id === selectedSnapshotId);
      if (snapshot) {
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
      }
    }
    return filteredCoverageSummary?.latestOpportunities || [];
  }, [selectedSnapshotId, analytics?.coverage?.snapshots, filteredCoverageSummary]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleProjectSelect = useCallback((projectId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) {
      params.set('projectId', projectId);
    } else {
      params.delete('projectId');
    }
    router.push(`/dashboard/analytics?${params.toString()}`);
  }, [router, searchParams]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

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
      const { error } = await supabase.from('narrative_goals').insert({
        user_id: user.id,
        topic_label: trimmedLabel,
        goal_type: params.type,
        target_mentions: Math.max(0, Number(params.target) || 0),
        cadence_days: params.cadence ? Math.max(1, Number(params.cadence)) : null,
        status: 'active'
      } as any);

      if (error) throw new Error(error.message);
      await fetchAnalytics();
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
      const { error } = await supabase
        .from('narrative_goals')
        // @ts-expect-error - Supabase types issue
        .update({ status: nextStatus })
        .eq('id', goalId);

      if (error) throw new Error(error.message);
      await fetchAnalytics();
    } catch (err) {
      console.error('Failed to update goal status:', err);
    }
  };

  const handleArchiveGoal = async (goalId: string, goalLabel: string) => {
    if (!user?.id) return;
    if (!confirm(`Archive goal "${goalLabel}"?`)) return;

    setArchivingGoal(goalId);
    try {
      const { error } = await supabase
        .from('narrative_goals')
        // @ts-expect-error - Supabase types issue
        .update({ status: 'archived' })
        .eq('id', goalId)
        .eq('user_id', user.id);

      if (error) throw new Error(error.message);
      await fetchAnalytics();
    } catch (error: any) {
      alert(`Failed to archive goal: ${error.message}`);
    } finally {
      setArchivingGoal(null);
    }
  };

  const handleRunCoverage = async (projectId: string) => {
    const title = projectTitleMap[projectId] || projectId;
    startCoverage(projectId, title);
    try {
      const response = await fetch(`/api/projects/${projectId}/run-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, force: true })
      });

      if (!response.ok) {
        throw new Error('Failed to run coverage analysis');
      }

      // Refresh analytics data to show new snapshot
      await fetchAnalytics();
    } catch (error) {
      console.error('Error running coverage:', error);
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
            <div className="h-8 bg-slate-700 rounded w-1/4" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-28 bg-slate-700 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="h-64 bg-slate-700 rounded-xl" />
              <div className="h-64 bg-slate-700 rounded-xl" />
            </div>
            <div className="h-80 bg-slate-700 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!analytics || analytics.totalProjects === 0) {
    return (
      <div className="p-6 bg-slate-800/50 min-h-screen">
        <div className="max-w-lg mx-auto text-center pt-20">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-900/20 flex items-center justify-center mb-6">
            <BarChart3 className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-50 mb-3">No analytics yet</h1>
          <p className="text-slate-400 mb-2">
            Upload and transcribe your first podcast or audio file to unlock analytics.
          </p>
          <p className="text-sm text-slate-400 mb-8">
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

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-4 lg:p-6 bg-slate-800/50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ================================================================== */}
        {/* HEADER: Title + Date Range */}
        {/* ================================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Analytics</h1>
            <p className="text-sm text-slate-400 mt-0.5">Insights and trends from your content</p>
          </div>

          <div className="flex items-center gap-4">
            <ProjectSwitcher
              projects={analytics.projectsSummary}
              selectedProjectId={projectIdFromUrl}
              onSelect={handleProjectSelect}
            />
            <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1 shadow-sm border border-slate-800">
              {(['7d', '30d', '90d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-gray-900 text-white'
                      : 'text-slate-400 hover:text-slate-50'
                  }`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* ROW 1: KPI Cards with Sparklines */}
        {/* ================================================================== */}
        <KPIGrid
          totalProjects={analytics.totalProjects}
          projectsTrend={analytics.trends.projects}
          projectsSparkline={analytics.sparklines.projects}
          totalOutputs={analytics.totalOutputs}
          outputsTrend={analytics.trends.outputs}
          outputsSparkline={analytics.sparklines.outputs}
          processingTime={formatDuration(analytics.totalProcessingTime)}
          processingTrend={analytics.trends.processing}
          processingSparkline={analytics.sparklines.processing}
          aiSpend={formatCurrency(filteredAiSpend)}
          aiSpendLabel={projectIdFromUrl ? 'AI Spend (this project)' : 'Est. AI Spend'}
          spendTrend={analytics.trends.spend}
          spendSparkline={analytics.sparklines.spend}
        />

        {/* ================================================================== */}
        {/* ROW 2: Content Mix + Top Topics */}
        {/* ================================================================== */}
        <ContentMixSection
          contentBreakdown={analytics.contentBreakdown}
          topTopics={allTopics.map(t => ({ label: t.label, mentions: t.mentions }))}
        />

        {/* ================================================================== */}
        {/* Unanalyzed Projects Banner */}
        {/* ================================================================== */}
        {!bannerDismissed && unanalyzedProjects.length > 0 && (
          <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 flex items-start gap-3" role="alert">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-blue-200">
                {unanalyzedProjects.length} project{unanalyzedProjects.length !== 1 ? 's' : ''} ready for analysis
              </h4>
              <p className="text-sm text-blue-300 mt-1">
                These projects have transcriptions but haven&apos;t been analyzed yet. Run analytics to see topic coverage and insights.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {unanalyzedProjects.slice(0, 3).map(project => (
                  <button
                    key={project.id}
                    onClick={() => handleRunCoverage(project.id)}
                    disabled={runningCoverageIds.has(project.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 bg-slate-900 border border-blue-800/30 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label={`Run analytics on ${project.title}`}
                  >
                    {runningCoverageIds.has(project.id) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <BarChart3 className="h-3 w-3" />
                    )}
                    <span className="truncate max-w-[150px]">
                      {runningCoverageIds.has(project.id) ? 'Analyzing...' : (project.title || 'Untitled')}
                    </span>
                  </button>
                ))}
                {unanalyzedProjects.length > 3 && (
                  <span className="text-xs text-blue-600 self-center">
                    +{unanalyzedProjects.length - 3} more
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="flex-shrink-0 p-1 rounded hover:bg-blue-100 transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4 text-blue-600" />
            </button>
          </div>
        )}

        {/* ================================================================== */}
        {/* ROW 3: Tab Section (Insights & Goals) */}
        {/* ================================================================== */}
        <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800" role="region" aria-label="Insights and goals">
          {/* Tab Header */}
          <div className="border-b border-slate-800 p-1">
            <nav className="flex gap-1" role="tablist" aria-label="Analytics sections">
              <button
                id="tab-insights"
                role="tab"
                aria-selected={activeTab === 'insights'}
                aria-controls="tabpanel-insights"
                onClick={() => setActiveTab('insights')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'insights'
                    ? 'bg-gray-900 text-white'
                    : 'text-slate-400 hover:text-slate-50 hover:bg-slate-800/50'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
                Insights & Gaps
              </button>
              <button
                id="tab-goals"
                role="tab"
                aria-selected={activeTab === 'goals'}
                aria-controls="tabpanel-goals"
                onClick={() => setActiveTab('goals')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'goals'
                    ? 'bg-gray-900 text-white'
                    : 'text-slate-400 hover:text-slate-50 hover:bg-slate-800/50'
                }`}
              >
                <Target className="h-4 w-4" />
                Goals
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'insights' && (
            <div id="tabpanel-insights" role="tabpanel" aria-labelledby="tab-insights" className="p-6">
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
                projectIdFilter={projectIdFromUrl}
                formatRelativeDate={formatRelativeDate}
                goals={coverageGoals}
              />
            </div>
          )}

          {activeTab === 'goals' && (
            <div id="tabpanel-goals" role="tabpanel" aria-labelledby="tab-goals" className="p-6">
              <GoalsSection
                goals={coverageGoals}
                goalProgress={analytics.goalProgress}
                onSaveGoal={saveGoal}
                onToggleStatus={handleToggleGoalStatus}
                onArchive={handleArchiveGoal}
                onOpenExamples={() => setExampleGoalsModalOpen(true)}
                suggestedGoals={suggestedGoals}
                isSaving={goalSaving}
                error={goalError}
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
