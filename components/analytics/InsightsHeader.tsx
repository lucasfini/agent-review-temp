'use client';

import { useState } from 'react';
import { ChevronDown, RefreshCw, History, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

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
          <h3 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
            Insights & Gaps
            {!isLatest && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <History className="w-3 h-3 mr-1" />
                Historical View
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            AI-driven visibility into topic mix, CTA cadence, and editorial gaps.
          </p>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Select analysis run"
            className="flex items-center justify-between w-full sm:w-[260px] px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm shadow-sm hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex flex-col items-start text-left truncate mr-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Analysis Run</span>
              <span className="font-medium truncate block max-w-[180px] text-slate-50">
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
              <div role="listbox" aria-label="Analysis run history" className="absolute right-0 mt-2 w-[300px] bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 max-h-[320px] overflow-y-auto ring-1 ring-black ring-opacity-5">
                <div className="sticky top-0 bg-slate-800/50 px-4 py-2 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wider">
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
                        "w-full text-left px-4 py-3 text-sm hover:bg-slate-800/50 border-b border-slate-800 last:border-0 transition-colors",
                        isSelected ? "bg-blue-900/20/60" : ""
                      )}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={cn(
                          "font-medium flex items-center gap-2",
                          isSelected ? "text-blue-400" : "text-slate-50"
                        )}>
                          {new Date(snapshot.created_at).toLocaleDateString()}
                          {isItemLatest && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-900/20 border border-green-100 px-1.5 py-0.5 rounded-full">
                              Latest
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(snapshot.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
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
        <div className="bg-amber-900/20 border border-amber-800/30 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="p-2 bg-amber-100 rounded-full flex-shrink-0 mt-0.5">
            <RefreshCw className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-900">Analysis out of date</h4>
            <p className="text-sm text-amber-300 mt-1 leading-relaxed">
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
