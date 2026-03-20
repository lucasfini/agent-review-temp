"use client"

import { cn } from "@/lib/utils"
import { AlertTriangle, Lightbulb, TrendingUp, ArrowRight, FileText, PauseCircle, Sparkles, Quote } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface Opportunity {
  id: string
  label: string
  type: string
  severity: 'high' | 'medium' | 'low'
  summary: string
  recommendedAction: string
  projectTitle?: string | null
  created_at: string
  topicId?: string
  appliesTo?: 'this_episode' | 'next_episode' | 'both'
  evidenceQuote?: string
}

interface Goal {
  id: string
  topic_label: string
  status: string
}

interface InsightsGridProps {
  opportunities: Opportunity[]
  projectIdFilter?: string | null
  formatRelativeDate: (timestamp: string) => string
  goals?: Goal[]
}

// ============================================================================
// INSIGHT CARD
// ============================================================================

interface InsightCardProps {
  opportunity: Opportunity
  showProject: boolean
  formatRelativeDate: (timestamp: string) => string
  status?: string
}

function InsightCard({ opportunity, showProject, formatRelativeDate, status }: InsightCardProps) {
  const meta = getOpportunityMeta(opportunity)
  const isPaused = status === 'paused'

  return (
    <div
      className={cn(
        "group rounded-xl p-4 transition-all relative bg-white dark:bg-slate-950 border shadow-sm",
        isPaused
          ? "opacity-60 grayscale-[50%] border-slate-200 dark:border-slate-800/40"
          : "border-slate-200 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md"
      )}
    >
      {isPaused && (
        <div className="absolute top-2 right-2 z-10">
           <span className="inline-flex items-center gap-1 bg-slate-200/80 dark:bg-slate-700/80 backdrop-blur-sm text-slate-500 dark:text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-600">
             <PauseCircle className="h-3 w-3" />
             Goal Paused
           </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          "flex-shrink-0 p-2 rounded-lg border",
          isPaused ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700" :
          meta.iconTone
        )}>
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap pr-16">
            <h4 className={cn(
              "text-sm font-semibold",
              isPaused ? "text-slate-600 dark:text-slate-300" : "text-slate-900 dark:text-slate-50"
            )}>
              {opportunity.label}
            </h4>
            <span className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase">
              {meta.badgeLabel}
              <span className="sr-only"> — severity: {opportunity.severity}</span>
            </span>
            {opportunity.appliesTo && (
              <span className="bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase">
                {formatAppliesTo(opportunity.appliesTo)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatRelativeDate(opportunity.created_at)}
          </p>
        </div>
      </div>

      {/* Project Source */}
      {showProject && opportunity.projectTitle && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
          <FileText className="h-3 w-3" />
          <span className="font-medium truncate">{opportunity.projectTitle}</span>
        </div>
      )}

      {/* Summary */}
      <p className="text-slate-600 dark:text-slate-300 text-sm mb-3 leading-relaxed">
        {opportunity.summary}
      </p>

      {opportunity.evidenceQuote && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/60">
          <div className="flex items-start gap-2">
            <Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {opportunity.evidenceQuote}
            </p>
          </div>
        </div>
      )}

      {/* Action */}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/60 flex items-center gap-2">
        <ArrowRight className={cn(
          "h-4 w-4 flex-shrink-0 mt-0.5",
          isPaused ? "text-slate-400 dark:text-slate-600" : "text-slate-500"
        )} />
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors group-hover:text-slate-900 dark:group-hover:text-white">
          {opportunity.recommendedAction || 'Review AI suggestion'}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN INSIGHTS GRID (Masonry Style)
// ============================================================================

export function InsightsGrid({
  opportunities,
  projectIdFilter,
  formatRelativeDate,
  goals = []
}: InsightsGridProps) {
  const showProject = !projectIdFilter

  if (opportunities.length === 0) {
    return (
      <div className="bg-slate-100/80 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
        <TrendingUp className="h-10 w-10 text-slate-500 mx-auto mb-3" />
        <h4 className="text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">No coaching yet</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Run analysis on your project to get creator feedback and next-step guidance.
        </p>
      </div>
    )
  }

  // Map opportunities to status
  const processedOps = opportunities.map(op => {
    // Find matching goal
    // Match logic: Fuzzy match on label or exact match on topicId (if available)
    const goal = goals.find(g => 
       (op.topicId && g.id === op.topicId) || 
       (g.topic_label && op.label.toLowerCase().includes(g.topic_label.toLowerCase())) ||
       (g.topic_label && g.topic_label.toLowerCase() === op.label.toLowerCase())
    );
    return {
      ...op,
      goalStatus: goal?.status || 'active'
    };
  });

  const activeOps = processedOps.filter(o => o.goalStatus !== 'paused');
  const pausedOps = processedOps.filter(o => o.goalStatus === 'paused');

  // Sort active ops by severity
  const gaps = activeOps.filter(o => getOpportunityMeta(o).group === 'gap');
  const mediumItems = activeOps.filter(o => getOpportunityMeta(o).group === 'improvement' && o.severity === 'medium');
  const otherOpportunities = activeOps.filter(o => {
    const group = getOpportunityMeta(o).group;
    return group === 'strength' || (group === 'improvement' && o.severity !== 'medium');
  });

  // Combine for display: Gaps -> Medium -> Low -> Paused
  const finalDisplayOrder = [...gaps, ...mediumItems, ...otherOpportunities, ...pausedOps];

  return (
    <div className="space-y-6" role="region" aria-label="Opportunities and gaps insights">

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {opportunities.length} coaching note{opportunities.length !== 1 ? 's' : ''} detected
            {projectIdFilter && <span className="text-blue-600 ml-1">(filtered)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />
            <span className="text-slate-500 dark:text-slate-400">Gaps ({gaps.length})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="text-slate-500 dark:text-slate-400">Needs attention ({mediumItems.length})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-slate-500 dark:text-slate-400">Strengths ({activeOps.filter(o => getOpportunityMeta(o).group === 'strength').length})</span>
          </span>
          {pausedOps.length > 0 && (
             <span className="flex items-center gap-1.5">
               <span className="w-2.5 h-2.5 rounded-full bg-slate-500" aria-hidden="true" />
               <span className="text-slate-500 dark:text-slate-400">Paused ({pausedOps.length})</span>
             </span>
          )}
        </div>
      </div>

      {/* Masonry Grid - CSS Columns for true masonry effect */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
        {finalDisplayOrder.map(opportunity => (
          <div key={opportunity.id} className="break-inside-avoid">
            <InsightCard
              opportunity={opportunity}
              showProject={showProject}
              formatRelativeDate={formatRelativeDate}
              status={opportunity.goalStatus}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function getOpportunityMeta(opportunity: Opportunity) {
  const type = opportunity.type.toLowerCase();

  if (type === 'strength' || type === 'balanced') {
    return {
      group: 'strength' as const,
      badgeLabel: 'Strength',
      icon: <Sparkles className="h-4 w-4" />,
      iconTone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
  }

  if (type === 'hook') {
    return {
      group: opportunity.severity === 'high' ? 'gap' as const : 'improvement' as const,
      badgeLabel: 'Hook',
      icon: <AlertTriangle className="h-4 w-4" />,
      iconTone: opportunity.severity === 'high'
        ? 'bg-red-500/10 text-red-500 border-red-500/20'
        : 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    };
  }

  if (['clarity', 'structure', 'pacing', 'depth', 'follow_up', 'audience_fit', 'cta', 'speaker_balance', 'underrepresented', 'overindexed', 'debt', 'cta-gap', 'new'].includes(type)) {
    return {
      group: opportunity.severity === 'high' || ['underrepresented', 'debt', 'cta-gap'].includes(type) ? 'gap' as const : 'improvement' as const,
      badgeLabel: formatBadgeLabel(type),
      icon: (opportunity.severity === 'high' || ['underrepresented', 'debt', 'cta-gap'].includes(type))
        ? <AlertTriangle className="h-4 w-4" />
        : <Lightbulb className="h-4 w-4" />,
      iconTone: (opportunity.severity === 'high' || ['underrepresented', 'debt', 'cta-gap'].includes(type))
        ? 'bg-red-500/10 text-red-500 border-red-500/20'
        : 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    };
  }

  return {
    group: 'improvement' as const,
    badgeLabel: formatBadgeLabel(type || 'coach note'),
    icon: <Lightbulb className="h-4 w-4" />,
    iconTone: opportunity.severity === 'high'
      ? 'bg-red-500/10 text-red-500 border-red-500/20'
      : 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  };
}

function formatBadgeLabel(type: string) {
  return type.replace(/[_-]/g, ' ');
}

function formatAppliesTo(value: Opportunity['appliesTo']) {
  switch (value) {
    case 'this_episode':
      return 'This episode';
    case 'next_episode':
      return 'Next episode';
    case 'both':
      return 'Both';
    default:
      return '';
  }
}
