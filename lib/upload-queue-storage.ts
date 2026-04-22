import { normalizeAnalysisOptions, type AnalysisOptions } from '@/lib/analysis-options';
import { normalizeTier, type TierLevel } from '@/lib/tier-config';
import type { ProcessingStage } from '@/lib/tier-progress-config';
import type { QueuedRosterSpeaker, UploadedFile } from '@/lib/context/upload-progress-sync';

const DB_NAME = 'audio-repurpose-upload-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queued_uploads';

type PersistedQueuedUploadStatus = 'queued';

interface PersistedQueuedUploadRecord {
  id: string;
  file?: File;
  status: PersistedQueuedUploadStatus;
  progress: number;
  extractionProgress?: number;
  processingStage?: ProcessingStage;
  stageProgress?: number;
  processingMessage?: string;
  processingTier: TierLevel;
  analysisOptions: AnalysisOptions;
  displayName: string;
  estimatedDurationSeconds?: number;
  sourceUrl?: string;
  sourceType?: UploadedFile['sourceType'];
  importPayload?: Record<string, unknown>;
  speakerCount?: number;
  rosterSpeakers?: QueuedRosterSpeaker[];
  savedAt: string;
}

function isIndexedDbAvailable() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openUploadQueueDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error('Failed to open upload queue database'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openUploadQueueDb().then((db) => {
    if (!db) {
      throw new Error('IndexedDB is not available');
    }

    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      let settled = false;

      const finishResolve = (value: T) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const finishReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      transaction.onerror = () => finishReject(transaction.error || new Error('Upload queue transaction failed'));
      transaction.onabort = () => finishReject(transaction.error || new Error('Upload queue transaction aborted'));

      Promise.resolve(handler(store))
        .then((value) => {
          transaction.oncomplete = () => {
            db.close();
            finishResolve(value);
          };
        })
        .catch((error) => {
          db.close();
          finishReject(error);
        });
    });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function toPersistedQueuedUpload(uploadedFile: UploadedFile): PersistedQueuedUploadRecord | null {
  if (uploadedFile.status !== 'queued') return null;

  return {
    id: uploadedFile.id,
    file: uploadedFile.file,
    status: 'queued',
    progress: uploadedFile.progress,
    extractionProgress: uploadedFile.extractionProgress,
    processingStage: uploadedFile.processingStage,
    stageProgress: uploadedFile.stageProgress,
    processingMessage: uploadedFile.processingMessage,
    processingTier: normalizeTier(uploadedFile.processingTier),
    analysisOptions: normalizeAnalysisOptions(uploadedFile.analysisOptions),
    displayName: uploadedFile.displayName,
    estimatedDurationSeconds: uploadedFile.estimatedDurationSeconds,
    sourceUrl: uploadedFile.sourceUrl,
    sourceType: uploadedFile.sourceType,
    importPayload: uploadedFile.importPayload,
    speakerCount: uploadedFile.speakerCount,
    rosterSpeakers: uploadedFile.rosterSpeakers,
    savedAt: new Date().toISOString(),
  };
}

function toUploadedFile(record: PersistedQueuedUploadRecord): UploadedFile {
  return {
    id: record.id,
    file: record.file,
    status: 'queued',
    progress: record.progress,
    extractionProgress: record.extractionProgress,
    processingStage: record.processingStage,
    stageProgress: record.stageProgress,
    processingMessage: record.processingMessage || 'Waiting in queue...',
    processingTier: normalizeTier(record.processingTier),
    analysisOptions: normalizeAnalysisOptions(record.analysisOptions),
    displayName: record.displayName,
    estimatedDurationSeconds: record.estimatedDurationSeconds,
    sourceUrl: record.sourceUrl,
    sourceType: record.sourceType,
    importPayload: record.importPayload,
    speakerCount: record.speakerCount,
    rosterSpeakers: record.rosterSpeakers,
  };
}

export async function loadPersistedQueuedUploads(): Promise<UploadedFile[]> {
  if (!isIndexedDbAvailable()) return [];

  try {
    const records = await withStore('readonly', async (store) => {
      const result = await requestToPromise(store.getAll() as IDBRequest<PersistedQueuedUploadRecord[]>);
      return result || [];
    });

    return records
      .filter((record) => record?.status === 'queued')
      .map(toUploadedFile);
  } catch (error) {
    console.warn('Failed to load persisted queued uploads:', error);
    return [];
  }
}

export async function persistQueuedUploads(uploadedFiles: UploadedFile[]): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  const queuedRecords = uploadedFiles
    .map(toPersistedQueuedUpload)
    .filter((record): record is PersistedQueuedUploadRecord => Boolean(record));

  try {
    const db = await openUploadQueueDb();
    if (!db) return;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      transaction.onerror = () => reject(transaction.error || new Error('Upload queue transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('Upload queue transaction aborted'));
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      store.clear();
      queuedRecords.forEach((record) => {
        store.put(record);
      });
    });
  } catch (error) {
    console.warn('Failed to persist queued uploads:', error);
  }
}

export async function clearPersistedQueuedUploads(): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    await withStore('readwrite', (store) => requestToPromise(store.clear()));
  } catch (error) {
    console.warn('Failed to clear persisted queued uploads:', error);
  }
}
