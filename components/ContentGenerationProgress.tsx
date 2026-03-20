"use client";

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, Clock, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface ContentBlock {
  name: string;
  contentTypeId: string;
  blockNumber: number;
  theme: string;
}

interface GenerationProgress {
  status: 'preparing' | 'generating' | 'completed' | 'failed';
  currentBlock?: {
    name: string;
    number: number;
    total: number;
  };
  completedBlocks: number;
  totalBlocks: number;
  message?: string;
}

interface ContentGenerationProgressProps {
  isOpen: boolean;
  projectId: string;
  blocks: ContentBlock[];
  onComplete: () => void;
}

export default function ContentGenerationProgress({
  isOpen,
  projectId,
  blocks,
  onComplete
}: ContentGenerationProgressProps) {
  const [progress, setProgress] = useState<GenerationProgress>({
    status: 'preparing',
    completedBlocks: 0,
    totalBlocks: blocks.length,
    message: 'Initializing content generation...'
  });

  useEffect(() => {
    if (!isOpen || !projectId) return;

    // Subscribe to generation_progress changes
    const channel = supabase
      .channel(`generation-progress-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_progress',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          const data = payload.new as any;

          if (data) {
            setProgress({
              status: data.status || 'generating',
              currentBlock: data.current_block ? {
                name: data.current_block.name,
                number: data.current_block.number,
                total: data.current_block.total
              } : undefined,
              completedBlocks: data.completed_blocks || 0,
              totalBlocks: data.total_blocks || blocks.length,
              message: data.message || ''
            });

            // Auto-close when completed
            if (data.status === 'completed') {
              setTimeout(() => {
                onComplete();
              }, 2000);
            }
          }
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, projectId, blocks.length, onComplete]);

  if (!isOpen) return null;

  const percentComplete = progress.totalBlocks > 0
    ? Math.round((progress.completedBlocks / progress.totalBlocks) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 dark:bg-black/40">
      <div className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Generating Content
          </h3>
          {progress.status === 'completed' ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : (
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {progress.completedBlocks} of {progress.totalBlocks} blocks
            </span>
            <span className="text-sm font-medium text-blue-600">
              {percentComplete}%
            </span>
          </div>
          <div className="w-full h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Current Block Status */}
        {progress.currentBlock && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/30 dark:bg-blue-900/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-200">
                  Currently generating:
                </p>
                <p className="mt-0.5 text-sm text-blue-600 dark:text-blue-400">
                  {progress.currentBlock.name}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status Message */}
        {progress.message && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {progress.message}
            </p>
          </div>
        )}

        {/* Blocks List */}
        <div className="space-y-2">
          {blocks.map((block, index) => {
            const isCompleted = index < progress.completedBlocks;
            const isCurrent = progress.currentBlock &&
              progress.currentBlock.number - 1 === index;
            const isPending = index >= progress.completedBlocks;

            return (
              <div
                key={`${block.contentTypeId}-${block.blockNumber}`}
                className={`flex items-center gap-3 p-2 rounded ${
                  isCompleted ? 'bg-green-50 dark:bg-green-900/20' :
                  isCurrent ? 'border border-blue-200 bg-blue-50 dark:border-blue-800/30 dark:bg-blue-900/20' :
                  'bg-slate-100 dark:bg-slate-800/50'
                }`}
              >
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${
                    isCompleted ? 'text-green-700 dark:text-green-300' :
                    isCurrent ? 'text-blue-700 dark:text-blue-200' :
                    'text-slate-600 dark:text-slate-400'
                  }`}>
                    {block.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Message */}
        {progress.status === 'completed' && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/30 dark:bg-green-900/20">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-700 dark:text-green-200">
                All content generated successfully!
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {progress.status === 'failed' && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/30 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-200">
              Generation failed. Please try again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
