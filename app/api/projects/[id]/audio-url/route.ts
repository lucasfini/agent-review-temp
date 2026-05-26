import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabaseAdmin } from '@/lib/supabase/server';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { isAudioExpired } from '@/lib/audio-retention';
import { getStarterAudioObjectKey } from '@/lib/starter-project';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    try {
      await requireProjectOwner(request, projectId, 'id');
    } catch (error) {
      if (error instanceof RouteAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    let { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, audio_file_name, audio_expires_at, audio_deleted_at, metadata')
      .eq('id', projectId)
      .single() as {
        data: {
          id: string;
          audio_file_name: string | null;
          audio_expires_at: string | null;
          audio_deleted_at: string | null;
          metadata?: unknown;
        } | null;
        error: any;
      };

    if (projectError?.message?.includes(`'audio_expires_at'`)) {
      const retry = await supabaseAdmin
        .from('projects')
        .select('id, audio_file_name')
        .eq('id', projectId)
        .single() as {
          data: {
            id: string;
            audio_file_name: string | null;
          } | null;
          error: any;
        };

      project = retry.data
        ? {
            ...retry.data,
            audio_expires_at: null,
            audio_deleted_at: null,
          }
        : null;
      projectError = retry.error;
    }

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.audio_file_name) {
      return NextResponse.json({ error: 'No audio file associated with this project' }, { status: 404 });
    }

    if (isAudioExpired(project)) {
      return NextResponse.json({
        error: 'Source audio has been deleted',
        code: 'AUDIO_DELETED',
        audioExpiresAt: project.audio_expires_at,
      }, { status: 410 });
    }

    const key = getStarterAudioObjectKey(project);
    if (!key) {
      return NextResponse.json({ error: 'No audio file associated with this project' }, { status: 404 });
    }

    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error('[audio-url] Error generating presigned URL:', error);
    return NextResponse.json({ error: 'Failed to generate audio URL' }, { status: 500 });
  }
}
