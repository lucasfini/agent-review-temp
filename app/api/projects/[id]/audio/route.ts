import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase/server';
import { r2Client, BUCKET_NAME } from '@/lib/r2';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    const authHeader = request.headers.get('authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, user_id, audio_file_name')
      .eq('id', projectId)
      .single() as { data: { id: string; user_id: string; audio_file_name: string | null } | null; error: any };

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!project.audio_file_name) {
      return NextResponse.json({ error: 'No audio file on record for this project' }, { status: 404 });
    }

    // Derive key server-side — never trust a client-supplied path
    const r2Key = `${projectId}/${project.audio_file_name}`;

    await r2Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: r2Key,
    }));

    await supabaseAdmin
      .from('projects')
      .update({ audio_deleted_at: new Date().toISOString() } as any)
      .eq('id', projectId)
      .is('audio_deleted_at', null);

    console.log(`[audio-delete] Deleted R2 file: ${r2Key} (project ${projectId})`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[audio-delete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete audio file' }, { status: 500 });
  }
}
