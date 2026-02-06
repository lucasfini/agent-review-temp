'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Insight } from './types';

interface TranscriptHighlightProps {
  text: string;
  insight: Insight;
  isActive: boolean;
  onClick: (insightId: string) => void;
}

export function TranscriptHighlight({
  text,
  insight,
  isActive,
  onClick,
}: TranscriptHighlightProps) {
  return (
    <button
      type="button"
      data-insight-id={insight.id}
      onClick={(e) => {
        e.stopPropagation();
        onClick(insight.id);
      }}
      className={cn(
        'inline cursor-pointer transition-all duration-150',
        // Subtle dotted underline by default
        'border-b-2 border-dotted border-gray-400',
        // Hover: faint background
        'hover:bg-amber-100/50 hover:border-amber-400',
        // Active state
        isActive && 'bg-amber-100/70 border-amber-500 border-solid',
        // Focus
        'focus:outline-none focus:bg-amber-100/50'
      )}
      aria-label={`View insight: ${insight.title}`}
    >
      {text}
    </button>
  );
}

interface HighlightMatch {
  start: number;
  end: number;
  insight: Insight;
  matchText: string;
}

// Utility to parse transcript and create highlighted segments
export function highlightTranscriptWithInsights(
  text: string,
  insights: Insight[],
  activeInsightId: string | null,
  onInsightClick: (insightId: string) => void
): React.ReactNode {
  if (!insights.length) {
    return text;
  }

  // Build matches
  const matches: HighlightMatch[] = [];

  insights.forEach((insight) => {
    const targets = [insight.matchText || insight.title];
    if (insight.matchVariants) {
      targets.push(...insight.matchVariants);
    }

    targets.forEach((target) => {
      if (!target) return;
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          insight,
          matchText: match[0],
        });

        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    });
  });

  if (!matches.length) {
    return text;
  }

  // Sort and remove overlaps
  const sorted = matches.sort((a, b) => a.start - b.start);
  const nonOverlapping: HighlightMatch[] = [];

  for (const match of sorted) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || match.start >= last.end) {
      nonOverlapping.push(match);
    }
  }

  // Build nodes
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  nonOverlapping.forEach((match, index) => {
    if (match.start > cursor) {
      nodes.push(
        <span key={`text-${index}-${cursor}`}>
          {text.slice(cursor, match.start)}
        </span>
      );
    }

    nodes.push(
      <TranscriptHighlight
        key={`insight-${match.insight.id}-${index}`}
        text={match.matchText}
        insight={match.insight}
        isActive={activeInsightId === match.insight.id}
        onClick={onInsightClick}
      />
    );

    cursor = match.end;
  });

  if (cursor < text.length) {
    nodes.push(
      <span key={`text-tail-${cursor}`}>{text.slice(cursor)}</span>
    );
  }

  return nodes;
}

// Helper to scroll to a highlight in the transcript
export function scrollToHighlight(insightId: string) {
  const element = document.querySelector(`[data-insight-id="${insightId}"]`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export default TranscriptHighlight;
