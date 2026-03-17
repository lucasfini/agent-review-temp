import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET_NAME, r2Client } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase/server';

export const AUDIO_RETENTION_DAYS = 7;

export interface AudioRetentionProject {
  id: string;
  audio_file_name: string | null;
  audio_expires_at: string | null;
  audio_deleted_at: string | null;
}

export function getAudioExpiryDate(from: Date = new Date()): string {
  const expiresAt = new Date(from);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + AUDIO_RETENTION_DAYS);
  return expiresAt.toISOString();
}

export function isAudioExpired(project: Pick<AudioRetentionProject, 'audio_expires_at' | 'audio_deleted_at'>): boolean {
  if (project.audio_deleted_at) return true;
  if (!project.audio_expires_at) return false;
  return new Date(project.audio_expires_at).getTime() <= Date.now();
}

export function getAudioObjectKey(project: Pick<AudioRetentionProject, 'id' | 'audio_file_name'>): string | null {
  if (!project.audio_file_name) return null;
  return `${project.id}/${project.audio_file_name}`;
}

export async function deleteProjectAudioObject(
  project: Pick<AudioRetentionProject, 'id' | 'audio_file_name' | 'audio_deleted_at'>,
  options: { markDeleted?: boolean } = {}
): Promise<{ deleted: boolean; reason?: string }> {
  const objectKey = getAudioObjectKey(project);
  if (!objectKey) {
    return { deleted: false, reason: 'no_audio' };
  }

  if (project.audio_deleted_at) {
    return { deleted: false, reason: 'already_deleted' };
  }

  await r2Client.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey,
  }));

  if (options.markDeleted) {
    const deletedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('projects')
      .update({ audio_deleted_at: deletedAt } as any)
      .eq('id', project.id)
      .is('audio_deleted_at', null);

    if (error) {
      console.error(`[AUDIO RETENTION] Failed marking audio deleted for project ${project.id}:`, error);
      throw error;
    }
  }

  return { deleted: true };
}

export async function expireProjectAudio(project: AudioRetentionProject): Promise<{ deleted: boolean; reason?: string }> {
  try {
    return await deleteProjectAudioObject(project, { markDeleted: true });
  } catch (error) {
    console.error(`[AUDIO RETENTION] Failed deleting R2 object for project ${project.id}:`, error);
    throw error;
  }
}

export async function cleanupExpiredAudio(limit: number = 50): Promise<{
  scanned: number;
  deleted: number;
  failed: number;
  projectIds: string[];
}> {
  const now = new Date().toISOString();
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('id, audio_file_name, audio_expires_at, audio_deleted_at')
    .not('audio_file_name', 'is', null)
    .is('audio_deleted_at', null)
    .not('audio_expires_at', 'is', null)
    .lte('audio_expires_at', now)
    .order('audio_expires_at', { ascending: true })
    .limit(limit) as { data: AudioRetentionProject[] | null; error: any };

  if (error) {
    throw error;
  }

  const rows = projects || [];
  let deleted = 0;
  let failed = 0;
  const projectIds: string[] = [];

  for (const project of rows) {
    try {
      const result = await expireProjectAudio(project);
      if (result.deleted) {
        deleted += 1;
        projectIds.push(project.id);
      }
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: rows.length,
    deleted,
    failed,
    projectIds,
  };
}
