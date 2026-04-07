"use client";

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ProcessingStage } from '@/lib/tier-progress-config';
import type { TierLevel } from '@/lib/tier-config';

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
  setSyncedUploads: (items: SyncedUploadProgressItem[]) => void;
}

const UploadProgressSyncContext = createContext<UploadProgressSyncContextValue | null>(null);

export function UploadProgressSyncProvider({ children }: { children: React.ReactNode }) {
  const [syncedUploads, setSyncedUploadsState] = useState<SyncedUploadProgressItem[]>([]);

  const setSyncedUploads = useCallback((items: SyncedUploadProgressItem[]) => {
    setSyncedUploadsState(items);
  }, []);

  const value = useMemo(() => ({
    syncedUploads,
    setSyncedUploads,
  }), [syncedUploads, setSyncedUploads]);

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
