import { supabaseAdmin } from '@/lib/supabase/server';

interface CachedTranscriptionRow {
  fingerprint: string;
  transcription_text: string;
  transcription_segments: unknown;
  speaker_data: unknown;
  duration?: number | null;
  created_at?: string;
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const TABLE_NAME = 'transcription_cache';

export interface CachedTranscriptionPayload {
  transcriptionText: string;
  transcriptionSegments: unknown;
  speakerData: unknown;
  duration?: number;
  createdAt?: string;
}

const isTableMissingError = (error: SupabaseErrorLike | null | undefined) =>
  error?.code === '42P01' || (error?.message ?? '').includes(TABLE_NAME);

export async function getCachedTranscription(
  fingerprint: string | undefined
): Promise<CachedTranscriptionPayload | null> {
  if (!fingerprint) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('transcription_text, transcription_segments, speaker_data, duration, created_at')
      .eq('fingerprint', fingerprint)
      .single();

    if (error || !data) {
      if (error && !isTableMissingError(error) && error.code !== 'PGRST116') {
        console.warn('[TRANSCRIPTION CACHE] Lookup failed:', error);
      }
      return null;
    }

    return {
      transcriptionText: data.transcription_text,
      transcriptionSegments: data.transcription_segments,
      speakerData: data.speaker_data,
      duration: data.duration || undefined,
      createdAt: data.created_at
    };
  } catch (error) {
    if (!isTableMissingError(error as SupabaseErrorLike)) {
      console.warn('[TRANSCRIPTION CACHE] Lookup error:', error);
    }
    return null;
  }
}

export async function cacheTranscriptionResult(
  fingerprint: string | undefined,
  payload: CachedTranscriptionPayload
): Promise<void> {
  if (!fingerprint) return;

  try {
    const upsertPayload: CachedTranscriptionRow = {
      fingerprint,
      transcription_text: payload.transcriptionText,
      transcription_segments: payload.transcriptionSegments,
      speaker_data: payload.speakerData,
      duration: payload.duration ?? null,
      created_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(upsertPayload, { onConflict: 'fingerprint' });

    if (error && !isTableMissingError(error)) {
      console.warn('[TRANSCRIPTION CACHE] Upsert failed:', error);
    }
  } catch (error) {
    if (!isTableMissingError(error as SupabaseErrorLike)) {
      console.warn('[TRANSCRIPTION CACHE] Upsert error:', error);
    }
  }
}

export async function applyCachedTranscriptionToProject(
  projectId: string,
  cached: CachedTranscriptionPayload,
  fallbackDuration?: number
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('projects')
      .update({
        transcription_text: cached.transcriptionText,
        transcription_segments: cached.transcriptionSegments,
        speaker_data: cached.speakerData,
        audio_duration: cached.duration ?? fallbackDuration ?? null,
        status: 'processing',
        processing_stage: 'finalizing',
        processing_progress: 75,
        processing_message: 'Base transcription loaded from cache, applying tier-specific features...',
        stage_started_at: now
      })
      .eq('id', projectId);

    if (error) {
      console.warn('[TRANSCRIPTION CACHE] Failed to hydrate project from cache:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('[TRANSCRIPTION CACHE] Error hydrating project:', error);
    return false;
  }
}

/**
 * Increment reference count for a cached transcription
 * Called when a project starts using this cache entry
 */
export async function incrementReferenceCount(
  _fingerprint: string | undefined
): Promise<void> {
  // Reference counting disabled until dedicated RPC/function exists.
  return;
}

/**
 * Decrement reference count and delete cache if count reaches 0
 * Called when a project is deleted
 */
export async function decrementReferenceCount(
  _fingerprint: string | undefined
): Promise<void> {
  // Reference counting disabled until dedicated RPC/function exists.
  return;
}

/**
 * Get the audio fingerprint associated with a project
 * Used for cache cleanup when project is deleted
 */
export async function getProjectFingerprint(
  projectId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('audio_fingerprint')
      .eq('id', projectId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.audio_fingerprint || null;
  } catch (error) {
    console.warn('[TRANSCRIPTION CACHE] Error fetching project fingerprint:', error);
    return null;
  }
}
