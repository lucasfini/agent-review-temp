"use client";

import { useEffect, useState } from 'react';
import {
  Check, Loader2, AlertCircle, Upload, FileText, Users,
  Tag, Cog, CheckCircle2, UserCheck, Award, BookOpen,
  Lightbulb, Quote
} from 'lucide-react';
import { getTierStages, calculateOverallProgress, type ProcessingStage } from '@/lib/tier-progress-config';
import { type TierLevel } from '@/lib/tier-config';

interface ProgressData {
  processing_stage: ProcessingStage;
  processing_progress: number;
  processing_message?: string;
  status: string;
  performance_level?: TierLevel;
}

interface ProgressTrackerProps {
  projectId: string;
  performanceLevel?: TierLevel;
  onComplete?: () => void;
  pollInterval?: number; // milliseconds
  className?: string;
}

// Map stage IDs to lucide-react icons
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Upload: Upload,
  FileText: FileText,
  Users: Users,
  UserCheck: UserCheck,
  Award: Award,
  BookOpen: BookOpen,
  Lightbulb: Lightbulb,
  Quote: Quote,
  CheckCircle: CheckCircle2,
  Tag: Tag,
  Cog: Cog
};

export default function ProgressTracker({
  projectId,
  performanceLevel = 'basic',
  onComplete,
  pollInterval = 2000,
  className = ''
}: ProgressTrackerProps) {
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<TierLevel>(performanceLevel);

  useEffect(() => {
    let pollTimer: NodeJS.Timeout;
    let isMounted = true;

    const fetchProgress = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/status`);

        if (!response.ok) {
          throw new Error('Failed to fetch progress');
        }

        const data = await response.json();

        if (!isMounted) return;

        const newProgressData: ProgressData = {
          processing_stage: data.processing_stage || 'pending',
          processing_progress: data.processing_progress || 0,
          processing_message: data.processing_message,
          status: data.status,
          performance_level: data.performance_level
        };

        setProgressData(newProgressData);

        // Update tier if backend provides it
        if (newProgressData.performance_level) {
          setTier(newProgressData.performance_level);
        }

        // If completed or failed, stop polling
        if (newProgressData.status === 'completed' || newProgressData.status === 'failed') {
          if (newProgressData.status === 'completed' && onComplete) {
            onComplete();
          }
          return; // Stop polling
        }

        // Continue polling
        pollTimer = setTimeout(fetchProgress, pollInterval);
      } catch (err) {
        console.error('Error fetching progress:', err);
        if (isMounted) {
          setError('Failed to fetch progress');
        }
        // Retry polling even on error
        pollTimer = setTimeout(fetchProgress, pollInterval);
      }
    };

    // Start polling
    fetchProgress();

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [projectId, pollInterval, onComplete]);

  if (error) {
    return (
      <div className={`p-4 bg-red-900/20 border border-red-800/30 rounded-lg ${className}`}>
        <div className="flex items-center space-x-2 text-red-300">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      </div>
    );
  }

  if (!progressData) {
    return (
      <div className={`p-4 bg-slate-800/50 border border-slate-700 rounded-lg ${className}`}>
        <div className="flex items-center space-x-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading progress...</span>
        </div>
      </div>
    );
  }

  const currentStage = progressData.processing_stage;
  const currentProgress = progressData.processing_progress;
  const status = progressData.status;

  // Get tier-specific stages
  const stages = getTierStages(tier);

  // Calculate overall progress using tier-aware calculation
  const overallProgress = calculateOverallProgress(tier, currentStage, currentProgress);

  if (status === 'failed') {
    return (
      <div className={`p-4 bg-red-900/20 border border-red-800/30 rounded-lg ${className}`}>
        <div className="flex items-center space-x-2 text-red-300">
          <AlertCircle className="h-5 w-5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Processing Failed</p>
            {progressData.processing_message && (
              <p className="text-xs text-red-400 mt-1">{progressData.processing_message}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className={`p-4 bg-green-900/20 border border-green-800/30 rounded-lg ${className}`}>
        <div className="flex items-center space-x-2 text-green-300">
          <CheckCircle2 className="h-5 w-5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Processing Complete!</p>
            <p className="text-xs text-green-400 mt-1">
              {tier === 'premium' ? 'All premium features ready' :
               tier === 'pro' ? 'Enhanced content ready' :
               'Transcription ready'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-slate-900 border border-slate-700 rounded-lg ${className}`}>
      {/* Header with tier badge and overall progress */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-slate-50">Processing Audio</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            tier === 'premium' ? 'bg-purple-100 text-purple-400' :
            tier === 'pro' ? 'bg-blue-100 text-blue-400' :
            'bg-slate-800 text-slate-300'
          }`}>
            {tier.toUpperCase()}
          </span>
        </div>
        <span className="text-sm font-semibold text-blue-600">{overallProgress}%</span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Stage indicators - tier-specific */}
      <div className="space-y-2">
        {stages.map((stageDef, index) => {
          const isActive = stageDef.id === currentStage;
          const currentStageIndex = stages.findIndex(s => s.id === currentStage);
          const isCompleted = currentStageIndex > index;

          // Get icon component
          const StageIcon = ICON_MAP[stageDef.icon] || FileText;

          return (
            <div
              key={stageDef.id}
              className={`flex items-center space-x-3 p-2 rounded transition-colors ${
                isActive ? 'bg-blue-900/20' : isCompleted ? 'bg-green-900/20' : 'bg-slate-800/50'
              }`}
            >
              <div className={`flex-shrink-0 ${
                isCompleted ? 'text-green-600' : isActive ? 'text-blue-600' : 'text-slate-500'
              }`}>
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <StageIcon className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${
                  isCompleted ? 'text-green-300' : isActive ? 'text-blue-300' : 'text-slate-400'
                }`}>
                  {stageDef.displayName}
                </p>
                {isActive && progressData.processing_message && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {progressData.processing_message}
                  </p>
                )}
              </div>
              {isActive && (
                <span className="text-xs font-medium text-blue-600">
                  {currentProgress}%
                </span>
              )}
              {isCompleted && (
                <span className="text-xs text-green-600">✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
