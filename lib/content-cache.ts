import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

const TABLE_NAME = 'content_generation_cache';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

const isTableMissingError = (error: SupabaseErrorLike | null | undefined) =>
  error?.code === '42P01' || (error?.message ?? '').includes(TABLE_NAME);

export interface CachedContentPayload {
  cacheKey: string;
  projectId: string;
  contentTypes: string[];
  transcriptionHash: string;
  analysis: Record<string, unknown>;
  generatedContent: unknown[];
  createdAt?: string;
}

export function buildContentCacheKey(payload: {
  projectId: string;
  contentTypes: string[];
  transcriptionHash: string;
  modelId?: string;
  keywordsSignature?: string | null;
}): string {
  const normalizedTypes = [...payload.contentTypes].sort();
  const keyPayload = JSON.stringify({
    projectId: payload.projectId,
    contentTypes: normalizedTypes,
    transcriptionHash: payload.transcriptionHash,
    modelId: payload.modelId || 'default',
    keywords: payload.keywordsSignature || null
  });

  return crypto.createHash('sha256').update(keyPayload).digest('hex');
}

export function hashTranscription(transcription: string): string {
  return crypto.createHash('sha256').update(transcription).digest('hex');
}

export async function getCachedGeneratedContent(
  cacheKey: string
): Promise<CachedContentPayload | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('cache_key, project_id, content_types, transcription_hash, analysis, generated_content, created_at')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) {
      if (error && !isTableMissingError(error) && error.code !== 'PGRST116') {
        console.warn('[CONTENT CACHE] Lookup failed:', error);
      }
      return null;
    }

    return {
      cacheKey: data.cache_key,
      projectId: data.project_id,
      contentTypes: data.content_types || [],
      transcriptionHash: data.transcription_hash,
      analysis: data.analysis as Record<string, unknown>,
      generatedContent: (data.generated_content || []) as unknown[],
      createdAt: data.created_at
    };
  } catch (error) {
    if (!isTableMissingError(error as SupabaseErrorLike)) {
      console.warn('[CONTENT CACHE] Lookup error:', error);
    }
    return null;
  }
}

export async function cacheGeneratedContent(payload: CachedContentPayload): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(
        {
          cache_key: payload.cacheKey,
          project_id: payload.projectId,
          content_types: payload.contentTypes,
          transcription_hash: payload.transcriptionHash,
          analysis: payload.analysis,
          generated_content: payload.generatedContent,
          created_at: new Date().toISOString()
        },
        { onConflict: 'cache_key' }
      );

    if (error && !isTableMissingError(error)) {
      console.warn('[CONTENT CACHE] Upsert failed:', error);
    }
  } catch (error) {
    if (!isTableMissingError(error as SupabaseErrorLike)) {
      console.warn('[CONTENT CACHE] Upsert error:', error);
    }
  }
}
