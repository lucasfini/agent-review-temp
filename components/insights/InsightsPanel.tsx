'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { InsightsSidebar } from './InsightsSidebar';
import { highlightTranscriptWithInsights } from './TranscriptHighlight';
import { Insight } from './types';

interface InsightsPanelProps {
  transcriptText: string;
  insights: Insight[];
  showSidebar: boolean;
  onCloseSidebar: () => void;
  className?: string;
}

export function InsightsPanel({
  transcriptText,
  insights,
  showSidebar,
  onCloseSidebar,
  className,
}: InsightsPanelProps) {
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);

  const handleInsightClick = useCallback((insightId: string) => {
    setActiveInsightId((prev) => (prev === insightId ? null : insightId));
  }, []);

  // Filter to only insights visible based on current filter
  const highlightedTranscript = highlightTranscriptWithInsights(
    transcriptText,
    insights,
    activeInsightId,
    handleInsightClick
  );

  return (
    <div className={cn('flex h-full', className)}>
      {/* Transcript Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <p className="text-gray-700 text-[15px] leading-7 whitespace-pre-wrap">
            {highlightedTranscript}
          </p>
        </div>
      </div>

      {/* Sidebar */}
      {showSidebar && (
        <div className="w-80 flex-shrink-0">
          <InsightsSidebar
            insights={insights}
            activeInsightId={activeInsightId}
            onInsightClick={handleInsightClick}
            onClose={onCloseSidebar}
          />
        </div>
      )}
    </div>
  );
}

export default InsightsPanel;
