'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InsightCard } from './InsightCard';
import { scrollToHighlight } from './TranscriptHighlight';
import { Insight, Category, CATEGORY_CONFIG } from './types';

type FilterOption = 'all' | Category;

interface InsightsSidebarProps {
  insights: Insight[];
  activeInsightId: string | null;
  onInsightClick: (insightId: string) => void;
  onClose?: () => void;
  className?: string;
  embedded?: boolean;
}

export function InsightsSidebar({
  insights,
  activeInsightId,
  onInsightClick,
  onClose,
  className,
  embedded = false,
}: InsightsSidebarProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');

  // Scroll sidebar to active card when it changes
  useEffect(() => {
    if (!activeInsightId) return;

    const cardElement = cardRefs.current.get(activeInsightId);
    if (!cardElement) return;

    if (embedded) {
      cardElement.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
      return;
    }

    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const cardRect = cardElement.getBoundingClientRect();
      const scrollOffset = cardElement.offsetTop - container.offsetTop - (containerRect.height / 2) + (cardRect.height / 2);

      container.scrollTo({
        top: Math.max(0, scrollOffset),
        behavior: 'smooth',
      });
    }
  }, [activeInsightId, embedded]);

  const setCardRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      cardRefs.current.set(id, element);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  // Handle sidebar card click - expands card AND scrolls transcript
  const handleCardClick = useCallback((insightId: string) => {
    onInsightClick(insightId);
    // Also scroll the transcript to show the highlighted text
    scrollToHighlight(insightId);
  }, [onInsightClick]);

  // Filter insights
  const filteredInsights = activeFilter === 'all'
    ? insights
    : insights.filter((i) => i.category === activeFilter);

  // Count by category
  const counts = insights.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {} as Record<Category, number>);

  const filters: Array<{ key: FilterOption; label: string; count: number }> = [
    { key: 'all', label: 'All', count: insights.length },
    { key: 'concept', label: 'Concepts', count: counts.concept || 0 },
    { key: 'person', label: 'People', count: counts.person || 0 },
    { key: 'tool', label: 'Tools', count: counts.tool || 0 },
  ];

  return (
    <div
      className={cn(
        'flex flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        embedded ? 'h-auto border-l-0 bg-transparent dark:bg-transparent' : 'h-full',
        className
      )}
    >
      {/* Header - Only shown if onClose is provided (e.g. in overlay mode) */}
      {onClose && (
        <div className="flex-shrink-0 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {filteredInsights.length} Results
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-400"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filter Row */}
      <div className="flex-shrink-0 border-b border-slate-200 px-1 pb-2 dark:border-slate-800">
        <div className="grid grid-cols-4 items-stretch justify-center gap-1">
        {filters.map((f) => {
          const isActive = activeFilter === f.key;
          const config = f.key !== 'all' ? CATEGORY_CONFIG[f.key] : null;

          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              disabled={f.count === 0 && f.key !== 'all'}
              className={cn(
                'flex h-9 w-full items-center justify-center rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                isActive
                  ? 'bg-slate-900 text-white dark:bg-gray-100 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              )}
            >
              <span className="flex items-center gap-1.5">
                {config && (
                  <span className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)} />
                )}
                {f.label}
              </span>
            </button>
          );
        })}
        </div>
      </div>

      {/* Insight List */}
      <div
        ref={scrollContainerRef}
        className={cn(
          'py-2',
          embedded ? 'flex-none overflow-visible' : 'flex-1 overflow-y-auto'
        )}
      >
        {filteredInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Lightbulb className="mb-2 h-6 w-6 text-slate-500 dark:text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {activeFilter !== 'all'
                ? 'No insights in this category'
                : 'No insights detected'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                ref={(el) => setCardRef(insight.id, el)}
                insight={insight}
                isExpanded={activeInsightId === insight.id}
                onClick={() => handleCardClick(insight.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default InsightsSidebar;
