"use client";

import { Loader2 } from 'lucide-react';
import { useCoverageProgress } from '@/lib/context/coverage-progress';

export function CoverageBanner() {
  const { runningCoverageIds } = useCoverageProgress();
  if (runningCoverageIds.size === 0) return null;

  const titles = [...runningCoverageIds.values()];

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-64 z-50 flex items-center gap-4 border-t border-slate-200 bg-white px-6 py-3 text-slate-900 shadow-[0_-12px_30px_-20px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          Running analysis for &quot;{titles.join('", "')}&quot;…
        </p>
        <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-blue-600 dark:bg-blue-400"
            style={{ animation: 'banner-sweep 1.5s ease-in-out infinite' }}
          />
        </div>
      </div>
    </div>
  );
}
