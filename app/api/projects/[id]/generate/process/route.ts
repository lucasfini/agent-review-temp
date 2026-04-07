import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { getAppBaseUrl } from '@/lib/app-url';
import { createReservation, failReservation, InsufficientCreditError } from '@/lib/billing/credit';
import { estimateAnalysisJobCost, estimateContentGenerationCost } from '@/lib/billing/cost-map';
import { isDemoUser } from '@/lib/demo-mode';
import {
  buildContentBlockForJob,
  isAnalysisJobKey,
  mapAnalysisJobKeyToReconcileTarget,
  type ProjectGenerationJob,
} from '@/lib/project-generation-jobs';

function isMissingFailureNotifiedAtColumn(error: any): boolean {
  return error?.code === 'PGRST204'
    && typeof error?.message === 'string'
    && error.message.includes('failure_notified_at');
}

async function updateJob(jobId: string, payload: Record<string, unknown>) {
  const primaryResult = await (supabaseAdmin as any)
    .from('project_generation_jobs')
    .update(payload)
    .eq('id', jobId);

  if (!primaryResult.error || !isMissingFailureNotifiedAtColumn(primaryResult.error)) {
    return primaryResult;
  }

  const { failure_notified_at, ...fallbackPayload } = payload;
  return (supabaseAdmin as any)
    .from('project_generation_jobs')
    .update(fallbackPayload)
    .eq('id', jobId);
}

async function completeJob(jobId: string) {
  await updateJob(jobId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_message: null,
    failure_notified_at: null,
  });
}

async function failJob(jobId: string, message: string) {
  await updateJob(jobId, {
    status: 'failed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_message: message,
    failure_notified_at: null,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isMaintenance = isAuthorizedMaintenanceRequest(request);
    let callerUserId: string | null = null;

    if (!isMaintenance) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      callerUserId = user.id;
    }

    const { id: projectId } = await params;

    // Non-maintenance callers must own the project
    if (callerUserId) {
      const { data: projectOwner } = await supabaseAdmin
        .from('projects')
        .select('user_id')
        .eq('id', projectId)
        .single() as { data: { user_id: string } | null };

      if (!projectOwner || projectOwner.user_id !== callerUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    const runningCheck = await (supabaseAdmin as any)
      .from('project_generation_jobs')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'running')
      .limit(1);

    if ((runningCheck.data || []).length > 0) {
      return NextResponse.json({ success: true, skipped: 'already-running' });
    }

    const baseUrl = getAppBaseUrl();

    while (true) {
      const { data: nextJob } = await (supabaseAdmin as any)
        .from('project_generation_jobs')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!nextJob) break;

      let claim = await (supabaseAdmin as any)
        .from('project_generation_jobs')
        .update({
          status: 'running',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: null,
          failure_notified_at: null,
        })
        .eq('id', nextJob.id)
        .eq('status', 'queued')
        .select('*')
        .maybeSingle();

      if (claim.error && isMissingFailureNotifiedAtColumn(claim.error)) {
        claim = await (supabaseAdmin as any)
          .from('project_generation_jobs')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', nextJob.id)
          .eq('status', 'queued')
          .select('*')
          .maybeSingle();
      }

      const job = claim.data as ProjectGenerationJob | null;
      if (!job) {
        continue;
      }

      try {
        const { data: project, error: projectError } = await (supabaseAdmin as any)
          .from('projects')
          .select('id, user_id, transcription_text, transcription_segments, speaker_data, metadata')
          .eq('id', projectId)
          .single();

        if (projectError || !project || !project.transcription_text) {
          throw new Error('Project transcription not available');
        }

        const {
          data: { user: projectOwner },
        } = await supabaseAdmin.auth.admin.getUserById(project.user_id);

        if (isDemoUser(projectOwner)) {
          throw new Error('Demo account is read-only');
        }

        const estimatedCost = job.kind === 'analysis'
          ? estimateAnalysisJobCost({
              targetKey: job.target_key,
              estimatedTranscriptLength: project.transcription_text.length,
            })
          : estimateContentGenerationCost([job.target_key]);

        if (job.kind === 'analysis') {
          if (!isAnalysisJobKey(job.target_key)) {
            throw new Error(`Invalid analysis target: ${job.target_key}`);
          }

          const reconcileTarget = mapAnalysisJobKeyToReconcileTarget(job.target_key);
          const reservation = estimatedCost > 0
            ? await createReservation({
                userId: project.user_id,
                projectId,
                workflowType: 'analysis_job',
                amount: Number((estimatedCost * 1.15).toFixed(4)),
                metadata: {
                  targetKey: job.target_key,
                  queuedJobId: job.id,
                },
                expiresAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
              })
            : null;

          const nextMetadata = {
            ...(project.metadata || {}),
            analysis_options: {
              ...(project.metadata?.analysis_options || {}),
              [job.target_key]: true,
            },
          };

          await (supabaseAdmin as any)
            .from('projects')
            .update({ metadata: nextMetadata })
            .eq('id', projectId);

          const reconcileHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          const forwardedAuth = request.headers.get('Authorization');
          const internalToken = request.headers.get('x-internal-job-token');
          if (forwardedAuth) {
            reconcileHeaders.Authorization = forwardedAuth;
          }
          if (internalToken) {
            reconcileHeaders['x-internal-job-token'] = internalToken;
          }

          const res = await fetch(`${baseUrl}/api/projects/${projectId}/reconcile`, {
            method: 'POST',
            headers: reconcileHeaders,
            body: JSON.stringify({
              targets: [reconcileTarget],
              reservationId: reservation?.id,
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => null);
            if (reservation?.id) {
              await failReservation(reservation.id, data?.message || data?.error || `Failed to generate ${job.target_key}`).catch((billingError) => {
                console.error('[PROJECT-GENERATE-PROCESS] Failed to fail analysis reservation:', billingError);
              });
            }
            throw new Error(data?.message || data?.error || `Failed to generate ${job.target_key}`);
          }

          const reconcileResult = await res.json().catch(() => null);
          const completedTargets = new Set<string>([
            ...((reconcileResult?.generated as string[] | undefined) || []),
            ...((reconcileResult?.flagFixed as string[] | undefined) || []),
          ]);

          if (!completedTargets.has(reconcileTarget) && reconcileResult?.message !== 'All features present') {
            throw new Error(`Reconcile did not complete ${job.target_key}`);
          }
        } else {
          const block = buildContentBlockForJob(job.target_key, job.theme_id || 'professional');
          const res = await fetch(`${baseUrl}/api/generate-content`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              transcription: project.transcription_text,
              segments: project.transcription_segments || [],
              speakerData: project.speaker_data || {},
              blocks: [block],
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.message || data?.error || `Failed to generate ${job.target_key}`);
          }
        }

        await completeJob(job.id);
      } catch (error: any) {
        console.error('[PROJECT-GENERATE-PROCESS] Job failed:', error);
        const message = error instanceof InsufficientCreditError
          ? `Insufficient credits: need $${error.required.toFixed(4)}, have $${error.available.toFixed(4)}`
          : (error?.message || 'Generation failed');
        await failJob(job.id, message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PROJECT-GENERATE-PROCESS] Fatal error:', error);
    return NextResponse.json({ error: 'Failed to process generation jobs' }, { status: 500 });
  }
}
