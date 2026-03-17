import { supabaseAdmin } from '@/lib/supabase/server';

export type CoverageStatus = 'underrepresented' | 'balanced' | 'overindexed' | 'debt' | 'cta-gap' | 'new';

export interface TopicSignal {
  id: string;
  label: string;
  keywords: string[];
  mentionCount: number;
  sentimentScore?: number;
  shareOfVoice?: number;
  mentionTimestamps?: number[];
  assetsCovered?: string[];
  relatedCtas?: string[];
}

export interface CtaSignal {
  id: string;
  label: string;
  mentionCount: number;
  cadenceDays?: number;
  lastMentionOffsetMinutes?: number;
  sentimentScore?: number;
}

export interface CoverageOpportunity {
  type: CoverageStatus;
  label: string;
  topicId?: string;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  recommendedAction: string;
  supportingTopics?: string[];
}

export interface AiUsageDetail {
  provider: string;
  model: string;
  runType: 'narrative_coverage' | string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  metadata?: Record<string, any>;
}

export interface NarrativeCoverageSnapshotInput {
  projectId: string;
  userId: string;
  projectTitle?: string;
  coverageWindow?: string;
  topics: TopicSignal[];
  ctas: CtaSignal[];
  opportunities?: CoverageOpportunity[];
  analyticsOverride?: Record<string, any>;
  aiUsage: AiUsageDetail;
  notes?: string;
  activeGoals?: any[];
}

const DEFAULT_ANALYTICS = {
  totalTopics: 0,
  avgSentiment: 0,
  dominantTopic: null as null | { id: string; label: string; shareOfVoice: number },
  topicEvenness: 0,
  uniqueCtas: 0,
  coverageScore: 0
};

const COVERAGE_COST_KEY = 'coverageAnalysis';

function deriveCoverageScore(topics: TopicSignal[], ctas: CtaSignal[], activeGoals: any[] = []) {
  const trackableGoals = activeGoals.filter(
    (goal) => goal && goal.status !== 'archived' && goal.goal_type !== 'avoid'
  );

  if (trackableGoals.length > 0) {
    const topicIds = new Set(topics.map((topic) => topic.id.toLowerCase()));
    const topicLabels = new Set(topics.map((topic) => topic.label.toLowerCase()));
    const ctaIds = new Set(ctas.map((cta) => cta.id.toLowerCase()));
    const ctaLabels = new Set(ctas.map((cta) => cta.label.toLowerCase()));

    const covered = trackableGoals.filter((goal) => {
      const id = String(goal.topic_id || '').toLowerCase();
      const label = String(goal.topic_label || '').toLowerCase();
      return topicIds.has(id) || topicLabels.has(label) || ctaIds.has(id) || ctaLabels.has(label);
    }).length;

    return Math.round((covered / trackableGoals.length) * 100);
  }

  if (!topics.length) return 0;

  const totalMentions = topics.reduce((sum, topic) => sum + topic.mentionCount, 0) || 1;
  const evennessBase =
    -topics.reduce((acc, topic) => {
      const share = topic.shareOfVoice ?? topic.mentionCount / totalMentions;
      return acc + (share > 0 ? share * Math.log(share) : 0);
    }, 0) / Math.log(topics.length || 1);

  const evenness = Number.isFinite(evennessBase) ? evennessBase : 0;
  const topicDepth = Math.min(topics.length / 6, 1);
  return Math.round(((evenness * 0.65) + (topicDepth * 0.35)) * 100);
}

function deriveAnalytics(topics: TopicSignal[], ctas: CtaSignal[], activeGoals: any[] = []) {
  if (!topics.length) {
    return {
      ...DEFAULT_ANALYTICS,
      uniqueCtas: ctas.length
    };
  }

  const totalMentions = topics.reduce((sum, topic) => sum + topic.mentionCount, 0) || 1;
  let sentimentAccumulator = 0;
  let sentimentCount = 0;

  const sortedByShare = [...topics]
    .map(topic => ({
      ...topic,
      share: topic.shareOfVoice ?? topic.mentionCount / totalMentions
    }))
    .sort((a, b) => b.share - a.share);

  topics.forEach(topic => {
    if (typeof topic.sentimentScore === 'number') {
      sentimentAccumulator += topic.sentimentScore;
      sentimentCount += 1;
    }
  });

  const evenness =
    -sortedByShare.reduce((acc, topic) => {
      const share = topic.share;
      return acc + (share > 0 ? share * Math.log(share) : 0);
    }, 0) / Math.log(topics.length || 1);

  return {
    totalTopics: topics.length,
    avgSentiment: sentimentCount ? sentimentAccumulator / sentimentCount : 0,
    dominantTopic: sortedByShare.length
      ? {
          id: sortedByShare[0].id,
          label: sortedByShare[0].label,
          shareOfVoice: sortedByShare[0].share
        }
      : null,
    topicEvenness: Number.isFinite(evenness) ? Number(evenness.toFixed(3)) : 0,
    uniqueCtas: ctas.length,
    coverageScore: deriveCoverageScore(topics, ctas, activeGoals)
  };
}

export async function saveNarrativeCoverageSnapshot(input: NarrativeCoverageSnapshotInput) {
  if (!input.projectId || !input.userId) {
    throw new Error('projectId and userId are required to save a narrative coverage snapshot');
  }

  const analytics = input.analyticsOverride || deriveAnalytics(input.topics, input.ctas, input.activeGoals || []);

  const payload = {
    project_id: input.projectId,
    user_id: input.userId,
    project_title: input.projectTitle || null,
    coverage_window: input.coverageWindow || 'full_episode',
    topics: input.topics,
    ctas: input.ctas,
    opportunities: input.opportunities || [],
    analytics,
    ai_usage: input.aiUsage,
    total_input_tokens: input.aiUsage.inputTokens,
    total_output_tokens: input.aiUsage.outputTokens,
    ai_cost_usd: input.aiUsage.costUsd,
    notes: input.notes || null,
    goals_snapshot: input.activeGoals || []
  };

  const { data, error } = await supabaseAdmin
    .from('narrative_coverage_snapshots')
    .insert(payload as any)
    .select('id')
    .single() as { data: { id: string } | null; error: any };

  if (error) {
    console.error('[NARRATIVE COVERAGE] Failed to save snapshot', error);
    throw new Error(`Failed to save narrative coverage snapshot: ${error.message}`);
  }

  return data;
}

export async function appendCoverageCostToProject(
  projectId: string,
  usage: AiUsageDetail
): Promise<{ newTotal: number; coverageCost: number } | null> {
  if (!usage || !projectId || usage.costUsd <= 0) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('actual_processing_cost, cost_breakdown')
    .eq('id', projectId)
    .single() as { data: any; error: any };

  if (error) {
    console.error('[NARRATIVE COVERAGE] Failed to fetch project cost breakdown', error);
    throw new Error(`Unable to update project costs: ${error.message}`);
  }

  const currentTotal = Number(data.actual_processing_cost || 0);
  const updatedTotal = currentTotal + usage.costUsd;
  const existingBreakdown =
    (data.cost_breakdown && typeof data.cost_breakdown === 'object'
      ? data.cost_breakdown
      : {}) as Record<string, any>;

  const updatedBreakdown = {
    ...existingBreakdown,
    [COVERAGE_COST_KEY]: Number(existingBreakdown[COVERAGE_COST_KEY] || 0) + usage.costUsd,
    total: updatedTotal
  };

  const updatePayload: any = {
    actual_processing_cost: updatedTotal,
    cost_breakdown: updatedBreakdown
  };

  const { error: updateError } = await (supabaseAdmin
    .from('projects') as any)
    .update(updatePayload)
    .eq('id', projectId);

  if (updateError) {
    console.error('[NARRATIVE COVERAGE] Failed to append coverage cost', updateError);
    throw new Error(`Unable to persist coverage cost: ${updateError.message}`);
  }

  return {
    newTotal: updatedTotal,
    coverageCost: updatedBreakdown[COVERAGE_COST_KEY]
  };
}

export interface CoverageTimelineOptions {
  limit?: number;
  lookbackDays?: number;
}

export async function getCoverageTimeline(
  userId: string,
  options: CoverageTimelineOptions = {}
) {
  if (!userId) {
    throw new Error('userId is required for coverage timeline');
  }

  const { limit = 12, lookbackDays } = options;

  let query = supabaseAdmin
    .from('narrative_coverage_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (lookbackDays && lookbackDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    query = query.gte('created_at', cutoff.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.error('[NARRATIVE COVERAGE] Failed to fetch timeline', error);
    throw new Error(`Failed to fetch coverage timeline: ${error.message}`);
  }

  return data || [];
}

export async function getActiveNarrativeGoals(userId: string) {
  if (!userId) {
    throw new Error('userId is required to fetch narrative goals');
  }

  const { data, error } = await supabaseAdmin
    .from('narrative_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[NARRATIVE COVERAGE] Failed to fetch narrative goals', error);
    throw new Error(`Failed to fetch narrative goals: ${error.message}`);
  }

  return data || [];
}
