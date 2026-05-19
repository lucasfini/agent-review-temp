import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET_NAME, r2Client } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase/server';

export interface AudioRetentionProject {
  id: string;
  audio_file_name: string | null;
  audio_expires_at: string | null;
  audio_deleted_at: string | null;
}

export function isAudioExpired(project: Pick<AudioRetentionProject, 'audio_expires_at' | 'audio_deleted_at'>): boolean {
  return Boolean(project.audio_deleted_at);
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

export async function cleanupExpiredAudio(_limit: number = 50): Promise<{
  scanned: number;
  deleted: number;
  failed: number;
  projectIds: string[];
}> {
  void _limit;

  return {
    scanned: 0,
    deleted: 0,
    failed: 0,
    projectIds: [],
  };
}
