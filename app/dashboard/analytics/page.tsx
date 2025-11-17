'use client';

import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import {
  BarChart3,
  TrendingUp,
  FileText,
  Clock,
  Zap,
  Calendar,
  Download,
  Eye,
  Users
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';

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
    severity: string;
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

const EMPTY_COVERAGE_SUMMARY: CoverageSummary = {
  totalAnalyses: 0,
  spendLast30: 0,
  avgTopics: 0,
  goalsTracked: 0,
  latestOpportunities: []
};

const COVERAGE_FEATURE_ENABLED = true;

const GOAL_TYPE_OPTIONS = [
  { value: 'include', label: 'Recurring Topic', helper: 'Ensure this theme shows up regularly.' },
  { value: 'cta', label: 'CTA Reminder', helper: 'Track mentions of offers or CTAs.' },
  { value: 'avoid', label: 'Avoid / Limit', helper: 'Flag when this theme appears.' },
  { value: 'mention', label: 'Awareness', helper: 'Lightweight monitoring of new ideas.' }
] as const;

const GOAL_STATUS_CLASSES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-yellow-50 text-yellow-700',
  archived: 'bg-gray-100 text-gray-600'
};

interface TopicHeatEntry {
  id: string;
  label: string;
  mentions: number;
  avgShare: number;
  goalAligned: boolean;
  lastMention: string | null;
  status: 'Under' | 'Balanced' | 'Over';
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
  goals: NarrativeGoalRecord[]
): CoverageSummary {
  if (!snapshots.length) {
    return {
      ...EMPTY_COVERAGE_SUMMARY,
      goalsTracked: goals.length
    };
  }

  const last30Cutoff = new Date();
  last30Cutoff.setDate(last30Cutoff.getDate() - 30);

  const spendLast30 = snapshots.reduce((sum, snapshot) => {
    const created = new Date(snapshot.created_at);
    if (created >= last30Cutoff) {
      return sum + Number(snapshot.ai_cost_usd || snapshot.ai_usage?.costUsd || 0);
    }
    return sum;
  }, 0);

  const totalTopics = snapshots.reduce(
    (sum, snapshot) => sum + ((snapshot.topics || []).length || 0),
    0
  );

  const latestOpportunities = snapshots
    .flatMap(snapshot => (snapshot.opportunities || []).map((op: any, index: number) => ({
      id: `${snapshot.id}-${index}`,
      label: op.label || 'Opportunity',
      type: op.type || 'balanced',
      severity: op.severity || 'medium',
      summary: op.summary || '',
      recommendedAction: op.recommendedAction || '',
      projectTitle: snapshot.project_title,
      created_at: snapshot.created_at
    })))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return {
    totalAnalyses: snapshots.length,
    spendLast30: Number(spendLast30.toFixed(4)),
    avgTopics: Number(((totalTopics / snapshots.length) || 0).toFixed(1)),
    goalsTracked: goals.length,
    latestOpportunities
  };
}

function buildTopicHeat(
  snapshots: CoverageSnapshotRecord[],
  goals: NarrativeGoalRecord[]
): TopicHeatEntry[] {
  if (!snapshots.length) return [];

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

  snapshots.forEach(snapshot => {
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

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [goalForm, setGoalForm] = useState({
    label: '',
    type: 'include',
    target: 1,
    cadence: 30
  });
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [coverageRunner, setCoverageRunner] = useState<string | null>(null);
  const [coverageRunError, setCoverageRunError] = useState('');
  const { user } = useAuth();
  const coverageFeatureEnabled = COVERAGE_FEATURE_ENABLED;

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Calculate date range
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
        default:
          startDate = null;
      }

      // Fetch projects
      let projectsQuery = supabase
        .from('projects')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        projectsQuery = projectsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: projects, error: projectsError } = await projectsQuery;

      if (projectsError) {
        console.error('Error fetching projects:', projectsError);
        return;
      }

      // Fetch outputs
      let outputsQuery = supabase
        .from('outputs')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (startDate) {
        outputsQuery = outputsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: outputs, error: outputsError } = await outputsQuery;

      if (outputsError) {
        console.error('Error fetching outputs:', outputsError);
        return;
      }

      // Fetch coverage snapshots
      const { data: coverageSnapshots, error: coverageError } = await supabase
        .from('narrative_coverage_snapshots')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (coverageError) {
        console.error('Error fetching coverage snapshots:', coverageError);
      }

      // Fetch narrative goals
      const { data: coverageGoals, error: goalsError } = await supabase
        .from('narrative_goals')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: true });

      if (goalsError) {
        console.error('Error fetching coverage goals:', goalsError);
      }

      // Fetch insights
      const { data: insights, error: insightsError } = await supabase
        .from('insights')
        .select('id, project_id, entity_id, label, category, confidence, cost_usd, created_at')
        .in('project_id', (projects || []).map(p => p.id))
        .order('created_at', { ascending: false });

      if (insightsError) {
        console.error('Error fetching insights:', insightsError);
      }

      // Process analytics data
      const totalProjects = projects?.length || 0;
      const totalOutputs = outputs?.length || 0;
      const totalProcessingTime = projects?.reduce((sum, p) => sum + (p.processing_time_seconds || 0), 0) || 0;
      const estimatedCosts = outputs?.length * 0.05 || 0; // Rough estimate

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

      // Monthly stats (simplified for demo)
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

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatRelativeDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 1) {
      return `${diffDays}d ago`;
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours >= 1) {
      return `${diffHours}h ago`;
    }
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMinutes}m ago`;
  };

  const topicHeat = useMemo(() => {
    if (!analytics?.coverage) return [];
    return buildTopicHeat(analytics.coverage.snapshots, analytics.coverage.goals).slice(0, 6);
  }, [analytics]);

  const projectsNeedingCoverage = useMemo(() => {
    if (!analytics || !coverageFeatureEnabled) return [];
    const coveredProjectIds = new Set(
      analytics.coverage.snapshots.map(snapshot => snapshot.project_id)
    );

    return (analytics.projectsSummary || [])
      .filter(project =>
        project.status === 'completed' &&
        project.transcription_text &&
        !coveredProjectIds.has(project.id)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [analytics, coverageFeatureEnabled]);

  const handleCreateGoal = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const trimmedLabel = goalForm.label.trim();
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
        goal_type: goalForm.type,
        target_mentions: Math.max(1, Number(goalForm.target) || 1),
        cadence_days: goalForm.cadence ? Math.max(1, Number(goalForm.cadence)) : null,
        status: 'active'
      });

      if (error) {
        throw new Error(error.message);
      }

      setGoalForm({
        label: '',
        type: goalForm.type,
        target: goalForm.target,
        cadence: goalForm.cadence
      });

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
        .update({ status: nextStatus })
        .eq('id', goalId);

      if (error) {
        throw new Error(error.message);
      }

      await fetchAnalytics();
    } catch (err) {
      console.error('Failed to update goal status:', err);
    }
  };

  const coverageGoals = analytics?.coverage?.goals || [];

  const handleRunCoverage = async (projectId: string) => {
    if (!coverageFeatureEnabled) {
      setCoverageRunError('Narrative coverage radar is currently under construction.');
      return;
    }

    if (!projectId || !user) return;
    setCoverageRunner(projectId);
    setCoverageRunError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/run-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      const result = await response.json();

      if (!response.ok) {
        setCoverageRunError(result.error || result.message || 'Failed to run coverage radar.');
      } else {
        await fetchAnalytics();
      }
    } catch (error: any) {
      setCoverageRunError(error.message || 'Unable to run coverage at this time.');
    } finally {
      setCoverageRunner(null);
    }
  };

  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-gray-200 rounded-lg"></div>
              <div className="h-64 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-8 text-center">
          <p className="text-gray-600">No analytics data available yet. Upload your first project to see insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                Analytics
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Track your podcast processing and content generation metrics
              </p>
            </div>
            
            {/* Time Range Selector */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {(['7d', '30d', '90d', 'all'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {range === 'all' ? 'All Time' : range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileText className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Projects
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {analytics?.totalProjects || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Zap className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Content Pieces
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {analytics?.totalOutputs || 0}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Processing Time
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {formatDuration(analytics?.totalProcessingTime || 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Content Breakdown */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Content Type Breakdown
              </h3>
              <div className="space-y-3">
                {Object.entries(analytics?.contentBreakdown || {}).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {type.replace('_', ' ')}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="bg-blue-200 rounded-full h-2 w-20">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ 
                            width: `${Math.min(100, (count / (analytics?.totalOutputs || 1)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Platform Distribution */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Platform Distribution
              </h3>
              <div className="space-y-3">
                {Object.entries(analytics?.platformStats || {}).map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {platform}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="bg-green-200 rounded-full h-2 w-20">
                        <div 
                          className="bg-green-600 h-2 rounded-full"
                          style={{ 
                            width: `${Math.min(100, (count / (analytics?.totalOutputs || 1)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {analytics?.recentActivity.map((activity, activityIdx) => (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== analytics.recentActivity.length - 1 ? (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                            activity.status === 'completed' ? 'bg-green-500' :
                            activity.status === 'processing' ? 'bg-yellow-500' :
                            'bg-gray-500'
                          }`}>
                            <FileText className="h-4 w-4 text-white" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              {activity.action}{' '}
                              <span className="font-medium text-gray-900">
                                {activity.title}
                              </span>
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Educational Insights */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Educational Insights</h2>
              <p className="text-sm text-gray-500">
                AI-powered insights about people and concepts in your podcasts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-xs uppercase text-gray-500">Total Insights</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {analytics?.insights?.summary?.totalInsights || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Entities extracted across all projects</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-xs uppercase text-gray-500">People</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {analytics?.insights?.summary?.insightsByCategory?.person || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Individuals mentioned in podcasts</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-xs uppercase text-gray-500">Concepts</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {analytics?.insights?.summary?.insightsByCategory?.concept || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Technical terms and ideas explained</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-xs uppercase text-gray-500">Avg Confidence</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {Math.round((analytics?.insights?.summary?.avgConfidence || 0) * 100)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">AI extraction accuracy score</p>
            </div>
          </div>

          {analytics?.insights?.records && analytics.insights.records.length > 0 && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Insights</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Label</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Category</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Confidence</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">AI Cost</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {analytics.insights.records.slice(0, 10).map(insight => (
                        <tr key={insight.id}>
                          <td className="px-4 py-3">
                            <div className="text-gray-900 font-medium">{insight.label}</div>
                            <div className="text-xs text-gray-500">{insight.entity_id}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              insight.category === 'person'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-purple-50 text-purple-700'
                            }`}>
                              {insight.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {Math.round(insight.confidence * 100)}%
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">
                            {formatCurrency(Number(insight.cost_usd || 0))}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(insight.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Narrative Coverage Radar */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Narrative Coverage Radar</h2>
              <p className="text-sm text-gray-500">
                AI-driven visibility into topic mix, CTA cadence, and editorial gaps
              </p>
            </div>
          </div>

          <div className="relative">
            {!coverageFeatureEnabled && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="bg-white/95 border border-gray-200 rounded-xl shadow p-6 text-center max-w-md">
                  <p className="text-sm font-semibold text-gray-900">Narrative Coverage Radar</p>
                  <p className="text-xs text-gray-600 mt-2">
                    Work in progress — this feature is temporarily disabled while we finish the manual
                    run workflow. Thanks for your patience!
                  </p>
                </div>
              </div>
            )}

            <div className={coverageFeatureEnabled ? '' : 'blur-sm pointer-events-none select-none'}>
              {coverageFeatureEnabled && projectsNeedingCoverage.length > 0 && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900">
                        {projectsNeedingCoverage.length} episode{projectsNeedingCoverage.length === 1 ? '' : 's'} awaiting coverage
                      </h3>
                      <p className="text-xs text-amber-800">
                        Run the radar only when needed to control AI spend.
                      </p>
                    </div>
                    {coverageRunError && (
                      <p className="text-xs text-red-700">{coverageRunError}</p>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {projectsNeedingCoverage.map(project => (
                      <div
                        key={project.id}
                        className="bg-white rounded-md px-3 py-2 flex items-center justify-between shadow-sm"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{project.title || 'Untitled Project'}</p>
                          <p className="text-xs text-gray-500">
                            Uploaded {new Date(project.created_at).toLocaleDateString()} • Tier {project.performance_level || 'basic'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRunCoverage(project.id)}
                          disabled={coverageRunner === project.id}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-60"
                        >
                          {coverageRunner === project.id ? 'Running…' : 'Run coverage'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white shadow rounded-lg p-4">
                  <p className="text-xs uppercase text-gray-500">Analyses Run</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{analytics.coverage.summary.totalAnalyses}</p>
                  <p className="text-xs text-gray-500 mt-1">Snapshots saved across recent episodes</p>
                </div>
                <div className="bg-white shadow rounded-lg p-4">
                  <p className="text-xs uppercase text-gray-500">Avg Topics/Episode</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{analytics.coverage.summary.avgTopics}</p>
                  <p className="text-xs text-gray-500 mt-1">Unique editorial themes surfaced</p>
                </div>
                <div className="bg-white shadow rounded-lg p-4">
                  <p className="text-xs uppercase text-gray-500">Goals Tracked</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">{analytics.coverage.summary.goalsTracked}</p>
                  <p className="text-xs text-gray-500 mt-1">Active narrative guardrails</p>
                </div>
                <div className="bg-white shadow rounded-lg p-4">
                  <p className="text-xs uppercase text-gray-500">Opportunities Logged</p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {analytics.coverage.summary.latestOpportunities.length}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Most recent AI recommendations</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Top Topics</h3>
                      <span className="text-xs text-gray-500">
                        {(analytics.coverage.snapshots[0]?.coverage_window || 'full episode').replace('_', ' ')}
                      </span>
                    </div>
                    {topicHeat.length === 0 ? (
                      <p className="text-sm text-gray-500">Run a project to see coverage insights.</p>
                    ) : (
                      <div className="space-y-4">
                        {topicHeat.map(topic => (
                          <div key={topic.id} className="border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{topic.label}</p>
                                <p className="text-xs text-gray-500">
                                  {topic.mentions} mentions • {Math.round(topic.avgShare * 100)}% share of voice
                                </p>
                              </div>
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                topic.status === 'Over'
                                  ? 'bg-purple-50 text-purple-700'
                                  : topic.status === 'Under'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {topic.status}
                              </span>
                            </div>
                            <div className="mt-3">
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{ width: `${Math.min(100, topic.avgShare * 100)}%` }}
                                />
                              </div>
                              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                <span>{topic.goalAligned ? '🎯 Matches goal' : 'Exploratory'}</span>
                                <span>{topic.lastMention ? formatRelativeDate(topic.lastMention) : '—'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Opportunities & Gaps</h3>
                      <span className="text-xs text-gray-500">Last {analytics.coverage.summary.latestOpportunities.length} recommendations</span>
                    </div>
                    {analytics.coverage.summary.latestOpportunities.length === 0 ? (
                      <p className="text-sm text-gray-500">No gaps detected yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {analytics.coverage.summary.latestOpportunities.map(opportunity => (
                          <div key={opportunity.id} className="border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{opportunity.label}</p>
                                <p className="text-xs text-gray-500">
                                  {opportunity.projectTitle || 'Recent episode'} • {formatRelativeDate(opportunity.created_at)}
                                </p>
                              </div>
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                                opportunity.severity === 'high'
                                  ? 'bg-red-50 text-red-700'
                                  : opportunity.severity === 'medium'
                                  ? 'bg-yellow-50 text-yellow-700'
                                  : 'bg-slate-50 text-slate-700'
                              }`}>
                                {opportunity.type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{opportunity.summary}</p>
                            <p className="text-xs text-blue-600 mt-2">
                              Next: {opportunity.recommendedAction || 'Review AI suggestion'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Coverage Timeline</h3>
                  {analytics.coverage.snapshots.length === 0 ? (
                    <p className="text-sm text-gray-500">No coverage snapshots recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Episode</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Topics</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">CTA Mentions</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">AI Spend</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">Captured</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {analytics.coverage.snapshots.slice(0, 6).map(snapshot => (
                            <tr key={snapshot.id}>
                              <td className="px-4 py-3">
                                <div className="text-gray-900 font-medium">
                                  {snapshot.project_title || 'Untitled Project'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {snapshot.coverage_window || 'full episode'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {(snapshot.topics || []).length}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {(snapshot.ctas || []).length}
                              </td>
                              <td className="px-4 py-3 text-gray-900 font-medium">
                                {formatCurrency(Number(snapshot.ai_cost_usd || 0))}
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {new Date(snapshot.created_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Narrative Goals Manager */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:space-x-8">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">Narrative Goals</h3>
                          <p className="text-sm text-gray-500">
                            Set guardrails so the coverage radar knows what to watch for.
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">
                          Tracking {coverageGoals.length} goal{coverageGoals.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {coverageGoals.length === 0 ? (
                        <p className="text-sm text-gray-500">No goals yet. Add one using the form.</p>
                      ) : (
                        <div className="space-y-3">
                          {coverageGoals.map(goal => (
                            <div
                              key={goal.id}
                              className="border border-gray-100 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{goal.topic_label}</p>
                                <p className="text-xs text-gray-500">
                                  {goal.goal_type.toUpperCase()} • Target {goal.target_mentions || 1}{' '}
                                  {goal.goal_type === 'cta' ? 'mentions per cadence' : 'mentions'}
                                  {goal.cadence_days ? ` • ${goal.cadence_days}d cadence` : ''}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2 mt-3 sm:mt-0">
                                <span
                                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                                    GOAL_STATUS_CLASSES[goal.status] || 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {goal.status}
                                </span>
                                <button
                                  type="button"
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                  onClick={() => handleToggleGoalStatus(goal.id, goal.status)}
                                >
                                  {goal.status === 'active' ? 'Pause' : 'Activate'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 lg:mt-0 lg:w-80">
                      <form onSubmit={handleCreateGoal} className="bg-gray-50 rounded-lg p-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Topic / CTA label
                          </label>
                          <input
                            type="text"
                            value={goalForm.label}
                            onChange={(e) => setGoalForm(current => ({ ...current, label: e.target.value.slice(0, 80) }))}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            placeholder="Ex: Mention accelerator CTA"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Goal type
                          </label>
                          <select
                            value={goalForm.type}
                            onChange={(e) => setGoalForm(current => ({ ...current, type: e.target.value }))}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          >
                            {GOAL_TYPE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-gray-500">
                            {GOAL_TYPE_OPTIONS.find(option => option.value === goalForm.type)?.helper}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Target mentions
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={goalForm.target}
                              onChange={(e) => setGoalForm(current => ({ ...current, target: Number(e.target.value) }))}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Cadence (days)
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={goalForm.cadence}
                              onChange={(e) => setGoalForm(current => ({ ...current, cadence: Number(e.target.value) }))}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            />
                          </div>
                        </div>

                        {goalError && (
                          <div className="text-xs text-red-600">{goalError}</div>
                        )}

                        <button
                          type="submit"
                          disabled={goalSaving}
                          className="w-full inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60"
                        >
                          {goalSaving ? 'Saving…' : 'Add goal'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
