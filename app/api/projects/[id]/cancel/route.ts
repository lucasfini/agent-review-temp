import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { deleteProjectAudioObject } from '@/lib/audio-retention';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams.id;
    const authHeader = request.headers.get('authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, status, audio_file_name, audio_deleted_at')
      .eq('id', projectId)
      .single() as {
        data: {
          id: string;
          user_id: string;
          status: string;
          audio_file_name: string | null;
          audio_deleted_at: string | null;
        } | null;
        error: any;
      };

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (project.status === 'completed' || project.status === 'failed') {
      return NextResponse.json({ error: 'Project is no longer cancellable' }, { status: 409 });
    }

    if (project.status !== 'cancelled') {
      const { error: updateError } = await (supabaseAdmin.from('projects') as any)
        .update({
          status: 'cancelled',
          processing_stage: 'cancelled',
          processing_progress: 0,
          processing_message: 'Upload cancelled by user.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (updateError) {
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
