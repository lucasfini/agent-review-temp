"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, FileAudio, X, AlertCircle, CheckCircle, Clock, History, Trash2, Eye, FileVideo, Loader2, ChevronDown, ChevronUp, Lightbulb, Users, Mic, Pencil, UserCircle, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';
import { DemoTour } from '@/components/demo/DemoTour';
import { calculateOverallProgress, getStageDisplayName, getUserFacingProcessingMessage, type ProcessingStage } from '@/lib/tier-progress-config';
import { SpeakerRosterForm, type RosterSpeaker } from '@/components/SpeakerRosterForm';
import { useAudioExtractor } from '@/lib/hooks/useAudioExtractor';
import { emitProjectMutation } from '@/lib/project-events';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

type PerformanceLevel = 'standard' | 'pro';
type IntegrationProvider = 'zoom' | 'microsoft';
const HISTORY_PAGE_SIZE = 10;

interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  metadata?: { email?: string; name?: string } | null;
  updatedAt?: string | null;
}

interface ZoomRecording {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
  files: Array<{
    fileId: string;
    fileType: string;
    fileExtension: string;
    fileSize: number;
  }>;
}

interface MicrosoftRecording {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  mimeType?: string;
}

interface UploadedFile {
  file?: File;
  id: string;
  status: 'queued' | 'pending' | 'extracting' | 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled';
  progress: number;
  extractionProgress?: number;
  error?: string;
  projectId?: string;
  processingStage?: ProcessingStage;
  stageProgress?: number;
  processingMessage?: string;
  performanceLevel: PerformanceLevel;
  displayName: string;
  sourceUrl?: string;
  sourceType?: 'local' | 'url' | 'youtube' | 'direct';
}

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

interface ActiveProject {
  id: string;
  title: string;
  audio_file_name: string | null;
  audio_file_size: number | null;
  audio_duration: number | null;
  audio_expires_at?: string | null;
  audio_deleted_at?: string | null;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  processing_stage?: ProcessingStage;
  processing_progress?: number;
  processing_message?: string | null;
  performance_level?: PerformanceLevel;
}

const TIER_OPTIONS: { id: PerformanceLevel; label: string; outcome: string; cost: string; description: string }[] = [
  {
    id: 'standard',
    label: 'Standard',
    outcome: 'Transcript + who said what',
    cost: '$0.39/hr',
    description: 'Clean transcript with diarization and numbered speakers. All 11 content types stay available after processing.',
  },
  {
    id: 'pro',
    label: 'Pro',
    outcome: 'Full analysis + content-ready',
    cost: '$0.67/hr',
    description: 'Adds speaker names, roles, summaries, chapters, takeaways, and quotes to improve downstream content quality.',
  },
];

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // Fall back to generic copy.
  }
  return fallback;
}

function formatExpiryDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTierLabel(level?: string | null): string {
  if (!level) return 'Standard';
  if (level === 'basic') return 'Standard';
  if (level === 'premium') return 'Pro';
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export default function UploadPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [activeProjectsLoading, setActiveProjectsLoading] = useState(false);
  const [performanceLevel, setPerformanceLevel] = useState<PerformanceLevel>('pro');
  const performanceLevelRef = useRef<PerformanceLevel>('pro');
  const [rosterSpeakers, setRosterSpeakers] = useState<RosterSpeaker[]>([]);
  const [speakerCount, setSpeakerCount] = useState<number | undefined>(undefined);
  const [recommendedSpeakerCount, setRecommendedSpeakerCount] = useState<number | undefined>(undefined);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [activeProvider, setActiveProvider] = useState<IntegrationProvider | null>(null);
  const [recordings, setRecordings] = useState<Array<ZoomRecording | MicrosoftRecording>>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsError, setRecordingsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'local' | 'url' | 'integrations'>('local');
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isUrlSubmitting, setIsUrlSubmitting] = useState(false);
  const lastActiveProjectCountRef = useRef<number | null>(null);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadRequestRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const pollTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cancelledUploadsRef = useRef<Set<string>>(new Set());

  // Fix: drag counter prevents isDragActive flickering when cursor passes over child elements
  const dragCounterRef = useRef(0);

  const { extractAudio } = useAudioExtractor();
  const { user, session, isDemoMode } = useAuth();

  useEffect(() => {
    const controllers = uploadControllersRef.current;
    const requests = uploadRequestRef.current;
    const pollTimeouts = pollTimeoutsRef.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      requests.forEach((xhr) => xhr.abort());
      pollTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

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
    const pendingFile = uploadedFiles.find(f => f.status === 'pending' || f.status === 'extracting');
    if (pendingFile?.file) {
      const estimated = estimateSpeakerCountFromTitle(pendingFile.file.name);
      setRecommendedSpeakerCount(estimated);
      // Auto-open advanced options to surface the recommendation
      if (estimated) setShowAdvancedOptions(true);
    } else {
      setRecommendedSpeakerCount(undefined);
    }
  }, [uploadedFiles]);

  const handlePerformanceChange = (level: PerformanceLevel) => {
    performanceLevelRef.current = level;
    setPerformanceLevel(level);
  };

  useEffect(() => {
    if (user) {
      setHistoryPage(1);
      fetchUploadHistory(1);
      fetchIntegrations();
      fetchActiveProjects();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchActiveProjects();
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchIntegrations = async () => {
    if (!session?.access_token) return;
    setIntegrationsLoading(true);
    try {
      const res = await fetch('/api/integrations/providers', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Failed to load integrations');
      const data = await res.json();
      setIntegrations(data.providers || []);
    } catch (error) {
      console.error('Failed to load integrations:', error);
      toast.error('Failed to load integrations. Refresh the page and try again.');
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const startOAuth = async (provider: IntegrationProvider) => {
    if (!session?.access_token) return;
    const res = await fetch(`/api/integrations/${provider}/start?mode=json`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!res.ok) {
      console.error('Failed to start OAuth');
      toast.error(`Unable to connect ${provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'} right now.`);
      return;
    }
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    toast.error(`Unable to connect ${provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'} right now.`);
  };

  const openImportDialog = async (provider: IntegrationProvider) => {
    if (!session?.access_token) return;
    setShowImportDialog(true);
    setActiveProvider(provider);
    setRecordings([]);
    setRecordingsError(null);
    setRecordingsLoading(true);
    try {
      const res = await fetch(`/api/integrations/${provider}/recordings`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to load recordings.'));
      }
      const data = await res.json();
      setRecordings(data.recordings || []);
    } catch {
      setRecordingsError('We could not load recordings right now. Please try again.');
    } finally {
      setRecordingsLoading(false);
    }
  };

  const importRecording = async (payload: any) => {
    if (!session?.access_token || !activeProvider) return;
    setRecordingsLoading(true);
    setRecordingsError(null);
    try {
      const res = await fetch(`/api/integrations/${activeProvider}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Import failed.'));
      }
      await fetchUploadHistory();
      await fetchActiveProjects();
      setShowImportDialog(false);
      toast.success('Import started. Your recording is now processing.');
    } catch {
      setRecordingsError('We could not import that recording. Please try again.');
    } finally {
      setRecordingsLoading(false);
    }
  };

  const fetchUploadHistory = async (page = historyPage) => {
    try {
      if (!user?.id) return;
      setHistoryLoading(true);
      const offset = (page - 1) * HISTORY_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('projects')
        .select('id, title, audio_file_name, audio_file_size, audio_duration, audio_expires_at, audio_deleted_at, status, created_at, processing_completed_at', { count: 'exact' })
        .eq('user_id', user.id)
        .in('status', ['completed', 'failed'])
        .order('created_at', { ascending: false })
        .range(offset, offset + HISTORY_PAGE_SIZE - 1) as { data: any[] | null; error: any; count?: number | null };

      if (error) {
        console.error('Error fetching upload history:', error);
        return;
      }

      const total = count ?? 0;
      const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
      if (page > totalPages && totalPages > 0) {
        setHistoryPage(totalPages);
        await fetchUploadHistory(totalPages);
        return;
      }

      setHistoryTotalCount(total);
      setHistoryTotalPages(totalPages);
      setUploadHistory((data || []).filter(item => item.status === 'completed' || item.status === 'failed'));
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchActiveProjects = async () => {
    try {
      if (!user?.id) return;
      setActiveProjectsLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, audio_file_name, audio_file_size, audio_duration, audio_expires_at, audio_deleted_at, status, created_at, processing_stage, processing_progress, processing_message, performance_level')
        .eq('user_id', user.id)
        .in('status', ['uploading', 'processing'])
        .order('created_at', { ascending: false })
        .limit(10) as { data: any[] | null; error: any };

      if (error) {
        console.error('Error fetching active projects:', error);
        return;
      }

      const activeCount = (data || []).length;
      setActiveProjects((data || []) as ActiveProject[]);
      const previousCount = lastActiveProjectCountRef.current;
      if (activeCount === 0 && previousCount && previousCount > 0) {
        fetchUploadHistory();
      }
      lastActiveProjectCountRef.current = activeCount;
    } catch (error) {
      console.error('Failed to fetch active projects:', error);
    } finally {
      setActiveProjectsLoading(false);
    }
  };

  const clearTrackedUploadState = (fileId: string) => {
    uploadControllersRef.current.get(fileId)?.abort();
    uploadControllersRef.current.delete(fileId);
    uploadRequestRef.current.get(fileId)?.abort();
    uploadRequestRef.current.delete(fileId);
    const timeoutId = pollTimeoutsRef.current.get(fileId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pollTimeoutsRef.current.delete(fileId);
    }
  };

  const getAuthHeaders = async (contentType: 'json' | 'none' = 'none') => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      ...(contentType === 'json' ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  };

  const cancelUploadOnServer = async (projectId: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/projects/${projectId}/cancel`, {
      method: 'POST',
      headers,
    });

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
      await fetchActiveProjects();
    } catch (error) {
      console.error('Failed to delete upload:', error);
      setConfirmDeleteId(null);
    }
  };

  const cancelUploadedFile = async (uploadedFile: UploadedFile) => {
    cancelledUploadsRef.current.add(uploadedFile.id);
    uploadRequestRef.current.get(uploadedFile.id)?.abort();
    uploadControllersRef.current.get(uploadedFile.id)?.abort();
    clearTrackedUploadState(uploadedFile.id);

    if (uploadedFile.projectId) {
      try {
        await cancelUploadOnServer(uploadedFile.projectId);
        emitProjectMutation({ projectId: uploadedFile.projectId, action: 'cancelled' });
      } catch (error) {
        console.error('Failed to cancel upload:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to cancel upload.');
        cancelledUploadsRef.current.delete(uploadedFile.id);
        return;
      }
    }

    setUploadedFiles(prev => prev.filter(f => f.id !== uploadedFile.id));
    await fetchActiveProjects();
    toast.success('Upload cancelled.');
  };

  const deleteActiveProject = async (projectId: string) => {
    try {
      await deleteProjectById(projectId);
      emitProjectMutation({ projectId, action: 'deleted' });
      setUploadedFiles(prev => {
        prev
          .filter(file => file.projectId === projectId)
          .forEach(file => {
            cancelledUploadsRef.current.add(file.id);
            clearTrackedUploadState(file.id);
          });
        return prev.filter(file => file.projectId !== projectId);
      });
      await fetchActiveProjects();
      await fetchUploadHistory();
      toast.success('Project deleted.');
    } catch (error) {
      console.error('Failed to delete active project:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete project.');
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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/upload/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({
          url: trimmed,
          title: urlTitle.trim() || undefined,
          performanceLevel,
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
        processingMessage: 'Import complete. Starting transcription...',
        performanceLevel,
        displayName,
        sourceUrl: trimmed,
        sourceType,
        projectId: result.projectId
      };

      setUploadedFiles(prev => [newEntry, ...prev]);
      pollForProgress(newEntry.id, result.projectId, performanceLevel);
      setUrlInput('');
      setUrlTitle('');
      await fetchActiveProjects();
      await fetchUploadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'We could not import that URL. Check the link and try again.';
      setUrlError(message);
    } finally {
      setIsUrlSubmitting(false);
    }
  };

  const handleFiles = (files: File[]) => {
    const selectedLevel = performanceLevelRef.current;

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
      performanceLevel: selectedLevel,
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
        processingMessage: 'Waiting in queue...',
        performanceLevel: selectedLevel,
        displayName: file.name,
        sourceType: 'local',
      })),
      ...videoFiles.map((file): UploadedFile => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        status: 'queued' as const,
        progress: 0,
        processingStage: 'pending' as ProcessingStage,
        stageProgress: 0,
        processingMessage: 'Waiting in queue...',
        performanceLevel: selectedLevel,
        displayName: file.name,
        sourceType: 'local',
      })),
    ];

    // Queue files — the useEffect queue processor will start them one at a time
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const processVideoFile = async (uploadedFile: UploadedFile) => {
    try {
      if (!uploadedFile.file) {
        throw new Error('No file provided for video processing');
      }
      const extractedAudioFile = await extractAudio(uploadedFile.file, (progress) => {
        if (cancelledUploadsRef.current.has(uploadedFile.id)) return;
        setUploadedFiles(prev => prev.map(f =>
          f.id === uploadedFile.id ? { ...f, extractionProgress: progress } : f
        ));
      });

      if (cancelledUploadsRef.current.has(uploadedFile.id)) {
        setUploadedFiles(prev => prev.filter(f => f.id !== uploadedFile.id));
        return;
      }

      const updatedFile = {
        ...uploadedFile,
        file: extractedAudioFile,
        status: 'pending' as const,
        processingMessage: 'Audio extracted. Starting upload...',
        extractionProgress: 100,
      };

      setUploadedFiles(prev => prev.map(f =>
        f.id === uploadedFile.id ? updatedFile : f
      ));

      processFile(updatedFile);

    } catch (error) {
      if (cancelledUploadsRef.current.has(uploadedFile.id)) {
        setUploadedFiles(prev => prev.filter(f => f.id !== uploadedFile.id));
        return;
      }
      console.error('Extraction error:', error);
      setUploadedFiles(prev => prev.map(f =>
        f.id === uploadedFile.id ? {
          ...f,
          status: 'error',
          error: 'Failed to extract audio from video.',
          processingMessage: 'Extraction failed',
        } : f
      ));
    }
  };

  const processFile = async (uploadedFile: UploadedFile) => {
    const controller = new AbortController();
    uploadControllersRef.current.set(uploadedFile.id, controller);

    try {
      if (!uploadedFile.file) {
        throw new Error('No file provided for upload');
      }
      // Fix: use the performanceLevel stored on the file at drop time, not the live ref.
      // This prevents a tier mismatch if the user changes tiers after dropping a file.
      const filePerformanceLevel = uploadedFile.performanceLevel;
      setUploadedFiles(prev =>
        prev.map(f => f.id === uploadedFile.id ? {
          ...f,
          status: 'uploading',
          processingStage: 'uploading',
          stageProgress: 0,
          processingMessage: 'Uploading audio...',
          progress: calculateOverallProgress(f.performanceLevel, 'uploading', 0),
        } : f)
      );

      const payload: any = {
        fileName: uploadedFile.file.name,
        contentType: uploadedFile.file.type || 'application/octet-stream',
        size: uploadedFile.file.size,
        title: uploadedFile.file.name.replace(/\.[^/.]+$/, ""),
        performanceLevel: filePerformanceLevel,
      };

      if (rosterSpeakers.length > 0) {
        payload.rosterSpeakers = rosterSpeakers;
      }

      if (speakerCount && speakerCount >= 2 && speakerCount <= 12) {
        payload.speakerCount = speakerCount;
      }

      // Step 1: Initialize upload and get presigned URL
      const initHeaders = await getAuthHeaders('json');
      const initResponse = await fetch('/api/upload/init', {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify(payload),
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({ error: 'Upload initialization failed' }));
        throw new Error(errorData.error || `Init failed with status ${initResponse.status}`);
      }

      const { presignedUrl, objectKey, projectId, audioFingerprint, uploadToken } = await initResponse.json();

      setUploadedFiles(prev =>
        prev.map(f => f.id === uploadedFile.id ? { ...f, projectId } : f)
      );

      if (controller.signal.aborted || cancelledUploadsRef.current.has(uploadedFile.id)) {
        await cancelUploadOnServer(projectId);
        return;
      }

      // Step 2: Upload directly to R2 using XMLHttpRequest for real progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadRequestRef.current.set(uploadedFile.id, xhr);

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setUploadedFiles(prev =>
              prev.map(f => {
                if (f.id !== uploadedFile.id || f.status !== 'uploading') return f;
                return {
                  ...f,
                  processingStage: 'uploading',
                  stageProgress: percentComplete,
                  progress: calculateOverallProgress(f.performanceLevel, 'uploading', percentComplete),
                };
              })
            );
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            console.error('S3 Upload Error:', xhr.status, xhr.responseText);
            reject(new Error(`S3 Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => {
          const abortError = new Error('Upload cancelled');
          abortError.name = 'AbortError';
          reject(abortError);
        });

        xhr.open('PUT', presignedUrl, true);
        xhr.setRequestHeader('Content-Type', uploadedFile.file!.type || 'application/octet-stream');
        xhr.send(uploadedFile.file);
      });

      uploadRequestRef.current.delete(uploadedFile.id);

      if (controller.signal.aborted || cancelledUploadsRef.current.has(uploadedFile.id)) {
        await cancelUploadOnServer(projectId);
        return;
      }

      // Step 3: Finalize upload and queue transcription
      const finalizeHeaders = await getAuthHeaders('json');
      const finalizeResponse = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: finalizeHeaders,
        body: JSON.stringify({
          projectId,
          objectKey,
          audioFingerprint,
          uploadToken,
          performanceLevel: filePerformanceLevel,
          speakerCount
        }),
        signal: controller.signal,
      });

      if (!finalizeResponse.ok) {
        const errorData = await finalizeResponse.json().catch(() => ({ error: 'Finalize failed' }));
        throw new Error(errorData.error || `Finalize failed with status ${finalizeResponse.status}`);
      }

      setUploadedFiles(prev =>
        prev.map(f => f.id === uploadedFile.id ? {
          ...f,
          status: 'processing',
          projectId,
          processingStage: 'transcribing',
          stageProgress: 0,
          processingMessage: 'Upload complete. Starting transcription...',
          progress: calculateOverallProgress(f.performanceLevel, 'transcribing', 0),
        } : f)
      );

      pollForProgress(uploadedFile.id, projectId, uploadedFile.performanceLevel);

    } catch (error) {
      console.error('Upload error:', error);

      let errorMessage = 'Upload failed';
      // Treat init/server config failures as fatal so queued siblings don't
      // spin through the queue and fail one-by-one.
      let isServerError = false;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (cancelledUploadsRef.current.has(uploadedFile.id)) {
            setUploadedFiles(prev => prev.filter(f => f.id !== uploadedFile.id));
            return;
          }
          errorMessage = 'Upload cancelled.';
        } else {
          errorMessage = error.message;
          // Init/config errors affect every queued file — mark siblings as
          // error immediately so the queue doesn't keep spinning.
          isServerError =
            error.message.includes('initialization failed') ||
            error.message.includes('Init failed') ||
            error.message.includes('Unsupported audio format') ||
            error.message.includes('500');
        }
      }

      setUploadedFiles(prev =>
        prev.map(f => {
          if (f.id === uploadedFile.id) {
            return {
              ...f,
              status: 'error' as const,
              error: errorMessage,
              processingStage: 'failed' as const,
              processingMessage: errorMessage,
              stageProgress: 0,
              progress: 0,
            };
          }
          // Cancel queued siblings if the failure is a server/config error
          if (isServerError && f.status === 'queued') {
            return {
              ...f,
              status: 'error' as const,
              error: 'Upload stopped — a previous file failed to initialize.',
              processingStage: 'failed' as const,
              processingMessage: 'Upload stopped.',
              stageProgress: 0,
              progress: 0,
            };
          }
          return f;
        })
      );
    } finally {
      clearTrackedUploadState(uploadedFile.id);
    }
  };

  const pollForProgress = (fileId: string, projectId: string, fallbackTier?: PerformanceLevel) => {
    const poll = async () => {
      if (cancelledUploadsRef.current.has(fileId)) {
        clearTrackedUploadState(fileId);
        return;
      }

      try {
        const response = await fetch(`/api/projects/${projectId}/status`);
        if (response.status === 404) {
          setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
          clearTrackedUploadState(fileId);
          return;
        }
        if (!response.ok) throw new Error('Failed to fetch project status');

        const status = await response.json();
        const apiStage = (status.processing_stage || 'pending') as ProcessingStage;
        const normalizedStage: ProcessingStage =
          status.status === 'cancelled' ? 'cancelled' :
          status.status === 'failed' ? 'failed' :
            status.status === 'completed' ? 'completed' : apiStage;
        const stageProgress = typeof status.processing_progress === 'number' ? status.processing_progress : 0;
        const derivedStatus =
          status.status === 'cancelled' ? 'cancelled' :
          status.status === 'completed' ? 'completed' :
            status.status === 'failed' ? 'error' : 'processing';
        const tier = (status.performance_level ||
          uploadedFiles.find(f => f.id === fileId)?.performanceLevel ||
          fallbackTier ||
          'standard') as PerformanceLevel;
        const progressValue = status.status === 'completed'
          ? 100
          : calculateOverallProgress(tier, normalizedStage, stageProgress);
        const message = derivedStatus === 'completed'
          ? 'Processing complete!'
          : getUserFacingProcessingMessage(tier, normalizedStage, status.processing_message);

        setUploadedFiles(prev =>
          prev.map(f => {
            if (f.id !== fileId) return f;
            return {
              ...f,
              status: derivedStatus,
              projectId,
              processingStage: normalizedStage,
              stageProgress,
              processingMessage: message,
              progress: progressValue,
              error: derivedStatus === 'error' ? (message || 'Processing failed') : f.error,
            };
          })
        );

        if (status.status === 'completed' || status.status === 'failed') {
          clearTrackedUploadState(fileId);
          return;
        }

        if (status.status === 'cancelled') {
          setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
          clearTrackedUploadState(fileId);
          return;
        }

        const timeoutId = setTimeout(poll, 2000);
        pollTimeoutsRef.current.set(fileId, timeoutId);
      } catch (error) {
        console.error('Status polling error:', error);
        const timeoutId = setTimeout(poll, 4000);
        pollTimeoutsRef.current.set(fileId, timeoutId);
      }
    };

    poll();
  };

  const removeFile = (id: string) => {
    cancelledUploadsRef.current.delete(id);
    clearTrackedUploadState(id);
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // ── Queue processor: start the next queued file when nothing is active ──
  const queueProcessingRef = useRef(false);

  useEffect(() => {
    // Prevent re-entrance while we're already promoting a file
    if (queueProcessingRef.current) return;

    const isActiveStatus = (s: string) =>
      s === 'pending' || s === 'extracting' || s === 'uploading' || s === 'processing';

    const activeFile = uploadedFiles.find(f => isActiveStatus(f.status));
    if (activeFile) return; // something is already running

    const nextQueued = uploadedFiles.find(f => f.status === 'queued');
    if (!nextQueued) return; // nothing waiting

    queueProcessingRef.current = true;

    if (!nextQueued.file) {
      queueProcessingRef.current = false;
      return;
    }
    const queuedFile = nextQueued.file;

    const isVideo = queuedFile.type.startsWith('video/') ||
      ['.mp4', '.mov', '.mkv', '.avi', '.webm'].some(ext =>
        queuedFile.name.toLowerCase().endsWith(ext)
      );

    // Promote the file from queued → pending/extracting
    const promoted: UploadedFile = {
      ...nextQueued,
      status: isVideo ? 'extracting' as const : 'pending' as const,
      processingMessage: isVideo ? 'Extracting audio...' : 'Starting upload...',
      extractionProgress: isVideo ? 0 : undefined,
    };

    setUploadedFiles(prev => prev.map(f =>
      f.id === nextQueued.id ? promoted : f
    ));

    if (isVideo) {
      processVideoFile(promoted);
    } else {
      processFile(promoted);
    }

    // Allow next cycle after a tick
    setTimeout(() => { queueProcessingRef.current = false; }, 0);
  }, [uploadedFiles]);

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
            Upload Audio
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Drop in an episode or clip. We&apos;ll handle transcription first, then you can generate any of the 11 content types from the finished project.
          </p>
        </div>

        <div className="xl:flex xl:gap-8 xl:items-start">
          <div className="flex-1 min-w-0">

            {/* Demo overlay */}
            {isDemoMode && (
              <div className="mb-6 bg-amber-950/50 border border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 bg-amber-500/20 rounded-lg flex items-center justify-center mt-0.5">
                  <Eye className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300">Demo accounts cannot upload audio</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    Sign up to process your own recordings and generate content.
                  </p>
                  <Link href="/auth/signup" className="inline-block mt-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg transition-colors">
                    Sign Up Free →
                  </Link>
                </div>
              </div>
            )}

            {/* Analysis level selector */}
            <div data-tour="tier-selector" className="mb-5">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Analysis level</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TIER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handlePerformanceChange(option.id)}
                    className={`border rounded-lg p-3 text-left transition-all ${performanceLevel === option.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 text-slate-900 dark:text-slate-50'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{option.label}</p>
                      <p className="text-xs font-medium text-slate-500">{option.cost}</p>
                    </div>
                    <p className={`text-xs font-medium mb-0.5 ${performanceLevel === option.id ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
                      {option.outcome}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{option.description}</p>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                All 11 content types are available on both plans. This setting only changes how much structure gets extracted during transcription.
              </p>
            </div>

            {/* Upload methods */}
            <div className="mb-6">
              <div className="flex w-full items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-1 shadow-sm">
                {([
                  { id: 'local', label: 'Local', labelFull: 'Local upload' },
                  { id: 'url', label: 'URL', labelFull: 'URL import' },
                  { id: 'integrations', label: 'Apps', labelFull: 'Integrations' },
                ] as Array<{ id: 'local' | 'url' | 'integrations'; label: string; labelFull: string }>).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-center ${activeTab === tab.id
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                  >
                    <span className="sm:hidden">{tab.label}</span>
                    <span className="hidden sm:inline">{tab.labelFull}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'local' && (
              <div data-tour="upload-zone" className="mb-6">
                <div
                  className={`relative border-2 border-dashed rounded-xl transition-all ${isDragActive
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.005]'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    } ${isDemoMode ? 'pointer-events-none opacity-50' : ''}`}
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
              <div className="mb-6 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Import from URL</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Paste a YouTube link or direct media URL, then transcribe once and generate whichever outputs you need later.
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
                    <div className="text-sm text-red-600">{urlError}</div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={handleUrlImport}
                      disabled={isUrlSubmitting}
                      className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                    >
                      {isUrlSubmitting ? 'Importing...' : 'Import URL'}
                    </button>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Supports YouTube and direct audio/video links. The finished transcript can be used for all 11 content types.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'integrations' && (
              <div data-tour="integrations" className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Import from apps</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Pull recordings directly from connected tools</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {(['zoom', 'microsoft'] as IntegrationProvider[]).map(provider => {
                    const status = integrations.find(i => i.provider === provider);
                    const connected = status?.connected;
                    return (
                      <div key={provider} className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                              {provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {connected
                                ? `Connected${status?.metadata?.email ? ` • ${status.metadata.email}` : ''}`
                                : 'Not connected'}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                            {connected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        <div className="mt-4 flex gap-2">
                          {!connected ? (
                            <button
                              type="button"
                              onClick={() => startOAuth(provider)}
                              className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              disabled={integrationsLoading}
                            >
                              Connect
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openImportDialog(provider)}
                              className="px-3 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                            >
                              Select recording
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Retention notice — quiet footnote, not a warning */}
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-600 text-center">
              Source audio is stored for 7 days, then deleted. Transcripts and generated content stay permanently.
            </p>

            {/* Active File List */}
            {uploadedFiles.length > 0 && (
              <div className="mb-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Files</h3>

                {uploadedFiles.map((uploadedFile, _idx) => {
                  const isActive = ['queued', 'pending', 'extracting', 'uploading', 'processing'].includes(uploadedFile.status);
                  const isProcessing = ['pending', 'extracting', 'uploading', 'processing'].includes(uploadedFile.status);
                  const displayName = uploadedFile.displayName || uploadedFile.file?.name || 'Untitled';
                  const fileSize = uploadedFile.file?.size;
                  // Queue position for display (1-based, only among queued files)
                  const queuedFiles = uploadedFiles.filter(f => f.status === 'queued');
                  const queuePosition = uploadedFile.status === 'queued'
                    ? queuedFiles.findIndex(f => f.id === uploadedFile.id) + 1
                    : 0;
                  const queueTotal = queuedFiles.length;
                  return (
                    <div
                      key={uploadedFile.id}
                      className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                    >
                      {/* Row 1: icon + name + cancel/remove */}
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
                        {/* Cancel/Remove — always top-right */}
                        {isProcessing ? (
                          <button
                            onClick={() => cancelUploadedFile(uploadedFile)}
                            className="flex-shrink-0 p-1 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 transition-colors"
                            title="Cancel upload"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => removeFile(uploadedFile.id)}
                            className="flex-shrink-0 p-1 rounded text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={uploadedFile.status === 'queued' ? 'Remove from queue' : 'Remove file'}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Row 2: status badges + tier + view button */}
                      <div className="mt-2 ml-10 flex items-center gap-2 flex-wrap">
                          {/* Status badges */}
                          <div className="flex items-center space-x-2 flex-wrap">
                            {uploadedFile.status === 'queued' && (
                              <div className="flex items-center space-x-1">
                                <Clock className="h-3.5 w-3.5 text-amber-500" />
                                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium">
                                  {queueTotal > 1 ? `Queued (${queuePosition} of ${queueTotal})` : 'Queued'}
                                </span>
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
                            {formatTierLabel(uploadedFile.performanceLevel)}
                          </span>

                          {/* View button — shown when completed */}
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

                      {/* Progress bar — not shown for queued files */}
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
                                    {uploadedFile.status === 'extracting' ? 'Extracting audio' : getStageDisplayName(uploadedFile.performanceLevel, uploadedFile.processingStage)}
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
                                        uploadedFile.performanceLevel,
                                        uploadedFile.processingStage || 'pending',
                                        uploadedFile.processingMessage
                                      )}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Error message */}
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

            {/* Advanced Options — collapsible, out of the critical path */}
            <div className="mb-8 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden" data-tour="advanced-options" data-expanded={showAdvancedOptions ? 'true' : 'false'}>
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
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
                          setSpeakerCount(value === '' ? undefined : parseInt(value, 10));
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
                          onClick={() => setSpeakerCount(recommendedSpeakerCount)}
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/30 dark:bg-blue-900/20 dark:text-blue-300"
                        >
                          Use suggested: {recommendedSpeakerCount} (from filename)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Speaker Roster */}
                  <div data-tour="speaker-roster">
                    <p className="text-xs text-blue-400/80 mb-3 flex items-center gap-1.5">
                      <Pencil className="w-3 h-3 flex-shrink-0" />
                      <span>Assigning names and roles here (e.g., Host, Guest) helps the AI match voices to identities from the very first second.</span>
                    </p>
                    <SpeakerRosterForm
                      speakers={rosterSpeakers}
                      onChange={setRosterSpeakers}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Active Processing (imports + non-local uploads) */}
            {filteredActiveProjects.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Active Processing</h3>
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
                    const rawTierStr: string = (project.performance_level as string) || 'pro';
                    const tier = (rawTierStr === 'premium' ? 'pro' : rawTierStr === 'basic' ? 'standard' : rawTierStr) as import('@/lib/tier-config').TierLevel;
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
                              {getStageDisplayName((() => { const s: string = (project.performance_level as string) || 'pro'; return s === 'premium' ? 'pro' : s === 'basic' ? 'standard' : s; })() as import('@/lib/tier-config').TierLevel, stage as ProcessingStage)}
                            </span>
                            {project.performance_level && (
                              <span className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700/70 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded">
                                {formatTierLabel(project.performance_level)}
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
                              onClick={() => deleteActiveProject(project.id)}
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
                      {isDemoMode && (
                        <div className="mt-6 text-left">
                          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3 flex-1 min-w-0">
                                <div className="flex-shrink-0">
                                  {getStatusIcon('completed')}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                                    Demo Upload: Future of Work Roundtable
                                  </h4>
                                  <div className="mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                    <span>128 MB</span>
                                    <span>52 min</span>
                                    <span className="hidden sm:inline">{new Date().toLocaleDateString()}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
                                  Completed
                                </span>
                                <span className="p-1.5 text-blue-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="View project">
                                  <Eye className="h-4 w-4" />
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
                                        ? 'Source audio expired and was deleted.'
                                        : item.audio_expires_at
                                          ? `Source audio expires ${formatExpiryDate(item.audio_expires_at)}.`
                                          : 'Source audio is retained temporarily.'}
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

            <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {activeProvider === 'zoom' ? 'Zoom recordings' : 'Teams recordings'}
                  </DialogTitle>
                  <DialogDescription>
                    Select a recording to import into your project
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-h-[60vh] overflow-auto">
                  {recordingsLoading && (
                    <div className="text-sm text-slate-500 dark:text-slate-400">Loading recordings...</div>
                  )}
                  {!recordingsLoading && recordingsError && (
                    <div className="text-sm text-red-600">{recordingsError}</div>
                  )}
                  {!recordingsLoading && !recordingsError && recordings.length === 0 && (
                    <div className="text-sm text-slate-500 dark:text-slate-400">No recordings found.</div>
                  )}
                  {!recordingsLoading && activeProvider === 'zoom' && (recordings as ZoomRecording[]).map((rec) => (
                    <div key={rec.meetingId} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-50">{rec.topic || 'Zoom Meeting'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(rec.startTime).toLocaleString()} • {rec.duration} mins
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {rec.files.map(file => (
                          <button
                            key={file.fileId}
                            type="button"
                            onClick={() => importRecording({ meetingId: rec.meetingId, fileId: file.fileId, performanceLevel })}
                            className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          >
                            Import {file.fileType || file.fileExtension}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!recordingsLoading && activeProvider === 'microsoft' && (recordings as MicrosoftRecording[]).map((rec) => (
                    <div key={rec.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-50">{rec.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(rec.createdAt).toLocaleString()} • {formatFileSize(rec.size)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => importRecording({ itemId: rec.id, performanceLevel })}
                        className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Import
                      </button>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

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
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-0.5">Pro Speaker Naming</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Pro can name speakers when they are explicitly introduced or addressed. Standard keeps clean numbered speakers.</p>
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
      {isDemoMode && <DemoTour chapter="upload" />}
    </div>
  );
}
