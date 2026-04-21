import { NextRequest, NextResponse } from 'next/server';

import { logAdminAuditEvent } from '@/lib/admin/audit';
import { AdminAuthError, requireAdmin } from '@/lib/admin/require-admin';
import { deleteProjectAudioObject } from '@/lib/audio-retention';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

async function startGenerationProcessor(projectId: string, adminAuthHeader: string) {
  const headers: Record<string, string> = {
    Authorization: adminAuthHeader,
  };
  const internalJobToken = getInternalJobToken();
  if (internalJobToken) {
    headers['x-internal-job-token'] = internalJobToken;
  }

  await fetch(`${getInternalAppBaseUrl()}/api/projects/${projectId}/generate/process`, {
    method: 'POST',
    headers,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin: { id: string; email: string } | null = null;

  try {
    admin = await requireAdmin(request);

    const { id: projectId } = await params;
    const body = await request.json().catch(() => null);
    const action = typeof body?.action === 'string' ? body.action : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!projectId || !action) {
      return NextResponse.json({ error: 'Missing projectId or action' }, { status: 400 });
    }

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id, title, user_id, status, processing_stage, processing_progress, processing_message, audio_file_name, audio_deleted_at')
      .eq('id', projectId)
      .single() as { data: any; error: any };

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (action === 'cancel') {
      if (!['uploading', 'processing'].includes(project.status)) {
        return NextResponse.json({ error: 'Project is not cancellable' }, { status: 409 });
      }

      await supabaseAdmin
        .from('projects')
        .update({
          status: 'cancelled',
          processing_stage: 'cancelled',
          processing_progress: 0,
          processing_message: reason || 'Cancelled by admin.',
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', projectId);

      let audioDeleted = false;
      if (project.audio_file_name && !project.audio_deleted_at) {
        try {
          const result = await deleteProjectAudioObject(project, { markDeleted: true });
          audioDeleted = result.deleted;
        } catch (audioError) {
          console.error('[ADMIN PROJECT ACTION] Failed to delete project audio during cancel:', audioError);
        }
      }

      await logAdminAuditEvent({
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: 'project.cancel',
        targetType: 'project',
        targetId: projectId,
        targetLabel: project.title || 'Untitled project',
        reason,
        metadata: {
          audioDeleted,
        },
      });

      return NextResponse.json({
        success: true,
        action,
        audioDeleted,
      });
    }

    if (action === 'retry_generation_jobs') {
      const failedJobIds = Array.isArray(body?.jobIds)
        ? body.jobIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];

      let query = (supabaseAdmin as any)
        .from('project_generation_jobs')
        .update({
          status: 'queued',
          error_message: null,
          failure_notified_at: null,
          started_at: null,
          completed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('project_id', projectId)
        .eq('status', 'failed');

      if (failedJobIds.length > 0) {
        query = query.in('id', failedJobIds);
      }

      const { data: requeuedJobs, error: requeueError } = await query.select('id, target_key, kind');
      if (requeueError) {
        throw requeueError;
      }

      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
      await startGenerationProcessor(projectId, authHeader);

      await logAdminAuditEvent({
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: 'project.retry_generation_jobs',
        targetType: 'project',
        targetId: projectId,
        targetLabel: project.title || 'Untitled project',
        reason,
        metadata: {
          requeuedJobIds: (requeuedJobs || []).map((job: any) => job.id),
        },
      });

      return NextResponse.json({
        success: true,
        action,
        requeuedJobs: requeuedJobs || [],
      });
    }

    if (action === 'clear_processing_error') {
      await supabaseAdmin
        .from('projects')
        .update({
          status: 'processing',
          processing_message: reason || 'Admin cleared failure and returned project to processing.',
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', projectId);

      await logAdminAuditEvent({
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: 'project.clear_processing_error',
        targetType: 'project',
        targetId: projectId,
        targetLabel: project.title || 'Untitled project',
        reason,
      });

      return NextResponse.json({ success: true, action });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    if (admin) {
      await logAdminAuditEvent({
        adminUserId: admin.id,
        adminEmail: admin.email,
        action: 'project.action_failed',
        targetType: 'project',
        targetId: (await params).id,
        reason: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
      });
    }

    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ADMIN PROJECT ACTION] Error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
