import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase/server';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    let project: { id: string; user_id: string; audio_file_name: string | null };
    try {
      const ownership = await requireProjectOwner<{ audio_file_name: string | null }>(
        request,
        projectId,
        'id, user_id, audio_file_name'
      );
      project = ownership.project;
    } catch (error) {
      if (error instanceof RouteAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
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
