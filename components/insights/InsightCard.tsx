'use client';

import React, { forwardRef } from 'react';
import { Lightbulb, User, Wrench, ExternalLink, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Insight, Category, CATEGORY_CONFIG } from './types';

// Color-coded icons based on category
const CategoryIcon = ({ category, colored = false }: { category: Category; colored?: boolean }) => {
  const config = CATEGORY_CONFIG[category];
  const colorClass = colored ? config.iconColor : 'text-slate-500';

  switch (category) {
    case 'concept':
      return <Lightbulb className={cn('h-4 w-4', colorClass)} />;
    case 'person':
      return <User className={cn('h-4 w-4', colorClass)} />;
    case 'tool':
      return <Wrench className={cn('h-4 w-4', colorClass)} />;
    default:
      return <Lightbulb className={cn('h-4 w-4', colorClass)} />;
  }
};

interface InsightCardProps {
  insight: Insight;
  isExpanded: boolean;
  onClick: () => void;
}

export const InsightCard = forwardRef<HTMLDivElement, InsightCardProps>(
  ({ insight, isExpanded, onClick }, ref) => {
    const config = CATEGORY_CONFIG[insight.category];
    const isPerson = insight.category === 'person';
    const isConcept = insight.category === 'concept';
    const isTool = insight.category === 'tool';
    const hasPersonProfile = isPerson && (
      insight.personProfile?.whoTheyAre ||
      insight.personProfile?.currentWork ||
      insight.personProfile?.notableBackground ||
      insight.personProfile?.whyRelevant
    );
    const hasConceptProfile = isConcept && (
      insight.conceptProfile?.plainEnglish ||
      insight.conceptProfile?.coreMechanism ||
      insight.conceptProfile?.inThisEpisode ||
      insight.conceptProfile?.whyRelevant ||
      insight.conceptProfile?.relatedIdeas?.length
    );
    const hasToolProfile = isTool && (
      insight.toolProfile?.whatItIs ||
      insight.toolProfile?.primaryUseCase ||
      insight.toolProfile?.whoUsesIt ||
      insight.toolProfile?.whyRelevant ||
      insight.toolProfile?.alternatives?.length
    );
    const hasStructuredProfile = hasPersonProfile || hasConceptProfile || hasToolProfile;
    const whyItMatters =
      insight.personProfile?.whyRelevant ||
      insight.conceptProfile?.whyRelevant ||
      insight.toolProfile?.whyRelevant ||
      insight.significance;

    return (
      <div
        ref={ref}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={cn(
          'group cursor-pointer transition-all duration-200',
          // Active card gets colored left border
          isExpanded && 'border-l-4 rounded-r-lg bg-slate-100/60 dark:bg-slate-800/30',
          isExpanded && config.borderColor
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'px-3 py-2.5 rounded-lg transition-colors duration-150',
            'hover:bg-slate-100/70 dark:hover:bg-slate-800/50',
            isExpanded && 'bg-transparent hover:bg-transparent'
          )}
        >
          <div className="flex items-start gap-3">
            {/* Icon - colored when expanded */}
            <div className="mt-0.5 flex-shrink-0">
              <CategoryIcon category={insight.category} colored={isExpanded} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {/* Category Dot */}
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dotColor)} />

                {/* Title */}
                <h3 className={cn(
                  'font-medium text-sm truncate',
                  isExpanded ? 'text-slate-900 dark:text-slate-50' : 'text-slate-600 dark:text-slate-300'
                )}>
                  {insight.title}
                </h3>
              </div>

              {/* Definition - truncated to one line when collapsed */}
              {!isExpanded && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {insight.definition}
                </p>
              )}
            </div>

            {/* Expand Arrow */}
            <ChevronRight
              className={cn(
                'h-4 w-4 flex-shrink-0 mt-0.5 transition-transform duration-200',
                isExpanded ? 'rotate-90 text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'
              )}
            />
          </div>
        </div>

        {/* Expandable Content - Accordion with smooth slide animation */}
        <div 
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <div className="px-3 pb-4 ml-7 space-y-4">
              {/* Full Definition - with breathing room */}
              {!hasStructuredProfile && (
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {insight.definition}
                </p>
              )}

              {hasPersonProfile && (
                <div className="space-y-3">
                  {insight.personProfile?.whoTheyAre && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        Who they are
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {insight.personProfile.whoTheyAre}
                      </p>
                    </div>
                  )}

                  {insight.personProfile?.currentWork && (
                    <div className={cn('rounded-lg p-3', config.hoverBg)}>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                        Current work
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {insight.personProfile.currentWork}
                      </p>
                    </div>
                  )}

                  {insight.personProfile?.notableBackground && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        Notable background
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {insight.personProfile.notableBackground}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {hasConceptProfile && (
                <div className="space-y-3">
                  {(insight.conceptProfile?.plainEnglish || insight.definition) && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        Plain-English explainer
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {insight.conceptProfile?.plainEnglish || insight.definition}
                      </p>
                    </div>
                  )}

                  {insight.conceptProfile?.coreMechanism && (
                    <div className={cn('rounded-lg p-3', config.hoverBg)}>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                        How it works
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {insight.conceptProfile.coreMechanism}
                      </p>
                    </div>
                  )}

                  {insight.conceptProfile?.inThisEpisode && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        In this episode
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {insight.conceptProfile.inThisEpisode}
                      </p>
                    </div>
                  )}

                  {!!insight.conceptProfile?.relatedIdeas?.length && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                        Related ideas
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {insight.conceptProfile.relatedIdeas.map((idea) => (
                          <span
                            key={idea}
                            className={cn(
                              'rounded-full border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300',
                              config.hoverBg
                            )}
                          >
                            {idea}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasToolProfile && (
                <div className="space-y-3">
                  {(insight.toolProfile?.whatItIs || insight.definition) && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        What it is
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {insight.toolProfile?.whatItIs || insight.definition}
                      </p>
                    </div>
                  )}

                  {insight.toolProfile?.primaryUseCase && (
                    <div className={cn('rounded-lg p-3', config.hoverBg)}>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                        Primary use case
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {insight.toolProfile.primaryUseCase}
                      </p>
                    </div>
                  )}

                  {insight.toolProfile?.whoUsesIt && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        Who uses it
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {insight.toolProfile.whoUsesIt}
                      </p>
                    </div>
                  )}

                  {!!insight.toolProfile?.alternatives?.length && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                        Alternatives
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {insight.toolProfile.alternatives.map((alternative) => (
                          <span
                            key={alternative}
                            className={cn(
                              'rounded-full border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300',
                              config.hoverBg
                            )}
                          >
                            {alternative}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Significance / Why it matters - separated with margin */}
              {whyItMatters && (
                <div className={cn('rounded-lg p-3', config.hoverBg)}>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                    Why it matters
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {whyItMatters}
                  </p>
                </div>
              )}

              {/* Sources */}
              {insight.sources && insight.sources.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Sources
                  </p>
                  <div className="space-y-1.5">
                    {insight.sources.map((source, idx) => (
                      <a
                        key={`${source.url}-${idx}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="group/link flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{source.title}</span>
                        {source.description && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
                            {source.description}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

InsightCard.displayName = 'InsightCard';

export default InsightCard;
