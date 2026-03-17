import { deleteProjectAudioObject } from '@/lib/audio-retention';
import { supabaseAdmin } from '@/lib/supabase/server';

export const STALE_UPLOAD_HOURS = 6;

type StaleUploadProject = {
  id: string;
  status: 'uploading' | 'cancelled';
  created_at: string;
  processing_stage: string | null;
  audio_file_name: string | null;
  audio_deleted_at: string | null;
};

export async function cleanupStaleUploads(
  limit: number = 50,
  olderThanHours: number = STALE_UPLOAD_HOURS
): Promise<{
  scanned: number;
  deleted: number;
  failed: number;
  deletedAudio: number;
  projectIds: string[];
}> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, status, created_at, processing_stage, audio_file_name, audio_deleted_at')
    .in('status', ['uploading', 'cancelled'])
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit) as { data: StaleUploadProject[] | null; error: any };

  if (error) throw error;

  const projects = data || [];
  const projectIds: string[] = [];
  let deleted = 0;
  let failed = 0;
  let deletedAudio = 0;

  for (const project of projects) {
    try {
      if (project.audio_file_name && !project.audio_deleted_at) {
        try {
          const audioResult = await deleteProjectAudioObject(project, { markDeleted: false });
          if (audioResult.deleted) {
            deletedAudio += 1;
          } else if (audioResult.reason !== 'already_deleted' && audioResult.reason !== 'no_audio') {
            throw new Error(`Audio delete incomplete: ${audioResult.reason || 'unknown'}`);
          }
        } catch (audioError) {
          console.error(`[UPLOAD CLEANUP] Failed deleting audio for stale project ${project.id}:`, audioError);
          failed += 1;
          continue;
        }
      }

      const { error: deleteError } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (deleteError) {
        throw deleteError;
      }

      deleted += 1;
      projectIds.push(project.id);
    } catch (projectError) {
      failed += 1;
      console.error(`[UPLOAD CLEANUP] Failed cleaning stale project ${project.id}:`, projectError);
    }
  }

  return {
    scanned: projects.length,
    deleted,
    failed,
    deletedAudio,
    projectIds,
  };
}
