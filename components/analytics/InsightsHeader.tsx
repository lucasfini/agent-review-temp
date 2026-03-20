'use client';

import { useState } from 'react';
import { ChevronDown, RefreshCw, History, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeatureHelp } from '@/components/ui/feature-help';

interface InsightsHeaderProps {
  snapshots: Array<{
    id: string;
    created_at: string;
    project_title?: string | null;
  }>;
  selectedSnapshotId: string | null;
  onSelectSnapshot: (id: string | null) => void;
  isStale: boolean;
  onRerunAnalysis?: () => void;
  goalsLastModified?: string | null;
}

export function InsightsHeader({
  snapshots,
  selectedSnapshotId,
  onSelectSnapshot,
  isStale,
  onRerunAnalysis,
  goalsLastModified
}: InsightsHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Find selected snapshot object
  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);
  const isLatest = !selectedSnapshotId || (snapshots.length > 0 && snapshots[0].id === selectedSnapshotId);

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
            Creator Coaching
            <FeatureHelp
              title="Creator Coaching"
              description="Shows what worked, what felt weak, and what to improve next time based on the transcript."
              bestFor="improving the quality of future recordings, not just measuring coverage"
            />
            {!isLatest && (
              <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                <History className="w-3 h-3 mr-1" />
                Historical View
              </span>
            )}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            What worked, what needs work, and what to improve next time.
          </p>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Select analysis run"
            className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:bg-slate-50 sm:w-[260px] dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800/50"
          >
            <div className="flex flex-col items-start text-left truncate mr-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Analysis Run</span>
              <span className="block max-w-[180px] truncate font-medium text-slate-900 dark:text-slate-50">
                {selectedSnapshot 
                  ? new Date(selectedSnapshot.created_at).toLocaleString(undefined, { 
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                    })
                  : snapshots.length > 0 
                    ? 'Latest Analysis' 
                    : 'No Analysis Yet'}
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", isOpen && "rotate-180")} />
          </button>

          {isOpen && snapshots.length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
              <div role="listbox" aria-label="Analysis run history" className="absolute right-0 z-20 mt-2 max-h-[320px] w-[300px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
                <div className="sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                  History
                </div>
                {snapshots.map((snapshot, index) => {
                  const isItemLatest = index === 0;
                  const isSelected = selectedSnapshotId === snapshot.id || (isItemLatest && selectedSnapshotId === null);
                  
                  return (
                    <button
                      key={snapshot.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectSnapshot(isItemLatest ? null : snapshot.id); // Null implies latest
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full border-b border-slate-100 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 last:border-0 dark:border-slate-800 dark:hover:bg-slate-800/50",
                        isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                      )}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={cn(
                          "font-medium flex items-center gap-2",
                          isSelected ? "text-blue-600 dark:text-blue-400" : "text-slate-900 dark:text-slate-50"
                        )}>
                          {new Date(snapshot.created_at).toLocaleDateString()}
                          {isItemLatest && (
                            <span className="rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700 dark:border-green-800/30 dark:bg-green-900/20 dark:text-green-400">
                              Latest
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(snapshot.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">{snapshot.project_title || 'Untitled Project'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stale State Banner */}
      {isStale && isLatest && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 animate-in fade-in slide-in-from-top-2 dark:border-amber-800/30 dark:bg-amber-900/20">
          <div className="mt-0.5 flex-shrink-0 rounded-full bg-amber-100 p-2 dark:bg-amber-950/50">
            <RefreshCw className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Analysis out of date</h4>
            <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
              Your goals were modified on {goalsLastModified ? new Date(goalsLastModified).toLocaleDateString() : 'recently'}, 
              which is after the last analysis run.
              {onRerunAnalysis ? (
                <>
                  {' '}
                  <button
                    onClick={onRerunAnalysis}
                    aria-label="Rerun analytics to update insights"
                    className="font-medium underline hover:text-amber-950 transition-colors"
                  >
                    Rerun analytics
                  </button>
                  {' '} to see updated insights.
                </>
              ) : (
                ' Rerun analytics to update these insights.'
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
