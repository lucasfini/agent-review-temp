"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Upload, FileAudio, X, AlertCircle, CheckCircle, Clock, History, Trash2, Eye, FileVideo, Loader2, ChevronDown, ChevronUp, Lightbulb, Users, Mic, Pencil, UserCircle, MoreHorizontal, Video, MessageSquare } from 'lucide-react';
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
    name: 'Teams',
    detail: 'Call recordings',
    Icon: Users,
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

  const handleAnalysisOptionToggle = (key: keyof AnalysisOptions) => {
    if (key === 'namedSpeakers' && rosterSpeakers.length > 0 && analysisOptions.namedSpeakers) {
      return;
    }
    setAnalysisOptions(prev => {
      const toggled = { ...prev, [key]: !prev[key] };
      const next = forceNamedSpeakersForRoster(toggled, rosterSpeakers);
      analysisOptionsRef.current = next;
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
      return next;
    });
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
    const oversizedFiles = audioFiles.filter(file => file.size > maxSize);
    const validAudioFiles = audioFiles.filter(file => file.size <= maxSize);

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
      ...videoFiles.map((file): UploadedFile => ({
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

  return (
    <div className="py-4 sm:py-6">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 md:px-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold leading-7 text-slate-900 dark:text-slate-50 sm:text-3xl">
            Add Source Material
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bring in a call, meeting, demo, webinar, founder update, or podcast. We&apos;ll handle transcription first, then your team can generate any of the 11 content types from the finished project.
          </p>
        </div>

        <div className="xl:flex xl:gap-8 xl:items-start">
          <div className="flex-1 min-w-0">
            {/* Upload methods */}
            <div className="mb-6">
              <div className="flex w-full items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {UPLOAD_METHOD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`${tab.soon ? 'relative flex-[0.62] sm:flex-[0.54] overflow-hidden' : 'flex-1'} px-2.5 py-1.5 text-sm font-medium rounded-md transition-all text-center ${activeTab === tab.id
                        ? tab.soon
                          ? 'bg-slate-900 text-white shadow dark:bg-white dark:text-slate-950'
                          : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow'
                        : tab.soon
                          ? 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white/80 dark:hover:bg-slate-800'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                  >
                    {tab.soon && (
                      <span className="pointer-events-none absolute inset-y-1 left-1 w-8 rounded bg-white/15 blur-sm motion-safe:animate-pulse" />
                    )}
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

            <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-5">
                {activeTab === 'local' && (
                  <div data-tour="upload-zone">
                    <div className="mb-4">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Upload audio or video</h2>
                        <FeatureHelp
                          title="File upload"
                          description="Upload audio or video directly, then use the transcript and selected analysis outputs as source material for B2B content."
                          bestFor="local calls, meetings, demos, webinars, podcasts, or exported files already on your device"
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Drag in a source file or browse from your device. Video is converted to audio automatically before transcription.
                      </p>
                    </div>
                    <div
                      className={`relative border-2 border-dashed rounded-xl transition-all ${isDragActive
                          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.005]'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      onDragEnter={onDragEnter}
                      onDragLeave={onDragLeave}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                    >
                      <label htmlFor="file-upload" className="flex flex-col items-center justify-center py-8 sm:py-14 px-6 cursor-pointer">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors ${isDragActive ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-100 dark:bg-slate-800'
                          }`}>
                          <Upload className={`w-6 h-6 transition-colors ${isDragActive ? 'text-blue-500' : 'text-slate-500'}`} />
                        </div>
                        <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
                          {isDragActive ? 'Drop to upload' : 'Drop audio or video here'}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          or <span className="text-blue-600 hover:text-blue-500 font-medium">browse files</span>
                        </p>
                        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 text-center">
                          MP3, WAV, M4A, FLAC, OGG, MP4, MOV · up to 500 MB · video is converted to audio automatically before transcription
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
                  </div>
                )}

                {activeTab === 'url' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Import from URL</h2>
                        <FeatureHelp
                          title="URL import"
                          description="Import hosted source material once, transcribe it, and use the finished project for analysis or content generation later."
                          bestFor="YouTube links or direct audio or video URLs you do not want to download manually"
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Paste a YouTube link or direct media URL, then transcribe once and generate whichever B2B outputs you need later.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <div>
                        <label htmlFor="url-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Media URL
                        </label>
                        <input
                          id="url-input"
                          type="url"
                          placeholder="https://www.youtube.com/watch?v=..."
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
                        Supports public YouTube videos and direct audio/video links. Direct file upload is the most reliable option for transcription and works with the same downstream content workflow.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'integrations' && (
                  <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
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
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Options</h2>
                      <FeatureHelp
                        title="Processing options"
                        description="These are optional analysis add-ons. Leave them all off if you only want the transcript now."
                        bestFor="choosing exactly which structured outputs should be generated during processing"
                      />
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Pick exactly what to generate during processing. Leave everything off if you just want the transcript now.
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
                  <div className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {selectedAnalysisSummary}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {ANALYSIS_OPTION_CONFIG.map((option) => (
                  <div key={option.key} className="relative">
                    <div className="absolute right-4 top-4 z-10">
                      <FeatureHelp
                        title={option.label}
                        description={ANALYSIS_HELP_COPY[option.key].description}
                        bestFor={ANALYSIS_HELP_COPY[option.key].bestFor}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAnalysisOptionToggle(option.key)}
                      disabled={option.key === 'namedSpeakers' && rosterSpeakers.length > 0 && analysisOptions.namedSpeakers}
                      className={`w-full rounded-xl border p-4 pr-10 text-left transition-colors ${
                        analysisOptions[option.key]
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
                      } ${(option.key === 'namedSpeakers' && rosterSpeakers.length > 0 && analysisOptions.namedSpeakers) ? 'cursor-not-allowed opacity-85' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${
                          analysisOptions[option.key]
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}>
                          {analysisOptions[option.key] ? <CheckCircle className="h-3.5 w-3.5" /> : null}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{option.label}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Transcription and numbered speaker labels are always included. You can generate any unselected analysis or content later from the project page.
                  </span>
                  <button
                    type="button"
                    onClick={activeTab === 'url' ? handleUrlImport : activeTab === 'local' ? handleStartQueuedUploads : undefined}
                    disabled={
                      activeTab === 'url'
                        ? isUrlSubmitting
                        : activeTab === 'integrations'
                          ? true
                        : queuedFiles.length === 0 || isStartingQueuedUploads
                    }
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
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
            </div>

            {/* Retention notice — quiet footnote, not a warning */}
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-600 text-center">
              Source media stays available until you delete the project. Transcripts and generated content stay with it.
            </p>

            {/* Advanced Options — collapsible, out of the critical path */}
            <div className="mb-8 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden" data-tour="advanced-options" data-expanded={showAdvancedOptions ? 'true' : 'false'}>
              <div className="flex items-center gap-2 bg-slate-100/80 px-4 py-3 dark:bg-slate-800/50">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="flex min-w-0 flex-1 items-center justify-between transition-colors text-left hover:text-slate-900 dark:hover:text-slate-100"
                  data-tour="advanced-options-toggle"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Advanced Options</span>
                    {(speakerCount || rosterSpeakers.length > 0) && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300">
                        {[
                          speakerCount ? `${speakerCount} speakers` : null,
                          rosterSpeakers.length > 0 ? `${rosterSpeakers.length} roster` : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  {showAdvancedOptions
                    ? <ChevronUp className="h-4 w-4 text-slate-500" />
                    : <ChevronDown className="h-4 w-4 text-slate-500" />
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
                <div className="px-4 py-5 space-y-6 bg-white dark:bg-slate-900">
                  {/* Expected Speaker Count */}
                  <div>
                    <label htmlFor="speaker-count" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Number of Speakers
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-2">
                      If you know how many speakers are in your audio, set it here (2–12). Leave on auto-detect if unsure.
                    </p>
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300">
                      <Users className="w-3 h-3 flex-shrink-0" />
                      <span>Crucial for debates: Specifying the exact count prevents the AI from merging distinct voices into a single speaker ID.</span>
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
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
                        className="block w-36 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200"
                      >
                        <option value="">Auto-detect</option>
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                          <option key={num} value={num}>{num} speakers</option>
                        ))}
                      </select>
                      {/* Recommendation chip — now properly inline with the select */}
                      {recommendedSpeakerCount && !speakerCount && (
                        <button
                          type="button"
                          onClick={() => {
                            setSpeakerCount(recommendedSpeakerCount);
                            updateSelectedQueuedFileAdvanced({ speakerCount: recommendedSpeakerCount });
                          }}
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                          Use suggested: {recommendedSpeakerCount} (from filename)
                        </button>
                      )}
                    </div>
                    {rosterSpeakers.length >= 2 && !speakerCount && !selectedQueuedFile?.speakerCountNudgeDismissed && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/30 dark:bg-amber-900/20 dark:text-amber-200">
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

                  {/* Speaker Roster */}
                  <div data-tour="speaker-roster">
                    <p className="text-xs text-blue-400/80 mb-3 flex items-center gap-1.5">
                      <Pencil className="w-3 h-3 flex-shrink-0" />
                      <span>Assigning names and roles here (e.g., Host, Guest) helps the AI match voices to identities from the very first second.</span>
                    </p>
                    {rosterSpeakers.length > 0 && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
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
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Apply roster to selected queued file
                      </button>
                      <button
                        type="button"
                        disabled={queuedFiles.length === 0 || rosterSpeakers.length === 0}
                        onClick={applyRosterToAllQueuedFiles}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Apply roster to all queued files
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Upload History */}
            <div className="mt-8" data-tour="upload-history">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <History className="h-5 w-5 text-slate-500" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Upload History</h3>
                </div>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-sm text-blue-600 hover:text-blue-400"
                >
                  {showHistory ? 'Hide' : 'Show'}
                </button>
              </div>

              {showHistory && (
                <div className="bg-white dark:bg-slate-900 shadow-sm rounded-lg border border-slate-200 dark:border-slate-700">
                  {historyLoading ? (
                    <div className="p-6">
                      <div className="animate-pulse space-y-4">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded"></div>
                            <div className="flex-1 space-y-2">
                              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : uploadHistory.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileAudio className="mx-auto h-10 w-10 text-slate-500" />
                      <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-50">No uploads yet</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Your upload history will appear here once you start uploading.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {uploadHistory.map((item) => (
                          <div key={item.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3 flex-1 min-w-0">
                                <div className="flex-shrink-0">
                                  {getStatusIcon(item.status)}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <h4
                                    className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate"
                                    title={item.title}
                                  >
                                    {item.title}
                                  </h4>
                                  <div className="mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                    <span>{formatFileSize(item.audio_file_size)}</span>
                                    {item.audio_duration && (
                                      <span>{formatDuration(item.audio_duration)}</span>
                                    )}
                                    <span className="hidden sm:inline">{new Date(item.created_at).toLocaleDateString()}</span>
                                  </div>
                                  {item.status === 'completed' && (
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {item.audio_deleted_at
                                        ? 'Source audio was deleted.'
                                        : 'Source audio is retained until the project is deleted.'}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                                <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' :
                                    item.status === 'processing' ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' :
                                      item.status === 'failed' ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
                                        'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300'
                                  }`}>
                                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                </span>

                                <a
                                  href={`/dashboard/projects?id=${item.id}`}
                                  className="p-1.5 text-blue-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                  title="View project"
                                >
                                  <Eye className="h-4 w-4" />
                                </a>

                                {/* Inline delete confirmation — replaces native confirm() dialog */}
                                {confirmDeleteId === item.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => deleteHistoryItem(item.id)}
                                      className="px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => item.status !== 'processing' && setConfirmDeleteId(item.id)}
                                    disabled={item.status === 'processing'}
                                    className={`p-1.5 rounded transition-colors ${item.status === 'processing'
                                        ? 'text-slate-400 dark:text-slate-300 cursor-not-allowed'
                                        : 'text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                      }`}
                                    title={item.status === 'processing' ? 'Cannot delete while processing' : 'Delete upload'}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {historyTotalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Page {historyPage} of {historyTotalPages}
                            {historyTotalCount > 0 && (
                              <span className="ml-1">· {historyTotalCount} uploads</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleHistoryPageChange(historyPage - 1)}
                              disabled={historyPage <= 1}
                              className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${historyPage <= 1
                                  ? 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHistoryPageChange(historyPage + 1)}
                              disabled={historyPage >= historyTotalPages}
                              className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${historyPage >= historyTotalPages
                                  ? 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

          </div>{/* end main column */}

          {/* Tips sidebar */}
          <div className="w-64 flex-shrink-0 sticky top-6 hidden xl:block">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-900/10">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Tips</span>
              </div>
              <div className="space-y-4">
                <div className="flex gap-2.5">
                  <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Speaker Count</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">5+ speakers? Setting the count manually drastically improves accuracy for panels.</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <Pencil className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Naming</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Filenames like &quot;Interview with [Name]&quot; help the AI identify guests automatically.</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <Mic className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Audio Quality</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Keep speakers close to mics and minimize background noise for best transcription.</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <UserCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Named Speaker Upgrade</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Turn on the Named speakers option when the conversation clearly introduces who is speaking. Otherwise, you still get clean numbered speakers.</p>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <MoreHorizontal className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Clear Turn-Taking</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Avoid talking over each other — overlapping speech reduces speaker separation accuracy.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>{/* end flex layout */}

      </div>
    </div>
  );
}
