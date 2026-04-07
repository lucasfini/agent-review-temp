"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ProcessingStage } from '@/lib/tier-progress-config';
import type { TierLevel } from '@/lib/tier-config';

export interface ActiveProcessingProject {
  id: string;
  title: string;
  audio_file_name: string | null;
  audio_file_size?: number | null;
  audio_duration?: number | null;
  audio_expires_at?: string | null;
  audio_deleted_at?: string | null;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  processing_stage?: ProcessingStage;
  processing_progress?: number;
  processing_message?: string | null;
  performance_level?: TierLevel | string;
  metadata?: any;
}

type StoreState = {
  data: ActiveProcessingProject[];
  isLoading: boolean;
};

type Listener = (state: StoreState) => void;
type ListenerConfig = {
  pollingEnabled: boolean;
  pollIntervalMs: number;
};

const store = {
  userId: null as string | null,
  limit: 10,
  data: [] as ActiveProcessingProject[],
  isLoading: false,
  listeners: new Set<Listener>(),
  listenerConfigs: new Map<Listener, ListenerConfig>(),
  intervalId: null as ReturnType<typeof setInterval> | null,
  intervalMs: null as number | null,
  realtimeChannel: null as ReturnType<typeof supabase.channel> | null,
  inFlight: false,
};

function emit() {
  const snapshot: StoreState = {
    data: store.data,
    isLoading: store.isLoading,
  };
  store.listeners.forEach((listener) => listener(snapshot));
}

async function fetchActiveProcessingProjects() {
  if (!store.userId || store.inFlight) return;

  store.inFlight = true;
  store.isLoading = true;
  emit();

  try {
    const { data } = await supabase
      .from('projects')
      .select('id, title, audio_file_name, audio_file_size, audio_duration, audio_expires_at, audio_deleted_at, status, created_at, processing_stage, processing_progress, processing_message, performance_level, metadata')
      .eq('user_id', store.userId)
      .in('status', ['uploading', 'processing'])
      .order('created_at', { ascending: false })
      .limit(store.limit);

    const baseProjects = (data || []) as ActiveProcessingProject[];
    store.data = baseProjects;

    // Stop polling when no active projects remain — real-time events or the
    // next manual refresh will restart it if a new job appears.
    if (baseProjects.length === 0 && store.intervalId) {
      clearInterval(store.intervalId);
      store.intervalId = null;
      store.intervalMs = null;
    } else if (baseProjects.length > 0 && store.listeners.size > 0) {
      syncPolling();
    }
  } finally {
    store.isLoading = false;
    store.inFlight = false;
    emit();
  }
}

function getPollingConfig() {
  let minPollIntervalMs = Number.POSITIVE_INFINITY;
  let hasPollingListener = false;

  store.listenerConfigs.forEach((config) => {
    if (!config.pollingEnabled) return;
    hasPollingListener = true;
    minPollIntervalMs = Math.min(minPollIntervalMs, config.pollIntervalMs);
  });

  return {
    enabled: hasPollingListener,
    pollIntervalMs: Number.isFinite(minPollIntervalMs) ? minPollIntervalMs : null,
  };
}

function syncPolling() {
  if (!store.userId) return;

  const pollingConfig = getPollingConfig();
  if (!pollingConfig.enabled || !pollingConfig.pollIntervalMs) {
    if (store.intervalId) {
      clearInterval(store.intervalId);
      store.intervalId = null;
      store.intervalMs = null;
    }
    return;
  }

  if (store.intervalId && store.intervalMs === pollingConfig.pollIntervalMs) return;

  if (store.intervalId) {
    clearInterval(store.intervalId);
  }

  store.intervalId = setInterval(() => {
    void fetchActiveProcessingProjects();
  }, pollingConfig.pollIntervalMs);
  store.intervalMs = pollingConfig.pollIntervalMs;
}

function ensureRealtime() {
  if (store.realtimeChannel || !store.userId) return;
  const userId = store.userId;
  store.realtimeChannel = supabase
    .channel(`active-projects-progress-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'projects',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void fetchActiveProcessingProjects();
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'projects',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void fetchActiveProcessingProjects();
      }
    )
    .subscribe();
}

function stopPollingIfIdle() {
  if (store.listeners.size > 0) {
    syncPolling();
    return;
  }
  if (store.intervalId) {
    clearInterval(store.intervalId);
    store.intervalId = null;
  }
  store.intervalMs = null;
  if (store.realtimeChannel) {
    supabase.removeChannel(store.realtimeChannel);
    store.realtimeChannel = null;
  }
  store.userId = null;
  store.data = [];
  store.isLoading = false;
  store.inFlight = false;
  store.listenerConfigs.clear();
}

export function useActiveProcessingProjects(
  userId?: string | null,
  limit = 10,
  options: Partial<ListenerConfig> = {}
) {
  const {
    pollingEnabled = true,
    pollIntervalMs = 5000,
  } = options;
  const [state, setState] = useState<StoreState>({
    data: store.data,
    isLoading: store.isLoading,
  });

  useEffect(() => {
    if (!userId) {
      setState({ data: [], isLoading: false });
      return;
    }

    store.userId = userId;
    store.limit = Math.max(store.limit, limit);

    const listener: Listener = (nextState) => setState(nextState);
    store.listeners.add(listener);
    store.listenerConfigs.set(listener, {
      pollingEnabled,
      pollIntervalMs,
    });
    setState({ data: store.data, isLoading: store.isLoading });

    syncPolling();
    ensureRealtime();
    void fetchActiveProcessingProjects();

    return () => {
      store.listeners.delete(listener);
      store.listenerConfigs.delete(listener);
      stopPollingIfIdle();
    };
  }, [userId, limit, pollingEnabled, pollIntervalMs]);

  return {
    activeProjects: state.data,
    isLoading: state.isLoading,
    refresh: fetchActiveProcessingProjects,
  };
}
