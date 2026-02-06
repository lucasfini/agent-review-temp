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
  BookOpen
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';

// New analytics components
import { KPIGrid, generateSparklineData } from '@/components/analytics/KPIGrid';
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
        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          selectedProject
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
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
          <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                !selectedProjectId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              All Projects
            </button>
            <div className="border-t border-gray-100" />
            {projects.map(project => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  onSelect(project.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                  selectedProjectId === project.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span className="block truncate">{project.title || 'Untitled'}</span>
                <span className="text-xs text-gray-500">
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/30" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Example Goals Library</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)] space-y-4">
            {EXAMPLE_NARRATIVE_GOALS.map((category, idx) => (
              <div key={idx} className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">{category.category}</h3>
                <p className="text-xs text-gray-600 mb-3">{category.description}</p>
                <div className="space-y-2">
                  {category.examples.map((example, exIdx) => (
                    <div
                      key={exIdx}
                      className="bg-white rounded-lg border border-gray-200 p-3 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{example.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{example.description}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
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
                          className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
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
      let startDate: Date | null = null;

      switch (timeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
      }

      // Fetch projects
      let projectsQuery = supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        projectsQuery = projectsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: projects, error: projectsError } = await projectsQuery as { data: any[] | null; error: any };

      if (projectsError) {
        console.error('Error fetching projects:', projectsError);
        return;
      }

      // Fetch outputs
      let outputsQuery = supabase
        .from('outputs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        outputsQuery = outputsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: outputs, error: outputsError } = await outputsQuery as { data: any[] | null; error: any };

      if (outputsError) {
        console.error('Error fetching outputs:', outputsError);
        return;
      }

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
        const projectIds = projects.map(p => p.id);
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

      // Process analytics data
      const totalProjects = projects?.length || 0;
      const totalOutputs = outputs?.length || 0;
      const totalProcessingTime = projects?.reduce((sum, p) => sum + (p.processing_time_seconds || 0), 0) || 0;
      const estimatedCosts = (outputs?.length || 0) * 0.05;

      // Content breakdown
      const contentBreakdown: Record<string, number> = {};
      outputs?.forEach(output => {
        const type = output.type || 'unknown';
        contentBreakdown[type] = (contentBreakdown[type] || 0) + 1;
      });

      // Platform stats
      const platformStats: Record<string, number> = {};
      outputs?.forEach(output => {
        const platform = output.platform || 'general';
        platformStats[platform] = (platformStats[platform] || 0) + 1;
      });

      // Recent activity
      const recentActivity = projects?.slice(0, 10).map(project => ({
        id: project.id,
        title: project.title,
        action: project.status === 'completed' ? 'Completed transcription' :
                project.status === 'processing' ? 'Processing audio' : 'Uploaded',
        timestamp: project.created_at,
        status: project.status
      })) || [];

      const monthlyStats = [
        { month: 'Jan', projects: Math.floor(totalProjects * 0.1), outputs: Math.floor(totalOutputs * 0.1) },
        { month: 'Feb', projects: Math.floor(totalProjects * 0.15), outputs: Math.floor(totalOutputs * 0.15) },
        { month: 'Mar', projects: Math.floor(totalProjects * 0.2), outputs: Math.floor(totalOutputs * 0.2) },
        { month: 'Apr', projects: Math.floor(totalProjects * 0.25), outputs: Math.floor(totalOutputs * 0.25) },
        { month: 'May', projects: Math.floor(totalProjects * 0.3), outputs: Math.floor(totalOutputs * 0.3) },
        { month: 'Jun', projects: totalProjects, outputs: totalOutputs },
      ];

      const coverageSnapshotData = coverageSnapshots || [];
      const coverageGoalData = coverageGoals || [];
      const coverageSummary = summarizeCoverage(coverageSnapshotData, coverageGoalData);

      const projectSummaries: ProjectSummary[] = (projects || []).map(project => ({
        id: project.id,
        title: project.title,
        status: project.status,
        created_at: project.created_at,
        performance_level: project.performance_level,
        transcription_text: project.transcription_text
      }));

      const insightRecords = insights || [];
      const insightsSummary = summarizeInsights(insightRecords);

      setAnalytics({
        totalProjects,
        totalOutputs,
        totalProcessingTime,
        estimatedCosts,
        recentActivity,
        contentBreakdown,
        monthlyStats,
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
        }
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
    try {
      // Optimistic update or loading state could be added here
      const response = await fetch(`/api/projects/${projectId}/run-coverage`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to run coverage analysis');
      }
      
      // Refresh analytics data to show new snapshot
      await fetchAnalytics();
    } catch (error) {
      console.error('Error running coverage:', error);
      alert('Failed to run analysis. Please try again.');
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
            <div className="h-8 bg-gray-200 rounded w-1/4" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-28 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="h-64 bg-gray-200 rounded-xl" />
              <div className="h-64 bg-gray-200 rounded-xl" />
            </div>
            <div className="h-80 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-gray-600">No analytics data available yet. Upload your first project to see insights.</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ================================================================== */}
        {/* HEADER: Title + Date Range */}
        {/* ================================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">Insights and trends from your content</p>
          </div>

          <div className="flex items-center gap-4">
            <ProjectSwitcher
              projects={analytics.projectsSummary}
              selectedProjectId={projectIdFromUrl}
              onSelect={handleProjectSelect}
            />
            <div className="flex items-center gap-1 bg-white rounded-lg p-1 shadow-sm border border-gray-100">
              {(['7d', '30d', '90d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900'
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
          projectsTrend={{ value: 12, direction: 'up', label: 'vs last period' }}
          projectsSparkline={generateSparklineData(analytics.totalProjects)}
          totalOutputs={analytics.totalOutputs}
          outputsTrend={{ value: 8, direction: 'up', label: 'vs last period' }}
          outputsSparkline={generateSparklineData(analytics.totalOutputs)}
          processingTime={formatDuration(analytics.totalProcessingTime)}
          processingTrend={{ value: 5, direction: 'down', label: 'faster' }}
          processingSparkline={generateSparklineData(analytics.totalProcessingTime / 60)}
          aiSpend={formatCurrency(analytics.estimatedCosts)}
          spendTrend={{ value: 3, direction: 'up', label: 'vs last period' }}
          spendSparkline={generateSparklineData(analytics.estimatedCosts * 100)}
        />

        {/* ================================================================== */}
        {/* ROW 2: Content Mix + Top Topics */}
        {/* ================================================================== */}
        <ContentMixSection
          contentBreakdown={analytics.contentBreakdown}
          topTopics={allTopics.map(t => ({ label: t.label, mentions: t.mentions }))}
        />

        {/* ================================================================== */}
        {/* ROW 3: Tab Section (Insights & Goals) */}
        {/* ================================================================== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {/* Tab Header */}
          <div className="border-b border-gray-100 p-1">
            <nav className="flex gap-1">
              <button
                onClick={() => setActiveTab('insights')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'insights'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
                Insights & Gaps
              </button>
              <button
                onClick={() => setActiveTab('goals')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'goals'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Target className="h-4 w-4" />
                Goals
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'insights' && (
              <>
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
              </>
            )}

            {activeTab === 'goals' && (
              <GoalsSection
                goals={coverageGoals}
                goalProgress={[]}
                onSaveGoal={saveGoal}
                onToggleStatus={handleToggleGoalStatus}
                onArchive={handleArchiveGoal}
                onOpenExamples={() => setExampleGoalsModalOpen(true)}
                suggestedGoals={suggestedGoals}
                isSaving={goalSaving}
                error={goalError}
              />
            )}
          </div>
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
