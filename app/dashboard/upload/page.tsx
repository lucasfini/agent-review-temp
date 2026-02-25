"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, FileAudio, X, AlertCircle, CheckCircle, Clock, History, Trash2, Eye, FileVideo, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';
import { calculateOverallProgress, getStageDisplayName, type ProcessingStage } from '@/lib/tier-progress-config';
import { SpeakerRosterForm, type RosterSpeaker } from '@/components/SpeakerRosterForm';
import { useAudioExtractor } from '@/lib/hooks/useAudioExtractor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type PerformanceLevel = 'basic' | 'pro' | 'premium';
type IntegrationProvider = 'zoom' | 'microsoft';

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
  status: 'queued' | 'pending' | 'extracting' | 'uploading' | 'processing' | 'completed' | 'error';
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
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  created_at: string;
  processing_stage?: ProcessingStage;
  processing_progress?: number;
  processing_message?: string | null;
  performance_level?: PerformanceLevel;
}

const TIER_OPTIONS: { id: PerformanceLevel; label: string; accuracy: string; cost: string; description: string }[] = [
  {
    id: 'basic',
    label: 'Basic',
    accuracy: 'Standard accuracy',
    cost: '$0.37/hr',
    description: 'Transcription + speakers + educational insights with research links',
  },
  {
    id: 'pro',
    label: 'Pro',
    accuracy: 'Enhanced accuracy',
    cost: '$0.44/hr',
    description: 'Basic + AI summary + named speakers + insight definitions',
  },
  {
    id: 'premium',
    label: 'Premium',
    accuracy: 'Maximum accuracy',
    cost: '$0.52/hr',
    description: 'Pro + roles + chapters + takeaways + quotes + deep insights',
  },
];

export default function UploadPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [activeProjectsLoading, setActiveProjectsLoading] = useState(false);
  const [performanceLevel, setPerformanceLevel] = useState<PerformanceLevel>('premium');
  const performanceLevelRef = useRef<PerformanceLevel>('premium');
  const [rosterSpeakers, setRosterSpeakers] = useState<RosterSpeaker[]>([]);
  const [speakerCount, setSpeakerCount] = useState<number | undefined>(undefined);
  const [recommendedSpeakerCount, setRecommendedSpeakerCount] = useState<number | undefined>(undefined);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
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

  // Fix: drag counter prevents isDragActive flickering when cursor passes over child elements
  const dragCounterRef = useRef(0);

  const { extractAudio } = useAudioExtractor();
  const { user, session } = useAuth();

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
    if (pendingFile) {
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
      fetchUploadHistory();
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
      return;
    }
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    }
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
        const text = await res.text();
        throw new Error(text || 'Failed to load recordings');
      }
      const data = await res.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      setRecordingsError(error instanceof Error ? error.message : 'Failed to load recordings');
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
        const text = await res.text();
        throw new Error(text || 'Import failed');
      }
      await fetchUploadHistory();
      await fetchActiveProjects();
      setShowImportDialog(false);
    } catch (error) {
      setRecordingsError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setRecordingsLoading(false);
    }
  };

  const fetchUploadHistory = async () => {
    try {
      if (!user?.id) return;
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, audio_file_name, audio_file_size, audio_duration, status, created_at, processing_completed_at')
        .eq('user_id', user.id)
        .in('status', ['completed', 'failed'])
        .order('created_at', { ascending: false })
        .limit(20) as { data: any[] | null; error: any };

      if (error) {
        console.error('Error fetching upload history:', error);
        return;
      }

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
        .select('id, title, audio_file_name, audio_file_size, audio_duration, status, created_at, processing_stage, processing_progress, processing_message, performance_level')
        .eq('user_id', user.id)
        .in('status', ['uploading', 'processing'])
        .order('created_at', { ascending: false })
        .limit(10) as { data: any[] | null; error: any };

      if (error) {
        console.error('Error fetching active projects:', error);
        return;
      }

      setActiveProjects((data || []) as ActiveProject[]);
      if ((data || []).length === 0) {
        fetchUploadHistory();
      }
    } catch (error) {
      console.error('Failed to fetch active projects:', error);
    } finally {
      setActiveProjectsLoading(false);
    }
  };

  const deleteHistoryItem = async (projectId: string) => {
    if (!user?.id) return;

    try {
      // Cleanup cache reference before deleting project
      try {
        await fetch(`/api/projects/${projectId}/cleanup-cache`, { method: 'POST' });
        console.log('[DELETE] Cache reference cleaned up');
      } catch (cacheError) {
        console.warn('[DELETE] Cache cleanup failed (non-fatal):', cacheError);
      }

      // Delete outputs first (due to foreign key constraints)
      await supabase.from('outputs').delete().eq('project_id', projectId);

      // Delete the project
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting project:', error);
        setConfirmDeleteId(null);
        return;
      }

      setUploadHistory(prev => prev.filter(item => item.id !== projectId));
      setConfirmDeleteId(null);
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
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
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
        const text = await res.text();
        throw new Error(text || 'URL import failed');
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
      setUrlError(error instanceof Error ? error.message : 'URL import failed');
    } finally {
      setIsUrlSubmitting(false);
    }
  };

  const handleFiles = (files: File[]) => {
    const selectedLevel = performanceLevelRef.current;

    const audioFiles = files.filter(file =>
      file.type.startsWith('audio/') ||
      ['.mp3', '.wav', '.m4a', '.flac', '.ogg'].some(ext => file.name.toLowerCase().endsWith(ext))
    );

    const videoFiles = files.filter(file =>
      file.type.startsWith('video/') ||
      ['.mp4', '.mov', '.mkv', '.avi', '.webm'].some(ext => file.name.toLowerCase().endsWith(ext))
    );

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
      ...validAudioFiles.map(file => ({
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
      ...videoFiles.map(file => ({
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
        setUploadedFiles(prev => prev.map(f =>
          f.id === uploadedFile.id ? { ...f, extractionProgress: progress } : f
        ));
      });

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
    try {
      if (!uploadedFile.file) {
        throw new Error('No file provided for upload');
      }
      // Fix: use the performanceLevel stored on the file at drop time, not the live ref.
      // This prevents a tier mismatch if the user changes tiers after dropping a file.
      const filePerformanceLevel = uploadedFile.performanceLevel;
      const fileSizeMB = (uploadedFile.file.size / 1024 / 1024).toFixed(2);

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

      if (uploadedFile.file.size > 25 * 1024 * 1024) {
        console.log(`Large file detected: ${fileSizeMB}MB - this may take a while`);
      }

      const formData = new FormData();
      formData.append('audio', uploadedFile.file);
      formData.append('title', uploadedFile.file.name.replace(/\.[^/.]+$/, ""));
      formData.append('performanceLevel', filePerformanceLevel);

      if (rosterSpeakers.length > 0) {
        formData.append('rosterSpeakers', JSON.stringify(rosterSpeakers));
      }

      if (speakerCount && speakerCount >= 2 && speakerCount <= 12) {
        formData.append('speakerCount', speakerCount.toString());
      }

      const { data: { session } } = await supabase.auth.getSession();

      const progressInterval = setInterval(() => {
        setUploadedFiles(prev =>
          prev.map(f => {
            if (f.id !== uploadedFile.id || f.status !== 'uploading') return f;
            const currentStageProgress = f.processingStage === 'uploading' ? f.stageProgress ?? 0 : 0;
            if (currentStageProgress >= 100) return f;
            const nextStageProgress = Math.min(currentStageProgress + 5, 100);
            return {
              ...f,
              processingStage: 'uploading',
              stageProgress: nextStageProgress,
              progress: calculateOverallProgress(f.performanceLevel, 'uploading', nextStageProgress),
            };
          })
        );
      }, 2000);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();

      setUploadedFiles(prev =>
        prev.map(f => f.id === uploadedFile.id ? {
          ...f,
          status: 'processing',
          projectId: result.projectId,
          processingStage: 'transcribing',
          stageProgress: 0,
          processingMessage: 'Upload complete. Starting transcription...',
          progress: calculateOverallProgress(f.performanceLevel, 'transcribing', 0),
        } : f)
      );

      pollForProgress(uploadedFile.id, result.projectId, uploadedFile.performanceLevel);

    } catch (error) {
      console.error('Upload error:', error);

      let errorMessage = 'Upload failed';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Upload timed out. The file may be too large or your connection is slow.';
        } else {
          errorMessage = error.message;
        }
      }

      setUploadedFiles(prev =>
        prev.map(f => f.id === uploadedFile.id ? {
          ...f,
          status: 'error',
          error: errorMessage,
          processingStage: 'failed',
          processingMessage: errorMessage,
          stageProgress: 0,
          progress: 0,
        } : f)
      );
    }
  };

  const pollForProgress = (fileId: string, projectId: string, fallbackTier?: PerformanceLevel) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/status`);
        if (!response.ok) throw new Error('Failed to fetch project status');

        const status = await response.json();
        const apiStage = (status.processing_stage || 'pending') as ProcessingStage;
        const normalizedStage: ProcessingStage =
          status.status === 'failed' ? 'failed' :
          status.status === 'completed' ? 'completed' : apiStage;
        const stageProgress = typeof status.processing_progress === 'number' ? status.processing_progress : 0;
        const derivedStatus =
          status.status === 'completed' ? 'completed' :
          status.status === 'failed' ? 'error' : 'processing';
        const tier = (status.performance_level ||
          uploadedFiles.find(f => f.id === fileId)?.performanceLevel ||
          fallbackTier ||
          'basic') as PerformanceLevel;
        const progressValue = status.status === 'completed'
          ? 100
          : calculateOverallProgress(tier, normalizedStage, stageProgress);
        const message = status.processing_message ||
          (derivedStatus === 'completed' ? 'Processing complete!' : undefined);

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

        if (status.status === 'completed' || status.status === 'failed') return;

        setTimeout(poll, 2000);
      } catch (error) {
        console.error('Status polling error:', error);
        setTimeout(poll, 4000);
      }
    };

    poll();
  };

  const removeFile = (id: string) => {
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

    const isVideo = nextQueued.file.type.startsWith('video/') ||
      ['.mp4', '.mov', '.mkv', '.avi', '.webm'].some(ext =>
        nextQueued.file.name.toLowerCase().endsWith(ext)
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
    <div className="py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
            Upload Audio
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Drop in an episode or clip — we'll handle transcription, speaker identification, and content generation.
          </p>
        </div>

        {/* Processing Quality — compact tab toggle, always visible above drop zone */}
        <div className="mb-5">
          <p className="text-sm font-semibold text-gray-800 mb-2">Processing quality</p>
          <div className="grid grid-cols-3 gap-2">
            {TIER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handlePerformanceChange(option.id)}
                className={`border rounded-lg p-3 text-left transition-all ${
                  performanceLevel === option.id
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                  <p className="text-xs font-medium text-gray-400">{option.cost}</p>
                </div>
                <p className={`text-xs font-medium mb-0.5 ${performanceLevel === option.id ? 'text-blue-600' : 'text-gray-500'}`}>
                  {option.accuracy}
                </p>
                <p className="text-[11px] text-gray-500 leading-snug">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Upload methods */}
        <div className="mb-6">
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {([
              { id: 'local', label: 'Local upload' },
              { id: 'url', label: 'URL import' },
              { id: 'integrations', label: 'Integrations' },
            ] as Array<{ id: 'local' | 'url' | 'integrations'; label: string }>).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'local' && (
          <div className="mb-6">
            <div
              className={`relative border-2 border-dashed rounded-xl transition-all ${
                isDragActive
                  ? 'border-blue-400 bg-blue-50 scale-[1.005]'
                  : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
              }`}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              <label htmlFor="file-upload" className="flex flex-col items-center justify-center py-14 px-6 cursor-pointer">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors ${
                  isDragActive ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <Upload className={`w-6 h-6 transition-colors ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                </div>
                <p className="text-base font-semibold text-gray-700">
                  {isDragActive ? 'Drop to upload' : 'Drop audio or video here'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  or <span className="text-blue-600 hover:text-blue-500 font-medium">browse files</span>
                </p>
                <p className="mt-3 text-xs text-gray-400 text-center">
                  MP3, WAV, M4A, FLAC, OGG, MP4, MOV · up to 500 MB · video is converted to audio automatically
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
          <div className="mb-6 border border-gray-200 bg-white rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Import from URL</h2>
              <p className="text-sm text-gray-500">
                Paste a YouTube link or a direct media URL (audio or video).
              </p>
            </div>
            <div className="grid gap-3">
              <div>
                <label htmlFor="url-input" className="block text-sm font-medium text-gray-700">
                  Media URL
                </label>
                <input
                  id="url-input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="url-title" className="block text-sm font-medium text-gray-700">
                  Title (optional)
                </label>
                <input
                  id="url-title"
                  type="text"
                  placeholder="Episode title"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {urlError && (
                <div className="text-sm text-red-600">{urlError}</div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleUrlImport}
                  disabled={isUrlSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {isUrlSubmitting ? 'Importing...' : 'Import URL'}
                </button>
                <p className="text-xs text-gray-500">
                  Supports YouTube and direct audio/video links. Max 500 MB.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Import from apps</h2>
                <p className="text-sm text-gray-500">Pull recordings directly from connected tools</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(['zoom', 'microsoft'] as IntegrationProvider[]).map(provider => {
                const status = integrations.find(i => i.provider === provider);
                const connected = status?.connected;
                return (
                  <div key={provider} className="border border-gray-200 bg-white rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          {provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {connected
                            ? `Connected${status?.metadata?.email ? ` • ${status.metadata.email}` : ''}`
                            : 'Not connected'}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
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
                          className="px-3 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
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

        {/* Active File List */}
        {uploadedFiles.length > 0 && (
          <div className="mb-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Files</h3>

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
                  className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {uploadedFile.status === 'extracting' ? (
                          <FileVideo className="h-8 w-8 text-purple-500 animate-pulse" />
                        ) : uploadedFile.status === 'queued' ? (
                          <Clock className="h-8 w-8 text-amber-400" />
                        ) : (
                          <FileAudio className="h-8 w-8 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
                        <p
                          className="text-sm font-medium text-gray-900 truncate"
                          title={displayName}
                        >
                          {displayName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {typeof fileSize === 'number' && fileSize > 0
                            ? formatFileSize(fileSize)
                            : uploadedFile.sourceType === 'youtube'
                              ? 'YouTube import'
                              : uploadedFile.sourceType === 'direct'
                                ? 'URL import'
                                : 'Processing'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {/* Status badges */}
                      <div className="flex items-center space-x-2 whitespace-nowrap">
                        {uploadedFile.status === 'queued' && (
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                              {queueTotal > 1 ? `Queued (${queuePosition} of ${queueTotal})` : 'Queued'}
                            </span>
                          </div>
                        )}
                        {uploadedFile.status === 'pending' && (
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">Starting...</span>
                        )}
                        {uploadedFile.status === 'extracting' && (
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">Extracting</span>
                        )}
                        {uploadedFile.status === 'uploading' && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Uploading</span>
                        )}
                        {uploadedFile.status === 'processing' && uploadedFile.processingStage && (
                          <>
                            {uploadedFile.processingStage === 'transcribing' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">Transcribing</span>
                            )}
                            {uploadedFile.processingStage === 'diarization' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">Analyzing</span>
                            )}
                            {uploadedFile.processingStage === 'name_extraction' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 font-medium">Naming</span>
                            )}
                            {uploadedFile.processingStage === 'summary' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-700 font-medium">Summarizing</span>
                            )}
                            {uploadedFile.processingStage === 'role_classification' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">Classifying</span>
                            )}
                            {uploadedFile.processingStage === 'chapters' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-fuchsia-100 text-fuchsia-700 font-medium">Chaptering</span>
                            )}
                            {uploadedFile.processingStage === 'takeaways' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium">Extracting</span>
                            )}
                            {uploadedFile.processingStage === 'quotes' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-pink-100 text-pink-700 font-medium">Quoting</span>
                            )}
                            {uploadedFile.processingStage === 'finalizing' && (
                              <span className="text-xs px-2 py-1 rounded-full bg-sky-100 text-sky-700 font-medium">Finalizing</span>
                            )}
                            {!['transcribing', 'diarization', 'name_extraction', 'summary', 'role_classification', 'chapters', 'takeaways', 'quotes', 'finalizing'].includes(uploadedFile.processingStage) && (
                              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">Processing</span>
                            )}
                          </>
                        )}
                        {uploadedFile.status === 'completed' && (
                          <div className="flex items-center space-x-1">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium hidden sm:inline">Complete</span>
                          </div>
                        )}
                        {uploadedFile.status === 'error' && (
                          <div className="flex items-center space-x-1">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium hidden sm:inline">Error</span>
                          </div>
                        )}
                      </div>

                      <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 px-2 py-0.5 rounded">
                        {uploadedFile.performanceLevel}
                      </span>

                      {/* View button — shown when completed */}
                      {uploadedFile.status === 'completed' && uploadedFile.projectId && (
                        <a
                          href={`/dashboard/projects?id=${uploadedFile.projectId}`}
                          className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded flex-shrink-0 transition-colors"
                          title="View project"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      )}

                      {/* Remove button — disabled during active processing (but allowed for queued) */}
                      <button
                        onClick={() => removeFile(uploadedFile.id)}
                        disabled={isProcessing}
                        className={`p-1 flex-shrink-0 rounded transition-colors ${
                          isProcessing
                            ? 'text-gray-200 cursor-not-allowed'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                        title={isProcessing ? 'Cannot remove while processing' : uploadedFile.status === 'queued' ? 'Remove from queue' : 'Remove file'}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar — not shown for queued files */}
                  {isActive && uploadedFile.status !== 'queued' && (
                    <>
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${uploadedFile.status === 'extracting' ? 'bg-purple-500' : 'bg-blue-600'}`}
                            style={{ width: `${uploadedFile.status === 'extracting' ? uploadedFile.extractionProgress : uploadedFile.progress}%` }}
                          />
                        </div>
                      </div>
                      {(uploadedFile.processingStage || uploadedFile.processingMessage) && (
                        <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                          {uploadedFile.processingStage && (
                            <span className="font-medium text-gray-600">
                              {uploadedFile.status === 'extracting' ? 'Extracting audio' : getStageDisplayName(uploadedFile.performanceLevel, uploadedFile.processingStage)}
                            </span>
                          )}
                          {uploadedFile.processingMessage && (
                            <span className="text-gray-400 sm:text-right">
                              {uploadedFile.processingMessage}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Error message */}
                  {uploadedFile.status === 'error' && uploadedFile.error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-xs text-red-800 break-words">{uploadedFile.error}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Advanced Options — collapsible, out of the critical path */}
        <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">Advanced Options</span>
              {(speakerCount || rosterSpeakers.length > 0) && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                  {[
                    speakerCount ? `${speakerCount} speakers` : null,
                    rosterSpeakers.length > 0 ? `${rosterSpeakers.length} roster` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            {showAdvancedOptions
              ? <ChevronUp className="h-4 w-4 text-gray-400" />
              : <ChevronDown className="h-4 w-4 text-gray-400" />
            }
          </button>

          {showAdvancedOptions && (
            <div className="px-4 py-5 space-y-6 bg-white">
              {/* Expected Speaker Count */}
              <div>
                <label htmlFor="speaker-count" className="block text-sm font-semibold text-gray-800">
                  Number of Speakers
                </label>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  If you know how many speakers are in your audio, set it here (2–12). Leave on auto-detect if unsure.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    id="speaker-count"
                    value={speakerCount ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSpeakerCount(value === '' ? undefined : parseInt(value, 10));
                    }}
                    className="block w-36 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                      className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full border border-blue-200 transition-colors"
                    >
                      Use suggested: {recommendedSpeakerCount} (from filename)
                    </button>
                  )}
                </div>
              </div>

              {/* Speaker Roster */}
              <SpeakerRosterForm
                speakers={rosterSpeakers}
                onChange={setRosterSpeakers}
              />
            </div>
          )}
        </div>

        {/* Active Processing (imports + non-local uploads) */}
        {filteredActiveProjects.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Active Processing</h3>
              {activeProjectsLoading && (
                <span className="text-xs text-gray-400">Refreshing...</span>
              )}
            </div>
            <div className="space-y-3">
              {filteredActiveProjects.map((project) => {
                const stage = project.processing_stage || 'processing';
                const progress = typeof project.processing_progress === 'number'
                  ? project.processing_progress
                  : 0;
                return (
                  <div key={project.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
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
                          <p className="text-sm font-medium text-gray-900 truncate" title={project.title}>
                            {project.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {project.audio_file_size ? formatFileSize(project.audio_file_size) : 'Processing'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                          {getStageDisplayName(project.performance_level || 'premium', stage as ProcessingStage)}
                        </span>
                        {project.performance_level && (
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 px-2 py-0.5 rounded">
                            {project.performance_level}
                          </span>
                        )}
                        <a
                          href={`/dashboard/projects?id=${project.id}`}
                          className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          title="View project"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                      </div>
                    </div>
                    {project.processing_message && (
                      <div className="mt-2 text-xs text-gray-500">
                        {project.processing_message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upload History */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <History className="h-5 w-5 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">Upload History</h3>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {showHistory ? 'Hide' : 'Show'}
            </button>
          </div>

          {showHistory && (
            <div className="bg-white shadow-sm rounded-lg border border-gray-200">
              {historyLoading ? (
                <div className="p-6">
                  <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gray-200 rounded"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : uploadHistory.length === 0 ? (
                <div className="p-8 text-center">
                  <FileAudio className="mx-auto h-10 w-10 text-gray-300" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No uploads yet</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Your upload history will appear here once you start uploading.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {uploadHistory.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {getStatusIcon(item.status)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4
                              className="text-sm font-medium text-gray-900 truncate"
                              title={item.title}
                            >
                              {item.title}
                            </h4>
                            <div className="mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-400">
                              <span>{formatFileSize(item.audio_file_size)}</span>
                              {item.audio_duration && (
                                <span>{formatDuration(item.audio_duration)}</span>
                              )}
                              <span className="hidden sm:inline">{new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'completed' ? 'bg-green-100 text-green-700' :
                            item.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                            item.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>

                          <a
                            href={`/dashboard/projects?id=${item.id}`}
                            className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
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
                                className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => item.status !== 'processing' && setConfirmDeleteId(item.id)}
                              disabled={item.status === 'processing'}
                              className={`p-1.5 rounded transition-colors ${
                                item.status === 'processing'
                                  ? 'text-gray-200 cursor-not-allowed'
                                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
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
                <div className="text-sm text-gray-500">Loading recordings...</div>
              )}
              {!recordingsLoading && recordingsError && (
                <div className="text-sm text-red-600">{recordingsError}</div>
              )}
              {!recordingsLoading && !recordingsError && recordings.length === 0 && (
                <div className="text-sm text-gray-500">No recordings found.</div>
              )}
              {!recordingsLoading && activeProvider === 'zoom' && (recordings as ZoomRecording[]).map((rec) => (
                <div key={rec.meetingId} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{rec.topic || 'Zoom Meeting'}</div>
                      <div className="text-xs text-gray-500">
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
                <div key={rec.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{rec.name}</div>
                    <div className="text-xs text-gray-500">
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

      </div>
    </div>
  );
}
