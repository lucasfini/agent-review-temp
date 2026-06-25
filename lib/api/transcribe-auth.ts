import type { NextRequest } from 'next/server';

import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export type TranscribeProjectRecord = {
  transcription_text: string | null;
  transcription_segments: any;
  speaker_data: any;
  audio_duration: number | null;
  audio_file_size: number | null;
  user_id: string;
  title: string;
  preset_speakers: any[] | null;
  metadata?: any;
  performance_level?: string | null;
  organization_id?: string | null;
};

export type TranscribeRequestAuthContext = {
  isInternal: boolean;
  callerUserId: string | null;
  existingProject: TranscribeProjectRecord;
};

export async function resolveTranscribeRequestAuthContext(
  request: NextRequest,
  projectId: string
): Promise<TranscribeRequestAuthContext> {
  const isInternal = isAuthorizedMaintenanceRequest(request);

  const projectSelect = 'transcription_text, transcription_segments, speaker_data, audio_duration, audio_file_size, user_id, title, preset_speakers, metadata, performance_level, organization_id';

  if (isInternal) {
    const { data: existingProject, error: projectError } = await supabaseAdmin
      .from('projects')
      .select(projectSelect)
      .eq('id', projectId)
      .single() as { data: TranscribeProjectRecord | null; error: any };

    if (projectError || !existingProject) {
      throw new RouteAccessError(404, 'Project not found');
    }

    return {
      isInternal: true,
      callerUserId: null,
      existingProject,
    };
  }

  const ownership = await requireProjectOwner<TranscribeProjectRecord>(
    request,
    projectId,
    projectSelect
  );

  return {
    isInternal: false,
    callerUserId: ownership.user.id,
    existingProject: ownership.project,
  };
}
