/**
 * useProjectRefresh Hook
 *
 * Watches for project status transitions and triggers a fresh data fetch
 * when the status changes to 'completed'. This solves the "stale data" issue
 * where the UI shows old speaker names after processing completes.
 *
 * The Problem:
 * - Backend runs: transcription -> speaker correction -> status = 'completed'
 * - Realtime subscription fires on status change
 * - BUT: The speaker_data update might happen AFTER the status change
 * - Result: UI fetches stale data with old speaker names
 *
 * The Solution:
 * - When status transitions to 'completed', wait a short delay
 * - Then do a FRESH fetch with cache: 'no-store'
 * - This ensures we get the final corrected speaker data
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface UseProjectRefreshOptions {
  /** Delay in ms after status changes to 'completed' before refetching */
  completionDelay?: number;
  /** Polling interval in ms when project is processing */
  pollingInterval?: number;
  /** Callback when fresh data is fetched */
  onRefresh?: (project: any) => void;
  /** Enable verbose logging */
  debug?: boolean;
}

export interface UseProjectRefreshResult {
  /** Current project data */
  project: any | null;
  /** Whether we're currently refreshing */
  isRefreshing: boolean;
  /** Last refresh timestamp */
  lastRefreshAt: Date | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
  /** Previous status (for detecting transitions) */
  previousStatus: string | null;
}

export function useProjectRefresh(
  projectId: string | null | undefined,
  options: UseProjectRefreshOptions = {}
): UseProjectRefreshResult {
  const {
    completionDelay = 1500, // Wait 1.5s after completion to ensure all writes are done
    pollingInterval = 3000,
    onRefresh,
    debug = false,
  } = options;

  const [project, setProject] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);

  const previousStatusRef = useRef<string | null>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const log = useCallback(
    (...args: any[]) => {
      if (debug) {
        console.log('[useProjectRefresh]', ...args);
      }
    },
    [debug]
  );

  /**
   * Fetch fresh project data via API route with cache-busting
   * Uses the /api/projects/[id] endpoint which has force-dynamic
   * Also includes cache-busting headers and timestamp query param
   */
  const fetchFreshProject = useCallback(async (): Promise<any | null> => {
    if (!projectId) return null;

    log('Fetching fresh project data for:', projectId);
    setIsRefreshing(true);

    try {
      // Use API route with cache-busting query param
      const timestamp = Date.now();
      const url = `/api/projects/${projectId}?_t=${timestamp}`;

      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store', // Disable fetch cache
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Requested-With': 'useProjectRefresh',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[useProjectRefresh] API error:', response.status, errorData);
        return null;
      }

      const data = await response.json();

      log('Fresh data fetched via API:', {
        status: data?.status,
        hasSpeakerData: !!data?.speaker_data,
        speakerCount: data?.speaker_data?.speakers
          ? Object.keys(data.speaker_data.speakers).length
          : 0,
        fetchedAt: response.headers.get('X-Fetched-At'),
      });

      return data;
    } catch (err) {
      console.error('[useProjectRefresh] Exception:', err);

      // Fallback to direct Supabase query if API fails
      log('Falling back to direct Supabase query...');
      try {
        const { data, error } = await supabase
          .from('projects')
          .select(`
            *,
            transcription_segments,
            speaker_data,
            performance_level,
            project_type,
            ai_summary,
            chapters,
            key_takeaways,
            social_quotes
          `)
          .eq('id', projectId)
          .single();

        if (error) {
          console.error('[useProjectRefresh] Supabase fallback error:', error);
          return null;
        }

        return data;
      } catch (fallbackErr) {
        console.error('[useProjectRefresh] Supabase fallback exception:', fallbackErr);
        return null;
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, log]);

  /**
   * Public refresh method
   */
  const refresh = useCallback(async () => {
    const freshData = await fetchFreshProject();
    if (freshData) {
      setProject(freshData);
      setLastRefreshAt(new Date());
      onRefresh?.(freshData);
    }
  }, [fetchFreshProject, onRefresh]);

  /**
   * Handle status transition to 'completed'
   */
  const handleStatusCompletion = useCallback(async () => {
    log(`Status changed to 'completed', waiting ${completionDelay}ms before final refresh...`);

    // Clear any existing timeout
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }

    // Wait for backend to finish all writes
    completionTimeoutRef.current = setTimeout(async () => {
      log('Performing final refresh after completion delay...');
      await refresh();

      // Do a second refresh after another delay to catch any late writes
      setTimeout(async () => {
        log('Performing secondary refresh to ensure data consistency...');
        await refresh();
      }, 1000);
    }, completionDelay);
  }, [completionDelay, refresh, log]);

  /**
   * Initial fetch and setup polling for processing projects
   */
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }

    // Initial fetch
    fetchFreshProject().then((data) => {
      if (data) {
        setProject(data);
        previousStatusRef.current = data.status;
        setPreviousStatus(data.status);
      }
    });

    // Cleanup
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [projectId, fetchFreshProject]);

  /**
   * Poll for status changes when project is processing
   */
  useEffect(() => {
    if (!projectId || !project) return;

    const isProcessing = project.status === 'processing' || project.status === 'uploading';

    if (!isProcessing) {
      // Clear polling if not processing
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    log('Project is processing, starting status poll...');
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      const freshData = await fetchFreshProject();
      if (!isActive) return;

      if (freshData) {
        const oldStatus = previousStatusRef.current;
        const newStatus = freshData.status;

        log(`Poll: status ${oldStatus} -> ${newStatus}`);

        // Detect status transition
        if (oldStatus !== newStatus) {
          previousStatusRef.current = newStatus;
          setPreviousStatus(oldStatus);
          setProject(freshData);

          // Handle completion transition
          if (newStatus === 'completed' && oldStatus !== 'completed') {
            log('Detected status transition to completed!');
            handleStatusCompletion();
            // Stop polling since it's completed
            return;
          }
        }
      }

      // Schedule next poll ONLY after this one resolves
      if (isActive) {
        pollingIntervalRef.current = setTimeout(poll, pollingInterval);
      }
    };

    // Start the first poll
    pollingIntervalRef.current = setTimeout(poll, pollingInterval);

    return () => {
      isActive = false;
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [projectId, project?.status, pollingInterval, fetchFreshProject, handleStatusCompletion, log]);

  /**
   * Listen for realtime updates on the project
   */
  useEffect(() => {
    if (!projectId) return;

    const subscription = supabase
      .channel(`project_refresh_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          log('Realtime update received:', payload);
          const newData = payload.new as any;
          const oldStatus = previousStatusRef.current;
          const newStatus = newData?.status;

          // Update previous status tracking
          if (newStatus && newStatus !== oldStatus) {
            previousStatusRef.current = newStatus;
            setPreviousStatus(oldStatus);

            // If status changed to completed, trigger delayed refresh
            if (newStatus === 'completed' && oldStatus !== 'completed') {
              log('Realtime: Detected completion transition');
              handleStatusCompletion();
            } else {
              // For other changes, do immediate refresh
              refresh();
            }
          } else {
            // Status didn't change, but other fields might have
            // Still do a refresh to get latest speaker_data
            refresh();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [projectId, handleStatusCompletion, refresh, log]);

  return {
    project,
    isRefreshing,
    lastRefreshAt,
    refresh,
    previousStatus,
  };
}

/**
 * Hook to specifically watch for speaker data updates after completion
 *
 * Use this when you need to ensure the UI shows the latest speaker names
 * after transcription processing completes.
 */
export function useSpeakerDataRefresh(
  projectId: string | null | undefined,
  currentSpeakerData: any,
  onSpeakerDataUpdate: (newSpeakerData: any) => void
) {
  const refreshCountRef = useRef(0);
  const maxRefreshes = 3;
  const refreshIntervalMs = 2000;

  useEffect(() => {
    if (!projectId) return;

    // Only start refresh cycle when there's no speaker data or it looks stale
    const hasValidSpeakerData =
      currentSpeakerData?.speakers &&
      Object.values(currentSpeakerData.speakers).some(
        (speaker: any) =>
          speaker.finalName &&
          !speaker.finalName.startsWith('Speaker ') &&
          speaker.finalName !== 'Unknown'
      );

    if (hasValidSpeakerData) {
      // Data looks good, no need to refresh
      return;
    }

    console.log('[useSpeakerDataRefresh] Speaker data looks stale, starting refresh cycle...');

    const refreshCycle = async () => {
      if (refreshCountRef.current >= maxRefreshes) {
        console.log('[useSpeakerDataRefresh] Max refreshes reached, stopping');
        return;
      }

      refreshCountRef.current++;

      try {
        // Use API route with cache-busting
        const timestamp = Date.now();
        const response = await fetch(`/api/projects/${projectId}?_t=${timestamp}&fields=speaker_data`, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });

        if (!response.ok) {
          console.error('[useSpeakerDataRefresh] API error:', response.status);
          // Schedule retry
          if (refreshCountRef.current < maxRefreshes) {
            setTimeout(refreshCycle, refreshIntervalMs);
          }
          return;
        }

        const data = await response.json();

        if (data?.speaker_data) {
          const newHasValidNames = Object.values(data.speaker_data.speakers || {}).some(
            (speaker: any) =>
              speaker.finalName &&
              !speaker.finalName.startsWith('Speaker ') &&
              speaker.finalName !== 'Unknown'
          );

          if (newHasValidNames) {
            console.log('[useSpeakerDataRefresh] Got valid speaker names, updating UI');
            onSpeakerDataUpdate(data.speaker_data);
            return;
          }
        }

        // Schedule another refresh
        if (refreshCountRef.current < maxRefreshes) {
          setTimeout(refreshCycle, refreshIntervalMs);
        }
      } catch (err) {
        console.error('[useSpeakerDataRefresh] Exception:', err);
        // Schedule retry on error
        if (refreshCountRef.current < maxRefreshes) {
          setTimeout(refreshCycle, refreshIntervalMs);
        }
      }
    };

    // Start refresh cycle after a short delay
    const timeoutId = setTimeout(refreshCycle, 1000);

    return () => {
      clearTimeout(timeoutId);
      refreshCountRef.current = 0;
    };
  }, [projectId, currentSpeakerData, onSpeakerDataUpdate]);
}
