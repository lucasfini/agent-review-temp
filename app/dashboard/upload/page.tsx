"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Upload, FileAudio, X, AlertCircle, CheckCircle, Clock, History, Trash2, Eye, FileVideo, Loader2, ChevronDown, ChevronUp, Lightbulb, Users, Mic, Pencil, MoreHorizontal, Video, MessageSquare, Globe2, Link2, Cloud, FileText, List, Quote, Star, Sparkles, Info, Network, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { calculateOverallProgress, getStageDisplayName, getUserFacingProcessingMessage, type ProcessingStage } from '@/lib/tier-progress-config';
import { SpeakerRosterForm, type RosterSpeaker } from '@/components/SpeakerRosterForm';
import { useActiveProcessingProjects } from '@/lib/hooks/useActiveProcessingProjects';
import { emitProjectMutation } from '@/lib/project-events';
import { normalizeTier } from '@/lib/tier-config';
import { ANALYSIS_OPTION_CONFIG, DEFAULT_ANALYSIS_OPTIONS, getProcessingTierForAnalysis, getSelectedAnalysisKeys, normalizeAnalysisOptions, type AnalysisOptions } from '@/lib/analysis-options';
import { FeatureHelp } from '@/components/ui/feature-help';
import { useUploadProgressSync, type UploadedFile, type QueuedRosterSpeaker } from '@/lib/context/upload-progress-sync';
import { toast } from 'sonner';
import { isIntegrationEnabled } from '@/lib/integrations/availability';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import { DashboardPageShell, DashboardPanel } from '@/components/dashboard/shell';

const HISTORY_PAGE_SIZE = 10;
const UPLOAD_METHOD_TABS = [
  { id: 'local', label: 'Local', labelFull: 'Local upload', soon: false },
  { id: 'url', label: 'URL', labelFull: 'URL import', soon: false },
  { id: 'integrations', label: 'Apps', labelFull: 'Integrations', soon: false },
] as const;

type UploadMethodTab = typeof UPLOAD_METHOD_TABS[number]['id'];

const COMING_SOON_INTEGRATIONS = [
  {
    name: 'Zoom',
    detail: 'Meeting recordings',
    Icon: Video,
    accent: 'text-blue-600 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-100 dark:border-blue-400/20',
  },
  {
    name: 'Google Drive',
    detail: 'Shared audio and video files',
    Icon: Cloud,
    accent: 'text-indigo-600 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    border: 'border-indigo-100 dark:border-indigo-400/20',
  },
  {
    name: 'Slack',
    detail: 'Huddles and clips',
    Icon: MessageSquare,
    accent: 'text-emerald-600 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-100 dark:border-emerald-400/20',
  },
  {
    name: 'Granola',
    detail: 'Meeting notes and recordings',
    Icon: Network,
    accent: 'text-violet-600 dark:text-violet-300',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    border: 'border-violet-100 dark:border-violet-400/20',
  },
];

type IntegrationProvider = 'zoom' | 'microsoft' | 'youtube';

type IntegrationProviderStatus = {
  provider: IntegrationProvider;
  connected: boolean;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

type YouTubeUploadItem = {
  videoId: string;
  title: string;
  channelTitle?: string | null;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
};

const LIVE_INTEGRATIONS: Array<{
  provider: IntegrationProvider;
  name: string;
  detail: string;
  Icon: typeof Video;
  accent: string;
  bg: string;
  border: string;
}> = [
  {
    provider: 'youtube',
    name: 'YouTube',
    detail: 'Your channel uploads',
    Icon: Video,
    accent: 'text-rose-600 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-100 dark:border-rose-400/20',
  },
];

const FEATURE_STRIP_ITEMS = [
  {
    title: 'Smart imports',
    description: 'Local files, URLs, and app integrations.',
    Icon: Globe2,
  },
  {
    title: 'Speaker controls',
    description: 'Set names, roles, and expected counts.',
    Icon: Users,
  },
  {
    title: 'Always saved',
    description: 'Your upload history is always available.',
    Icon: Clock,
  },
];

const HELPFUL_TIPS = [
  {
    title: 'Speaker count',
    description: 'Set or auto-detect the number of speakers for best accuracy.',
    Icon: Users,
  },
  {
    title: 'Naming',
    description: 'Use clear names, e.g. "Interviewer" with {{Name}}, to help AI identify speakers automatically.',
    Icon: Pencil,
  },
  {
    title: 'Audio quality',
    description: 'Keep speakers close to mics and minimize background noise for best results.',
    Icon: Mic,
  },
  {
    title: 'Clear turn-taking',
    description: 'Avoid overlapping speech to improve speaker separation.',
    Icon: MoreHorizontal,
  },
  {
    title: 'File size & length',
    description: 'Files up to 500 MB. Longer recordings may take more time to process.',
    Icon: Clock,
  },
];

const ANALYSIS_MODULE_ICONS: Record<keyof AnalysisOptions, typeof Users> = {
  namedSpeakers: Users,
  summary: FileText,
  insights: Lightbulb,
  chapters: List,
  takeaways: Star,
  quotes: Quote,
};

interface UploadHistory {
  id: string;
  title: string;
  audio_file_name: string;
  audio_file_size: number;
  audio_duration: number;
  audio_expires_at?: string | null;
  audio_deleted_at?: string | null;
  status: string;
  created_at: string;
  processing_completed_at?: string;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // Fall back to generic copy.
  }
  return fallback;
}

function formatAnalysisSummary(options: AnalysisOptions): string {
  const selected = getSelectedAnalysisKeys(options);
  if (selected.length === 0) {
    return 'Transcript only';
  }

  return selected
    .map((key) => ANALYSIS_OPTION_CONFIG.find((option) => option.key === key)?.label)
    .filter(Boolean)
    .join(' · ');
}

function UploadActivitySection({
  uploadedFiles,
  queuedFiles,
  selectedQueuedFileId,
  setSelectedQueuedFileId,
  removeFile,
  cancelUploadedFile,
  filteredActiveProjects,
  activeProjectsLoading,
  deleteActiveProject,
  formatFileSize,
}: {
  uploadedFiles: UploadedFile[];
  queuedFiles: UploadedFile[];
  selectedQueuedFileId: string | null;
  setSelectedQueuedFileId: (id: string) => void;
  removeFile: (id: string) => void;
  cancelUploadedFile: (uploadedFile: UploadedFile) => Promise<void>;
  filteredActiveProjects: Array<any>;
  activeProjectsLoading: boolean;
  deleteActiveProject: (projectId: string) => Promise<void>;
  formatFileSize: (bytes: number) => string;
}) {
  if (uploadedFiles.length === 0 && filteredActiveProjects.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Queued and processing files</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Upload activity appears here before the processing options so you can track progress without leaving the form.
          </p>
        </div>
        {queuedFiles.length > 1 && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-300">
            {queuedFiles.length} queued
          </span>
        )}
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          {uploadedFiles.map((uploadedFile) => {
            const isActive = ['queued', 'pending', 'extracting', 'uploading', 'processing'].includes(uploadedFile.status);
            const isProcessing = ['pending', 'extracting', 'uploading', 'processing'].includes(uploadedFile.status);
            const isSelectedQueued = uploadedFile.status === 'queued' && uploadedFile.id === selectedQueuedFileId;
            const displayName = uploadedFile.displayName || uploadedFile.file?.name || 'Untitled';
            const fileSize = uploadedFile.file?.size;
            const queuePosition = uploadedFile.status === 'queued'
              ? queuedFiles.findIndex(f => f.id === uploadedFile.id) + 1
              : 0;
            const queueTotal = queuedFiles.length;
            const showNamedSpeakersAutoFixNotice = Boolean(uploadedFile.namedSpeakersAutoFixed);

            return (
              <div
                key={uploadedFile.id}
                onClick={() => {
                  if (uploadedFile.status === 'queued') {
                    setSelectedQueuedFileId(uploadedFile.id);
                  }
                }}
                className={`rounded-lg border p-4 shadow-sm transition-colors ${
                  isSelectedQueued
                    ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200 dark:border-blue-700 dark:bg-blue-950/20 dark:ring-blue-900/50'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                } ${uploadedFile.status === 'queued' ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {uploadedFile.status === 'extracting' ? (
                      <FileVideo className="h-7 w-7 text-purple-500 animate-pulse" />
                    ) : uploadedFile.status === 'queued' ? (
                      <Clock className="h-7 w-7 text-amber-400" />
                    ) : (
                      <FileAudio className="h-7 w-7 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate" title={displayName}>
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {typeof fileSize === 'number' && fileSize > 0
                        ? formatFileSize(fileSize)
                        : uploadedFile.sourceType === 'youtube'
                          ? 'YouTube import'
                          : uploadedFile.sourceType === 'direct'
                            ? 'URL import'
                            : 'Processing'}
                    </p>
                  </div>
                  {isProcessing ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void cancelUploadedFile(uploadedFile);
                      }}
                      className="flex-shrink-0 p-1 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 transition-colors"
                      title="Cancel upload"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(uploadedFile.id);
                      }}
                      className="flex-shrink-0 p-1 rounded text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={uploadedFile.status === 'queued' ? 'Remove from queue' : 'Remove file'}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-2 ml-10 flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-2 flex-wrap">
                    {uploadedFile.status === 'queued' && (
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium">
                          {queueTotal > 1 ? `Queued (${queuePosition} of ${queueTotal})` : 'Queued'}
                        </span>
                        {isSelectedQueued && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium dark:bg-blue-900/20 dark:text-blue-300">
                            Editing
                          </span>
                        )}
                      </div>
                    )}
                    {uploadedFile.status === 'pending' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">Starting…</span>
                    )}
                    {uploadedFile.status === 'extracting' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">Extracting audio</span>
                    )}
                    {uploadedFile.status === 'uploading' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">Uploading</span>
                    )}
                    {uploadedFile.status === 'processing' && uploadedFile.processingStage && (
                      <>
                        {uploadedFile.processingStage === 'transcribing' && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">Transcribing</span>
                        )}
                        {(['diarization', 'name_extraction'] as ProcessingStage[]).includes(uploadedFile.processingStage) && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">Analyzing speakers</span>
                        )}
                        {(['summary', 'role_classification', 'chapters', 'takeaways', 'quotes', 'finalizing'] as ProcessingStage[]).includes(uploadedFile.processingStage) && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">Generating insights</span>
                        )}
                        {!(['transcribing', 'diarization', 'name_extraction', 'summary', 'role_classification', 'chapters', 'takeaways', 'quotes', 'finalizing'] as ProcessingStage[]).includes(uploadedFile.processingStage) && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">Processing</span>
                        )}
                      </>
                    )}
                    {uploadedFile.status === 'completed' && (
                      <div className="flex items-center space-x-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-medium hidden sm:inline">Complete</span>
                      </div>
                    )}
                    {uploadedFile.status === 'error' && (
                      <div className="flex items-center space-x-1">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-300 font-medium hidden sm:inline">Error</span>
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700/70 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded">
                    {formatAnalysisSummary(uploadedFile.analysisOptions)}
                  </span>

                  {uploadedFile.status === 'completed' && uploadedFile.projectId && (
                    <a
                      href={`/dashboard/projects?id=${uploadedFile.projectId}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex-shrink-0 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </a>
                  )}
                </div>

                {isActive && uploadedFile.status !== 'queued' && (
                  <>
                    <div className="mt-3">
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${uploadedFile.status === 'extracting' ? 'bg-purple-500' : 'bg-blue-600'}`}
                          style={{ width: `${uploadedFile.status === 'extracting' ? uploadedFile.extractionProgress : uploadedFile.progress}%` }}
                        />
                      </div>
                    </div>
                    {(uploadedFile.processingStage || uploadedFile.processingMessage) && (
                      <div className="mt-2 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          {uploadedFile.processingStage && (
                            <span className="font-medium text-slate-500 dark:text-slate-400">
                              {uploadedFile.status === 'extracting' ? 'Extracting audio' : getStageDisplayName(uploadedFile.processingTier, uploadedFile.processingStage)}
                            </span>
                          )}
                          <span className="font-semibold text-blue-400">
                            {Math.min(100, Math.max(0, Math.round(uploadedFile.status === 'extracting'
                              ? uploadedFile.extractionProgress || 0
                              : uploadedFile.progress)))}%
                          </span>
                        </div>
                        {uploadedFile.processingMessage && (
                          <span className="text-slate-400 dark:text-slate-500 sm:text-right">
                            {uploadedFile.status === 'extracting'
                              ? uploadedFile.processingMessage
                              : getUserFacingProcessingMessage(
                                  uploadedFile.processingTier,
                                  uploadedFile.processingStage || 'pending',
                                  uploadedFile.processingMessage
                                )}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}

                {uploadedFile.status === 'error' && uploadedFile.error && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-800/30 rounded-md">
                    <p className="text-xs text-red-300 break-words">{uploadedFile.error}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredActiveProjects.length > 0 && (
        <div className={uploadedFiles.length > 0 ? 'mt-5 border-t border-slate-200 pt-5 dark:border-slate-800' : ''}>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Processing projects</h4>
            {activeProjectsLoading && (
              <span className="text-xs text-slate-500">Refreshing...</span>
            )}
          </div>
          <div className="space-y-3">
            {filteredActiveProjects.map((project) => {
              const stage = project.processing_stage ||
                (project.status === 'uploading' ? 'uploading' : 'transcribing');
              const stageProgress = typeof project.processing_progress === 'number'
                ? project.processing_progress
                : 0;
              const tier = normalizeTier((project.performance_level as string) || 'content_kit');
              const progress = calculateOverallProgress(
                tier,
                stage as ProcessingStage,
                stageProgress
              );
              const message = getUserFacingProcessingMessage(
                tier,
                stage as ProcessingStage,
                project.processing_message
              );

              return (
                <div key={project.id} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {project.status === 'processing' ? (
                          <Loader2 className="h-8 w-8 text-yellow-500 animate-spin" />
                        ) : (
                          <FileAudio className="h-8 w-8 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate" title={project.title}>
                          {project.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {project.audio_file_size ? formatFileSize(project.audio_file_size) : 'Processing'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium">
                        {getStageDisplayName(normalizeTier((project.performance_level as string) || 'content_kit'), stage as ProcessingStage)}
                      </span>
                      {project.performance_level && (
                        <span className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700/70 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded">
                          {formatAnalysisSummary(normalizeAnalysisOptions(project.metadata?.analysis_options))}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-blue-400">
                        {progress}%
                      </span>
                      <a
                        href={`/dashboard/projects?id=${project.id}`}
                        className="p-1.5 text-blue-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="View project"
                      >
                        <Eye className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void deleteActiveProject(project.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                  </div>
                  {message && (
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const ANALYSIS_HELP_COPY: Record<keyof AnalysisOptions, { description: string; bestFor: string }> = {
  namedSpeakers: {
    description: 'Attempts to replace numbered speaker labels with real names and roles like host or guest.',
    bestFor: 'the recording clearly includes introductions or repeated speaker references',
  },
  summary: {
    description: 'Creates a quick overview of the recording so you can understand the main arc without rereading the full transcript.',
    bestFor: 'you want a fast recap before editing, publishing, or generating content',
  },
  insights: {
    description: 'Pulls out notable ideas, people, concepts, and useful context from the conversation.',
    bestFor: 'the episode teaches, argues, or references concepts you may want to reuse later',
  },
  chapters: {
    description: 'Breaks the recording into timestamped sections so the episode is easier to scan and navigate.',
    bestFor: 'long-form audio with clear topic changes or segments',
  },
  takeaways: {
    description: 'Extracts the strongest lessons, conclusions, or action points from the recording.',
    bestFor: 'you want the fastest way to see the practical value of the episode',
  },
  quotes: {
    description: 'Finds memorable lines worth highlighting, clipping, or turning into social content later.',
    bestFor: 'the recording includes strong phrasing, punchy opinions, or quotable moments',
  },
};

export default function UploadPage() {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>(DEFAULT_ANALYSIS_OPTIONS);
  const analysisOptionsRef = useRef<AnalysisOptions>(DEFAULT_ANALYSIS_OPTIONS);
  const [rosterSpeakers, setRosterSpeakers] = useState<RosterSpeaker[]>([]);
  const [speakerCount, setSpeakerCount] = useState<number | undefined>(undefined);
  const [recommendedSpeakerCount, setRecommendedSpeakerCount] = useState<number | undefined>(undefined);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(true);
  const [showHelpfulTips, setShowHelpfulTips] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<UploadMethodTab>('local');
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isUrlSubmitting, setIsUrlSubmitting] = useState(false);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [integrationStatuses, setIntegrationStatuses] = useState<IntegrationProviderStatus[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  const [youtubeUploads, setYouTubeUploads] = useState<YouTubeUploadItem[]>([]);
  const [youtubeUploadsLoading, setYouTubeUploadsLoading] = useState(false);
  const [youtubeUploadsError, setYouTubeUploadsError] = useState<string | null>(null);
  const [youtubeImportingVideoId, setYoutubeImportingVideoId] = useState<string | null>(null);
  const [selectedQueuedFileId, setSelectedQueuedFileId] = useState<string | null>(null);
  const lastActiveProjectCountRef = useRef<number | null>(null);
  const forceNamedSpeakersForRoster = useCallback((options: AnalysisOptions, roster: RosterSpeaker[] | QueuedRosterSpeaker[] | undefined | null): AnalysisOptions => {
    if (!roster || roster.length === 0) return options;
    if (options.namedSpeakers) return options;
    return { ...options, namedSpeakers: true };
  }, []);

  // Fix: drag counter prevents isDragActive flickering when cursor passes over child elements
  const dragCounterRef = useRef(0);

  const { user, session } = useAuth();
  const { organizationId } = useCurrentOrganization();
  const {
    uploadedFiles,
    setUploadedFiles,
    isStartingQueuedUploads,
    startQueuedUploads,
    removeFile,
    cancelUploadedFile,
    deleteActiveProject,
    trackProcessingEntry,
  } = useUploadProgressSync();
  const {
    activeProjects,
    isLoading: activeProjectsLoading,
    refresh: refreshActiveProjects,
  } = useActiveProcessingProjects(user?.id, 10, {
    pollingEnabled: false,
    pollIntervalMs: 5000,
  });
  const processingTier = useMemo(() => getProcessingTierForAnalysis(analysisOptions), [analysisOptions]);
  const queuedFiles = useMemo(
    () => uploadedFiles.filter((file) => file.status === 'queued'),
    [uploadedFiles]
  );
  const selectedQueuedFile = useMemo(
    () => queuedFiles.find((file) => file.id === selectedQueuedFileId) || null,
    [queuedFiles, selectedQueuedFileId]
  );
  const selectedAnalysisSummary = useMemo(
    () => formatAnalysisSummary(selectedQueuedFile?.analysisOptions || analysisOptions),
    [analysisOptions, selectedQueuedFile]
  );
  const selectedQueuedRosterConflict = Boolean(
    selectedQueuedFile &&
    (selectedQueuedFile.rosterSpeakers?.length || 0) > 0 &&
    normalizeAnalysisOptions(selectedQueuedFile.analysisOptions).namedSpeakers === false
  );
  // Heuristic to estimate speaker count from title
  const estimateSpeakerCountFromTitle = (filename: string): number | undefined => {
    const clean = filename.toLowerCase().replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    let count = 1;
    const withMatch = clean.match(/\b(?:with|feat\.?|featuring|guest|starring)\s+(.+)/i);
    if (withMatch) {
      const guestPart = withMatch[1];
      const separators = (guestPart.match(/(?:,|\s+and\s+|&)/g) || []).length;
      count += 1 + separators;
    } else {
      if (clean.includes('interview') || clean.includes('conversation') || clean.includes('chat') || clean.includes('debate')) {
        count = Math.max(count, 2);
      }
    }
    return count > 1 ? Math.min(count, 12) : undefined;
  };

  // Update recommendation when a new file is added
  useEffect(() => {
    const pendingFile = selectedQueuedFile || uploadedFiles.find(f => f.status === 'pending' || f.status === 'extracting');
    if (pendingFile?.file) {
      const estimated = estimateSpeakerCountFromTitle(pendingFile.file.name);
      setRecommendedSpeakerCount(estimated);
      // Auto-open advanced options to surface the recommendation
      if (estimated) setShowAdvancedOptions(true);
    } else {
      setRecommendedSpeakerCount(undefined);
    }
  }, [selectedQueuedFile, uploadedFiles]);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    if (mobileQuery.matches) {
      setShowHelpfulTips(false);
      setShowAdvancedOptions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedQueuedFile) {
      const normalizedSelectedOptions = normalizeAnalysisOptions(selectedQueuedFile.analysisOptions);
      const next = forceNamedSpeakersForRoster(
        normalizedSelectedOptions,
        selectedQueuedFile.rosterSpeakers || []
      );
      analysisOptionsRef.current = next;
      setAnalysisOptions(next);
      setSpeakerCount(selectedQueuedFile.speakerCount);
      setRosterSpeakers((selectedQueuedFile.rosterSpeakers || []) as RosterSpeaker[]);
      if (next.namedSpeakers !== normalizedSelectedOptions.namedSpeakers && selectedQueuedFile.status === 'queued') {
        setUploadedFiles((currentFiles) => currentFiles.map((file) => (
          file.id === selectedQueuedFile.id && file.status === 'queued'
            ? {
                ...file,
                analysisOptions: next,
                processingTier: getProcessingTierForAnalysis(next),
                namedSpeakersAutoFixed: true,
              }
            : file
        )));
      }
      return;
    }

    // Do not auto-select a queued file on page return/reload.
    // Selection should reflect explicit user intent to edit one queued item.
    setSelectedQueuedFileId((current) => {
      if (current && queuedFiles.some((file) => file.id === current)) return current;
      return null;
    });

    // Reset form-side state when no queued file is selected so stale "editing"
    // values are not shown as if tied to a specific queue item.
    const fallbackOptions = normalizeAnalysisOptions(DEFAULT_ANALYSIS_OPTIONS);
    analysisOptionsRef.current = fallbackOptions;
    setAnalysisOptions(fallbackOptions);
    setSpeakerCount(undefined);
    setRosterSpeakers([]);
  }, [queuedFiles, selectedQueuedFile, forceNamedSpeakersForRoster, setUploadedFiles]);

  const updateAnalysisOptionsForCurrentContext = useCallback((nextOptions: AnalysisOptions) => {
    const next = forceNamedSpeakersForRoster(normalizeAnalysisOptions(nextOptions), rosterSpeakers);
    analysisOptionsRef.current = next;
    setAnalysisOptions(next);
    if (selectedQueuedFileId) {
      setUploadedFiles((currentFiles) => currentFiles.map((file) => (
        file.id === selectedQueuedFileId && file.status === 'queued'
          ? {
              ...file,
              analysisOptions: next,
              processingTier: getProcessingTierForAnalysis(next),
            }
          : file
      )));
    }
  }, [forceNamedSpeakersForRoster, rosterSpeakers, selectedQueuedFileId, setUploadedFiles]);

  const handleAnalysisOptionToggle = (key: keyof AnalysisOptions) => {
    if (key === 'namedSpeakers' && rosterSpeakers.length > 0 && analysisOptions.namedSpeakers) {
      return;
    }
    updateAnalysisOptionsForCurrentContext({ ...analysisOptions, [key]: !analysisOptions[key] });
  };

  const handleSelectAllAnalysis = () => {
    updateAnalysisOptionsForCurrentContext({
      namedSpeakers: true,
      summary: true,
      insights: true,
      chapters: true,
      takeaways: true,
      quotes: true,
    });
  };

  const handleClearAnalysis = () => {
    updateAnalysisOptionsForCurrentContext({ ...DEFAULT_ANALYSIS_OPTIONS });
  };

  const updateSelectedQueuedFileAdvanced = useCallback((updates: Partial<Pick<UploadedFile, 'speakerCount' | 'rosterSpeakers'>>) => {
    if (!selectedQueuedFileId) return;
    setUploadedFiles((currentFiles) => currentFiles.map((file) => (
      file.id === selectedQueuedFileId && file.status === 'queued'
        ? {
            ...file,
            ...updates,
          }
        : file
    )));
  }, [selectedQueuedFileId, setUploadedFiles]);

  const dismissSpeakerCountNudgeForSelected = useCallback(() => {
    if (!selectedQueuedFileId) return;
    setUploadedFiles((currentFiles) => currentFiles.map((file) => (
      file.id === selectedQueuedFileId && file.status === 'queued'
        ? {
            ...file,
            speakerCountNudgeDismissed: true,
          }
        : file
    )));
  }, [selectedQueuedFileId, setUploadedFiles]);

  const applyRosterToQueuedFile = useCallback((targetFileId: string) => {
    const rosterToApply = rosterSpeakers as QueuedRosterSpeaker[];
    if (!targetFileId || rosterToApply.length === 0) return 0;
    let appliedCount = 0;
    setUploadedFiles((currentFiles) => currentFiles.map((file) => {
      if (file.id !== targetFileId || file.status !== 'queued') return file;
      appliedCount += 1;
      const nextAnalysis = forceNamedSpeakersForRoster(normalizeAnalysisOptions(file.analysisOptions), rosterToApply);
      return {
        ...file,
        rosterSpeakers: rosterToApply,
        analysisOptions: nextAnalysis,
        processingTier: getProcessingTierForAnalysis(nextAnalysis),
        namedSpeakersAutoFixed: true,
      };
    }));
    return appliedCount;
  }, [forceNamedSpeakersForRoster, rosterSpeakers, setUploadedFiles]);

  const applyRosterToAllQueuedFiles = useCallback(() => {
    const rosterToApply = rosterSpeakers as QueuedRosterSpeaker[];
    if (rosterToApply.length === 0) return;
    let appliedCount = 0;
    setUploadedFiles((currentFiles) => currentFiles.map((file) => {
      if (file.status !== 'queued') return file;
      appliedCount += 1;
      const nextAnalysis = forceNamedSpeakersForRoster(normalizeAnalysisOptions(file.analysisOptions), rosterToApply);
      return {
        ...file,
        rosterSpeakers: rosterToApply,
        analysisOptions: nextAnalysis,
        processingTier: getProcessingTierForAnalysis(nextAnalysis),
        namedSpeakersAutoFixed: true,
      };
    }));
    if (appliedCount > 0) {
      toast.success(`Applied roster to ${appliedCount} queued file${appliedCount === 1 ? '' : 's'}.`);
    }
  }, [forceNamedSpeakersForRoster, rosterSpeakers, setUploadedFiles]);

  const handleStartQueuedUploads = useCallback(() => {
    let autoFixedCount = 0;
    setUploadedFiles((currentFiles) => currentFiles.map((file) => {
      if (file.status !== 'queued') return file;
      const hasRoster = (file.rosterSpeakers?.length || 0) > 0;
      const namedSpeakersOn = normalizeAnalysisOptions(file.analysisOptions).namedSpeakers;
      if (!hasRoster || namedSpeakersOn) {
        return file;
      }
      autoFixedCount += 1;
      const nextAnalysis = forceNamedSpeakersForRoster(normalizeAnalysisOptions(file.analysisOptions), file.rosterSpeakers);
      return {
        ...file,
        analysisOptions: nextAnalysis,
        processingTier: getProcessingTierForAnalysis(nextAnalysis),
        namedSpeakersAutoFixed: true,
      };
    }));
    if (autoFixedCount > 0) {
      toast.message(`Auto-fixed ${autoFixedCount} queued file${autoFixedCount === 1 ? '' : 's'}: enabled Named Speakers for rostered uploads.`);
    }
    startQueuedUploads();
  }, [forceNamedSpeakersForRoster, setUploadedFiles, startQueuedUploads]);

  useEffect(() => {
    if (user) {
      setHistoryPage(1);
      fetchUploadHistory(1);
      refreshActiveProjects();
    }
  }, [organizationId, user, session?.access_token]);

  const fetchUploadHistory = async (page = historyPage) => {
    try {
      if (!session?.access_token) return;
      setHistoryLoading(true);
      const response = await fetch(withOrganizationId(`/api/dashboard/upload-history?page=${page}&limit=${HISTORY_PAGE_SIZE}`, organizationId), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load upload history' }));
        throw new Error(payload.error || 'Failed to load upload history');
      }

      const payload = await response.json() as {
        items?: UploadHistory[];
        total?: number;
        totalPages?: number;
      };

      const total = payload.total ?? 0;
      const totalPages = payload.totalPages ?? Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
      if (page > totalPages && totalPages > 0) {
        setHistoryPage(totalPages);
        await fetchUploadHistory(totalPages);
        return;
      }

      setHistoryTotalCount(total);
      setHistoryTotalPages(totalPages);
      setUploadHistory((payload.items || []).filter(item => item.status === 'completed' || item.status === 'failed'));
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const activeCount = activeProjects.length;
    const previousCount = lastActiveProjectCountRef.current;
    if (activeCount === 0 && previousCount && previousCount > 0) {
      fetchUploadHistory();
    }
    lastActiveProjectCountRef.current = activeCount;
  }, [activeProjects.length]);

  const getAccessToken = useCallback(async () => {
    if (session?.access_token) {
      return session.access_token;
    }

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    return currentSession?.access_token ?? null;
  }, [session?.access_token]);

  const getAuthHeaders = useCallback(async (contentType: 'json' | 'none' = 'none') => {
    const accessToken = await getAccessToken();
    return {
      ...(contentType === 'json' ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
  }, [getAccessToken]);

  const fetchIntegrationStatuses = useCallback(async () => {
    if (!session?.access_token) return;
    setIntegrationsLoading(true);
    setIntegrationsError(null);
    try {
      const response = await fetch('/api/integrations/providers', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to load integrations'));
      }

      const payload = await response.json() as { providers?: IntegrationProviderStatus[] };
      setIntegrationStatuses(payload.providers || []);
    } catch (error) {
      setIntegrationsError(error instanceof Error ? error.message : 'Failed to load integrations');
    } finally {
      setIntegrationsLoading(false);
    }
  }, [session?.access_token]);

  const handleConnectIntegration = useCallback(async (provider: IntegrationProvider) => {
    setConnectingProvider(provider);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/integrations/${provider}/start?mode=json`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, `Unable to connect ${provider} right now.`));
      }

      const payload = await response.json() as { url?: string };
      if (!payload.url) throw new Error('Missing OAuth redirect URL');
      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start integration connection');
      setConnectingProvider(null);
    }
  }, [getAuthHeaders]);

  const fetchYouTubeUploads = useCallback(async () => {
    if (!session?.access_token) return;
    setYouTubeUploadsLoading(true);
    setYouTubeUploadsError(null);
    try {
      const response = await fetch('/api/integrations/youtube/uploads?limit=20', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to load YouTube uploads'));
      }
      const payload = await response.json() as { uploads?: YouTubeUploadItem[] };
      setYouTubeUploads(payload.uploads || []);
    } catch (error) {
      setYouTubeUploadsError(error instanceof Error ? error.message : 'Failed to load YouTube uploads');
    } finally {
      setYouTubeUploadsLoading(false);
    }
  }, [session?.access_token]);

  const queueYouTubeImport = useCallback((upload: YouTubeUploadItem) => {
    const itemId = `youtube-${upload.videoId}`;
    setUploadedFiles((prev) => {
      if (prev.some((file) => file.id === itemId || file.importPayload?.videoId === upload.videoId)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: itemId,
          status: 'queued',
          progress: 0,
          processingStage: 'pending',
          stageProgress: 0,
          processingMessage: 'Ready to import...',
          processingTier,
          analysisOptions,
          displayName: upload.title || 'YouTube upload',
          sourceType: 'youtube',
          importPayload: {
            videoId: upload.videoId,
            estimatedDurationSeconds: upload.durationSeconds || undefined,
          },
          estimatedDurationSeconds: upload.durationSeconds || undefined,
        }
      ];
    });
    setSelectedQueuedFileId((current) => current || itemId);
    startQueuedUploads();
  }, [analysisOptions, processingTier, setUploadedFiles, startQueuedUploads]);

  const handleImportYouTubeUpload = useCallback(async (upload: YouTubeUploadItem) => {
    setYoutubeImportingVideoId(upload.videoId);
    try {
      queueYouTubeImport(upload);
      toast.success('YouTube upload added to queue.');
    } finally {
      setYoutubeImportingVideoId(null);
    }
  }, [queueYouTubeImport]);

  useEffect(() => {
    if (activeTab !== 'integrations') return;
    void fetchIntegrationStatuses();
  }, [activeTab, fetchIntegrationStatuses]);

  useEffect(() => {
    if (activeTab !== 'integrations') return;
    const youtubeConnected = integrationStatuses.some((item) => item.provider === 'youtube' && item.connected);
    if (youtubeConnected) {
      void fetchYouTubeUploads();
    } else {
      setYouTubeUploads([]);
      setYouTubeUploadsError(null);
    }
  }, [activeTab, fetchYouTubeUploads, integrationStatuses]);

  const cancelUploadOnServer = async (projectId: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/projects/${projectId}/cancel`, {
      method: 'POST',
      headers,
    });

    // 409 means the project already completed or failed — treat as a no-op
    if (response.status === 409) return;

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Failed to cancel upload' }));
      throw new Error(data.error || 'Failed to cancel upload');
    }
  };

  const deleteProjectById = async (projectId: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Failed to delete project' }));
      throw new Error(data.error || 'Failed to delete project');
    }
  };

  const deleteHistoryItem = async (projectId: string) => {
    if (!user?.id) return;

    try {
      await deleteProjectById(projectId);
      emitProjectMutation({ projectId, action: 'deleted' });

      setConfirmDeleteId(null);
      await fetchUploadHistory(historyPage);
      await refreshActiveProjects();
    } catch (error) {
      console.error('Failed to delete upload:', error);
      setConfirmDeleteId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatUploadedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: 'Unknown date', time: '' };
    return {
      date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  };

  const getHistorySourceLabel = (item: UploadHistory) => {
    if (!item.audio_file_name) return 'Workspace source';
    return 'Local upload';
  };

  const getHistoryFileMeta = (item: UploadHistory) => {
    const parts: string[] = [];
    const extension = item.audio_file_name?.split('.').pop()?.toUpperCase();
    if (extension && extension.length <= 5) parts.push(`${extension} source`);
    if (item.audio_duration) parts.push(formatDuration(item.audio_duration));
    if (item.audio_file_size) parts.push(formatFileSize(item.audio_file_size));
    return parts.join(' · ') || 'Source material';
  };

  const getHistoryStatusClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-900/20 dark:text-emerald-300';
      case 'processing':
        return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-300';
      case 'failed':
        return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/30 dark:bg-red-900/20 dark:text-red-300';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        // Fix: Loader2 looks correct as a spinner; Clock does not
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      case 'extracting':
        return <FileVideo className="h-5 w-5 text-purple-500 animate-pulse" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <X className="h-5 w-5 text-slate-500" />;
      default:
        return <Clock className="h-5 w-5 text-slate-500" />;
    }
  };

  const handleHistoryPageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > historyTotalPages) return;
    setHistoryPage(nextPage);
    fetchUploadHistory(nextPage);
  };

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Fix: only deactivate when cursor truly leaves the zone (not just a child element)
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, []);

  const isYouTubeUrl = (value: string) => {
    const lower = value.toLowerCase();
    return lower.includes('youtube.com') || lower.includes('youtu.be');
  };

  const handleUrlImport = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError('Please enter a URL.');
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setUrlError('Please enter a valid URL.');
      return;
    }

    setUrlError(null);
    setIsUrlSubmitting(true);

    const enforcedAnalysisOptions = forceNamedSpeakersForRoster(
      normalizeAnalysisOptions(analysisOptions),
      rosterSpeakers
    );

    try {
      const accessToken = await getAccessToken();
      const res = await fetch('/api/upload/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          url: trimmed,
          title: urlTitle.trim() || undefined,
          analysisOptions: enforcedAnalysisOptions,
          speakerCount,
          rosterSpeakers
        })
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'URL import failed.'));
      }

      const result = await res.json();
      const displayName = result.title || urlTitle.trim() || trimmed;
      const sourceType: UploadedFile['sourceType'] = isYouTubeUrl(trimmed) ? 'youtube' : 'direct';

      const newEntry: UploadedFile = {
        id: Math.random().toString(36).substr(2, 9),
        status: 'processing',
        progress: 0,
        processingStage: 'transcribing',
        stageProgress: 0,
        processingMessage: 'Preparing your audio for processing...',
        processingTier,
        analysisOptions: enforcedAnalysisOptions,
        displayName,
        sourceUrl: trimmed,
        sourceType,
        projectId: result.projectId
      };

      trackProcessingEntry(newEntry, result.projectId, processingTier);
      setUrlInput('');
      setUrlTitle('');
      await refreshActiveProjects();
      await fetchUploadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'We could not import that URL. Check the link and try again.';
      setUrlError(message);
    } finally {
      setIsUrlSubmitting(false);
    }
  };

  const handleFiles = (files: File[]) => {
    const selectedAnalysisOptions = forceNamedSpeakersForRoster(
      normalizeAnalysisOptions(analysisOptionsRef.current),
      rosterSpeakers
    );
    const selectedProcessingTier = getProcessingTierForAnalysis(selectedAnalysisOptions);

    const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'];
    const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi'];

    // Classify by extension first (authoritative), then fall back to MIME type.
    // This prevents M4A files (which some browsers report as video/mp4) from
    // being treated as video and going through unnecessary audio extraction.
    const audioFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      if (AUDIO_EXTENSIONS.some(ext => name.endsWith(ext))) return true;
      if (VIDEO_EXTENSIONS.some(ext => name.endsWith(ext))) return false;
      return file.type.startsWith('audio/');
    });

    const videoFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      if (AUDIO_EXTENSIONS.some(ext => name.endsWith(ext))) return false;
      if (VIDEO_EXTENSIONS.some(ext => name.endsWith(ext))) return true;
      return file.type.startsWith('video/');
    });

    const maxSize = 500 * 1024 * 1024; // 500MB
    const acceptedFiles = new Set([...audioFiles, ...videoFiles]);
    const unsupportedFiles = files.filter(file => !acceptedFiles.has(file));
    const oversizedFiles = [...audioFiles, ...videoFiles].filter(file => file.size > maxSize);
    const validAudioFiles = audioFiles.filter(file => file.size <= maxSize);
    const validVideoFiles = videoFiles.filter(file => file.size <= maxSize);

    const unsupportedEntries: UploadedFile[] = unsupportedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'error' as const,
      progress: 0,
      processingStage: 'failed' as ProcessingStage,
      stageProgress: 0,
      processingMessage: 'Unsupported file type',
      error: 'Unsupported file type. Upload MP3, WAV, M4A, FLAC, OGG, WEBM, MP4, MOV, MKV, or AVI.',
      processingTier: selectedProcessingTier,
      analysisOptions: selectedAnalysisOptions,
      displayName: file.name,
      sourceType: 'local',
    }));

    // Build error entries for oversized files (inline error instead of alert())
    const oversizedEntries: UploadedFile[] = oversizedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'error' as const,
      progress: 0,
      processingStage: 'failed' as ProcessingStage,
      stageProgress: 0,
      processingMessage: 'File too large',
      error: `File exceeds the 500 MB limit (${formatFileSize(file.size)}). Please compress or trim the audio first.`,
      processingTier: selectedProcessingTier,
      analysisOptions: selectedAnalysisOptions,
      displayName: file.name,
      sourceType: 'local',
    }));

    const newFiles: UploadedFile[] = [
      ...unsupportedEntries,
      ...oversizedEntries,
      ...validAudioFiles.map((file): UploadedFile => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        status: 'queued' as const,
        progress: 0,
        processingStage: 'pending' as ProcessingStage,
        stageProgress: 0,
        processingMessage: 'Ready to process...',
        processingTier: selectedProcessingTier,
        analysisOptions: selectedAnalysisOptions,
        displayName: file.name,
        sourceType: 'local',
        speakerCount,
        rosterSpeakers: rosterSpeakers as QueuedRosterSpeaker[],
      })),
      ...validVideoFiles.map((file): UploadedFile => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        status: 'queued' as const,
        progress: 0,
        processingStage: 'pending' as ProcessingStage,
        stageProgress: 0,
        processingMessage: 'Ready to process...',
        processingTier: selectedProcessingTier,
        analysisOptions: selectedAnalysisOptions,
        displayName: file.name,
        sourceType: 'local',
        speakerCount,
        rosterSpeakers: rosterSpeakers as QueuedRosterSpeaker[],
      })),
    ];

    // Queue files — the useEffect queue processor will start them one at a time
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setSelectedQueuedFileId((current) => current || newFiles.find((file) => file.status === 'queued')?.id || null);
  };

  const uploadedProjectIds = new Set(
    uploadedFiles.map(f => f.projectId).filter(Boolean) as string[]
  );
  const localTitles = new Set(
    uploadedFiles
      .map(f => (f.displayName || f.file?.name || '').replace(/\.[^/.]+$/, '').toLowerCase())
      .filter(Boolean)
  );
  const filteredActiveProjects = activeProjects.filter(p => {
    if (uploadedProjectIds.has(p.id)) return false;
    if (p.title && localTitles.has(p.title.toLowerCase())) return false;
    return true;
  });
  const selectedAnalysisKeys = getSelectedAnalysisKeys(analysisOptions);
  const transcriptOnly = selectedAnalysisKeys.length === 0;
  const urlImportReady = urlInput.trim().length > 0;

  return (
    <DashboardPageShell
      maxWidth="full"
      contentClassName="max-w-[1480px]"
      className="bg-[#f7f9fd] text-[#07132d] dark:bg-slate-950 dark:text-slate-50"
    >
        <header className="mb-6 motion-safe:animate-fade-up">
          <p className="mb-2 text-xs font-bold uppercase text-blue-600 dark:text-blue-300">
            UPLOAD
          </p>
          <h1 className="font-serif text-4xl font-semibold leading-tight text-[#07132d] dark:text-white sm:text-5xl">
            Add Source Material
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Bring in a call, meeting, webinar, founder update, or podcast and turn it into accurate transcripts and content your team can use.
          </p>
        </header>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] motion-safe:animate-fade-up-200 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 text-sm md:grid-cols-3 md:divide-x md:divide-slate-200 md:dark:divide-slate-800">
            {FEATURE_STRIP_ITEMS.map(({ title, description, Icon }) => (
              <div key={title} className="flex items-center gap-4 md:px-6 md:first:pl-0 md:last:pr-0">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-slate-950 dark:text-slate-100">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="flex-1 min-w-0">
            {/* Upload methods */}
            <div className="mb-6">
              <div
                role="tablist"
                aria-label="Upload source"
                className="flex w-full items-center rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                {UPLOAD_METHOD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`upload-tab-${tab.id}`}
                    aria-selected={activeTab === tab.id}
                    aria-controls={`upload-panel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex-1 border-r border-slate-200 px-3 py-3 text-center text-sm font-semibold transition-colors last:border-r-0 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 ${
                      activeTab === tab.id
                        ? 'bg-blue-50 text-blue-700 shadow-[inset_0_-2px_0_#2563eb] dark:bg-blue-500/10 dark:text-blue-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    <span className="relative inline-flex items-center justify-center gap-1.5">
                      <span className="sm:hidden">{tab.label}</span>
                      <span className="hidden sm:inline">{tab.labelFull}</span>
                      {tab.soon && (
                        <span className={`h-1.5 w-1.5 rounded-full ${activeTab === tab.id ? 'bg-cyan-300' : 'bg-cyan-400'} motion-safe:animate-pulse`} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <DashboardPanel className="mb-6 overflow-hidden rounded-xl border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)] motion-safe:animate-fade-up-400 dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-5">
                {activeTab === 'local' && (
                  <div id="upload-panel-local" role="tabpanel" aria-labelledby="upload-tab-local" data-tour="upload-zone">
                    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Upload audio or video</h2>
                          <FeatureHelp
                            title="File upload"
                            description="Upload audio or video directly, then use the transcript and selected analysis outputs as source material for B2B content."
                            bestFor="local calls, meetings, demos, webinars, podcasts, or exported files already on your device"
                          />
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Drag & drop a file here, or browse from your device.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Transcript only</span>
                        <FeatureHelp
                          title="Transcript only"
                          description="When enabled, AudioRepurpose creates the transcript and speaker labels without generating analysis modules during upload."
                          bestFor="quick intake when you want to decide on summaries, quotes, chapters, and insights later"
                        />
                        <button
                          type="button"
                          role="switch"
                          aria-checked={transcriptOnly}
                          aria-label="Toggle transcript only mode"
                          onClick={transcriptOnly ? handleSelectAllAnalysis : handleClearAnalysis}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                            transcriptOnly ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${transcriptOnly ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-200 ${isDragActive
                          ? 'scale-[1.003] border-blue-500 bg-blue-50 shadow-inner dark:bg-blue-500/10'
                          : 'border-blue-300 bg-blue-50/40 hover:border-blue-500 hover:bg-blue-50/80 dark:border-blue-400/30 dark:bg-blue-500/10'
                        }`}
                      onDragEnter={onDragEnter}
                      onDragLeave={onDragLeave}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                    >
                      <label htmlFor="file-upload" className="flex min-h-48 cursor-pointer flex-col items-center justify-center px-6 py-10 text-center focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-900 sm:min-h-56">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 transition-colors dark:bg-blue-500/15 dark:text-blue-300">
                          <Upload className="h-6 w-6" />
                        </div>
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                          {isDragActive ? 'Drop to upload' : 'Drop audio or video here'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          or <span className="text-blue-600 hover:text-blue-500 font-medium">browse files</span>
                        </p>
                        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 text-center">
                          MP3, WAV, M4A, FLAC, OGG, MP4, MOV · up to 500 MB
                        </p>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          multiple
                          accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.ogg,.mp4,.mov,.mkv,.avi,.webm"
                          onChange={onFileInputChange}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add from</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600"
                          title="Zoom import is coming soon"
                        >
                          <Video className="h-4 w-4" />
                          Zoom
                        </button>
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600"
                          title="Google Drive import is coming soon"
                        >
                          <Cloud className="h-4 w-4" />
                          Google Drive
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('url')}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-px hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-blue-200"
                        >
                          <Link2 className="h-4 w-4" />
                          RSS / URL
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'url' && (
                  <div id="upload-panel-url" role="tabpanel" aria-labelledby="upload-tab-url" className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Import from a URL</h2>
                        <FeatureHelp
                          title="URL import"
                          description="Import hosted source material once, transcribe it, and use the finished project for analysis or content generation later."
                          bestFor="YouTube links or direct audio or video URLs you do not want to download manually"
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Paste a public audio, video, RSS, or transcript URL.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <div>
                        <label htmlFor="url-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Source URL
                        </label>
                        <input
                          id="url-input"
                          type="url"
                          placeholder="https://example.com/podcast-episode"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="url-title" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Title (optional)
                        </label>
                        <input
                          id="url-title"
                          type="text"
                          placeholder="Episode title"
                          value={urlTitle}
                          onChange={(e) => setUrlTitle(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-500"
                        />
                      </div>
                      {urlError && (
                        <div className="text-sm text-amber-700 dark:text-amber-300">{urlError}</div>
                      )}
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                        YouTube import is best effort for public videos. Some links may still be blocked by YouTube&apos;s anti-bot checks even if they open normally in a browser. If that happens, download the audio or video file and upload it directly instead.
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Supports public audio, video, podcast RSS feeds, and transcript links when available.
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Podcast RSS</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Webinar recording link</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">Public MP3 / MP4</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'integrations' && (
                  <div id="upload-panel-integrations" role="tabpanel" aria-labelledby="upload-tab-integrations" className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Import from integrations</h2>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Connect your account and import recordings without downloading files manually first.
                      </p>
                    </div>

                    <div className="mt-5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Live now</h3>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {LIVE_INTEGRATIONS.filter(({ provider }) => isIntegrationEnabled(provider)).map(({ provider, name, detail, Icon, accent, bg, border }) => {
                        const status = integrationStatuses.find((item) => item.provider === provider);
                        const connected = Boolean(status?.connected);
                        const loadingThis = connectingProvider === provider;
                        return (
                          <div
                            key={name}
                            className={`rounded-lg border ${border} ${bg} p-3`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/80 shadow-sm dark:bg-slate-900/80">
                                  <Icon className={`h-4 w-4 ${accent}`} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{name}</p>
                                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleConnectIntegration(provider)}
                                disabled={connected || loadingThis}
                                className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                              >
                                {connected ? 'Connected' : loadingThis ? 'Connecting...' : 'Connect'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {integrationsLoading && (
                      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Loading integration status...</p>
                    )}
                    {integrationsError && !integrationsLoading && (
                      <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{integrationsError}</p>
                    )}

                    {integrationStatuses.some((item) => item.provider === 'youtube' && item.connected) && (
                      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">YouTube uploads</h4>
                          <button
                            type="button"
                            onClick={() => void fetchYouTubeUploads()}
                            disabled={youtubeUploadsLoading}
                            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {youtubeUploadsLoading ? 'Refreshing...' : 'Refresh'}
                          </button>
                        </div>
                        {youtubeUploadsLoading && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">Loading uploads...</p>
                        )}
                        {youtubeUploadsError && !youtubeUploadsLoading && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">{youtubeUploadsError}</p>
                        )}
                        {!youtubeUploadsLoading && !youtubeUploadsError && youtubeUploads.length === 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">No public uploads found on this channel yet.</p>
                        )}
                        {!youtubeUploadsLoading && youtubeUploads.length > 0 && (
                          <div className="space-y-2">
                            {youtubeUploads.slice(0, 10).map((upload) => (
                              <div key={upload.videoId} className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                                {upload.thumbnailUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={upload.thumbnailUrl}
                                    alt={upload.title}
                                    className="h-12 w-20 rounded object-cover"
                                  />
                                ) : (
                                  <div className="h-12 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{upload.title}</p>
                                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                    {upload.channelTitle || 'YouTube'}{upload.durationSeconds ? ` · ${formatDuration(upload.durationSeconds)}` : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleImportYouTubeUpload(upload)}
                                  disabled={youtubeImportingVideoId === upload.videoId}
                                  className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  {youtubeImportingVideoId === upload.videoId ? 'Queueing...' : 'Import'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coming soon</h3>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {COMING_SOON_INTEGRATIONS.map(({ name, detail, Icon, accent, bg, border }) => (
                        <div
                          key={name}
                          className={`rounded-lg border ${border} ${bg} p-3`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/80 shadow-sm dark:bg-slate-900/80">
                              <Icon className={`h-4 w-4 ${accent}`} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{name}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <UploadActivitySection
                uploadedFiles={uploadedFiles}
                queuedFiles={queuedFiles}
                selectedQueuedFileId={selectedQueuedFileId}
                setSelectedQueuedFileId={setSelectedQueuedFileId}
                removeFile={removeFile}
                cancelUploadedFile={cancelUploadedFile}
                filteredActiveProjects={filteredActiveProjects}
                activeProjectsLoading={activeProjectsLoading}
                deleteActiveProject={deleteActiveProject}
                formatFileSize={formatFileSize}
              />
              <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Analysis modules</h2>
                      <FeatureHelp
                        title="Processing options"
                        description="These are optional analysis add-ons. Leave them all off if you only want the transcript now."
                        bestFor="choosing exactly which structured outputs should be generated during processing"
                      />
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Pick what to generate. You can change these later.
                    </p>
                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {selectedQueuedFile
                        ? `Editing queued file: ${selectedQueuedFile.displayName || selectedQueuedFile.file?.name || 'Untitled'}`
                        : 'These options become the default for your next queued upload or URL import.'}
                    </p>
                    {selectedQueuedRosterConflict && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        Conflict detected: this queued file has a roster but Named Speakers was off. It has been auto-fixed for upload.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {selectedAnalysisSummary}
                    </div>
                    <button type="button" onClick={handleSelectAllAnalysis} className="text-sm font-semibold text-blue-700 hover:text-blue-600 dark:text-blue-300">
                      Select all
                    </button>
                    <button type="button" onClick={handleClearAnalysis} className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                      Clear all
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                {ANALYSIS_OPTION_CONFIG.map((option) => {
                  const ModuleIcon = ANALYSIS_MODULE_ICONS[option.key];
                  const checked = analysisOptions[option.key];
                  const locked = option.key === 'namedSpeakers' && rosterSpeakers.length > 0 && checked;
                  return (
                    <label
                      key={option.key}
                      className={`group relative flex min-h-24 cursor-pointer gap-3 rounded-xl border p-4 transition-all hover:-translate-y-px focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-900 ${
                        checked
                          ? 'border-blue-500 bg-blue-50 shadow-sm dark:bg-blue-900/20'
                          : 'border-slate-200 bg-white hover:border-blue-200 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-400/30'
                      } ${locked ? 'cursor-not-allowed opacity-85' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => handleAnalysisOptionToggle(option.key)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                        <ModuleIcon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{option.description}</span>
                      </span>
                      <span className="absolute right-3 top-3">
                        <FeatureHelp
                          title={option.label}
                          description={ANALYSIS_HELP_COPY[option.key].description}
                          bestFor={ANALYSIS_HELP_COPY[option.key].bestFor}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    You can review and adjust these after upload.
                  </span>
                  <button
                    type="button"
                    onClick={activeTab === 'url' ? handleUrlImport : activeTab === 'local' ? handleStartQueuedUploads : undefined}
                    disabled={
                      activeTab === 'url'
                        ? isUrlSubmitting || !urlImportReady
                        : activeTab === 'integrations'
                          ? true
                        : queuedFiles.length === 0 || isStartingQueuedUploads
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:-translate-y-px hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {isStartingQueuedUploads || isUrlSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {activeTab === 'url'
                      ? (isUrlSubmitting ? 'Importing...' : 'Import URL')
                      : activeTab === 'integrations'
                        ? 'Manage in panel above'
                      : isStartingQueuedUploads
                        ? 'Starting...'
                        : queuedFiles.length === 1
                          ? 'Upload File'
                          : 'Upload Files'}
                  </button>
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel className="mt-8 overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm motion-safe:animate-fade-up-600 dark:border-slate-800 dark:bg-slate-900" data-tour="upload-history">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                    <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">Upload history</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Previous source material for this workspace appears here.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href="/dashboard/hub" className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10">
                    View all
                  </a>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed dark:border-slate-800 dark:text-slate-600"
                    title="Export is not available for upload history yet"
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    {showHistory ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {showHistory && (
                <>
                  {historyLoading ? (
                    <div className="p-5">
                      <div className="animate-pulse space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="grid gap-4 rounded-lg border border-slate-100 p-4 dark:border-slate-800 md:grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.7fr_0.9fr_0.6fr]">
                            <div className="h-10 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
                            <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
                            <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
                            <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
                            <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : uploadHistory.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <FileAudio className="mx-auto h-10 w-10 text-slate-400" />
                      <h3 className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">No uploads yet</h3>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                        Your uploaded source material will appear here once processing begins.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-[920px] w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                            <tr>
                              <th scope="col" className="px-5 py-3">File</th>
                              <th scope="col" className="px-4 py-3">Source</th>
                              <th scope="col" className="px-4 py-3">Uploaded</th>
                              <th scope="col" className="px-4 py-3">Status</th>
                              <th scope="col" className="px-4 py-3">Modules</th>
                              <th scope="col" className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {uploadHistory.map((item) => {
                              const uploadedAt = formatUploadedAt(item.created_at);
                              return (
                                <tr key={item.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                  <td className="max-w-[320px] px-5 py-4">
                                    <div className="flex items-center gap-3">
                                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                                        {getStatusIcon(item.status)}
                                      </span>
                                      <div className="min-w-0">
                                        <a
                                          href={`/dashboard/projects?id=${item.id}`}
                                          className="block truncate font-semibold text-slate-950 hover:text-blue-700 dark:text-slate-50 dark:hover:text-blue-300"
                                          title={item.title}
                                        >
                                          {item.title}
                                        </a>
                                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                          {getHistoryFileMeta(item)}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                                    <span className="inline-flex items-center gap-2">
                                      <FileAudio className="h-4 w-4 text-slate-400" />
                                      {getHistorySourceLabel(item)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4">
                                    <p className="font-medium text-slate-700 dark:text-slate-200">{uploadedAt.date}</p>
                                    {uploadedAt.time && (
                                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{uploadedAt.time}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-4">
                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getHistoryStatusClass(item.status)}`}>
                                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4">
                                    {item.status === 'completed' ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                        <FileText className="h-3.5 w-3.5" />
                                        Transcript
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                        No outputs
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <a
                                        href={`/dashboard/projects?id=${item.id}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-blue-500/10"
                                        title="View project"
                                        aria-label={`View ${item.title}`}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </a>
                                      {confirmDeleteId === item.id ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => deleteHistoryItem(item.id)}
                                            className="rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                                          >
                                            Delete
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => item.status !== 'processing' && setConfirmDeleteId(item.id)}
                                          disabled={item.status === 'processing'}
                                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${item.status === 'processing'
                                              ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                                              : 'text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20'
                                            }`}
                                          title={item.status === 'processing' ? 'Cannot delete while processing' : 'Delete upload'}
                                          aria-label={`Delete ${item.title}`}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Upload history is saved for this workspace and will appear here.
                        </p>
                        {historyTotalPages > 1 && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Page {historyPage} of {historyTotalPages}
                              {historyTotalCount > 0 && (
                                <span className="ml-1">· {historyTotalCount} uploads</span>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleHistoryPageChange(historyPage - 1)}
                                disabled={historyPage <= 1}
                                className={`rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${historyPage <= 1
                                    ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-800 dark:text-slate-600'
                                    : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                                  }`}
                              >
                                Previous
                              </button>
                              <button
                                type="button"
                                onClick={() => handleHistoryPageChange(historyPage + 1)}
                                disabled={historyPage >= historyTotalPages}
                                className={`rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${historyPage >= historyTotalPages
                                    ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-800 dark:text-slate-600'
                                    : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                                  }`}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </DashboardPanel>

          </div>{/* end main column */}

          <div className="space-y-5 xl:sticky xl:top-6">
            <DashboardPanel className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowHelpfulTips(!showHelpfulTips)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800/60"
                aria-expanded={showHelpfulTips}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                  <span className="text-base font-semibold text-slate-950 dark:text-slate-50">Helpful tips</span>
                </span>
                {showHelpfulTips
                  ? <ChevronUp className="h-4 w-4 text-slate-500" />
                  : <ChevronDown className="h-4 w-4 text-slate-500" />
                }
              </button>
              {showHelpfulTips && (
                <div className="border-t border-slate-200 px-5 py-5 dark:border-slate-800">
                  <div className="space-y-5">
                    {HELPFUL_TIPS.map(({ title, description, Icon }) => (
                      <div key={title} className="flex gap-3">
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <a href="/dashboard/studio/profile" className="mt-5 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-600 dark:text-blue-300">
                    Open Studio Profile →
                  </a>
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" data-tour="advanced-options" data-expanded={showAdvancedOptions ? 'true' : 'false'}>
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="flex min-w-0 flex-1 items-center justify-between text-left transition-colors hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-slate-100"
                  data-tour="advanced-options-toggle"
                  aria-expanded={showAdvancedOptions}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-base font-semibold text-slate-950 dark:text-slate-50">Advanced options</span>
                    {(speakerCount || rosterSpeakers.length > 0) && (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300">
                        {[
                          speakerCount ? `${speakerCount} speakers` : null,
                          rosterSpeakers.length > 0 ? `${rosterSpeakers.length} roster` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {showAdvancedOptions
                    ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
                    : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                  }
                </button>
                <FeatureHelp
                  title="Advanced options"
                  description="Optional controls for edge cases like known speaker counts or custom speaker rosters. Most uploads do not need these."
                  bestFor="you already know something specific about the recording that should guide processing"
                  side="top"
                />
              </div>

              {showAdvancedOptions && (
                <div className="space-y-6 px-5 py-5">
                  <div>
                    <label htmlFor="speaker-count" className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Number of speakers
                    </label>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Let us know how many people are in your audio. Leave on auto-detect if unsure.
                    </p>
                    <select
                      id="speaker-count"
                      value={speakerCount ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const nextSpeakerCount = value === '' ? undefined : parseInt(value, 10);
                        setSpeakerCount(nextSpeakerCount);
                        updateSelectedQueuedFileAdvanced({ speakerCount: nextSpeakerCount });
                        if (selectedQueuedFileId && nextSpeakerCount) {
                          setUploadedFiles((currentFiles) => currentFiles.map((file) => (
                            file.id === selectedQueuedFileId && file.status === 'queued'
                              ? {
                                  ...file,
                                  speakerCountNudgeDismissed: true,
                                }
                              : file
                          )));
                        }
                      }}
                      className="mt-3 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <option value="">Auto-detect</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                        <option key={num} value={num}>{num} speaker{num === 1 ? '' : 's'}</option>
                      ))}
                    </select>
                    {recommendedSpeakerCount && !speakerCount && (
                      <button
                        type="button"
                        onClick={() => {
                          setSpeakerCount(recommendedSpeakerCount);
                          updateSelectedQueuedFileAdvanced({ speakerCount: recommendedSpeakerCount });
                        }}
                        className="mt-3 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300"
                      >
                        Use suggested: {recommendedSpeakerCount} from filename
                      </button>
                    )}
                    {rosterSpeakers.length >= 2 && !speakerCount && !selectedQueuedFile?.speakerCountNudgeDismissed && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-200">
                        <div className="flex items-center justify-between gap-2">
                          <span>Set expected speaker count? This reduces roster merge/split errors.</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const suggested = Math.min(12, Math.max(2, rosterSpeakers.length));
                                setSpeakerCount(suggested);
                                updateSelectedQueuedFileAdvanced({ speakerCount: suggested });
                                if (selectedQueuedFileId) {
                                  setUploadedFiles((currentFiles) => currentFiles.map((file) => (
                                    file.id === selectedQueuedFileId && file.status === 'queued'
                                      ? {
                                          ...file,
                                          speakerCountNudgeDismissed: true,
                                        }
                                      : file
                                  )));
                                }
                              }}
                              className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                            >
                              Use {Math.min(12, Math.max(2, rosterSpeakers.length))}
                            </button>
                            <button
                              type="button"
                              onClick={dismissSpeakerCountNudgeForSelected}
                              className="text-[11px] text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div data-tour="speaker-roster">
                    <p className="mb-3 flex items-center gap-1.5 text-xs leading-5 text-blue-700 dark:text-blue-300">
                      <Pencil className="h-3.5 w-3.5 shrink-0" />
                      <span>Pre-define names and roles to help the AI match voices to identities earlier.</span>
                    </p>
                    {rosterSpeakers.length > 0 && (
                      <p className="mb-3 text-xs text-blue-700 dark:text-blue-300">
                        Named Speakers stays on while a roster is set so your provided names are applied reliably.
                      </p>
                    )}
                    <SpeakerRosterForm
                      speakers={rosterSpeakers}
                      onChange={(nextRoster) => {
                        setRosterSpeakers(nextRoster);
                        updateSelectedQueuedFileAdvanced({ rosterSpeakers: nextRoster as QueuedRosterSpeaker[] });
                        const currentOptions = normalizeAnalysisOptions(analysisOptionsRef.current);
                        const enforcedOptions = forceNamedSpeakersForRoster(currentOptions, nextRoster);
                        if (enforcedOptions.namedSpeakers !== currentOptions.namedSpeakers) {
                          analysisOptionsRef.current = enforcedOptions;
                          setAnalysisOptions(enforcedOptions);
                          if (selectedQueuedFileId) {
                            setUploadedFiles((currentFiles) => currentFiles.map((file) => (
                              file.id === selectedQueuedFileId && file.status === 'queued'
                                ? {
                                    ...file,
                                    analysisOptions: enforcedOptions,
                                    processingTier: getProcessingTierForAnalysis(enforcedOptions),
                                    speakerCountNudgeDismissed: (nextRoster.length >= 2 && !file.speakerCount)
                                      ? false
                                      : file.speakerCountNudgeDismissed,
                                  }
                                : file
                            )));
                          }
                        }
                      }}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!selectedQueuedFileId || rosterSpeakers.length === 0}
                        onClick={() => {
                          if (!selectedQueuedFileId) return;
                          const applied = applyRosterToQueuedFile(selectedQueuedFileId);
                          if (applied > 0) {
                            toast.success('Applied roster to selected queued file.');
                          }
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Apply to selected
                      </button>
                      <button
                        type="button"
                        disabled={queuedFiles.length === 0 || rosterSpeakers.length === 0}
                        onClick={applyRosterToAllQueuedFiles}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Apply to all queued
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </DashboardPanel>
          </div>

        </div>{/* end flex layout */}

    </DashboardPageShell>
  );
}
