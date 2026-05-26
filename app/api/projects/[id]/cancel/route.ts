import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { deleteProjectAudioObject } from '@/lib/audio-retention';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams.id;
    let project: {
      id: string;
      user_id: string;
      status: string;
      audio_file_name: string | null;
      audio_deleted_at: string | null;
    };
    try {
      const ownership = await requireProjectOwner<{
        status: string;
        audio_file_name: string | null;
        audio_deleted_at: string | null;
      }>(request, projectId, 'id, user_id, status, audio_file_name, audio_deleted_at');
      project = ownership.project;
    } catch (error) {
      if (error instanceof RouteAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    if (project.status === 'completed' || project.status === 'failed') {
      return NextResponse.json({ error: 'Project is no longer cancellable' }, { status: 409 });
    }

    if (project.status !== 'cancelled') {
      const updateCandidates = [
        {
          status: 'cancelled',
          processing_stage: 'cancelled',
          processing_progress: 0,
          processing_message: 'Upload cancelled by user.',
          updated_at: new Date().toISOString(),
        },
        {
          status: 'cancelled',
          processing_stage: 'cancelled',
          processing_progress: 0,
          processing_message: 'Upload cancelled by user.',
        },
        {
          status: 'cancelled',
        },
      ];

      let updateError: any = null;
      for (const updatePayload of updateCandidates) {
        const attempt = await (supabaseAdmin.from('projects') as any)
          .update(updatePayload)
          .eq('id', projectId);

        updateError = attempt.error;
        if (!updateError) break;
      }

      if (updateError) {
        console.error('[CANCEL] Failed to update project status:', updateError);
        return NextResponse.json({ error: 'Failed to cancel project' }, { status: 500 });
      }
    }

    let audioDeleted = false;
    if (project.audio_file_name && !project.audio_deleted_at) {
      try {
        const result = await deleteProjectAudioObject(project, { markDeleted: true });
        audioDeleted = result.deleted;
      } catch (error) {
        console.error(`[CANCEL] Failed to delete audio for project ${projectId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      status: 'cancelled',
      audioDeleted,
    });
  } catch (error) {
    console.error('[CANCEL] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to cancel upload' }, { status: 500 });
  }
}
