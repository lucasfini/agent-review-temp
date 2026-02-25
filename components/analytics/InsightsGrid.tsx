"use client"

import { cn } from "@/lib/utils"
import { AlertTriangle, Lightbulb, TrendingUp, ArrowRight, FileText, PauseCircle } from 'lucide-react'

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
  // Determine if this is a gap (critical) or opportunity
  const isGap = opportunity.severity === 'high' || opportunity.type.toLowerCase().includes('gap')
  const isMedium = opportunity.severity === 'medium'
  const isPaused = status === 'paused'

  return (
    <div
      className={cn(
        "rounded-xl p-4 transition-all hover:shadow-md relative",
        isPaused ? "opacity-50 bg-slate-800/50 border border-slate-700" :
        isGap
          ? "bg-red-900/20 border border-red-100"
          : isMedium
          ? "bg-amber-900/20 border border-amber-100"
          : "bg-green-900/20 border border-green-100"
      )}
    >
      {isPaused && (
        <div className="absolute top-2 right-2 z-10">
           <span className="inline-flex items-center gap-1 bg-slate-700/80 backdrop-blur-sm text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-600">
             <PauseCircle className="h-3 w-3" />
             Goal Paused
           </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          "flex-shrink-0 p-2 rounded-lg",
          isPaused ? "bg-slate-700 text-slate-400" :
          isGap
            ? "bg-red-100 text-red-600"
            : isMedium
            ? "bg-amber-100 text-amber-600"
            : "bg-green-100 text-green-600"
        )}>
          {isGap ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Lightbulb className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap pr-16">
            <h4 className={cn(
              "text-sm font-semibold",
              isPaused ? "text-slate-300" :
              isGap ? "text-red-900" : isMedium ? "text-amber-900" : "text-green-900"
            )}>
              {opportunity.label}
            </h4>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              isPaused ? "bg-slate-700 text-slate-400" :
              isGap
                ? "bg-red-100 text-red-400"
                : isMedium
                ? "bg-amber-100 text-amber-400"
                : "bg-green-100 text-green-400"
            )}>
              {opportunity.type}
              <span className="sr-only"> — severity: {opportunity.severity}</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatRelativeDate(opportunity.created_at)}
          </p>
        </div>
      </div>

      {/* Project Source */}
      {showProject && opportunity.projectTitle && (
        <div className="flex items-center gap-1.5 text-xs text-indigo-600 mb-2">
          <FileText className="h-3 w-3" />
          <span className="font-medium truncate">{opportunity.projectTitle}</span>
        </div>
      )}

      {/* Summary */}
      <p className={cn(
        "text-sm mb-3 leading-relaxed",
        isPaused ? "text-slate-400" :
        isGap ? "text-red-300" : isMedium ? "text-amber-300" : "text-green-300"
      )}>
        {opportunity.summary}
      </p>

      {/* Action */}
      <div className={cn(
        "flex items-start gap-2 p-2.5 rounded-lg",
        isPaused ? "bg-slate-800" :
        isGap
          ? "bg-red-100/50"
          : isMedium
          ? "bg-amber-100/50"
          : "bg-green-100/50"
      )}>
        <ArrowRight className={cn(
          "h-4 w-4 flex-shrink-0 mt-0.5",
          isPaused ? "text-slate-500" :
          isGap ? "text-red-600" : isMedium ? "text-amber-600" : "text-green-600"
        )} />
        <p className={cn(
          "text-xs font-medium",
          isPaused ? "text-slate-400" :
          isGap ? "text-red-400" : isMedium ? "text-amber-400" : "text-green-400"
        )}>
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
      <div className="bg-slate-800/50 rounded-xl border border-dashed border-slate-600 p-8 text-center">
        <TrendingUp className="h-10 w-10 text-slate-500 mx-auto mb-3" />
        <h4 className="text-sm font-medium text-slate-50 mb-1">No insights yet</h4>
        <p className="text-sm text-slate-400">
          Run analytics on your projects to discover opportunities and gaps.
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
  const gaps = activeOps.filter(o => o.severity === 'high');
  const mediumItems = activeOps.filter(o => o.severity === 'medium');
  const otherOpportunities = activeOps.filter(o => o.severity !== 'high' && o.severity !== 'medium');

  // Combine for display: Gaps -> Medium -> Low -> Paused
  const finalDisplayOrder = [...gaps, ...mediumItems, ...otherOpportunities, ...pausedOps];

  return (
    <div className="space-y-6" role="region" aria-label="Opportunities and gaps insights">

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-50">Opportunities & Gaps</h3>
          <p className="text-sm text-slate-400">
            {opportunities.length} insight{opportunities.length !== 1 ? 's' : ''} detected
            {projectIdFilter && <span className="text-blue-600 ml-1">(filtered)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />
            <span className="text-slate-400">Gaps ({gaps.length})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="text-slate-400">Needs attention ({mediumItems.length})</span>
          </span>
          {pausedOps.length > 0 && (
             <span className="flex items-center gap-1.5">
               <span className="w-2.5 h-2.5 rounded-full bg-slate-500" aria-hidden="true" />
               <span className="text-slate-400">Paused ({pausedOps.length})</span>
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
