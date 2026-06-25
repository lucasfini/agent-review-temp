import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAuthorizedMaintenanceRequest } from '@/lib/maintenance-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { failReservation, InsufficientCreditError } from '@/lib/billing/credit';
import { estimateAnalysisJobCostAsync, estimateContentGenerationCostAsync } from '@/lib/billing/cost-map';
import { isDemoUser } from '@/lib/demo-mode';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import {
  buildContentBlockForJob,
  isAnalysisJobKey,
  mapAnalysisJobKeyToReconcileTarget,
  type ProjectGenerationJob,
} from '@/lib/project-generation-jobs';
import { acquireGlobalJobLock, releaseGlobalJobLock, heartbeatGlobalJobLock } from '@/lib/concurrency';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import { recordSubscriptionUsage } from '@/lib/billing/subscription-usage-counters';
import {
  runEntitlementGuard,
  shouldEnforceSubscriptionEntitlements,
} from '@/lib/billing/entitlement-guards';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { createPlanCreditReservation, InsufficientPlanCreditsError } from '@/lib/billing/plan-credits';
import { estimateDraftProductCredits } from '@/lib/billing/product-credits';

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

  const fallbackPayload = { ...payload };
  delete fallbackPayload.failure_notified_at;
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
  await releaseGlobalJobLock(jobId);
}

async function failJob(jobId: string, message: string) {
  await updateJob(jobId, {
    status: 'failed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_message: message,
    failure_notified_at: null,
  });
  await releaseGlobalJobLock(jobId);
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
      try {
        await requireProjectOwner(request, projectId, 'id');
      } catch (error) {
        if (error instanceof RouteAccessError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
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

    if (callerUserId) {
      const { data: projectForEntitlement, error: entitlementProjectError } = await (supabaseAdmin as any)
        .from('projects')
        .select('id, user_id, organization_id')
        .eq('id', projectId)
        .single();

      if (entitlementProjectError || !projectForEntitlement) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const { count: queuedJobCount, error: queuedJobCountError } = await (supabaseAdmin as any)
        .from('project_generation_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('status', 'queued');

      if (queuedJobCountError) {
        throw new Error(queuedJobCountError.message || 'Failed to load queued generation jobs');
      }

      if ((queuedJobCount || 0) > 0) {
        const entitlementOrganizationId = projectForEntitlement.organization_id
          || (shouldEnforceSubscriptionEntitlements()
            ? await resolveOrganizationIdForWrite(projectForEntitlement.user_id)
            : null);
        const entitlementGuard = await runEntitlementGuard({
          organizationId: entitlementOrganizationId,
          legacyUserId: projectForEntitlement.user_id,
          action: 'content_generation',
          requestedAmount: queuedJobCount || 1,
          allowHardBlock: true,
          logContext: {
            route: 'app/api/projects/[id]/generate/process',
            userId: callerUserId,
            projectId,
            metadata: {
              queuedJobCount,
              isMaintenance,
            },
          },
        });
        if (entitlementGuard.response) {
          return entitlementGuard.response;
        }
      }
    }

    const baseUrl = getInternalAppBaseUrl();

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

      // Check global concurrency lock
      const lockAcquired = await acquireGlobalJobLock(nextJob.id);
      if (!lockAcquired) {
        console.log(`[PROJECT-GENERATE-PROCESS] Yielding due to global concurrency limit. Job ${nextJob.id} will remain queued.`);
        
        // Keep user-facing progress neutral while work waits for a processing slot.
        await (supabaseAdmin as any)
          .from('generation_progress')
          .update({
            message: 'Preparing your content...',
            updated_at: new Date().toISOString()
          })
          .eq('project_id', projectId);

        break; // Stop processing for this project instance for now
      }

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
        await releaseGlobalJobLock(nextJob.id);
        continue;
      }

      // Start heartbeat to keep lock alive for long-running tasks
      const heartbeat = setInterval(() => {
        heartbeatGlobalJobLock(job.id).catch(err => 
          console.error(`[PROJECT-GENERATE-PROCESS] Heartbeat failed for ${job.id}:`, err)
        );
      }, 5 * 60 * 1000); // Every 5 minutes

      try {
        const { data: project, error: projectError } = await (supabaseAdmin as any)
          .from('projects')
          .select('id, user_id, organization_id, transcription_text, transcription_segments, speaker_data, metadata')
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
          ? await estimateAnalysisJobCostAsync({
              targetKey: job.target_key,
              estimatedTranscriptLength: project.transcription_text.length,
            })
          : await estimateContentGenerationCostAsync([job.target_key]);

        if (job.kind === 'analysis') {
          if (!isAnalysisJobKey(job.target_key)) {
            throw new Error(`Invalid analysis target: ${job.target_key}`);
          }

          const reconcileTarget = mapAnalysisJobKeyToReconcileTarget(job.target_key);
          const legacyEstimatedHold = estimateReservationAmount(estimatedCost, 'analysis_job');
          const productCreditAmount = estimateDraftProductCredits(1);
          const reservation = estimatedCost > 0
            ? await createPlanCreditReservation({
                userId: project.user_id,
                organizationId: project.organization_id || await resolveOrganizationIdForWrite(project.user_id),
                projectId,
                workflowType: 'analysis_job',
                amount: productCreditAmount,
                metadata: {
                  targetKey: job.target_key,
                  queuedJobId: job.id,
                  estimatedCost,
                  estimatedProviderCost: estimatedCost,
                  legacyEstimatedHold,
                  productCreditAmount,
                  productCreditWorkflow: 'extra_draft_or_regeneration',
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

          if (completedTargets.has(reconcileTarget)) {
            await recordSubscriptionUsage({
              organizationId: project.organization_id || null,
              userId: project.user_id,
              counterKey: 'content_generation',
              quantity: 1,
              idempotencyKey: `project_generation_job:${job.id}`,
              metadata: {
                source: 'analysis_job',
                jobId: job.id,
                targetKey: job.target_key,
                reconcileTarget,
                reservationId: reservation?.id || null,
              },
              logContext: {
                route: 'app/api/projects/[id]/generate/process',
                userId: project.user_id,
                projectId,
                source: 'analysis_job',
              },
            });
          }
        } else {
          const block = buildContentBlockForJob(
            job.target_key,
            job.theme_id || 'professional',
            job.custom_guidance || undefined
          );
          const generationHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          const forwardedAuth = request.headers.get('Authorization');
          const internalToken = request.headers.get('x-internal-job-token');
          if (forwardedAuth) {
            generationHeaders.Authorization = forwardedAuth;
          }
          if (internalToken) {
            generationHeaders['x-internal-job-token'] = internalToken;
          }
          const res = await fetch(`${baseUrl}/api/generate-content`, {
            method: 'POST',
            headers: generationHeaders,
            body: JSON.stringify({
              projectId,
              transcription: project.transcription_text,
              segments: project.transcription_segments || [],
              speakerData: project.speaker_data || {},
              blocks: [block],
              creator_profile_id: job.creator_profile_id || undefined,
              brand_voice_id: job.brand_voice_id || undefined,
              campaign_id: job.campaign_id || undefined,
              library_id: job.library_id || undefined,
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
          : error instanceof InsufficientPlanCreditsError
            ? `Insufficient credits: need ${error.required.toFixed(4)}, have ${error.available.toFixed(4)}`
          : (error?.message || 'Generation failed');
        await failJob(job.id, message);
      } finally {
        clearInterval(heartbeat);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PROJECT-GENERATE-PROCESS] Fatal error:', error);
    return NextResponse.json({ error: 'Failed to process generation jobs' }, { status: 500 });
  }
}
