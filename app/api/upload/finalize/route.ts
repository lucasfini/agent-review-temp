import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateProcessingProgress } from '@/lib/progress-tracker';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { verifyUploadToken } from '@/lib/upload-token';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { deleteProjectAudioObject } from '@/lib/audio-retention';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { scheduleBackgroundTask } from '@/lib/background-task';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

export const runtime = 'nodejs';
export const maxDuration = 300; // Allow background tasks to run up to 5 mins

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    const body = await request.json();
    const { projectId, objectKey, audioFingerprint, uploadToken, analysisOptions, speakerCount } = body;

    if (!uploadToken || typeof uploadToken !== 'string') {
      return NextResponse.json({ error: 'Missing upload token' }, { status: 400 });
    }

    const tokenPayload = verifyUploadToken(uploadToken);
    let user: { id: string; email?: string | null };
    let project: { id: string; user_id: string; status: string; audio_file_name: string | null; audio_deleted_at: string | null };
    try {
      const ownership = await requireProjectOwner<{
        status: string;
        audio_file_name: string | null;
        audio_deleted_at: string | null;
      }>(request, projectId, 'id, user_id, status, audio_file_name, audio_deleted_at');
      user = ownership.user;
      project = ownership.project;
    } catch (error) {
      if (error instanceof RouteAccessError) {
        if (error.status === 401) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 403 });
      }
      throw error;
    }

    if (
      !tokenPayload ||
      tokenPayload.projectId !== projectId ||
      tokenPayload.objectKey !== objectKey ||
      tokenPayload.audioFingerprint !== audioFingerprint ||
      tokenPayload.userId !== user.id
    ) {
      return NextResponse.json({ error: 'Invalid upload token' }, { status: 400 });
    }

    if (project.status === 'cancelled') {
      if (project.audio_file_name && !project.audio_deleted_at) {
        try {
          await deleteProjectAudioObject({
            id: projectId,
            audio_file_name: project.audio_file_name,
            audio_deleted_at: project.audio_deleted_at,
          }, { markDeleted: true });
        } catch (error) {
          console.error('[FINALIZE] Cancelled project cleanup failed:', error);
        }
      }
      return NextResponse.json(
        { error: 'Upload was cancelled', phase: 'finalizing', retryable: false },
        { status: 409 }
      );
    }

    if (project.status === 'completed' || project.status === 'failed') {
      return NextResponse.json(
        { error: 'Project is not in an uploadable state', phase: 'finalizing', retryable: false },
        { status: 409 }
      );
    }

    try {
      await updateProcessingProgress(projectId, {
        stage: 'finalizing',
        progress: 0,
        message: 'Verifying uploaded audio...'
      });

      const head = await r2Client.send(new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
      }));
      if (!head.ContentLength || head.ContentLength <= 0) {
        return NextResponse.json({ error: 'Uploaded file is empty or unavailable' }, { status: 400 });
      }
    } catch (error) {
      console.error('R2 verification failed:', error);
      return NextResponse.json({ error: 'Uploaded file not found in storage' }, { status: 400 });
    }

    // Update progress: upload complete, starting transcription
    await updateProcessingProgress(projectId, {
      stage: 'transcribing',
      progress: 0,
      message: 'Preparing your audio for processing...'
    });

    // Legacy status update
    await supabaseAdmin
      .from('projects')
      // @ts-ignore
      .update({ processing_started_at: new Date().toISOString() })
      .eq('id', projectId);

    // Call /api/transcribe using fireAndForget
    {
      const diarizationProvider = (process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY) ? 'assemblyai' : 'deepgram';

      const baseUrl = getInternalAppBaseUrl();

      const internalJobToken = getInternalJobToken();
      const transcribeHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authHeader) {
        transcribeHeaders.Authorization = authHeader;
      }
      if (internalJobToken) {
        transcribeHeaders['x-internal-job-token'] = internalJobToken;
      }

      scheduleBackgroundTask(
        fetch(`${baseUrl}/api/transcribe`, {
          method: 'POST',
          headers: transcribeHeaders,
          body: JSON.stringify({
            projectId,
            fileName: objectKey,
            fingerprint: audioFingerprint,
            analysisOptions,
            diarizationProvider,
            ...(speakerCount && { speakerCount })
          })
        })
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.text();
              console.error('Transcription start failed:', res.status, body.slice(0, 200));
              if (res.status === 409) {
                return;
              }
              await (supabaseAdmin.from('projects') as any)
                .update({ status: 'failed', processing_stage: 'failed', processing_message: `Transcription failed: ${res.status}` })
                .eq('id', projectId)
                .neq('status', 'cancelled');
            }
          })
          .catch(async (error) => {
            console.error('Failed to start transcription:', error);
            await (supabaseAdmin.from('projects') as any)
              .update({ status: 'failed', processing_stage: 'failed', processing_message: `Queue error: ${error.message}` })
              .eq('id', projectId)
              .neq('status', 'cancelled');
          })
      );
    }

    return NextResponse.json({ success: true, message: 'Processing started' });
  } catch (error) {
    console.error('Finalize error:', error);
    return NextResponse.json({ error: 'Failed to finalize upload' }, { status: 500 });
  }
}
