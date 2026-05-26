"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle, AlertCircle, Eye, Download, RefreshCw, Trash2, Zap, MessageCircle, Sparkles, BookOpen, Lightbulb, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Loader2, CheckSquare, Square, ListChecks, X, PanelRightOpen, PanelRightClose, ScanSearch, MoreHorizontal, Users, Mic, Radio, User, HelpCircle, Copy, Pencil, BarChart2, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import ConfirmModal from '@/components/ui/confirm-modal';
import { useAuth } from '@/lib/auth/context';
import { supabase } from '@/lib/supabase/client';
import { useCoverageProgress } from '@/lib/context/coverage-progress';
import { DashboardLoadErrorState } from '@/components/dashboard/load-error-state';
import ExportModal, { type ExportPayload } from '@/components/ExportModal';
import { exportContent } from '@/lib/export-utils';
import ConversationView from '@/components/ConversationView';
import { AudioPlayer } from '@/components/AudioPlayer';
import { getSpeakerColor, getSpeakerDisplayName } from '@/lib/name-extraction';
import TeamsStyleTranscript from '@/components/TeamsStyleTranscript';
import ContextSidebar from '@/components/ContextSidebar';
import { CONTENT_TYPES, MAX_CUSTOM_GUIDANCE_LENGTH, normalizeCustomGuidance, type ContentBlock } from '@/lib/content-types';
import { DEFAULT_THEME_ID } from '@/lib/content-themes';
import type { AudioPlayerRef } from '@/lib/hooks/useSpeakerSample';
import { useProjectRefresh, useSpeakerDataRefresh } from '@/lib/hooks/useProjectRefresh';
import { emitProjectMutation } from '@/lib/project-events';
import { ANALYSIS_OPTION_CONFIG, getProjectAnalysisOptions, normalizeAnalysisOptions, type AnalysisOptionKey } from '@/lib/analysis-options';
import type { ProjectGenerationJob } from '@/lib/project-generation-jobs';
import { getDashboardErrorMessage, logDashboardLoad } from '@/lib/dashboard-load-state';
import {
  getReviewItemsFromSpeakerData,
  getReviewSegmentIndicesFromSpeakerData,
  getSpeakerAssignmentConfidencePercent,
  getSpeakerSuggestionsFromSpeakerData,
} from '@/lib/speaker-review';

type ProjectType = 'DEBATE' | 'INTERVIEW' | 'PODCAST' | 'MONOLOGUE' | 'OTHER';
type MobileStudioTab = 'projects' | 'conversation' | 'content';

interface Project {
  id: string;
  title: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  audio_duration?: number;
  audio_file_size?: number;
  audio_file_name?: string;
  audio_expires_at?: string | null;
  audio_deleted_at?: string | null;
  processing_time_seconds?: number;
  transcription_text?: string;
  selected_content_types?: string[];
  estimated_cost?: number;
  audio_duration_seconds?: number;
  transcription_segments?: string;
  speaker_data?: any;
  performance_level?: string;
  metadata?: any;
  project_type?: ProjectType;
  processing_stage?: string;
  ai_summary?: string;
  chapters?: Array<{
    title: string;
    start_time: number;
    end_time: number;
    description?: string;
  }>;
  key_takeaways?: Array<{
    takeaway: string;
    timestamp?: number;
  }>;
  social_quotes?: Array<{
    quote: string;
    speaker?: string;
    timestamp?: number;
    platform?: string;
  }>;
  insights?: Array<{
    id: string;
    entity_id: string;
    label: string;
    category: 'concept' | 'person' | 'tool';
    simple_definition?: string;
    full_explanation?: string;
    why_it_matters?: string;
    external_sources?: Array<{
      title: string;
      url: string;
      type?: string;
      description?: string;
    }>;
    transcript_excerpts?: Array<{ text?: string }>;
    person_profile?: {
      who_they_are?: string;
      current_work?: string;
      notable_background?: string;
      why_relevant?: string;
    };
  }>;
}

type ProjectListItem = Pick<
  Project,
  | 'id'
  | 'title'
  | 'status'
  | 'created_at'
  | 'audio_duration'
  | 'audio_file_size'
  | 'audio_file_name'
  | 'audio_expires_at'
  | 'audio_deleted_at'
  | 'processing_time_seconds'
  | 'selected_content_types'
  | 'estimated_cost'
  | 'audio_duration_seconds'
  | 'performance_level'
  | 'metadata'
  | 'project_type'
  | 'processing_stage'
>;

interface Output {
  id: string;
  type: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  metadata?: any;
}

const SPEAKER_BADGE_CLASSES: Record<string, string> = {
  blue: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-800/40',
  green: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/25 border border-green-300 dark:border-green-800/40',
  purple: 'text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-800/40',
  orange: 'text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/25 border border-orange-300 dark:border-orange-800/40',
  pink: 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/25 border border-rose-300 dark:border-rose-800/40',
  indigo: 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-800/40',
  slate: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/60',
};

const getSpeakerBadgeClasses = (speakerId: string) => {
  const colorClass = getSpeakerColor(speakerId);
  const match = colorClass.match(/text-([a-z]+)-/);
  const base = match?.[1] ?? 'slate';
  return SPEAKER_BADGE_CLASSES[base] ?? SPEAKER_BADGE_CLASSES.slate;
};

const isProjectAudioExpired = (project: Project | null): boolean => {
  if (!project) return false;
  return Boolean(project.audio_deleted_at);
};

type ContentGuidanceMap = Record<string, string>;

function getProjectContentGuidance(project?: { metadata?: any } | null): ContentGuidanceMap {
  const raw = project?.metadata?.content_generation_preferences?.guidance_by_type;
  if (!raw || typeof raw !== 'object') return {};

  const next: ContentGuidanceMap = {};
  for (const contentType of CONTENT_TYPES) {
    const value = normalizeCustomGuidance((raw as Record<string, unknown>)[contentType.id] as string | undefined);
    if (value) {
      next[contentType.id] = value;
    }
  }
  return next;
}

function mergeProjectContentGuidance(metadata: any, guidanceByType: ContentGuidanceMap) {
  const cleanedEntries = Object.entries(guidanceByType)
    .map(([contentTypeId, value]) => [contentTypeId, normalizeCustomGuidance(value)] as const)
    .filter(([, value]) => value.length > 0);

  const currentMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
  const currentPreferences = (
    currentMetadata.content_generation_preferences
    && typeof currentMetadata.content_generation_preferences === 'object'
  ) ? currentMetadata.content_generation_preferences : {};

  return {
    ...currentMetadata,
    content_generation_preferences: {
      ...currentPreferences,
      guidance_by_type: Object.fromEntries(cleanedEntries),
    },
  };
}

function getGenerationJobLabel(job: ProjectGenerationJob): string {
  if (job.kind === 'analysis') {
    return ANALYSIS_OPTION_CONFIG.find((option) => option.key === job.target_key)?.label || 'Analysis';
  }

  return CONTENT_TYPES.find((contentType) => contentType.id === job.target_key)?.name || 'Content';
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const selectedProjectRef = useRef<string | null>(null);

  // Audio player refs for speaker sample playback
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const audioPlayerRef = useRef<AudioPlayerRef | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectLoading, setSelectedProjectLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [generatingProjects, setGeneratingProjects] = useState<Set<string>>(new Set());
  const [generationJobs, setGenerationJobs] = useState<ProjectGenerationJob[]>([]);
  const [optimisticGeneratingAnalysisKeys, setOptimisticGeneratingAnalysisKeys] = useState<Set<AnalysisOptionKey>>(new Set());
  const [pendingContentTypeIds, setPendingContentTypeIds] = useState<Set<string>>(new Set());
  const [showFullTranscription, setShowFullTranscription] = useState(false);
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const [readerView, setReaderView] = useState(false);
  // Reader view follow-along state
  const [readerActiveIndex, setReaderActiveIndex] = useState<number | null>(null);
  const [readerAutoScrollPaused, setReaderAutoScrollPaused] = useState(false);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const isReaderScrollingRef = useRef(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [projectsSidebarOpen, setProjectsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name-asc' | 'name-desc'>('recent');
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [mobileStudioTab, setMobileStudioTab] = useState<MobileStudioTab>('projects');
  const [mobileConversationChromeCollapsed, setMobileConversationChromeCollapsed] = useState(false);

  // Insights control state
  const [insightsSidebarOpen, setInsightsSidebarOpen] = useState(false);
  const [insightsStatus, setInsightsStatus] = useState<{ count: number; loading: boolean; generating: boolean; refreshing: boolean }>({ count: 0, loading: true, generating: false, refreshing: false });
  const [triggerInsightGeneration, setTriggerInsightGeneration] = useState(0);
  const [triggerInsightRefresh, setTriggerInsightRefresh] = useState(0);
  const [insightsRefreshToken, setInsightsRefreshToken] = useState(0);
  const [insightsData, setInsightsData] = useState<Array<{
    id: string;
    title: string;
    category: 'concept' | 'person' | 'tool';
    definition: string;
    significance: string;
    sources: Array<{ title: string; url: string }>;
    matchText?: string;
    matchVariants?: string[];
  }>>([]);

  // Right sidebar (Context) state
  const [contextSidebarOpen, setContextSidebarOpen] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
  const isCenterWide = !projectsSidebarOpen && !contextSidebarOpen;

  // Export selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [pendingBulkDeleteProjects, setPendingBulkDeleteProjects] = useState(false);
  const [bulkDeletingProjects, setBulkDeletingProjects] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProjects, setExportProjects] = useState<Array<Project & { outputs: Output[] }>>([]);

  // Coverage analysis state
  const { runningCoverageIds, startCoverage, stopCoverage } = useCoverageProgress();

  // Audio URL state for speaker sample playback
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notifiedFailedJobIdsRef = useRef<Set<string>>(new Set());

  // Reconcile (pipeline healing) state
  const [isReconciling, setIsReconciling] = useState(false);

  // Project type filter
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectType>('all');

  // Project title inline rename
  const [editingProjectTitle, setEditingProjectTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Per-output delete tracking
  const [deletingOutput, setDeletingOutput] = useState<string | null>(null);
  const [contentGuidanceByType, setContentGuidanceByType] = useState<ContentGuidanceMap>({});
  const previousActiveJobCountRef = useRef(0);
  const previousGenerationJobStatusesRef = useRef<Map<string, string>>(new Map());
  const selectedProjectGenerationActiveRef = useRef(false);
  const selectedProjectArtifactsRefreshRef = useRef<Promise<void> | null>(null);
  const selectedProjectArtifactsRefreshQueuedRef = useRef(false);
  const contentGuidancePersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedContentGuidanceRef = useRef<string>('');
  const { user, session, isDemoMode } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedProjectId = searchParams.get('id');
  const selectedProjectAudioExpired = isProjectAudioExpired(selectedProject);
  const mobileRequestedProjectId = isMobileViewport ? requestedProjectId : null;
  const mobileHasProjectStage = Boolean(mobileRequestedProjectId || selectedProjectLoading || selectedProject);
  const showMobileList = isMobileViewport && mobileStudioTab === 'projects';
  const showMobileConversation = isMobileViewport && mobileStudioTab === 'conversation' && mobileHasProjectStage;
  const showMobileContent = isMobileViewport && mobileStudioTab === 'content' && mobileHasProjectStage;
  const showMainStage = !isMobileViewport || showMobileConversation;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const updateViewport = () => {
      setIsMobileViewport(mobileQuery.matches);
      setIsDesktopViewport(desktopQuery.matches);
    };

    updateViewport();
    mobileQuery.addEventListener('change', updateViewport);
    desktopQuery.addEventListener('change', updateViewport);

    return () => {
      mobileQuery.removeEventListener('change', updateViewport);
      desktopQuery.removeEventListener('change', updateViewport);
    };
  }, []);

  const activeGenerationJobs = useMemo(
    () => generationJobs.filter((job) => job.status === 'queued' || job.status === 'running'),
    [generationJobs]
  );
  const generatingContentTypes = useMemo(
    () => {
      const next = new Set(
        activeGenerationJobs
          .filter((job) => job.kind === 'content')
          .map((job) => job.target_key)
      );

      pendingContentTypeIds.forEach((contentTypeId) => next.add(contentTypeId));
      return next;
    },
    [activeGenerationJobs, pendingContentTypeIds]
  );
  const generatingAnalysisKeys = useMemo(
    () =>
      new Set(
        activeGenerationJobs
          .filter((job) => job.kind === 'analysis')
          .map((job) => job.target_key as AnalysisOptionKey)
      ),
    [activeGenerationJobs]
  );
  const uploadBackgroundAnalysisKeys = useMemo(() => {
    if (!selectedProject) return new Set<AnalysisOptionKey>();

    const options = getProjectAnalysisOptions(selectedProject);
    const aiProcessing = (selectedProject.speaker_data as any)?.detectionMetadata?.aiProcessing || {};
    const backgroundErrors = aiProcessing.backgroundErrors || {};
    const next = new Set<AnalysisOptionKey>();

    ANALYSIS_OPTION_CONFIG.forEach((option) => {
      if (!options[option.key]) return;
      if (isAnalysisOptionAvailable(selectedProject, option.key)) return;
      if (backgroundErrors[option.key]) return;
      if (aiProcessing[option.key] === false) {
        next.add(option.key);
      }
    });

    return next;
  }, [selectedProject]);
  const effectiveGeneratingAnalysisKeys = useMemo(
    () => new Set<AnalysisOptionKey>([
      ...generatingAnalysisKeys,
      ...optimisticGeneratingAnalysisKeys,
      ...uploadBackgroundAnalysisKeys,
    ]),
    [generatingAnalysisKeys, optimisticGeneratingAnalysisKeys, uploadBackgroundAnalysisKeys]
  );

  useEffect(() => {
    if (!selectedProject) return;

    setPendingContentTypeIds((prev) => {
      const next = new Set(prev);
      for (const contentTypeId of prev) {
        const hasOutput = outputs.some((output) => {
          const original = output.metadata?.originalOutputType;
          const mappedType =
            typeof original === 'string'
              ? {
                twitter_thread: 'twitter_threads',
                linkedin_post: 'linkedin_posts',
                instagram_caption: 'instagram_content',
                blog_post: 'blog_post',
                email_newsletter: 'newsletter',
                show_notes: 'show_notes',
                quote_graphic: 'quote_graphics',
                facebook_post: 'facebook_post',
                youtube_description: 'youtube_description',
                podcast_episode_description: 'podcast_episode_description',
                short_form_video_script: 'short_form_video_script',
              }[original]
              : undefined;
          const fallbackType =
            {
              twitter_thread: 'twitter_threads',
              linkedin_post: 'linkedin_posts',
              instagram_caption: 'instagram_content',
              blog_post: 'blog_post',
              email_newsletter: 'newsletter',
              show_notes: 'show_notes',
              quote_graphic: 'quote_graphics',
              facebook_post: 'facebook_post',
              youtube_description: 'youtube_description',
              podcast_episode_description: 'podcast_episode_description',
              short_form_video_script: 'short_form_video_script',
            }[output.type];
          return (mappedType || fallbackType) === contentTypeId;
        });

        const hasFailedJob = generationJobs.some(
          (job) => job.kind === 'content' && job.target_key === contentTypeId && job.status === 'failed'
        );

        if (hasOutput || hasFailedJob) {
          next.delete(contentTypeId);
        }
      }
      return next;
    });
  }, [selectedProject, outputs, generationJobs]);

  useEffect(() => {
    if (!selectedProject) return;

    setOptimisticGeneratingAnalysisKeys((prev) => {
      const next = new Set(prev);
      ANALYSIS_OPTION_CONFIG.forEach((option) => {
        const hasActiveJob = generatingAnalysisKeys.has(option.key);
        const isAvailable = isAnalysisOptionAvailable(selectedProject, option.key);
        const hasFailedJob = generationJobs.some(
          (job) => job.kind === 'analysis' && job.target_key === option.key && job.status === 'failed'
        );
        if (hasActiveJob || isAvailable || hasFailedJob) {
          next.delete(option.key);
        }
      });
      return next;
    });
  }, [selectedProject, generatingAnalysisKeys, generationJobs]);

  useEffect(() => {
    const nextGuidance = getProjectContentGuidance(selectedProject);
    setContentGuidanceByType(nextGuidance);
    lastPersistedContentGuidanceRef.current = JSON.stringify(nextGuidance);
  }, [selectedProject, selectedProject?.id, selectedProject?.metadata]);

  useEffect(() => {
    if (contentGuidancePersistTimeoutRef.current) {
      clearTimeout(contentGuidancePersistTimeoutRef.current);
    }

    if (!selectedProject?.id || isDemoMode) return;

    const serialized = JSON.stringify(
      Object.fromEntries(
        Object.entries(contentGuidanceByType)
          .map(([contentTypeId, value]) => [contentTypeId, normalizeCustomGuidance(value)])
          .filter(([, value]) => value.length > 0)
      )
    );

    if (serialized === lastPersistedContentGuidanceRef.current) return;

    const nextMetadata = mergeProjectContentGuidance(selectedProject.metadata, contentGuidanceByType);
    contentGuidancePersistTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('projects')
        .update({ metadata: nextMetadata })
        .eq('id', selectedProject.id);

      if (error) {
        console.error('Error saving content guidance:', error);
        showToast('Failed to save guidance defaults');
        return;
      }

      lastPersistedContentGuidanceRef.current = serialized;
      setSelectedProject((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      setProjects((prev) => prev.map((project) => (
        project.id === selectedProject.id ? { ...project, metadata: nextMetadata } : project
      )));
    }, 500);

    return () => {
      if (contentGuidancePersistTimeoutRef.current) {
        clearTimeout(contentGuidancePersistTimeoutRef.current);
      }
    };
  }, [contentGuidanceByType, isDemoMode, selectedProject?.id, selectedProject?.metadata]);

  useEffect(() => {
    if (isDemoMode) return;
    if (!selectedProject?.id) return;
    if (selectedProject.status !== 'completed') return;
    if (uploadBackgroundAnalysisKeys.size === 0) return;

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!isActive) return;

      await fetchProjects({ source: 'poll:upload_background' });

      if (isActive && selectedProjectRef.current === selectedProject.id) {
        await fetchProjectOutputs(selectedProject.id);
        setInsightsRefreshToken((prev) => prev + 1);
      }

      if (isActive) {
        timeoutId = setTimeout(poll, 2500);
      }
    };

    // Start initial poll
    timeoutId = setTimeout(poll, 2500);

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [selectedProject?.id, selectedProject?.status, uploadBackgroundAnalysisKeys.size]);

  // ─── Segment review / selection state (lifted from ConversationView) ───
  interface TouchupPreviewItem {
    index: number;
    oldSpeakerId: string;
    newSpeakerId: string;
    reason: string;
    confidence: number | null;
    segmentText: string;
    accepted: boolean;
  }
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [aiTouchupLoading, setAiTouchupLoading] = useState(false);
  const [aiTouchupResult, setAiTouchupResult] = useState<string | null>(null);
  const [touchupPreview, setTouchupPreview] = useState<TouchupPreviewItem[] | null>(null);
  const [applyingTouchup, setApplyingTouchup] = useState(false);
  const [scrollToSegmentIndex, setScrollToSegmentIndex] = useState<number | null>(null);

  // Keep ref in sync with selectedProject for use in realtime callbacks
  useEffect(() => {
    selectedProjectRef.current = selectedProject?.id || null;
  }, [selectedProject?.id]);

  useEffect(() => {
    setOptimisticGeneratingAnalysisKeys(new Set());
    setPendingContentTypeIds(new Set());
  }, [selectedProject?.id]);

  // ============================================================
  // STALE DATA FIX: Watch for status completion and refresh
  // When a project transitions to 'completed', the speaker data
  // may be updated by the debate correction algorithm. This hook
  // ensures we fetch the FRESH data after processing completes.
  // ============================================================
  const {
    project: refreshedProject,
    isRefreshing: isProjectRefreshing,
    previousStatus: projectPreviousStatus,
  } = useProjectRefresh(selectedProject?.id, {
    completionDelay: 2000, // Wait 2s after completion before final refresh
    pollingInterval: 3000,
    debug: false,
    onRefresh: (freshProject) => {
      console.log('[REFRESH] Got fresh project data:', {
        id: freshProject.id,
        status: freshProject.status,
        hasSpeakerData: !!freshProject.speaker_data,
        speakerNames: freshProject.speaker_data?.speakers
          ? Object.values(freshProject.speaker_data.speakers)
            .map((s: any) => s.finalName || s.fallbackName)
            .filter(Boolean)
          : [],
      });

      // Update the selected project with fresh data
      // IMPORTANT: Use ref instead of selectedProject to avoid stale closure issues
      // when user switches projects while refresh is pending
      if (freshProject && selectedProjectRef.current === freshProject.id) {
        setSelectedProject(freshProject);

        // Also update in the projects list
        setProjects((prev) =>
          prev.map((p) => (p.id === freshProject.id ? freshProject : p))
        );
      }
    },
  });

  // Secondary hook: specifically watch for speaker data updates
  // This handles the case where speaker_data is written AFTER status completion
  useSpeakerDataRefresh(
    selectedProject?.id,
    selectedProject?.speaker_data,
    (newSpeakerData) => {
      console.log('[SPEAKER_REFRESH] Got updated speaker data');
      // Use ref to get current project ID to avoid stale closure issues
      const currentProjectId = selectedProjectRef.current;
      if (currentProjectId && selectedProject && currentProjectId === selectedProject.id) {
        const updatedProject = {
          ...selectedProject,
          speaker_data: newSpeakerData,
        };
        setSelectedProject(updatedProject);
        setProjects((prev) =>
          prev.map((p) => (p.id === currentProjectId ? updatedProject : p))
        );
      }
    }
  );

  // Wire up audio player methods for speaker sample playback
  useEffect(() => {
    if (audioElementRef.current) {
      audioPlayerRef.current = {
        seekTo: (time: number) => {
          if (audioElementRef.current) {
            audioElementRef.current.currentTime = time;
          }
        },
        play: () => {
          audioElementRef.current?.play();
        },
        pause: () => {
          audioElementRef.current?.pause();
        },
      };
    }
  }, [selectedProject?.id, audioUrl]);

  // Fetch signed URL for audio playback when project changes
  useEffect(() => {
    async function fetchAudioUrl() {
      if (!selectedProject?.id || !selectedProject?.audio_file_name) {
        setAudioUrl(null);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`/api/projects/${selectedProject.id}/audio-url`, {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        });

        if (!response.ok) {
          if (response.status === 410) {
            const payload = await response.json().catch(() => ({}));
            setSelectedProject((prev) => prev ? {
              ...prev,
              audio_deleted_at: prev.audio_deleted_at || new Date().toISOString(),
              audio_expires_at: payload.audioExpiresAt || prev.audio_expires_at || null,
            } : prev);
          } else {
            console.error('Failed to get audio URL:', await response.text());
          }
          setAudioUrl(null);
          return;
        }

        const { signedUrl } = await response.json();
        setAudioUrl(signedUrl);
      } catch (err) {
        console.error('Error fetching audio URL:', err);
        setAudioUrl(null);
      }
    }

    fetchAudioUrl();
  }, [selectedProject?.id, selectedProject?.audio_file_name]);

  // Insights are fetched by ConversationView and reported back via onInsightsDataChange / onInsightsStatusChange callbacks.
  // No independent fetch needed here — single source of truth avoids race conditions.

  // Open details panel when a project is selected
  useEffect(() => {
    if (selectedProject) {
      setContextSidebarOpen(isDesktopViewport);
    }
  }, [isDesktopViewport, selectedProject?.id]);

  useEffect(() => {
    if (!isMobileViewport) return;

    if (!mobileRequestedProjectId) {
      setMobileStudioTab('projects');
      return;
    }

    setMobileStudioTab((prev) => (prev === 'projects' ? 'conversation' : prev));
  }, [isMobileViewport, mobileRequestedProjectId]);

  useEffect(() => {
    if (!selectedProject && !selectedProjectLoading) {
      setProjectsSidebarOpen(true);
      setContextSidebarOpen(false);
      if (isMobileViewport) {
        setMobileStudioTab('projects');
      }
      return;
    }

    if (isMobileViewport) {
      setProjectsSidebarOpen(false);
      setContextSidebarOpen(false);
    }
  }, [isMobileViewport, selectedProject?.id]);

  useEffect(() => {
    setMobileConversationChromeCollapsed(false);
  }, [selectedProject?.id]);

  const parseSpeakerData = (data: any) => {
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (error) {
        console.error('Failed to parse speaker_data', error);
        return null;
      }
    }
    return data;
  };

  const parsedSpeakerData = useMemo(
    () => parseSpeakerData(selectedProject?.speaker_data),
    [selectedProject?.speaker_data]
  );

  // Reader view: sync active segment via timeupdate
  useEffect(() => {
    const audio = audioElementRef.current;
    if (!audio || !readerView || !parsedSpeakerData?.segments?.length) return;
    const segments = parsedSpeakerData.segments;
    const onTimeUpdate = () => {
      const t = audio.currentTime;
      let found: number | null = null;
      for (let i = 0; i < segments.length; i++) {
        if (t >= (segments[i].startTime || 0) && t <= (segments[i].endTime || 0)) { found = i; break; }
      }
      setReaderActiveIndex(prev => prev === found ? prev : found);
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, [audioElementRef, readerView, parsedSpeakerData?.segments, audioUrl]);

  // Reader view: auto-scroll to active segment
  useEffect(() => {
    if (!readerView || readerActiveIndex == null) return;
    if (readerAutoScrollPaused || isReaderScrollingRef.current) return;
    document.getElementById(`reader-segment-${readerActiveIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [readerActiveIndex, readerView, readerAutoScrollPaused]);

  // Reader view: detect manual scrolling to pause auto-scroll
  useEffect(() => {
    const container = readerScrollRef.current;
    if (!container || !readerView) return;
    const onScroll = () => {
      isReaderScrollingRef.current = true;
      setReaderAutoScrollPaused(true);
    };
    container.addEventListener('wheel', onScroll, { passive: true });
    container.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      container.removeEventListener('wheel', onScroll);
      container.removeEventListener('touchmove', onScroll);
    };
  }, [readerView]);

  // Reset reader follow-along when switching into reader view
  useEffect(() => {
    if (readerView) {
      isReaderScrollingRef.current = false;
      setReaderAutoScrollPaused(false);
      setReaderActiveIndex(null);
    }
  }, [readerView]);

  const resetSelectedProject = useCallback(() => {
    selectedProjectRef.current = null;
    setSelectedProject(null);
    setProjectsSidebarOpen(true);
    setContextSidebarOpen(false);
    setMobileStudioTab('projects');
    setSelectedProjectLoading(false);
    setOutputs([]);
    setInsightsData([]);
    setInsightsStatus({ count: 0, loading: false, generating: false, refreshing: false });
    setShowFullTranscription(false);
    setInsightsSidebarOpen(false);
    setTriggerInsightGeneration(0);
    setTriggerInsightRefresh(0);
    router.push('/dashboard/projects');
  }, [router]);

  useEffect(() => {
    const handler = () => {
      resetSelectedProject();
    };
    window.addEventListener('demoCloseProject', handler as EventListener);
    return () => window.removeEventListener('demoCloseProject', handler as EventListener);
  }, [resetSelectedProject]);

  const featuredProjectId = useMemo(() => {
    const namedTarget = projects.find(
      (project) => project.status === 'completed' && project.title?.includes('Future of Work Roundtable')
    );
    if (namedTarget) return namedTarget.id;

    const firstCompleted = projects.find((project) => project.status === 'completed');
    return firstCompleted?.id ?? projects[0]?.id ?? null;
  }, [projects]);

  const accuracyPercent = useMemo(
    () => getSpeakerAssignmentConfidencePercent(parsedSpeakerData),
    [parsedSpeakerData]
  );

  const reviewSegmentIndices = useMemo(
    () => getReviewSegmentIndicesFromSpeakerData(parsedSpeakerData),
    [parsedSpeakerData]
  );
  const reviewItems = useMemo(
    () => getReviewItemsFromSpeakerData(parsedSpeakerData),
    [parsedSpeakerData]
  );
  const speakerSuggestions = useMemo(
    () => getSpeakerSuggestionsFromSpeakerData(parsedSpeakerData),
    [parsedSpeakerData]
  );

  const hasUncertainSegments = reviewSegmentIndices.length > 0;

  // Reset segment selection when project changes
  useEffect(() => {
    setSelectedSegments(new Set());
    setTouchupPreview(null);
    setAiTouchupResult(null);
    setScrollToSegmentIndex(null);
  }, [selectedProject?.id]);

  useEffect(() => {
    setSelectedSpeaker(null);
  }, [selectedProject?.id]);

  // Auto-refresh insights shortly after completion so they appear without page reload.
  useEffect(() => {
    if (!selectedProject?.id) return;
    if (selectedProject.status !== 'completed') return;
    if (insightsStatus.generating) return;
    if (insightsStatus.count > 0) return;

    let attempts = 0;
    const maxAttempts = 15;
    const intervalMs = 6000;
    const interval = setInterval(() => {
      attempts += 1;
      setInsightsRefreshToken(prev => prev + 1);
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [selectedProject?.id, selectedProject?.status, insightsStatus.count, insightsStatus.generating]);

  // ── Pipeline reconciliation: heal missing selected analysis outputs ─────────
  // Fires once when a completed project is opened. If any expected analysis
  // output is missing, the reconcile endpoint silently regenerates only the gaps.
  useEffect(() => {
    if (!selectedProject?.id) return;
    if (selectedProject.status !== 'completed') return;

    const aiProcessing = (selectedProject as any).speaker_data?.detectionMetadata?.aiProcessing || {};
    const options = getProjectAnalysisOptions(selectedProject);
    const expected = [
      ...(options.summary ? ['summary'] : []),
      ...(options.chapters ? ['chapters'] : []),
      ...(options.takeaways ? ['takeaways'] : []),
      ...(options.quotes ? ['quotes'] : []),
      ...(options.insights ? ['insights'] : []),
    ];
    const hasMissing = expected.some((f) => !aiProcessing[f]);

    if (!hasMissing) return;

    let cancelled = false;
    setIsReconciling(true);

    fetch(`/api/projects/${selectedProject.id}/reconcile`, {
      method: 'POST',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setIsReconciling(false);
        if (data.totalFixed > 0) {
          setInsightsRefreshToken(prev => prev + 1);
          // Refresh project data to pull in newly generated content
          setProjects((prev) =>
            prev.map((p) =>
              p.id === selectedProject.id ? { ...p, _reconciled: Date.now() } as typeof p : p
            )
          );
          showToast(`Repaired ${data.totalFixed} missing feature(s)`, 'success');
        }
      })
      .catch(() => {
        if (!cancelled) setIsReconciling(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, selectedProject?.id, selectedProject?.status]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
  }, []);

  const getInsufficientFundsMessage = useCallback((fallback?: string) => {
    return fallback?.trim() || 'Insufficient funds, cannot complete.';
  }, []);

  const acknowledgeFailedGenerationJobs = useCallback(async (projectId: string, jobIds: string[]) => {
    if (jobIds.length === 0) {
      return [];
    }

    const response = await fetch(`/api/projects/${projectId}/generation-jobs/acknowledge-failures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ jobIds }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to acknowledge generation job failures');
    }

    return Array.isArray(data?.acknowledgedJobIds)
      ? data.acknowledgedJobIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];
  }, [session?.access_token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!selectedProject?.id) return;

    const handled = notifiedFailedJobIdsRef.current;
    const failedJobs = generationJobs.filter(
      (job) => job.status === 'failed' && !job.failure_notified_at && !handled.has(job.id)
    );

    if (failedJobs.length === 0) return;

    failedJobs.forEach((job) => handled.add(job.id));

    const nowIso = new Date().toISOString();
    const pendingJobIds = failedJobs.map((job) => job.id);
    const pendingJobIdSet = new Set(pendingJobIds);

    for (const job of failedJobs) {
      const message = job.error_message || '';
      const lower = message.toLowerCase();
      if (lower.includes('insufficient credit') || lower.includes('insufficient funds')) {
        showToast(getInsufficientFundsMessage(message), 'error');
        continue;
      }

      const label = job.kind === 'analysis'
        ? ANALYSIS_OPTION_CONFIG.find((option) => option.key === job.target_key)?.label || 'Analysis'
        : CONTENT_TYPES.find((contentType) => contentType.id === job.target_key)?.name || 'Content';

      showToast(message || `${label} generation failed.`, 'error');
    }

    setGenerationJobs((prev) => prev.map((job) => (
      pendingJobIdSet.has(job.id)
        ? { ...job, failure_notified_at: nowIso }
        : job
    )));

    void acknowledgeFailedGenerationJobs(selectedProject.id, pendingJobIds).then((acknowledgedIds) => {
      if (acknowledgedIds.length === 0) return;

      setGenerationJobs((prev) => prev.map((job) => (
        acknowledgedIds.includes(job.id)
          ? { ...job, failure_notified_at: job.failure_notified_at || nowIso }
          : job
      )));
    }).catch((error) => {
      console.error('[Dashboard] Failed to acknowledge generation job failures:', error);
      pendingJobIds.forEach((jobId) => handled.delete(jobId));
      setGenerationJobs((prev) => prev.map((job) => (
        pendingJobIdSet.has(job.id)
          ? { ...job, failure_notified_at: null }
          : job
      )));
    });
  }, [acknowledgeFailedGenerationJobs, generationJobs, getInsufficientFundsMessage, selectedProject?.id, showToast]);

  // ─── Segment review handlers ───────────────────────────────────────────────
  const handleSelectAllUncertain = useCallback(() => {
    setSelectedSegments(new Set(reviewSegmentIndices));
  }, [reviewSegmentIndices]);

  const handleToggleSegmentSelection = useCallback((index: number) => {
    setSelectedSegments(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleAiTouchup = useCallback(async () => {
    if (!selectedProject?.id || selectedSegments.size === 0) return;
    setAiTouchupLoading(true);
    setAiTouchupResult(null);
    setTouchupPreview(null);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/touchup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ segmentIndices: Array.from(selectedSegments), dryRun: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Touch-up failed');
      const changed = (data.reassignments || []).filter((r: any) => r.oldSpeakerId !== r.newSpeakerId);
      if (changed.length === 0) {
        setAiTouchupResult(`AI found no changes needed for ${selectedSegments.size} segment${selectedSegments.size !== 1 ? 's' : ''}`);
        return;
      }
      setTouchupPreview(changed.map((r: any) => ({ ...r, accepted: true })));
    } catch (err) {
      setAiTouchupResult(err instanceof Error ? err.message : 'Touch-up failed, try again');
    } finally {
      setAiTouchupLoading(false);
    }
  }, [selectedProject?.id, selectedSegments, session?.access_token]);

  const handleApplyTouchup = useCallback(async () => {
    if (!selectedProject?.id || !touchupPreview) return;
    const approved = touchupPreview.filter(item => item.accepted);
    if (approved.length === 0) { setTouchupPreview(null); return; }
    setApplyingTouchup(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/touchup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ approvedReassignments: approved }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Apply failed');
      if (data.updatedSpeakerData) {
        setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
      }
      setAiTouchupResult(`AI reassigned ${approved.length} segment${approved.length !== 1 ? 's' : ''}`);
      setTouchupPreview(null);
      setSelectedSegments(new Set());
    } catch (err) {
      setAiTouchupResult(err instanceof Error ? err.message : 'Apply failed, try again');
    } finally {
      setApplyingTouchup(false);
    }
  }, [selectedProject?.id, touchupPreview, session?.access_token]);

  const handleTogglePreviewItem = useCallback((index: number) => {
    setTouchupPreview(prev =>
      prev ? prev.map(item => item.index === index ? { ...item, accepted: !item.accepted } : item) : null
    );
  }, []);

  const handleConfirmSegment = useCallback(async (segmentIndex: number) => {
    if (!selectedProject?.id) return;
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: [segmentIndex], confirmOnly: true }),
      });
      if (!response.ok) throw new Error('Failed to confirm segment');
      const data = await response.json();
      if (data.updatedSpeakerData) {
        setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
      }
      setSelectedSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentIndex);
        return next;
      });
    } catch (error) {
      console.error('Error confirming segment:', error);
    }
  }, [selectedProject?.id]);

  const handleSidebarSegmentReassign = useCallback(async (segmentIndex: number, newSpeakerId: string) => {
    if (!selectedProject?.id || !newSpeakerId) return;
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}/segments/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIndices: [segmentIndex], newSpeakerId }),
      });
      if (!response.ok) throw new Error('Failed to reassign segment');
      const data = await response.json();
      if (data.updatedSpeakerData) {
        setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
      }
    } catch (error) {
      console.error('Error reassigning segment from sidebar:', error);
    }
  }, [selectedProject?.id]);

  const handleAddSpeaker = useCallback(async (name: string, role: string) => {
    if (!selectedProject?.id) return;
    const res = await fetch(`/api/projects/${selectedProject.id}/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.updatedSpeakerData) {
      setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
    }
  }, [selectedProject?.id]);

  const handleDeleteSpeaker = useCallback(async (speakerId: string, action: 'reassign' | 'delete', targetId?: string) => {
    if (!selectedProject?.id) return;
    const res = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reassignToSpeakerId: targetId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.updatedSpeakerData) {
      setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
    }
  }, [selectedProject?.id]);
  // ─────────────────────────────────────────────────────────────────────────────

  // Filter and sort projects
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = [...projects];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(project =>
        project.title.toLowerCase().includes(searchLower) ||
        project.audio_file_name?.toLowerCase().includes(searchLower)
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(project => project.project_type === typeFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name-asc':
          return a.title.localeCompare(b.title);
        case 'name-desc':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });

    return filtered;
  }, [projects, searchTerm, typeFilter, sortBy]);

  const handleRefresh = async () => {
    setRefreshing(true);

    // Fetch fresh generation progress state
    await fetchGenerationProgress();

    // Fetch projects and selected detail
    await fetchProjects({ source: 'manual:refresh' });
    const currentSelectedId = selectedProjectRef.current;
    if (currentSelectedId) {
      await selectProject(currentSelectedId);
    }

    setRefreshing(false);
  };

  const handleRedoInsights = () => {
    if (!selectedProject?.id) return;
    if (isMobileViewport) {
      setMobileStudioTab('content');
    } else {
      setContextSidebarOpen(true);
    }
    setTriggerInsightRefresh((prev) => prev + 1);
  };

  const fetchGenerationJobs = useCallback(async (projectId: string) => {
    try {
      const { data, error } = await (supabase
        .from('project_generation_jobs') as any)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching generation jobs:', error);
        return;
      }

      if (selectedProjectRef.current === projectId) {
        setGenerationJobs((data || []) as ProjectGenerationJob[]);
      }
    } catch (error) {
      console.error('Failed to fetch generation jobs:', error);
    }
  }, []);

  const enqueueGenerationItems = async (
    items: Array<{ kind: 'analysis' | 'content'; targetKey: string; themeId?: string; customGuidance?: string }>
  ) => {
    if (!selectedProject?.id) {
      throw new Error('No project selected');
    }

    const response = await fetch(`/api/projects/${selectedProject.id}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ items }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (data?.code === 'INSUFFICIENT_CREDITS') {
        throw new Error(getInsufficientFundsMessage(data?.message));
      }
      throw new Error(data?.message || data?.error || 'Failed to queue generation');
    }

    await fetchGenerationJobs(selectedProject.id);
    return data;
  };

  const handleGenerateContentBlock = async (block: ContentBlock) => {
    if (!selectedProject?.id || !selectedProject.transcription_text) return;
    try {
      setPendingContentTypeIds((prev) => new Set(prev).add(block.contentTypeId));
      const customGuidance = normalizeCustomGuidance(
        block.customGuidance || contentGuidanceByType[block.contentTypeId] || ''
      );
      await enqueueGenerationItems([
        {
          kind: 'content',
          targetKey: block.contentTypeId,
          themeId: block.theme || DEFAULT_THEME_ID,
          customGuidance,
        },
      ]);
      showToast(`${block.name} generation started`, 'success');
    } catch (error) {
      setPendingContentTypeIds((prev) => {
        const next = new Set(prev);
        next.delete(block.contentTypeId);
        return next;
      });
      console.error('Error starting content generation:', error);
      showToast(error instanceof Error ? error.message : 'Failed to start content generation');
    }
  };

  const handleContentGuidanceChange = useCallback((contentTypeId: string, value: string) => {
    if (!selectedProject?.id) return;

    const nextValue = value.slice(0, MAX_CUSTOM_GUIDANCE_LENGTH);
    setContentGuidanceByType((prev) => ({
      ...prev,
      [contentTypeId]: nextValue,
    }));
  }, [selectedProject?.id]);

  function isAnalysisOptionAvailable(project: Project | null, key: AnalysisOptionKey) {
    if (!project) return false;
    switch (key) {
      case 'namedSpeakers':
        return Object.values((project.speaker_data as any)?.speakers || {}).some(
          (speaker: any) => speaker?.finalName && !String(speaker.finalName).startsWith('Speaker ')
        );
      case 'summary':
        return Boolean(project.ai_summary);
      case 'insights':
        return insightsData.length > 0;
      case 'chapters':
        return Boolean(project.chapters && project.chapters.length > 0);
      case 'takeaways':
        return Boolean(project.key_takeaways && project.key_takeaways.length > 0);
      case 'quotes':
        return Boolean(project.social_quotes && project.social_quotes.length > 0);
      default:
        return false;
    }
  }

  const handleGenerateAnalysisOption = async (key: AnalysisOptionKey) => {
    if (isDemoMode) {
      showToast('Demo account is read-only.');
      return;
    }

    if (!selectedProject?.id || !selectedProject.audio_file_name) {
      showToast('This project cannot run additional analysis.');
      return;
    }

    const nextOptions = {
      ...getProjectAnalysisOptions(selectedProject),
      [key]: true,
    };

    try {
      setOptimisticGeneratingAnalysisKeys((prev) => new Set(prev).add(key));
      const nextMetadata = {
        ...(selectedProject.metadata || {}),
        analysis_options: nextOptions,
      };

      const { error: metadataError } = await supabase
        .from('projects')
        .update({ metadata: nextMetadata })
        .eq('id', selectedProject.id);

      if (metadataError) {
        throw metadataError;
      }

      setSelectedProject((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      setProjects((prev) => prev.map((project) => (
        project.id === selectedProject.id ? { ...project, metadata: nextMetadata } : project
      )));

      await enqueueGenerationItems([{ kind: 'analysis', targetKey: key }]);
      showToast(`${ANALYSIS_OPTION_CONFIG.find((option) => option.key === key)?.label || 'Analysis'} generation started`, 'success');
    } catch (error) {
      setOptimisticGeneratingAnalysisKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      console.error('Failed to generate analysis option:', error);
      showToast(error instanceof Error ? error.message : 'Failed to generate analysis');
    }
  };

  // Output action handlers
  const handleDownloadOutput = (output: Output) => {
    const blob = new Blob([`${output.title}\n\n${output.content}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${output.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded', 'success');
  };

  const handleCopyOutput = async (output: Output) => {
    try {
      await navigator.clipboard.writeText(output.content);
      showToast('Copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy — try selecting the text manually');
    }
  };

  const handleDeleteOutput = async (outputId: string) => {
    setDeletingOutput(outputId);
    try {
      const { error } = await supabase.from('outputs').delete().eq('id', outputId);
      if (error) throw error;
      setOutputs(prev => prev.filter(o => o.id !== outputId));
      showToast('Output deleted', 'success');
    } catch {
      showToast('Failed to delete output');
    } finally {
      setDeletingOutput(null);
    }
  };

  // Project title inline rename
  const handleSaveProjectTitle = async () => {
    if (!selectedProject || !editingTitleValue.trim()) {
      setEditingProjectTitle(false);
      return;
    }
    if (editingTitleValue.trim() === selectedProject.title) {
      setEditingProjectTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      const response = await fetch(`/api/projects/${selectedProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitleValue.trim() })
      });
      if (!response.ok) throw new Error('Failed to rename');
      const newTitle = editingTitleValue.trim();
      setSelectedProject(prev => prev ? { ...prev, title: newTitle } : null);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, title: newTitle } : p));
      showToast('Project renamed', 'success');
    } catch {
      showToast('Failed to rename project');
    } finally {
      setSavingTitle(false);
      setEditingProjectTitle(false);
    }
  };

  // Export functionality helpers
  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const toggleAllProjectSelection = () => {
    if (selectedProjectIds.size === filteredAndSortedProjects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(filteredAndSortedProjects.map(p => p.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedProjectIds(new Set());
  };

  const prepareExportForProjects = async (projectIds: string[]) => {
    try {
      // Fetch fresh project data + outputs for each selected project
      const projectsWithOutputs = await Promise.all(
        projectIds.map(async (projectId) => {
          const fallbackProject = projects.find(p => p.id === projectId);
          if (!fallbackProject) return null;

          const { data: projectData, error: projectError } = await supabase
            .from('projects')
            .select('id, title, transcription_text, ai_summary, chapters, key_takeaways, social_quotes, speaker_data')
            .eq('id', projectId)
            .single();

          if (projectError) {
            throw new Error(projectError.message || 'Failed to load project for export');
          }

          const { data: outputsData, error: outputsError } = await supabase
            .from('outputs')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

          if (outputsError) {
            throw new Error(outputsError.message || 'Failed to load outputs for export');
          }

          const { data: insightsData, error: insightsError } = await supabase
            .from('insights')
            .select('id, entity_id, label, category, simple_definition, full_explanation, why_it_matters, external_sources, transcript_excerpts, relationships')
            .eq('project_id', projectId)
            .order('confidence', { ascending: false });

          if (insightsError) {
            throw new Error(insightsError.message || 'Failed to load insights for export');
          }

          const project = projectData || fallbackProject;

          const buildPersonProfile = (insight: any) => {
            if (insight.category !== 'person') return undefined;
            const relationships = Array.isArray(insight.relationships) ? insight.relationships : [];
            const getSection = (type: string) =>
              relationships.find((relationship: any) => relationship?.type === type)?.description;

            const whoTheyAre = getSection('person_summary') || insight.simple_definition || '';
            const currentWork = getSection('current_work') || '';
            const notableBackground = getSection('notable_background') || '';
            const whyRelevant = getSection('episode_relevance') || insight.why_it_matters || '';

            if (!whoTheyAre && !currentWork && !notableBackground && !whyRelevant) {
              return undefined;
            }

            return {
              who_they_are: whoTheyAre,
              current_work: currentWork,
              notable_background: notableBackground,
              why_relevant: whyRelevant,
            };
          };

          return {
            ...project,
            outputs: outputsData || [],
            // Include core content fields for export
            transcription_text: (project as any).transcription_text,
            ai_summary: (project as any).ai_summary,
            chapters: (project as any).chapters,
            key_takeaways: (project as any).key_takeaways,
            social_quotes: (project as any).social_quotes,
            insights: (insightsData || []).map((insight: any) => ({
              ...insight,
              person_profile: buildPersonProfile(insight),
            })),
            speaker_data: (project as any).speaker_data,
          };
        })
      );

      const validProjects = projectsWithOutputs.filter(p => p !== null) as unknown as Array<Project & { outputs: Output[] }>;

      if (validProjects.length === 0) {
        showToast('Nothing available to export');
        return;
      }

      setExportProjects(validProjects);
      setShowExportModal(true);
    } catch (error: any) {
      console.error('[EXPORT] Failed to prepare export:', error);
      showToast(error?.message || 'Failed to prepare export');
    }
  };

  const handleBulkExport = async () => {
    if (selectedProjectIds.size === 0) return;
    await prepareExportForProjects(Array.from(selectedProjectIds));
  };

  const handleSingleExport = async (project: Project) => {
    await prepareExportForProjects([project.id]);
  };

  const handleExport = async (payload: ExportPayload) => {
    console.log('[EXPORT] Handling export with payload:', JSON.stringify(payload, null, 2));

    // Prepare projects data for export (including core content)
    const projectsForExport = exportProjects.map(p => ({
      id: p.id,
      title: p.title,
      outputs: p.outputs.map(o => ({
        id: o.id,
        title: o.title,
        content: o.content,
        platform: o.platform,
        type: o.type,
        created_at: o.created_at,
        metadata: o.metadata,
      })),
      // Include core content fields
      transcription_text: (p as any).transcription_text,
      ai_summary: (p as any).ai_summary,
      chapters: (p as any).chapters,
      key_takeaways: (p as any).key_takeaways,
      social_quotes: (p as any).social_quotes,
      insights: (p as any).insights,
      speaker_data: (p as any).speaker_data,
    }));

    // Call the export utility
    const result = await exportContent(
      projectsForExport,
      payload.export_manifest,
      payload.format,
      { debug: payload.debug }
    );

    if (result.success) {
      console.log('[EXPORT] Success:', result.message);
    } else {
      console.error('[EXPORT] Failed:', result.message);
      showToast(`Export failed: ${result.message}`);
    }

    // Exit selection mode after export
    exitSelectionMode();
  };

  const confirmBulkDeleteProjects = async () => {
    const projectIds = Array.from(selectedProjectIds);
    if (projectIds.length === 0 || !user?.id) return;

    setBulkDeletingProjects(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit | undefined = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const results = await Promise.allSettled(
        projectIds.map(async (projectId) => {
          try {
            await fetch(`/api/projects/${projectId}/cleanup-cache`, {
              method: 'POST',
            });
          } catch (cacheError) {
            console.warn('[DELETE] Cache cleanup failed (non-fatal):', cacheError);
          }

          const response = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            headers,
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Failed to delete project. Please try again.' }));
            throw new Error(data.error || 'Failed to delete project. Please try again.');
          }

          return projectId;
        })
      );

      const deletedIds = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      const failedCount = results.length - deletedIds.length;
      const deletedIdSet = new Set(deletedIds);

      deletedIds.forEach((projectId) => {
        emitProjectMutation({ projectId, action: 'deleted' });
      });

      if (deletedIds.length > 0) {
        setProjects((prev) => prev.filter((project) => !deletedIdSet.has(project.id)));
        setSelectedProjectIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((projectId) => next.delete(projectId));
          return next;
        });

        if (selectedProject?.id && deletedIdSet.has(selectedProject.id)) {
          setSelectedProject(null);
          setOutputs([]);
        }
      }

      if (failedCount > 0) {
        showToast(`Deleted ${deletedIds.length} project${deletedIds.length === 1 ? '' : 's'}; ${failedCount} failed`);
      } else {
        showToast(`Deleted ${deletedIds.length} project${deletedIds.length === 1 ? '' : 's'}`, 'success');
        exitSelectionMode();
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      showToast('Failed to delete selected projects');
    } finally {
      setBulkDeletingProjects(false);
      setPendingBulkDeleteProjects(false);
    }
  };

  // Run Coverage Analysis for a project
  const handleRunCoverage = async (project: Project) => {
    if (isDemoMode) {
      showToast('Demo account is read-only.');
      return;
    }

    if (!user?.id || !session?.access_token || !project.id || !project.transcription_text) {
      showToast('You need to be signed in to run analysis.');
      return;
    }

    startCoverage(project.id, project.title);

    try {
      const response = await fetch(`/api/projects/${project.id}/run-coverage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          force: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Coverage analysis failed');
      }

      console.log('[Coverage] Analysis complete:', result);
    } catch (error: any) {
      console.error('[Coverage] Analysis failed:', error);
      showToast(error?.message || 'Coverage analysis failed');
    } finally {
      stopCoverage(project.id);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    if (!user?.id) return;
    setPendingDeleteProjectId(projectId);
  };

  const confirmDeleteProject = async () => {
    const projectId = pendingDeleteProjectId;
    if (!projectId || !user?.id) return;
    setPendingDeleteProjectId(null);
    setDeletingProject(projectId);

    try {
      // Cleanup cache reference before deleting project
      try {
        await fetch(`/api/projects/${projectId}/cleanup-cache`, {
          method: 'POST'
        });
        console.log('[DELETE] Cache reference cleaned up');
      } catch (cacheError) {
        console.warn('[DELETE] Cache cleanup failed (non-fatal):', cacheError);
        // Continue with deletion even if cache cleanup fails
      }

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to delete project. Please try again.' }));
        throw new Error(data.error || 'Failed to delete project. Please try again.');
      }

      emitProjectMutation({ projectId, action: 'deleted' });

      // Remove project from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setSelectedProjectIds(prev => {
        if (!prev.has(projectId)) return prev;
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });

      // Clear selected project if it was the deleted one
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setOutputs([]);
      }

      showToast('Project deleted', 'success');

    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast('An unexpected error occurred. Please try again.');
    } finally {
      setDeletingProject(null);
    }
  };

  useEffect(() => {
    if (user) {
      void fetchProjects({ markLoading: true, surfaceError: true, source: 'initial' });
      fetchGenerationProgress(); // Restore loading state on page load

      // Set up real-time updates for projects
      const projectsSubscription = supabase
        .channel('projects_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'projects',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Project change detected:', payload);
            void fetchProjects({ source: 'realtime:projects' }); // Refresh projects when changes occur
            const changedProjectId = (payload.new as { id?: string } | null)?.id || (payload.old as { id?: string } | null)?.id;
            if (changedProjectId && selectedProjectRef.current === changedProjectId) {
              void fetchSelectedProject(changedProjectId);
            }
          }
        )
        .subscribe();

      // Set up real-time updates for outputs if a project is selected
      let outputsSubscription: any = null;
      let jobSubscription: any = null;
      if (selectedProject) {
        const subscribedProjectId = selectedProject.id;
      void fetchGenerationJobs(subscribedProjectId);
        outputsSubscription = supabase
          .channel('outputs_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'outputs',
              filter: `project_id=eq.${subscribedProjectId}`,
            },
            (payload) => {
              console.log('Output change detected:', payload);
              // Only fetch if this project is still selected (use ref for current value)
              if (selectedProjectRef.current === subscribedProjectId) {
              void fetchProjectOutputs(subscribedProjectId);
            }
          }
        )
          .subscribe();

        jobSubscription = supabase
          .channel('project_generation_jobs_changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'project_generation_jobs',
              filter: `project_id=eq.${subscribedProjectId}`,
            },
            (payload) => {
              console.log('Generation job change detected:', payload);
              void fetchGenerationJobs(subscribedProjectId);
              if (payload.eventType === 'UPDATE') {
                const data = payload.new as any;
                if (data?.status === 'completed' || data?.status === 'failed') {
                  void refreshSelectedProjectArtifacts(subscribedProjectId, 'realtime:generation_jobs');
                }
              }
            }
          )
          .subscribe();
      }

      // Set up real-time updates for generation progress
      const generationProgressSubscription = supabase
        .channel('generation_progress_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'generation_progress',
          },
          (payload) => {
            console.log('[REALTIME] Generation progress event:', payload.eventType, payload);

            // Handle INSERT and UPDATE events
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const data = payload.new as any;

              if (data && data.project_id) {
                console.log('[REALTIME] Project:', data.project_id, 'Status:', data.status);

                // Add to generating set if status is preparing or generating
                if (data.status === 'preparing' || data.status === 'generating') {
                  console.log('[REALTIME] Adding to generating set:', data.project_id);
                  setGeneratingProjects((prev) => new Set(prev).add(data.project_id));
                }

                // Remove from generating set if completed or failed
                if (data.status === 'completed' || data.status === 'failed') {
                  console.log('[REALTIME] Removing from generating set:', data.project_id);
                  setGeneratingProjects((prev) => {
                    const next = new Set(prev);
                    next.delete(data.project_id);
                    return next;
                  });

                  // Refresh data AFTER updating state (not inside setState)
                  console.log('[REALTIME] Refreshing projects...');
                  void fetchProjects({ source: 'realtime:generation_progress' });

                  // Use ref to check selected project (avoids stale closure)
                  if (selectedProjectRef.current === data.project_id) {
                    console.log('[REALTIME] Refreshing outputs for selected project...');
                    void refreshSelectedProjectArtifacts(data.project_id, 'realtime:generation_progress');

                    // Content panel now always visible (no tab to switch)
                  }
                }
              }
            }

            // Handle DELETE events (cleanup after status update)
            if (payload.eventType === 'DELETE') {
              const data = payload.old as any;

              if (data && data.project_id) {
                console.log('[REALTIME] Progress entry deleted for project:', data.project_id);

                // Remove from generating set (in case it wasn't already removed)
                setGeneratingProjects((prev) => {
                  const next = new Set(prev);
                  next.delete(data.project_id);
                  return next;
                });
              }
            }
          }
        )
        .subscribe((status) => {
          console.log('[REALTIME] Generation progress subscription status:', status);
        });

      return () => {
        console.log('[REALTIME] Unsubscribing from channels...');
        projectsSubscription.unsubscribe();
        generationProgressSubscription.unsubscribe();
        if (outputsSubscription) {
          outputsSubscription.unsubscribe();
        }
        if (jobSubscription) {
          jobSubscription.unsubscribe();
        }
      };
    }
  }, [user, selectedProject?.id, fetchGenerationJobs]);

  // Fetch current generation progress on page load
  const fetchGenerationProgress = async () => {
    try {
      if (!user?.id) return;

      // Get all projects for this user that are currently generating
      const { data: progressData, error } = await supabase
        .from('generation_progress')
        .select('project_id, status')
        .in('status', ['preparing', 'generating']);

      if (error) {
        console.error('Error fetching generation progress:', error);
        return;
      }

      if (progressData && progressData.length > 0) {
        const generatingIds = progressData.map((p: any) => p.project_id);
        setGeneratingProjects(new Set(generatingIds));
        console.log('Restored generation state for projects:', generatingIds);
      }
    } catch (error) {
      console.error('Exception fetching generation progress:', error);
    }
  };

  // Poll for generation completion as a reliable fallback (realtime can be flaky)
  useEffect(() => {
    if (generatingProjects.size === 0) return;

    console.log('[POLL] Starting poll for', generatingProjects.size, 'generating projects');

    const pollInterval = setInterval(async () => {
      const projectIds = Array.from(generatingProjects);
      console.log('[POLL] Checking status for projects:', projectIds);

      try {
        // Check if any of the generating projects have completed (no progress entry = completed)
        const { data: progressData, error } = await supabase
          .from('generation_progress')
          .select('project_id, status')
          .in('project_id', projectIds);

        if (error) {
          console.error('[POLL] Error checking progress:', error);
          return;
        }

        // Find projects that are no longer in progress (completed or failed)
        const stillGenerating = new Set(
          (progressData || [])
            .filter((p: any) => p.status === 'preparing' || p.status === 'generating')
            .map((p: any) => p.project_id)
        );

        const completedProjects = projectIds.filter(id => !stillGenerating.has(id));

        if (completedProjects.length > 0) {
          console.log('[POLL] Detected completed projects:', completedProjects);

          // Remove completed projects from generating set
          setGeneratingProjects(prev => {
            const next = new Set(prev);
            completedProjects.forEach(id => next.delete(id));
            return next;
          });

          // Refresh data
          void fetchProjects({ source: 'poll:generation_progress' });

          // Refresh outputs if selected project completed
          const selectedId = selectedProjectRef.current;
          if (selectedId && completedProjects.includes(selectedId)) {
            console.log('[POLL] Refreshing outputs for completed project:', selectedId);
            void refreshSelectedProjectArtifacts(selectedId, 'poll:generation_progress');
          }
        }
      } catch (error) {
        console.error('[POLL] Exception checking progress:', error);
      }
    }, 8000); // Poll every 8s (real-time handles the common case)

    return () => {
      console.log('[POLL] Stopping poll');
      clearInterval(pollInterval);
    };
  }, [generatingProjects.size]);

  useEffect(() => {
    if (!selectedProject?.id || activeGenerationJobs.length === 0) return;

    const interval = setInterval(async () => {
      await fetchGenerationJobs(selectedProject.id);
    }, 2500);

    return () => clearInterval(interval);
  }, [selectedProject?.id, activeGenerationJobs.length, fetchGenerationJobs]);

  const syncProjectListEntry = useCallback((projectUpdate: Pick<Project, 'id'> & Partial<ProjectListItem>) => {
    setProjects((prev) => prev.map((project) => (
      project.id === projectUpdate.id ? { ...project, ...projectUpdate } : project
    )));
  }, []);

  const fetchSelectedProject = useCallback(async (projectId: string) => {
    setSelectedProjectLoading(true);
    try {
      logDashboardLoad('projects', 'detail_start', { projectId });
      const response = await fetch(`/api/projects/${projectId}`, {
        cache: 'no-store',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (response.status === 404) {
        if (selectedProjectRef.current === projectId) {
          selectedProjectRef.current = null;
          setSelectedProject(null);
          setOutputs([]);
          setContextSidebarOpen(false);
          if (isMobileViewport) {
            setMobileStudioTab('projects');
            showToast('That project could not be found.', 'error');
            router.replace('/dashboard/projects');
          }
        }
        return null;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch project detail');
      }

      const project = await response.json() as Project;

      if (selectedProjectRef.current === projectId || !selectedProjectRef.current) {
        setSelectedProject(project);
        syncProjectListEntry({
          id: project.id,
          title: project.title,
          status: project.status,
          created_at: project.created_at,
          audio_duration: project.audio_duration,
          audio_file_size: project.audio_file_size,
          audio_file_name: project.audio_file_name,
          audio_expires_at: project.audio_expires_at,
          audio_deleted_at: project.audio_deleted_at,
          processing_time_seconds: project.processing_time_seconds,
          selected_content_types: project.selected_content_types,
          estimated_cost: project.estimated_cost,
          audio_duration_seconds: project.audio_duration_seconds,
          performance_level: project.performance_level,
          metadata: project.metadata,
          project_type: project.project_type,
          processing_stage: project.processing_stage,
        });
      }

      logDashboardLoad('projects', 'detail_success', { projectId, status: project.status });

      return project;
    } catch (error) {
      console.error('Failed to fetch selected project:', error);
      if (selectedProjectRef.current === projectId) {
        selectedProjectRef.current = null;
        setSelectedProject(null);
        setOutputs([]);
        setContextSidebarOpen(false);
        if (isMobileViewport) {
          setMobileStudioTab('projects');
          showToast('We could not open that project right now.', 'error');
          router.replace('/dashboard/projects');
        }
      }
      logDashboardLoad('projects', 'detail_error', {
        projectId,
        message: getDashboardErrorMessage(error, 'Failed to fetch project detail'),
      });
      return null;
    } finally {
      setSelectedProjectLoading(false);
    }
  }, [isMobileViewport, router, session?.access_token, showToast, syncProjectListEntry]);

  const fetchProjects = useCallback(async (
    options: { markLoading?: boolean; surfaceError?: boolean; source?: string } = {}
  ) => {
    const { markLoading = false, surfaceError = false, source = 'unknown' } = options;

    if (markLoading) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      if (!user?.id) {
        console.log('No user ID available');
        if (markLoading) {
          setLoading(false);
        }
        return;
      }

      logDashboardLoad('projects', 'list_start', { userId: user.id, source });
      console.log('Fetching projects for user:', user.id);

      const response = await fetch('/api/dashboard/projects?limit=100', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load projects' }));
        throw new Error(payload.error || 'Failed to load projects');
      }

      const payload = await response.json() as { projects?: ProjectListItem[] };
      console.log('Fetched projects:', payload.projects);
      const updatedProjects = (payload.projects || []) as ProjectListItem[];
      setProjects(updatedProjects);
      if (surfaceError) {
        setLoadError(null);
      }
      logDashboardLoad('projects', 'list_success', {
        userId: user.id,
        source,
        count: updatedProjects.length,
      });

      const currentSelectedId = selectedProjectRef.current;
      if (currentSelectedId) {
        const refreshedSelection = updatedProjects.find(
          (project) => project.id === currentSelectedId
        );
        if (refreshedSelection) {
          setSelectedProject((prev) => (prev && prev.id === currentSelectedId ? { ...prev, ...refreshedSelection } : prev));
        } else {
          selectedProjectRef.current = null;
          setSelectedProject(null);
          setOutputs([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      const message = getDashboardErrorMessage(error, 'We could not load your projects right now. Please try again.');
      if (surfaceError) {
        setProjects([]);
        setOutputs([]);
        setLoadError(message);
      }
      logDashboardLoad('projects', 'list_error', { userId: user?.id, source, message });
    } finally {
      if (markLoading) {
        setLoading(false);
      }
    }
  }, [session?.access_token, user?.id]);

  const fetchProjectOutputs = useCallback(async (projectId: string) => {
    try {
      console.log('Fetching outputs for project:', projectId);

      const response = await fetch(`/api/projects/${projectId}/outputs`, {
        cache: 'no-store',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load outputs' }));
        throw new Error(payload.error || 'Failed to load outputs');
      }

      const payload = await response.json() as { outputs?: Output[] };
      const outputsData = payload.outputs || [];
      console.log('Fetched outputs:', outputsData);
      if (selectedProjectRef.current === projectId) {
        setOutputs(outputsData);
      }
    } catch (error) {
      console.error('Failed to fetch outputs:', error);
    }
  }, [session?.access_token]);

  const selectProject = useCallback(async (projectId: string) => {
    selectedProjectRef.current = projectId;
    setProjectsSidebarOpen(false);
    setContextSidebarOpen(false);
    if (isMobileViewport) {
      setMobileStudioTab('conversation');
    }
    setSelectedProjectLoading(true);
    setInsightsData([]);
    setInsightsStatus({ count: 0, loading: true, generating: false, refreshing: false });
    setShowFullTranscription(false);
    setInsightsSidebarOpen(false);
    setTriggerInsightGeneration(0);
    setTriggerInsightRefresh(0);

    await Promise.all([
      fetchSelectedProject(projectId),
      fetchProjectOutputs(projectId),
      fetchGenerationJobs(projectId),
    ]);
  }, [fetchGenerationJobs, fetchProjectOutputs, fetchSelectedProject, isMobileViewport]);

  // Auto-select project from URL query parameter or default to the newest project
  useEffect(() => {
    if (loading || projects.length === 0) return;
    if (isMobileViewport && !requestedProjectId) return;

    const nextProjectId = requestedProjectId || projects[0]?.id;
    if (!nextProjectId) return;

    const projectToSelect = projects.find((project) => project.id === nextProjectId);
    if (!projectToSelect) {
      if (selectedProject?.id && !projects.some((project) => project.id === selectedProject.id)) {
        resetSelectedProject();
      }
      if (isMobileViewport && requestedProjectId) {
        selectedProjectRef.current = null;
        setSelectedProject(null);
        setSelectedProjectLoading(false);
        setContextSidebarOpen(false);
        router.replace('/dashboard/projects');
      }
      return;
    }

    if (!requestedProjectId && !isMobileViewport) {
      router.replace(`/dashboard/projects?id=${nextProjectId}`);
    }

    if (selectedProjectRef.current !== nextProjectId) {
      void selectProject(nextProjectId);
    }
  }, [isMobileViewport, loading, projects, requestedProjectId, resetSelectedProject, router, selectProject, selectedProject?.id]);

  const refreshSelectedProjectArtifacts = useCallback(async (projectId: string, source: string) => {
    if (selectedProjectRef.current !== projectId) {
      return;
    }

    if (selectedProjectArtifactsRefreshRef.current) {
      selectedProjectArtifactsRefreshQueuedRef.current = true;
      await selectedProjectArtifactsRefreshRef.current;
      return;
    }

    const runRefresh = async () => {
      try {
        do {
          selectedProjectArtifactsRefreshQueuedRef.current = false;
          await Promise.all([
            fetchGenerationJobs(projectId),
            fetchProjectOutputs(projectId),
            fetchSelectedProject(projectId),
            fetchProjects({ source }),
          ]);
          setInsightsRefreshToken((prev) => prev + 1);
        } while (selectedProjectArtifactsRefreshQueuedRef.current && selectedProjectRef.current === projectId);
      } finally {
        selectedProjectArtifactsRefreshRef.current = null;
      }
    };

    selectedProjectArtifactsRefreshRef.current = runRefresh();
    await selectedProjectArtifactsRefreshRef.current;
  }, [fetchGenerationJobs, fetchProjectOutputs, fetchSelectedProject, fetchProjects]);

  useEffect(() => {
    if (!selectedProject?.id) {
      selectedProjectGenerationActiveRef.current = false;
      return;
    }

    const projectId = selectedProject.id;
    let cancelled = false;

    const pollSelectedProjectGeneration = async () => {
      try {
        const { data, error } = await supabase
          .from('generation_progress')
          .select('status')
          .eq('project_id', projectId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error('[POLL] Failed to check selected project generation progress:', error);
          return;
        }

        const status = (data as { status?: string } | null)?.status;
        const isActive = status === 'preparing' || status === 'generating';
        const wasActive = selectedProjectGenerationActiveRef.current;

        if (isActive) {
          selectedProjectGenerationActiveRef.current = true;
          void refreshSelectedProjectArtifacts(projectId, 'poll:selected-generation-active');
          return;
        }

        if (wasActive) {
          selectedProjectGenerationActiveRef.current = false;
          void refreshSelectedProjectArtifacts(projectId, 'poll:selected-generation-complete');
        }
      } catch (error) {
        console.error('[POLL] Selected project generation poll failed:', error);
      }
    };

    void pollSelectedProjectGeneration();
    const interval = setInterval(() => {
      void pollSelectedProjectGeneration();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedProject?.id, refreshSelectedProjectArtifacts]);

  useEffect(() => {
    const previousStatuses = previousGenerationJobStatusesRef.current;
    const currentStatuses = new Map<string, string>();
    let shouldRefreshOutputs = false;
    let shouldRefreshDetail = false;
    const completedLabels: string[] = [];

    for (const job of generationJobs) {
      currentStatuses.set(job.id, job.status);
      const previousStatus = previousStatuses.get(job.id);
      const transitionedToTerminal =
        previousStatus &&
        previousStatus !== job.status &&
        (job.status === 'completed' || job.status === 'failed');

      if (!transitionedToTerminal) continue;

      if (job.status === 'completed') {
        completedLabels.push(getGenerationJobLabel(job));
      }
      if (job.kind === 'content') {
        shouldRefreshOutputs = true;
      }
      shouldRefreshDetail = true;
    }

    previousGenerationJobStatusesRef.current = currentStatuses;

    if (completedLabels.length === 1) {
      showToast(`${completedLabels[0]} is ready.`, 'success');
    } else if (completedLabels.length > 1) {
      const [first, second, ...rest] = completedLabels;
      showToast(
        rest.length > 0
          ? `${first}, ${second}, and ${rest.length} more are ready.`
          : `${first} and ${second} are ready.`,
        'success'
      );
    }

    const selectedId = selectedProjectRef.current;
    if (!selectedId) return;

    if (shouldRefreshOutputs || shouldRefreshDetail) {
      void refreshSelectedProjectArtifacts(selectedId, 'job-transition');
    }
  }, [generationJobs, refreshSelectedProjectArtifacts, showToast]);

  useEffect(() => {
    const currentActiveJobCount = activeGenerationJobs.length;
    const previousActiveJobCount = previousActiveJobCountRef.current;

    if (!selectedProject?.id) {
      previousActiveJobCountRef.current = currentActiveJobCount;
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (currentActiveJobCount > 0) {
      intervalId = setInterval(() => {
        void fetchGenerationJobs(selectedProject.id);
      }, 1500);
    } else if (previousActiveJobCount > 0) {
      void refreshSelectedProjectArtifacts(selectedProject.id, 'jobs:settled');
    }

    previousActiveJobCountRef.current = currentActiveJobCount;

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeGenerationJobs.length, selectedProject?.id, fetchGenerationJobs, refreshSelectedProjectArtifacts]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getProcessingStage = (project: Project): string => {
    if (project.processing_stage) return project.processing_stage;
    return 'Processing...';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-slate-500" />;
    }
  };

  const toggleOutputExpansion = (outputId: string) => {
    setExpandedOutputs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(outputId)) {
        newSet.delete(outputId);
      } else {
        newSet.add(outputId);
      }
      return newSet;
    });
  };

  const getPlatformColor = (output: Output) => {
    const platform = output.platform;

    // Check metadata for specific platform types
    if (output.metadata?.platform) {
      if (output.metadata.platform === 'Show Notes') return 'bg-indigo-100 text-indigo-300';
      if (output.metadata.platform === 'Quote Graphic') return 'bg-amber-100 text-amber-300';
      if (output.metadata.platform === 'Blog Post') return 'bg-emerald-100 text-emerald-800';
      if (output.metadata.platform === 'Email Newsletter') return 'bg-orange-100 text-orange-800';
    }

    switch (platform) {
      case 'twitter':
        return 'bg-blue-100 text-blue-300';
      case 'linkedin':
        return 'bg-blue-100 text-blue-400';
      case 'instagram':
        return 'bg-pink-100 text-pink-800';
      case 'general':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100';
    }
  };

  // Returns icon letter + style for the output card platform icon
  const getOutputPlatformMeta = (output: Output): { letter: string; iconStyle: string } => {
    const rawPlatform = (output.metadata?.platform || output.platform || '').toLowerCase();
    if (rawPlatform.includes('twitter') || rawPlatform.includes('x thread') || rawPlatform === 'x') {
      return { letter: 'X', iconStyle: 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700' };
    }
    if (rawPlatform.includes('linkedin')) {
      return { letter: 'in', iconStyle: 'bg-blue-600 text-white border-blue-500' };
    }
    if (rawPlatform.includes('instagram')) {
      return { letter: 'IG', iconStyle: 'bg-pink-600 text-white border-pink-500' };
    }
    if (rawPlatform.includes('blog')) {
      return { letter: 'B', iconStyle: 'bg-green-700 text-white border-green-600' };
    }
    if (rawPlatform.includes('newsletter') || rawPlatform.includes('email')) {
      return { letter: '✉', iconStyle: 'bg-orange-600 text-white border-orange-500' };
    }
    if (rawPlatform.includes('show notes')) {
      return { letter: '♪', iconStyle: 'bg-indigo-600 text-white border-indigo-500' };
    }
    const displayName = output.metadata?.platform || output.platform || 'G';
    return { letter: displayName.charAt(0).toUpperCase(), iconStyle: 'bg-slate-700 text-white border-slate-600' };
  };

  const getOutputSubtitle = (output: Output): string => {
    const rawPlatform = (output.metadata?.platform || output.platform || '').toLowerCase();
    const charCount = output.content.length;
    if (rawPlatform.includes('twitter') || rawPlatform.includes('x thread')) {
      const posts = output.content.split(/\n\n+/).filter(p => p.trim().length > 0);
      return `${posts.length} posts • 280 chars each`;
    }
    return `${charCount.toLocaleString()} characters`;
  };

  const getPlatformDisplayName = (output: Output) => {
    // Prioritize metadata platform label
    if (output.metadata?.platform && output.metadata.platform !== 'General') {
      return output.metadata.platform;
    }

    // Fallback if metadata.platform_label exists
    if (output.metadata?.platform_label) {
      return output.metadata.platform_label;
    }

    const platform = output.platform;
    switch (platform) {
      case 'twitter':
        return 'X';
      case 'linkedin':
        return 'LinkedIn';
      case 'instagram':
        return 'Instagram';
      case 'email':
        return 'Email';
      case 'blog':
        return 'Blog';
      case 'general':
        return 'General';
      default:
        return platform;
    }
  };

  const getProcessingBadge = (project: ProjectListItem | Project) => {
    const options = getProjectAnalysisOptions(project);
    const selectedCount = Object.values(options).filter(Boolean).length;
    const label = selectedCount === 0 ? 'Transcript only' : `${selectedCount} add-on${selectedCount === 1 ? '' : 's'}`;

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700/60">
        <FileText className="w-3 h-3 mr-1 text-slate-500 dark:text-slate-400" />
        {label}
      </span>
    );
  };

  const getProjectTypeBadge = (type: ProjectType | undefined) => {
    if (!type) return null;

    const typeConfig: Record<ProjectType, {
      icon: any;
      label: string;
      color: string;
      iconColor: string;
      description: string;
    }> = {
      DEBATE: {
        icon: Users,
        label: 'Debate',
        color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30',
        iconColor: 'text-amber-600',
        description: 'Panel discussion with moderator',
      },
      INTERVIEW: {
        icon: Mic,
        label: 'Interview',
        color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/30',
        iconColor: 'text-green-600',
        description: '1-on-1 Q&A format',
      },
      PODCAST: {
        icon: Radio,
        label: 'Podcast',
        color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/30',
        iconColor: 'text-indigo-600',
        description: 'Conversational show',
      },
      MONOLOGUE: {
        icon: User,
        label: 'Monologue',
        color: 'bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        iconColor: 'text-slate-500 dark:text-slate-300',
        description: 'Single speaker',
      },
      OTHER: {
        icon: HelpCircle,
        label: 'Other',
        color: 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700',
        iconColor: 'text-slate-500 dark:text-slate-400',
        description: 'Unclassified format',
      },
    };

    const config = typeConfig[type];
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}
        title={config.description}
      >
        <Icon className={`w-2.5 h-2.5 mr-0.5 ${config.iconColor}`} />
        {config.label}
      </span>
    );
  };

  const getContentAvailability = (project: ProjectListItem, detailProject?: Project | null) => {
    const options = getProjectAnalysisOptions(detailProject && detailProject.id === project.id ? detailProject : project);
    const features = [];
    const resolvedProject = detailProject && detailProject.id === project.id ? detailProject : null;
    const aiProcessing = (resolvedProject?.speaker_data as any)?.detectionMetadata?.aiProcessing || {};

    features.push({
      name: 'Transcription',
      available: project.status === 'completed',
      pending: false,
      icon: FileText,
      color: 'text-green-600'
    });

    features.push({
      name: 'Speakers',
      available: !!resolvedProject?.speaker_data,
      pending: false,
      icon: MessageCircle,
      color: 'text-green-600',
      label: options.namedSpeakers ? 'Named' : 'Generic'
    });

    if (options.summary) {
      features.push({
        name: 'AI Summary',
        available: !!resolvedProject?.ai_summary,
        pending: aiProcessing.summary === false,
        icon: Sparkles,
        color: 'text-blue-600'
      });
    }

    if (options.chapters) {
      features.push({
        name: 'Chapters',
        available: !!resolvedProject?.chapters && resolvedProject.chapters.length > 0,
        pending: aiProcessing.chapters === false,
        icon: BookOpen,
        color: 'text-purple-600',
        count: resolvedProject?.chapters?.length
      });
    }

    if (options.takeaways) {
      features.push({
        name: 'Key Takeaways',
        available: !!resolvedProject?.key_takeaways && resolvedProject.key_takeaways.length > 0,
        pending: aiProcessing.takeaways === false,
        icon: Lightbulb,
        color: 'text-purple-600',
        count: resolvedProject?.key_takeaways?.length
      });
    }

    if (options.quotes) {
      features.push({
        name: 'Social Quotes',
        available: !!resolvedProject?.social_quotes && resolvedProject.social_quotes.length > 0,
        pending: aiProcessing.quotes === false,
        icon: MessageSquare,
        color: 'text-purple-600',
        count: resolvedProject?.social_quotes?.length
      });
    }

    features.push({
      name: 'Content Outputs',
      available: (project.selected_content_types?.length || 0) > 0,
      pending: false,
      icon: Zap,
      color: 'text-emerald-600',
      count: project.selected_content_types?.length
    });

    return features;
  };

  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-4"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <DashboardLoadErrorState
        title="Projects unavailable"
        message={loadError}
        onRetry={() => {
          void fetchProjects({ markLoading: true, surfaceError: true, source: 'retry' });
        }}
      />
    );
  }

  const studioEmptyState = (
    <div className="h-full flex items-center justify-center bg-white dark:bg-[#0F172A] px-6 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)]">
        <div className="p-8 sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 dark:border-blue-500/20 bg-blue-50/80 dark:bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
            <Sparkles className="h-3.5 w-3.5" />
            Project Workspace
          </div>

          <div className="mt-5 max-w-xl">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Select a project to open the workspace
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Open a project to review the transcript, check speaker labels, and work through generated content in one place.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-4">
              <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">Transcript review</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Read the full transcript and jump between speakers quickly.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-4">
              <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">Insights panel</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Surface concepts, people, and useful highlights from the conversation.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-4">
              <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">Content outputs</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Open summaries, quotes, and other generated assets for each project.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {filteredAndSortedProjects.length > 0 ? (
              <button
                onClick={() => setProjectsSidebarOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                <FileText className="h-4 w-4" />
                Browse projects
              </button>
            ) : null}
            <Link
              href="/dashboard/upload"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Zap className="h-4 w-4" />
              Upload a new project
            </Link>
          </div>

          {filteredAndSortedProjects.length > 0 && (
            <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Recent projects
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {filteredAndSortedProjects.slice(0, 3).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      router.push(`/dashboard/projects?id=${project.id}`);
                      void selectProject(project.id);
                    }}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                  >
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {project.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(project.created_at).toLocaleDateString()}
                    </p>
                    <div className="mt-3 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      Open project
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredAndSortedProjects.length > 0 && (
            <button
              onClick={() => setProjectsSidebarOpen(true)}
              className="mt-6 lg:hidden inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400"
            >
              <PanelLeftOpen className="h-4 w-4" />
              Open project list
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard-page flex flex-col h-full w-full overflow-hidden bg-white dark:bg-slate-950">
      <ConfirmModal
        isOpen={!!pendingDeleteProjectId}
        onClose={() => setPendingDeleteProjectId(null)}
        onConfirm={confirmDeleteProject}
        title="Delete Project"
        description="This will permanently delete the project and all its generated content. This cannot be undone."
        confirmText="Delete"
        isDestructive
      />
      <ConfirmModal
        isOpen={pendingBulkDeleteProjects}
        onClose={() => setPendingBulkDeleteProjects(false)}
        onConfirm={confirmBulkDeleteProjects}
        title={`Delete ${selectedProjectIds.size} Project${selectedProjectIds.size === 1 ? '' : 's'}`}
        description="This will permanently delete the selected projects and all their generated content. This cannot be undone."
        confirmText={`Delete ${selectedProjectIds.size}`}
        isDestructive
      />
      {projects.length === 0 ? (
        <div className="flex-1 overflow-hidden">
          {studioEmptyState}
        </div>
      ) : (
        /* 3-Column Dashboard Layout */
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT COLUMN: Projects List (25% on desktop) - Collapsible */}
          {/* Mobile backdrop for projects sidebar */}
          {projectsSidebarOpen && !isMobileViewport && (
            <div
              className="fixed inset-0 bg-black/60 z-20 lg:hidden"
              onClick={() => setProjectsSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <aside
            data-tour="project-sidebar"
            className={`flex-shrink-0 border-r border-slate-200 bg-slate-50 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900 ${isMobileViewport
              ? showMobileList
                ? 'flex w-full flex-col overflow-hidden border-r-0 pb-40'
                : 'hidden'
              : projectsSidebarOpen
                ? 'fixed inset-y-0 left-0 z-30 flex w-[88vw] max-w-sm flex-col overflow-hidden shadow-2xl md:w-[26rem] lg:static lg:inset-auto lg:z-auto lg:w-[520px] lg:min-w-[460px] lg:flex-shrink-0 lg:shadow-none'
                : 'w-0 opacity-0 pointer-events-none'
              }`}
          >
            <div className="flex-shrink-0 p-5 pb-0 space-y-4">
              {/* Header with Select Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium text-slate-900 dark:text-slate-50">Project Workspace</h2>
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    {projects.length} project{projects.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (selectionMode) {
                      exitSelectionMode();
                    } else {
                      setSelectionMode(true);
                    }
                  }}
                  className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selectionMode
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  {selectionMode ? (
                    <>
                      <X className="w-4 h-4 mr-1.5" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <ListChecks className="w-4 h-4 mr-1.5" />
                      Select
                    </>
                  )}
                </button>
              </div>

              {/* Selection Mode Header */}
              {selectionMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-500/30">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleAllProjectSelection}
                        className="p-1 hover:bg-blue-900/40 rounded transition-colors"
                      >
                        {selectedProjectIds.size === filteredAndSortedProjects.length && filteredAndSortedProjects.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : selectedProjectIds.size > 0 ? (
                          <div className="w-4 h-4 border-2 border-blue-600 rounded bg-blue-600/20" />
                        ) : (
                          <Square className="w-4 h-4 text-blue-600" />
                        )}
                      </button>
                      <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                        {selectedProjectIds.size} selected
                      </span>
                    </div>
                    {selectedProjectIds.size > 0 && (
                      <button
                        onClick={() => setSelectedProjectIds(new Set())}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {/* Bulk actions - shown when projects are selected */}
                  {selectedProjectIds.size > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleBulkExport}
                        disabled={bulkDeletingProjects}
                        className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </button>
                      <button
                        onClick={() => setPendingBulkDeleteProjects(true)}
                        disabled={bulkDeletingProjects}
                        className="inline-flex items-center justify-center px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {bulkDeletingProjects ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 mr-2" />
                        )}
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                {/* Sort By */}
                <div className="flex-1 min-w-[140px]">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'recent' | 'oldest' | 'name-asc' | 'name-desc')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="recent">Recently Uploaded</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                  </select>
                </div>

                {/* Type Filter */}
                <div className="w-full">
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as 'all' | ProjectType)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="DEBATE">Debate</option>
                    <option value="INTERVIEW">Interview</option>
                    <option value="PODCAST">Podcast</option>
                    <option value="MONOLOGUE">Monologue</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Results count */}
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {filteredAndSortedProjects.length} {filteredAndSortedProjects.length === 1 ? 'project' : 'projects'}
                {(searchTerm || typeFilter !== 'all') && ` (filtered from ${projects.length})`}
              </div>
            </div>

            {/* Scrollable Projects List */}
            <div className={`flex-1 overflow-y-auto px-5 space-y-3 ${isMobileViewport ? 'pb-40' : 'pb-5'}`}>
              {filteredAndSortedProjects.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <FileText className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500 mb-2" />
                  <p className="text-sm">No projects found</p>
                  {(searchTerm || typeFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setTypeFilter('all');
                      }}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-300"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                filteredAndSortedProjects.map((project) => {
                  const isProjectSelected = selectedProjectIds.has(project.id);
                  const isActive = selectedProject?.id === project.id;
                  return (
                    <div
                      key={project.id}
                      {...(project.id === featuredProjectId ? { 'data-tour': 'premium-project' } : {})}
                      className={`group p-4 rounded-xl transition-colors cursor-pointer border overflow-hidden ${selectionMode && isProjectSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400'
                        : isActive
                          ? 'bg-slate-100 dark:bg-slate-800 border-blue-500 ring-1 ring-blue-500/50'
                          : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      onClick={() => {
                        if (selectionMode) {
                          toggleProjectSelection(project.id);
                          return;
                        }
                        router.push(`/dashboard/projects?id=${project.id}`);
                        void selectProject(project.id);
                      }}
                    >
                      {(() => {
                        const availability = getContentAvailability(project, selectedProject?.id === project.id ? selectedProject : null);
                        const pendingFeatures = availability.filter(f => f.pending && !f.available);
                        const availableCount = availability.filter(f => f.available).length;
                        const pendingLabel = pendingFeatures.map(f => f.name).join(', ');
                        return (
                          <>
                            {/* Top Row: Checkbox (selection mode), Title & Status */}
                            <div className="flex justify-between items-start mb-1.5 gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                {selectionMode && (
                                  <div className="flex-shrink-0 mt-0.5">
                                    {isProjectSelected ? (
                                      <CheckSquare className="w-4 h-4 text-blue-600" />
                                    ) : (
                                      <Square className="w-4 h-4 text-slate-500" />
                                    )}
                                  </div>
                                )}
                                <h3 className={`text-sm leading-snug text-slate-900 dark:text-slate-50 truncate ${selectedProject?.id === project.id ? 'font-semibold' : 'font-medium'
                                  }`} title={project.title}>
                                  {project.title}
                                </h3>
                              </div>
                              <div className="flex-shrink-0 mt-0.5">
                                {getStatusIcon(project.status)}
                              </div>
                            </div>

                            {/* Middle Row: Tier & Features */}
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              {getProcessingBadge(project)}

                              {/* Compact Content Indicators */}
                              {project.status === 'completed' && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                  {availableCount > 0 && (
                                    <span className="flex items-center px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded text-[10px] font-medium">
                                      {availableCount} Assets
                                    </span>
                                  )}
                                  {pendingFeatures.length > 0 && (
                                    <span
                                      className="flex items-center px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded text-[10px] font-medium"
                                      title={`Generating: ${pendingLabel}`}
                                    >
                                      Generating {pendingFeatures.length}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Bottom Row: Metadata & Actions */}
                            <div className="flex items-end justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                              {/* Metadata */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>{new Date(project.created_at).toLocaleDateString()}</span>
                                {project.audio_duration && (
                                  <span>{formatDuration(project.audio_duration)}</span>
                                )}
                                {project.project_type && getProjectTypeBadge(project.project_type)}
                              </div>

                              {/* Hover Actions */}
                              {!isDemoMode && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProject(project.id);
                                    }}
                                    disabled={deletingProject === project.id}
                                    className="p-1 text-slate-500 hover:text-red-600 transition-colors rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                    title="Delete project"
                                  >
                                    {deletingProject === project.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>

          </aside>

          {/* MIDDLE COLUMN: Main Content Stage */}
          <main
            className={`${showMainStage ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out ${!projectsSidebarOpen && !contextSidebarOpen ? 'lg:w-full' : 'lg:w-1/2'}`}
          >
            {selectedProject ? (
              <div className="h-full flex flex-col bg-white dark:bg-[#0F172A]">
                {(!isMobileViewport || !mobileConversationChromeCollapsed) && (
                <div className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={resetSelectedProject}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      aria-label="Back to project list"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 flex-1">
                      {editingProjectTitle ? (
                        <input
                          type="text"
                          value={editingTitleValue}
                          onChange={(e) => setEditingTitleValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveProjectTitle();
                            if (e.key === 'Escape') setEditingProjectTitle(false);
                          }}
                          onBlur={handleSaveProjectTitle}
                          disabled={savingTitle}
                          autoFocus
                          className="w-full rounded-lg border border-blue-500/50 bg-slate-100/60 px-3 py-2 text-sm font-medium text-slate-700 outline-none dark:bg-slate-800/70 dark:text-slate-100"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingTitleValue(selectedProject.title); setEditingProjectTitle(true); }}
                          className="w-full truncate rounded-lg px-1 py-1 text-left text-sm font-semibold text-slate-900 dark:text-slate-100"
                          title="Rename project"
                        >
                          {selectedProject.title}
                        </button>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-800">
                          {getProcessingBadge(selectedProject)}
                        </span>
                        {selectedProject.project_type && (
                          <span className="inline-flex items-center gap-1">
                            {getProjectTypeBadge(selectedProject.project_type)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Global Project Header */}
                <div className="hidden flex-shrink-0 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 lg:block">
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: sidebar toggle + badges */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setProjectsSidebarOpen(!projectsSidebarOpen)}
                        className="flex p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        title={projectsSidebarOpen ? 'Hide projects' : 'Show projects'}
                        aria-label={projectsSidebarOpen ? 'Hide projects sidebar' : 'Show projects sidebar'}
                      >
                        {projectsSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                      </button>
                      <div className="hidden sm:flex items-center gap-1.5">
                        {getProcessingBadge(selectedProject)}
                        {selectedProject.project_type && getProjectTypeBadge(selectedProject.project_type)}
                      </div>
                    </div>

                    {/* Center: Project title pill */}
                    <div className="flex-1 flex justify-center min-w-0 px-2">
                      {editingProjectTitle ? (
                        <input
                          type="text"
                          value={editingTitleValue}
                          onChange={(e) => setEditingTitleValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveProjectTitle();
                            if (e.key === 'Escape') setEditingProjectTitle(false);
                          }}
                          onBlur={handleSaveProjectTitle}
                          disabled={savingTitle}
                          autoFocus
                          className={`bg-slate-100/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 px-4 py-1.5 rounded-lg text-sm border border-blue-500/50 outline-none w-full text-center ${isCenterWide ? 'max-w-none' : 'max-w-2xl'
                            }`}
                        />
                      ) : (
                        <button
                          className={`group flex items-center justify-center gap-2 bg-slate-100/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 px-4 py-1.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors w-full truncate border border-transparent hover:border-slate-300 dark:hover:border-slate-700 ${isCenterWide ? 'max-w-none' : 'max-w-2xl'
                            }`}
                          onClick={() => { setEditingTitleValue(selectedProject.title); setEditingProjectTitle(true); }}
                          title="Click to rename"
                          aria-label="Rename project title"
                        >
                          <span className="truncate">{selectedProject.title}</span>
                          <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                        </button>
                      )}
                    </div>

                    {/* Right: Status + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedProjectAudioExpired && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs font-medium whitespace-nowrap">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span>Audio expired</span>
                        </div>
                      )}
                      {isReconciling && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium">
                          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                          <span>Repairing&hellip;</span>
                        </div>
                      )}
                      {selectedProject.status === 'completed' && (
                        <div className="hidden sm:flex relative group">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium cursor-default whitespace-nowrap">
                            <CheckCircle className="w-3 h-3 flex-shrink-0" />
                            <span>Processing complete</span>
                          </div>
                          {/* Tooltip on hover */}
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 w-56">
                            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Completed Tasks</p>
                            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                <span>Transcription (AssemblyAI)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                                <span>Speaker Attribution (AI Enhanced)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                                <span>Selected analysis outputs</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedProject.status === 'processing' && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium whitespace-nowrap">
                          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                          <span>{getProcessingStage(selectedProject)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setContextSidebarOpen(!contextSidebarOpen)}
                          className="flex p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                          title={contextSidebarOpen ? 'Hide details panel' : 'Show details panel'}
                          aria-label={contextSidebarOpen ? 'Hide details panel' : 'Show details panel'}
                        >
                          {contextSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transcript panel (full width) */}
                <div className="flex flex-col min-h-0 flex-1 overflow-hidden">

                  {/* Transcript Panel */}
                  <div className="flex flex-col min-h-0 overflow-hidden">
                    {/* Panel Header */}
                    {(!isMobileViewport || !mobileConversationChromeCollapsed) && (
                      <div data-tour="transcript-header" className="flex-shrink-0 border-b border-slate-200 bg-white/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <BarChart2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <div className="min-w-0">
                              <span className="block text-slate-800 dark:text-slate-100 font-semibold text-sm">Transcript</span>
                              {parsedSpeakerData?.detectionMetadata && (
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {parsedSpeakerData.detectionMetadata.totalSpeakers} speaker{parsedSpeakerData.detectionMetadata.totalSpeakers !== 1 ? 's' : ''} • {parsedSpeakerData.detectionMetadata.totalSegments} segments
                                </p>
                              )}
                            </div>
                          </div>
                          {isMobileViewport && (
                            <button
                              type="button"
                              onClick={() => setMobileConversationChromeCollapsed(true)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                              aria-label="Hide header rows"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                              Hide header
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                          {parsedSpeakerData && (
                            <>
                              <label className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${showTimestamps ? 'border-blue-300 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                                }`} title="Toggle timestamps">
                                <input type="checkbox" checked={showTimestamps} onChange={(e) => setShowTimestamps(e.target.checked)} className="sr-only" aria-label="Toggle transcript timestamps" />
                                <Clock className="w-3 h-3" />
                              </label>
                              <button
                                data-tour="view-toggle"
                                onClick={() => setReaderView(v => !v)}
                                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${readerView ? 'border-blue-300 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                                  }`}
                                title="Reader view"
                                aria-label={readerView ? 'Disable reader view' : 'Enable reader view'}
                              >
                                <BookOpen className="w-3 h-3" />
                              </button>
                              <select
                                value={selectedSpeaker || ''}
                                onChange={(e) => setSelectedSpeaker(e.target.value || null)}
                                className={`min-w-[8rem] text-xs px-2 py-0.5 rounded-full border transition-colors bg-transparent ${selectedSpeaker
                                  ? 'border-blue-300 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                                  }`}
                              >
                                <option value="">All speakers</option>
                                {Object.keys(parsedSpeakerData.speakers || {}).map((speakerId) => (
                                  <option key={speakerId} value={speakerId}>
                                    {getSpeakerDisplayName(parsedSpeakerData.speakers[speakerId])}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <DropdownMenu
                            align="right"
                            side="bottom"
                            offset={8}
                            portal
                            trigger={
                              <button
                                type="button"
                                data-tour="export-btn"
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${runningCoverageIds.has(selectedProject.id)
                                  ? 'border-cyan-300 dark:border-cyan-800/40 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700'
                                  }`}
                                title={isDemoMode ? 'Demo account is read-only' : !selectedProject.transcription_text ? 'Analysis requires a transcript' : 'More actions'}
                              >
                                {runningCoverageIds.has(selectedProject.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="w-4 h-4" />
                                )}
                                <span className="sr-only">More actions</span>
                              </button>
                            }
                          >
                          <DropdownMenuItem
                            onClick={() => handleRunCoverage(selectedProject)}
                            disabled={isDemoMode || runningCoverageIds.has(selectedProject.id) || !selectedProject.transcription_text}
                          >
                            {runningCoverageIds.has(selectedProject.id) ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyzing...
                              </>
                            ) : (
                              <>
                                <ScanSearch className="w-4 h-4" />
                                Run Analysis
                              </>
                            )}
                          </DropdownMenuItem>
                          {selectedProject.status === 'completed' && getProjectAnalysisOptions(selectedProject).insights && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={handleRedoInsights}
                                disabled={insightsStatus.loading || insightsStatus.generating || insightsStatus.refreshing}
                              >
                                <Sparkles className={`w-4 h-4 ${insightsStatus.refreshing ? 'animate-spin' : ''}`} />
                                {insightsStatus.refreshing ? 'Redoing insights...' : 'Redo insights'}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleRefresh} disabled={refreshing}>
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleSingleExport(selectedProject)}>
                            <Download className="w-4 h-4" />
                            Export
                          </DropdownMenuItem>
                          </DropdownMenu>
                        </div>
                        </div>
                      </div>
                    )}

                    {(!isMobileViewport || !mobileConversationChromeCollapsed) && (
                      <>
                        {/* Status notices */}
                        {(isProjectRefreshing || (projectPreviousStatus === 'processing' && selectedProject.status === 'completed')) && (
                          <div className="flex-shrink-0 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            {isProjectRefreshing && (
                              <div className="flex items-center gap-2 text-blue-400 text-sm">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                <span>Refreshing speaker data...</span>
                              </div>
                            )}
                            {projectPreviousStatus === 'processing' && selectedProject.status === 'completed' && (
                              <div className="flex items-center gap-2 text-green-400 text-sm">
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>Processing complete!</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
                          {selectedProjectAudioExpired ? (
                            <div className="flex items-center gap-2 text-rose-300 text-sm">
                              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>
                                Source audio was deleted. Transcript and generated content remain available.
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}

                    {/* Audio Player */}
                    {!selectedProjectAudioExpired && audioUrl && (
                      <AudioPlayer
                        src={audioUrl}
                        audioElementRef={audioElementRef}
                        headerToggle={
                          isMobileViewport && mobileConversationChromeCollapsed ? (
                            <button
                              type="button"
                              onClick={() => setMobileConversationChromeCollapsed(false)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                              aria-label="Show header rows"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                              Show header
                            </button>
                          ) : null
                        }
                      />
                    )}

                    {/* Transcript Body */}
                    <div ref={readerScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                      {parsedSpeakerData ? (
                        readerView ? (
                          <div className="px-4 py-4 divide-y divide-slate-200 dark:divide-slate-800/70 relative">
                            {/* Resume follow-along button */}
                            {readerAutoScrollPaused && (
                              <div className="sticky top-2 z-10 flex justify-center mb-2 pointer-events-none">
                                <button
                                  onClick={() => { isReaderScrollingRef.current = false; setReaderAutoScrollPaused(false); }}
                                  className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                >
                                  ↓ Resume follow-along
                                </button>
                              </div>
                            )}
                            {parsedSpeakerData.segments.map((segment: any, i: number) => {
                              const speakerId = segment.finalSpeakerId || segment.speakerId;
                              const speaker = parsedSpeakerData.speakers[speakerId];
                              const speakerName = speaker?.finalName || speaker?.fallbackName || speaker?.name || speakerId;
                              const badgeClasses = getSpeakerBadgeClasses(speakerId);
                              const mins = Math.floor((segment.startTime || 0) / 60);
                              const secs = Math.floor((segment.startTime || 0) % 60);
                              const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;
                              const isActive = readerActiveIndex === i;
                              return (
                                <div
                                  key={i}
                                  id={`reader-segment-${i}`}
                                  className={`flex items-baseline gap-3 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer transition-all duration-300 ${isActive
                                    ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-2 border-blue-500 pl-3 -ml-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                                    : 'hover:bg-slate-100/40 dark:hover:bg-slate-800/40'
                                    }`}
                                  onClick={() => {
                                    const audio = audioElementRef.current;
                                    if (!audio) return;
                                    audio.currentTime = segment.startTime || 0;
                                    isReaderScrollingRef.current = false;
                                    setReaderAutoScrollPaused(false);
                                    audio.play().catch(() => undefined);
                                  }}
                                >
                                  <span className="flex-shrink-0 text-[11px] font-mono text-slate-500 w-9 select-none">{timestamp}</span>
                                  <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClasses}`}>{speakerName}</span>
                                  <span className={`text-[14px] leading-relaxed transition-colors duration-300 ${isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{segment.text}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <ConversationView
                            speakerData={parsedSpeakerData}
                            transcriptionText={selectedProject.transcription_text || ''}
                            projectId={selectedProject.id}
                            onSpeakerUpdate={(updatedSpeakerData) => {
                              setSelectedProject(prev => prev ? { ...prev, speaker_data: updatedSpeakerData } : null);
                            }}
                            insightsSidebarOpen={insightsSidebarOpen}
                            onInsightsSidebarChange={setInsightsSidebarOpen}
                            onInsightsStatusChange={setInsightsStatus}
                            onInsightsDataChange={setInsightsData}
                            triggerInsightGeneration={triggerInsightGeneration}
                            triggerInsightRefresh={triggerInsightRefresh}
                            insightsRefreshToken={insightsRefreshToken}
                            audioPlayerRef={audioPlayerRef}
                            audioElementRef={audioElementRef}
                            audioSrc={audioUrl}
                            showTimestamps={showTimestamps}
                            selectedSpeaker={selectedSpeaker}
                            selectedSegments={selectedSegments}
                            onToggleSegmentSelection={handleToggleSegmentSelection}
                            scrollToSegmentIndex={scrollToSegmentIndex}
                            onConfirmSegment={handleConfirmSegment}
                            onTranscriptInsightClick={(insightId) => {
                              if (isMobileViewport) {
                                setMobileStudioTab('content');
                              } else {
                                setContextSidebarOpen(true);
                              }
                              setActiveInsightId(insightId);
                            }}
                          />
                        )
                      ) : selectedProject.transcription_text ? (
                        <div className="px-4 py-4">
                          <div className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {selectedProject.transcription_text}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center py-12 text-slate-400">
                            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-slate-500" />
                            <p className="text-sm">Processing transcription...</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Transcript Footer */}
                    <div className={`flex-shrink-0 border-t border-slate-200 px-4 text-slate-400 dark:border-slate-800 dark:text-slate-500 ${isMobileViewport ? 'pt-2 pb-20' : 'py-3'}`}>
                      <p className="text-slate-400 dark:text-slate-500 text-xs">
                        {parsedSpeakerData?.detectionMetadata?.totalSpeakers ?? 0} speakers detected
                        {(selectedProject.audio_duration || selectedProject.audio_duration_seconds)
                          ? ` | ${formatDuration(selectedProject.audio_duration || selectedProject.audio_duration_seconds || 0)}`
                          : ''
                        }
                        {accuracyPercent !== null ? ` · ${accuracyPercent.toFixed(1)}% accuracy` : ''}
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            ) : selectedProjectLoading ? (
              <div className="h-full flex flex-col bg-white dark:bg-[#0F172A] p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-10 w-1/3 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
                </div>
              </div>
            ) : (
              /* Empty state when no project selected */
              studioEmptyState
            )}
          </main>

          {/* RIGHT COLUMN: Context Sidebar (25% on desktop) */}
          {/* Mobile backdrop for context sidebar */}
          {!isMobileViewport && contextSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/60 z-20 lg:hidden"
              onClick={() => setContextSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <ContextSidebar
            speakers={parsedSpeakerData?.speakers}
            onSpeakerClick={(speakerId) => setActiveSpeakerId(speakerId)}
            activeSpeakerId={activeSpeakerId}
            projectId={selectedProject?.id}
            segments={parsedSpeakerData?.segments}
            reviewItems={reviewItems}
            speakerSuggestions={speakerSuggestions}
            reviewSegmentIndices={reviewSegmentIndices}
            selectedSegments={selectedSegments}
            hasUncertainSegments={hasUncertainSegments}
            onSelectAllUncertain={handleSelectAllUncertain}
            onClearSelection={() => setSelectedSegments(new Set())}
            onToggleSegmentSelection={handleToggleSegmentSelection}
            onScrollToSegment={(idx) => {
              setScrollToSegmentIndex(null);
              setTimeout(() => setScrollToSegmentIndex(idx), 0);
            }}
            onConfirmSegment={handleConfirmSegment}
            onSegmentReassign={handleSidebarSegmentReassign}
            onSpeakerAdd={handleAddSpeaker}
            onSpeakerDelete={handleDeleteSpeaker}
            aiTouchupLoading={aiTouchupLoading}
            onAiTouchup={handleAiTouchup}
            aiTouchupResult={aiTouchupResult}
            touchupPreview={touchupPreview}
            applyingTouchup={applyingTouchup}
            onApplyTouchup={handleApplyTouchup}
            onTogglePreviewItem={handleTogglePreviewItem}
            onDismissPreview={() => setTouchupPreview(null)}
            onSpeakerRename={async (speakerId, newName) => {
              if (!selectedProject?.id) return;
              const res = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename', newName }),
              });
              if (!res.ok) return;
              const data = await res.json();
              if (data.updatedSpeakerData) {
                setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
              }
            }}
            onSpeakerRoleChange={async (speakerId, newRole) => {
              if (!selectedProject?.id) return;
              const res = await fetch(`/api/projects/${selectedProject.id}/speakers/${speakerId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_role', newRole }),
              });
              if (!res.ok) return;
              const data = await res.json();
              if (data.updatedSpeakerData) {
                setSelectedProject(prev => prev ? { ...prev, speaker_data: data.updatedSpeakerData } : null);
              }
            }}
            onSpeakerMerge={async (sourceSpeakerId, targetSpeakerId) => {
              if (!selectedProject?.id) return;
              if (sourceSpeakerId === targetSpeakerId) return;

              // Merge: delete source, reassign its segments to target
              const response = await fetch(`/api/projects/${selectedProject.id}/speakers/${sourceSpeakerId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'reassign',
                  reassignToSpeakerId: targetSpeakerId
                })
              });

              if (response.ok) {
                const refreshed = await fetch(`/api/projects/${selectedProject.id}`);
                if (refreshed.ok) {
                  const updatedProject = await refreshed.json();
                  setSelectedProject(prev => prev ? {
                    ...prev,
                    speaker_data: updatedProject.speaker_data
                  } : null);
                }
              }
            }}
            insights={insightsData}
            activeInsightId={activeInsightId}
            onInsightClick={(insightId) => setActiveInsightId(prev => prev === insightId ? null : insightId)}
            insightsLoading={insightsStatus.loading}
            insightsGenerating={insightsStatus.generating}
            onGenerateInsights={() => {
              if (isDemoMode) {
                showToast('Demo account is read-only.');
                return;
              }
              setTriggerInsightGeneration(prev => prev + 1);
            }}
            summary={selectedProject?.ai_summary}
            chapters={selectedProject?.chapters || []}
            takeaways={selectedProject?.key_takeaways || []}
            quotes={selectedProject?.social_quotes || []}
            contentLoading={selectedProject?.status === 'processing' || isProjectRefreshing}
            outputs={outputs}
            onCopyOutput={handleCopyOutput}
            onDownloadOutput={handleDownloadOutput}
            onDeleteOutput={handleDeleteOutput}
            deletingOutput={deletingOutput}
            generatingContentTypes={generatingContentTypes}
            onGenerateContentBlock={handleGenerateContentBlock}
            contentGuidanceByType={contentGuidanceByType}
            onContentGuidanceChange={handleContentGuidanceChange}
            analysisStates={Object.fromEntries(
              ANALYSIS_OPTION_CONFIG.map((option) => [
                option.key,
                {
                  available: isAnalysisOptionAvailable(selectedProject, option.key),
                  generating: effectiveGeneratingAnalysisKeys.has(option.key),
                },
              ])
            )}
            onGenerateAnalysisOption={handleGenerateAnalysisOption}
            isOpen={isMobileViewport ? showMobileContent : contextSidebarOpen}
            onClose={isMobileViewport ? undefined : () => setContextSidebarOpen(false)}
            readOnly={isDemoMode}
            mobileSheet={!isMobileViewport}
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              isMobileViewport
                ? showMobileContent
                  ? 'flex h-full w-full flex-col border-l-0 pb-28'
                  : 'hidden'
                : contextSidebarOpen
                  ? 'fixed inset-x-0 bottom-0 z-30 h-[62svh] rounded-t-[1.75rem] border-l-0 opacity-100 shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[24rem] md:max-w-none md:rounded-none md:border-l lg:static lg:inset-auto lg:z-auto lg:flex-shrink-0 lg:w-[420px] lg:min-w-[380px] lg:shadow-none'
                  : 'pointer-events-none translate-y-8 opacity-0 md:translate-y-0 md:w-0'
            }`}
          />
        </div>
      )}

      {isMobileViewport && projects.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-[1.75rem] border border-b-0 border-slate-200/90 bg-white/95 px-3 pt-2 shadow-[0_-18px_50px_-24px_rgba(15,23,42,0.4)] backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/95"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)',
          }}
        >
          <div className="grid grid-cols-3 gap-1">
            {([
              { id: 'projects', label: 'Projects', icon: FileText, disabled: false },
              { id: 'conversation', label: 'Conversation', icon: MessageSquare, disabled: !mobileHasProjectStage },
              { id: 'content', label: 'Content', icon: Sparkles, disabled: !mobileHasProjectStage },
            ] as const).map(({ id, label, icon: Icon, disabled }) => {
              const isActive = mobileStudioTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (!disabled) {
                      setMobileStudioTab(id);
                    }
                  }}
                  disabled={disabled}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : disabled
                        ? 'text-slate-400 dark:text-slate-600'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'
                  }`}
                  aria-pressed={isActive}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setExportProjects([]);
        }}
        projects={exportProjects}
        onExport={handleExport}
      />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white animate-in slide-in-from-top-2 duration-200 ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />
          }
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
}
