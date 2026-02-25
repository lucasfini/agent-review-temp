"use client";

import { Loader2 } from 'lucide-react';
import { useCoverageProgress } from '@/lib/context/coverage-progress';

export function CoverageBanner() {
  const { runningCoverageIds } = useCoverageProgress();
  if (runningCoverageIds.size === 0) return null;

  const titles = [...runningCoverageIds.values()];

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-64 z-50 bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          Running analysis for &quot;{titles.join('", "')}&quot;…
        </p>
        <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden relative">
          <div
            className="absolute inset-y-0 left-0 w-2/5 bg-blue-400 rounded-full"
            style={{ animation: 'banner-sweep 1.5s ease-in-out infinite' }}
          />
        </div>
      </div>
    </div>
  );
}
