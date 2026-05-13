"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/context';
import { useAudioExtractor } from '@/lib/hooks/useAudioExtractor';
import { emitProjectMutation } from '@/lib/project-events';
import { calculateOverallProgress, type ProcessingStage } from '@/lib/tier-progress-config';
import type { TierLevel } from '@/lib/tier-config';
import type { AnalysisOptions } from '@/lib/analysis-options';
import { normalizeAnalysisOptions } from '@/lib/analysis-options';
import { ESTIMATED_BITRATE_BPS } from '@/lib/upload-constants';
import {
  loadPersistedQueueRunningState,
  loadPersistedQueuedUploads,
  persistQueueRunningState,
  persistQueuedUploads,
} from '@/lib/upload-queue-storage';
import { toast } from 'sonner';

type IntegrationProvider = 'zoom' | 'microsoft' | 'youtube';

export interface QueuedRosterSpeaker {
  name: string;
  aliases?: string[];
  role?: string;
}

export interface UploadedFile {
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
  processingTier: TierLevel;
  analysisOptions: AnalysisOptions;
  displayName: string;
  estimatedDurationSeconds?: number;
  sourceUrl?: string;
  sourceType?: 'local' | 'url' | 'youtube' | 'direct' | 'zoom' | 'microsoft';
  importPayload?: Record<string, unknown>;
  speakerCount?: number;
  rosterSpeakers?: QueuedRosterSpeaker[];
  namedSpeakersAutoFixed?: boolean;
  speakerCountNudgeDismissed?: boolean;
}

export interface SyncedUploadProgressItem {
  id: string;
  projectId?: string;
  title: string;
  status: 'queued' | 'pending' | 'extracting' | 'uploading' | 'processing';
  progress: number;
  processingStage?: ProcessingStage;
  processingMessage?: string;
  processingTier: TierLevel;
}

interface UploadProgressSyncContextValue {
  syncedUploads: SyncedUploadProgressItem[];
  uploadedFiles: UploadedFile[];
  setUploadedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  isStartingQueuedUploads: boolean;
  startQueuedUploads: () => void;
  removeFile: (id: string) => void;
  cancelUploadedFile: (uploadedFile: UploadedFile) => Promise<void>;
  deleteActiveProject: (projectId: string) => Promise<void>;
  trackProcessingEntry: (entry: UploadedFile, projectId: string, fallbackTier?: TierLevel) => void;
}

const UploadProgressSyncContext = createContext<UploadProgressSyncContextValue | null>(null);

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // ignore
  }
  return fallback;
}

async function getMediaDurationSeconds(file: File): Promise<number | undefined> {
  if (typeof window === 'undefined') return undefined;

  const objectUrl = URL.createObjectURL(file);
  const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
  media.preload = 'metadata';
  media.src = objectUrl;

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        media.removeAttribute('src');
        media.load();
        URL.revokeObjectURL(objectUrl);
      };
      const finish = (callback: () => void) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        callback();
      };
      const timeoutId = window.setTimeout(() => {
        finish(() => {
          cleanup();
          reject(new Error('Timed out while reading media metadata'));
        });
      }, 5000);

      media.onloadedmetadata = () => {
        const nextDuration = Number.isFinite(media.duration) ? Math.round(media.duration) : 0;
        finish(() => {
          cleanup();
          resolve(nextDuration);
        });
      };

      media.onerror = () => {
        finish(() => {
          cleanup();
          reject(new Error('Failed to read media metadata'));
        });
      };
    });

    return duration > 0 ? duration : undefined;
  } catch {
    URL.revokeObjectURL(objectUrl);
    return undefined;
  }
}

function estimateDurationSecondsFromFileSize(file: File): number {
  return Math.max(1, Math.round(file.size / (ESTIMATED_BITRATE_BPS / 8)));
}

export function UploadProgressSyncProvider({ children }: { children: ReactNode }) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isStartingQueuedUploads, setIsStartingQueuedUploads] = useState(false);
  const [hasHydratedPersistedQueue, setHasHydratedPersistedQueue] = useState(false);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadRequestRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const pollTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cancelledUploadsRef = useRef<Set<string>>(new Set());
  const completedUploadNotificationsRef = useRef<Set<string>>(new Set());
  const queueProcessingRef = useRef(false);
  const { session, isDemoMode } = useAuth();
  const { extractAudio } = useAudioExtractor();

  const clearTrackedUploadState = useCallback((fileId: string, options: { abortNetwork?: boolean } = {}) => {
    if (options.abortNetwork) {
      uploadControllersRef.current.get(fileId)?.abort();
      uploadRequestRef.current.get(fileId)?.abort();
    }
    uploadControllersRef.current.delete(fileId);
    uploadRequestRef.current.delete(fileId);
    const timeoutId = pollTimeoutsRef.current.get(fileId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pollTimeoutsRef.current.delete(fileId);
    }
  }, []);

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

  const cancelUploadOnServer = useCallback(async (projectId: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/projects/${projectId}/cancel`, {
      method: 'POST',
      headers,
    });

    if (response.status === 409) return;

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Failed to cancel upload' }));
      throw new Error(data.error || 'Failed to cancel upload');
    }
  }, [getAuthHeaders]);

  const deleteProjectById = useCallback(async (projectId: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Failed to delete project' }));
      throw new Error(data.error || 'Failed to delete project');
    }
  }, [getAuthHeaders]);

  const pollForProgress = useCallback((fileId: string, projectId: string, fallbackTier?: TierLevel, displayName?: string) => {
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

        setUploadedFiles(prev =>
          prev.map(f => {
            if (f.id !== fileId) return f;
            const tier = (status.performance_level || f.processingTier || fallbackTier || 'transcript') as TierLevel;
            const progressValue = status.status === 'completed'
              ? 100
              : calculateOverallProgress(tier, normalizedStage, stageProgress);
            return {
              ...f,
              status: derivedStatus,
              projectId,
              processingStage: normalizedStage,
              stageProgress,
              processingMessage: status.processing_message || f.processingMessage,
              progress: progressValue,
              error: derivedStatus === 'error' ? (status.processing_message || 'Processing failed') : f.error,
            };
          })
        );

        if (status.status === 'completed' || status.status === 'failed') {
          if (status.status === 'completed') {
            const notificationKey = `${projectId}:${fileId}`;
            if (!completedUploadNotificationsRef.current.has(notificationKey)) {
              completedUploadNotificationsRef.current.add(notificationKey);
              toast.success(`${displayName || 'Your file'} is ready.`);
            }
            emitProjectMutation({ projectId, action: 'updated' });
          }
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
  }, [clearTrackedUploadState]);

  const processImportedRecording = useCallback(async (uploadedFile: UploadedFile) => {
    if (!uploadedFile.importPayload || !uploadedFile.sourceType || !['zoom', 'microsoft', 'youtube'].includes(uploadedFile.sourceType)) {
      setUploadedFiles(prev => prev.map(f =>
        f.id === uploadedFile.id ? {
          ...f,
          status: 'error',
          error: 'Missing import details.',
          processingStage: 'failed',
          processingMessage: 'Import setup failed',
          stageProgress: 0,
          progress: 0,
        } : f
      ));
      return;
    }

    setUploadedFiles(prev =>
      prev.map(f => f.id === uploadedFile.id ? {
        ...f,
        status: 'processing',
        processingStage: 'transcribing',
        stageProgress: 0,
        processingMessage: 'Importing recording...',
        progress: calculateOverallProgress(f.processingTier, 'transcribing', 0),
      } : f)
    );

    try {
      const accessToken = await getAccessToken();
      const provider = uploadedFile.sourceType as IntegrationProvider;
      const res = await fetch(`/api/integrations/${provider}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          ...uploadedFile.importPayload,
          analysisOptions: normalizeAnalysisOptions(uploadedFile.analysisOptions),
        }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Import failed.'));
      }

      setUploadedFiles(prev => prev.filter(f => f.id !== uploadedFile.id));
    } catch (error) {
      console.error('Recording import error:', error);
      setUploadedFiles(prev => prev.map(f =>
        f.id === uploadedFile.id ? {
          ...f,
          status: 'error',
          error: error instanceof Error ? error.message : 'Import failed.',
          processingStage: 'failed',
          processingMessage: 'Import failed',
          stageProgress: 0,
          progress: 0,
        } : f
      ));
    }
  }, [getAccessToken]);

  const processFile = useCallback(async (uploadedFile: UploadedFile) => {
    const controller = new AbortController();
    uploadControllersRef.current.set(uploadedFile.id, controller);

    try {
      if (!uploadedFile.file) {
        throw new Error('No file provided for upload');
      }

      const fileProcessingTier = uploadedFile.processingTier;
      const normalizedFileAnalysisOptions = normalizeAnalysisOptions(uploadedFile.analysisOptions);
      const fileAnalysisOptions = (uploadedFile.rosterSpeakers?.length || 0) > 0
        ? { ...normalizedFileAnalysisOptions, namedSpeakers: true }
        : normalizedFileAnalysisOptions;
      setUploadedFiles(prev =>
        prev.map(f => f.id === uploadedFile.id ? {
          ...f,
          status: 'uploading',
          processingStage: 'uploading',
          stageProgress: 0,
          processingMessage: 'Uploading audio...',
          progress: calculateOverallProgress(f.processingTier, 'uploading', 0),
        } : f)
      );
      const estimatedDurationSeconds = uploadedFile.estimatedDurationSeconds
        || await getMediaDurationSeconds(uploadedFile.file)
        || estimateDurationSecondsFromFileSize(uploadedFile.file);

      const payload: any = {
        fileName: uploadedFile.file.name,
        contentType: uploadedFile.file.type || 'application/octet-stream',
        size: uploadedFile.file.size,
        title: uploadedFile.file.name.replace(/\.[^/.]+$/, ""),
        performanceLevel: fileProcessingTier,
        analysisOptions: fileAnalysisOptions,
        ...(estimatedDurationSeconds ? { estimatedDurationSeconds } : {}),
      };

      if ((uploadedFile.rosterSpeakers?.length || 0) > 0) {
        payload.rosterSpeakers = uploadedFile.rosterSpeakers;
      }

      if (uploadedFile.speakerCount && uploadedFile.speakerCount >= 2 && uploadedFile.speakerCount <= 12) {
        payload.speakerCount = uploadedFile.speakerCount;
      }

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
                  progress: calculateOverallProgress(f.processingTier, 'uploading', percentComplete),
                };
              })
            );
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
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

      const finalizeHeaders = await getAuthHeaders('json');
      const finalizeResponse = await fetch('/api/upload/finalize', {
        method: 'POST',
        headers: finalizeHeaders,
        body: JSON.stringify({
          projectId,
          objectKey,
          audioFingerprint,
          uploadToken,
          performanceLevel: fileProcessingTier,
          analysisOptions: fileAnalysisOptions,
          speakerCount: uploadedFile.speakerCount,
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
          processingMessage: 'Preparing your audio for processing...',
          progress: calculateOverallProgress(f.processingTier, 'transcribing', 0),
        } : f)
      );

      pollForProgress(uploadedFile.id, projectId, uploadedFile.processingTier, uploadedFile.displayName);
    } catch (error) {
      console.error('Upload error:', error);

      let errorMessage = 'Upload failed';
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
              status: 'error',
              error: errorMessage,
              processingStage: 'failed',
              processingMessage: errorMessage,
              stageProgress: 0,
              progress: 0,
            };
          }
          if (isServerError && f.status === 'queued') {
            return {
              ...f,
              status: 'error',
              error: 'Upload stopped — a previous file failed to initialize.',
              processingStage: 'failed',
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
  }, [cancelUploadOnServer, clearTrackedUploadState, getAuthHeaders, pollForProgress]);

  const processVideoFile = useCallback(async (uploadedFile: UploadedFile) => {
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
  }, [extractAudio, processFile]);

  const removeFile = useCallback((id: string) => {
    cancelledUploadsRef.current.delete(id);
    clearTrackedUploadState(id, { abortNetwork: true });
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }, [clearTrackedUploadState]);

  const cancelUploadedFile = useCallback(async (uploadedFile: UploadedFile) => {
    cancelledUploadsRef.current.add(uploadedFile.id);
    clearTrackedUploadState(uploadedFile.id, { abortNetwork: true });

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
    toast.success('Upload cancelled.');
  }, [cancelUploadOnServer, clearTrackedUploadState]);

  const deleteActiveProject = useCallback(async (projectId: string) => {
    try {
      await deleteProjectById(projectId);
      emitProjectMutation({ projectId, action: 'deleted' });
      setUploadedFiles(prev => {
        prev
          .filter(file => file.projectId === projectId)
          .forEach(file => {
            cancelledUploadsRef.current.add(file.id);
            clearTrackedUploadState(file.id, { abortNetwork: true });
          });
        return prev.filter(file => file.projectId !== projectId);
      });
      toast.success('Project deleted.');
    } catch (error) {
      console.error('Failed to delete active project:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete project.');
    }
  }, [clearTrackedUploadState, deleteProjectById]);

  const startQueuedUploads = useCallback(() => {
    if (isDemoMode) return;
    setIsStartingQueuedUploads(true);
  }, [isDemoMode]);

  const trackProcessingEntry = useCallback((entry: UploadedFile, projectId: string, fallbackTier?: TierLevel) => {
    setUploadedFiles(prev => {
      const withoutExisting = prev.filter(f => f.id !== entry.id);
      return [entry, ...withoutExisting];
    });
    pollForProgress(entry.id, projectId, fallbackTier, entry.displayName);
  }, [pollForProgress]);

  useEffect(() => {
    let cancelled = false;

    const hydrateQueuedUploads = async () => {
      const persistedUploads = await loadPersistedQueuedUploads();
      const shouldResumeQueue = loadPersistedQueueRunningState();
      if (cancelled) return;

      if (persistedUploads.length > 0) {
        setUploadedFiles((current) => {
          const currentIds = new Set(current.map((file) => file.id));
          const restored = persistedUploads.filter((file) => !currentIds.has(file.id));
          return restored.length > 0 ? [...current, ...restored] : current;
        });
      }

      if (shouldResumeQueue && persistedUploads.length > 0) {
        setIsStartingQueuedUploads(true);
      }

      setHasHydratedPersistedQueue(true);
    };

    hydrateQueuedUploads();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedPersistedQueue) return;

    persistQueuedUploads(uploadedFiles);
  }, [hasHydratedPersistedQueue, uploadedFiles]);

  useEffect(() => {
    if (!hasHydratedPersistedQueue) return;

    const hasPendingQueueWork = uploadedFiles.some((file) =>
      ['queued', 'pending', 'extracting', 'uploading'].includes(file.status) && !file.projectId
    );

    persistQueueRunningState(isStartingQueuedUploads && hasPendingQueueWork);
  }, [hasHydratedPersistedQueue, isStartingQueuedUploads, uploadedFiles]);

  useEffect(() => {
    const uploadControllers = uploadControllersRef.current;
    const uploadRequests = uploadRequestRef.current;
    const pollTimeouts = pollTimeoutsRef.current;

    return () => {
      uploadControllers.forEach((controller) => controller.abort());
      uploadRequests.forEach((xhr) => xhr.abort());
      pollTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedPersistedQueue) return;
    if (!isStartingQueuedUploads) return;
    if (queueProcessingRef.current) return;

    const isActiveStatus = (s: string) =>
      s === 'pending' || s === 'extracting' || s === 'uploading' || s === 'processing';

    const activeFile = uploadedFiles.find(f => isActiveStatus(f.status));
    if (activeFile) return;

    const nextQueued = uploadedFiles.find(f => f.status === 'queued');
    if (!nextQueued) {
      setIsStartingQueuedUploads(false);
      return;
    }

    queueProcessingRef.current = true;

    if (!nextQueued.file && !nextQueued.importPayload) {
      queueProcessingRef.current = false;
      return;
    }
    const queuedFile = nextQueued.file;

    const isVideo = Boolean(queuedFile) && (
      queuedFile?.type.startsWith('video/') ||
      ['.mp4', '.mov', '.mkv', '.avi', '.webm'].some(ext =>
        queuedFile?.name.toLowerCase().endsWith(ext)
      )
    );

    const promoted: UploadedFile = {
      ...nextQueued,
      status: nextQueued.importPayload ? 'pending' : isVideo ? 'extracting' : 'pending',
      processingMessage: nextQueued.importPayload ? 'Starting import...' : isVideo ? 'Extracting audio...' : 'Starting upload...',
      extractionProgress: isVideo ? 0 : undefined,
    };

    setUploadedFiles(prev => prev.map(f =>
      f.id === nextQueued.id ? promoted : f
    ));

    if (nextQueued.importPayload) {
      processImportedRecording(promoted);
    } else if (isVideo) {
      processVideoFile(promoted);
    } else {
      processFile(promoted);
    }

    setTimeout(() => { queueProcessingRef.current = false; }, 0);
  }, [hasHydratedPersistedQueue, isStartingQueuedUploads, processFile, processImportedRecording, processVideoFile, uploadedFiles]);

  const syncedUploads = useMemo(() => uploadedFiles
    .filter((file) => ['queued', 'pending', 'extracting', 'uploading', 'processing'].includes(file.status))
    .map((file) => ({
      id: file.id,
      projectId: file.projectId,
      title: file.displayName || file.file?.name || 'Untitled',
      status: file.status as 'queued' | 'pending' | 'extracting' | 'uploading' | 'processing',
      progress: file.status === 'extracting'
        ? (file.extractionProgress || 0)
        : file.progress,
      processingStage: file.processingStage,
      processingMessage: file.processingMessage,
      processingTier: file.processingTier,
    })), [uploadedFiles]);

  const value = useMemo(() => ({
    syncedUploads,
    uploadedFiles,
    setUploadedFiles,
    isStartingQueuedUploads,
    startQueuedUploads,
    removeFile,
    cancelUploadedFile,
    deleteActiveProject,
    trackProcessingEntry,
  }), [
    syncedUploads,
    uploadedFiles,
    isStartingQueuedUploads,
    startQueuedUploads,
    removeFile,
    cancelUploadedFile,
    deleteActiveProject,
    trackProcessingEntry,
  ]);

  return (
    <UploadProgressSyncContext.Provider value={value}>
      {children}
    </UploadProgressSyncContext.Provider>
  );
}

export function useUploadProgressSync() {
  const context = useContext(UploadProgressSyncContext);
  if (!context) {
    throw new Error('useUploadProgressSync must be used within UploadProgressSyncProvider');
  }
  return context;
}
