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
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-4">
      <div className="relative w-full max-w-md bg-slate-900 rounded-lg border border-slate-700 shadow-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-50">
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
            <span className="text-sm font-medium text-slate-300">
              {progress.completedBlocks} of {progress.totalBlocks} blocks
            </span>
            <span className="text-sm font-medium text-blue-600">
              {percentComplete}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Current Block Status */}
        {progress.currentBlock && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-200">
                  Currently generating:
                </p>
                <p className="text-sm text-blue-400 mt-0.5">
                  {progress.currentBlock.name}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status Message */}
        {progress.message && (
          <div className="mb-4">
            <p className="text-sm text-slate-400">
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
                  isCompleted ? 'bg-green-900/20' :
                  isCurrent ? 'bg-blue-900/20 border border-blue-800/30' :
                  'bg-slate-800/50'
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
                    isCompleted ? 'text-green-900' :
                    isCurrent ? 'text-blue-200' :
                    'text-slate-400'
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
          <div className="mt-6 p-3 bg-green-900/20 border border-green-800/30 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm font-medium text-green-900">
                All content generated successfully!
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {progress.status === 'failed' && (
          <div className="mt-6 p-3 bg-red-900/20 border border-red-800/30 rounded-lg">
            <p className="text-sm font-medium text-red-900">
              Generation failed. Please try again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
