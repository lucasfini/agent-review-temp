import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { scheduleBackgroundTask } from '@/lib/background-task';
import { DEFAULT_THEME_ID } from '@/lib/content-themes';
import { normalizeCustomGuidance } from '@/lib/content-types';
import { isAnalysisJobKey } from '@/lib/project-generation-jobs';
import { billingErrorResponse } from '@/lib/billing/middleware';
import { estimateAnalysisJobCostAsync, estimateContentGenerationCostAsync } from '@/lib/billing/cost-map';
import { aiRatelimit } from '@/lib/rate-limit';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import { can } from '@/lib/authz/permissions';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import { runEntitlementGuard } from '@/lib/billing/entitlement-guards';
import { getOrganizationPlanCreditBalance, InsufficientPlanCreditsError } from '@/lib/billing/plan-credits';
import { estimateDraftProductCredits } from '@/lib/billing/product-credits';
import {
  notifyContentGenerationStarted,
  notifyCreditsDepleted,
} from '@/lib/notifications/notification-events';
import {
  GenerationContextValidationError,
  hasGenerationContextIds,
  readGenerationContextIds,
  resolveGenerationContext,
} from '@/lib/generation-context';
import { getAnalysisCompatibility } from '@/lib/generation-capabilities';
import type { AnalysisOptionKey } from '@/lib/analysis-options';

type GenerateItem = {
  kind: 'analysis' | 'content';
  targetKey: string;
  themeId?: string;
  customGuidance?: string;
  creatorProfileId?: string | null;
  creator_profile_id?: string | null;
  brandVoiceId?: string | null;
  brand_voice_id?: string | null;
  campaignId?: string | null;
  campaign_id?: string | null;
  libraryId?: string | null;
  library_id?: string | null;
};

type GenerationJobInsertRow = {
  project_id: string;
  user_id: string;
  organization_id?: string | null;
  kind: 'analysis' | 'content';
  target_key: string;
  theme_id: string | null;
  custom_guidance?: string | null;
  creator_profile_id?: string | null;
  brand_voice_id?: string | null;
  campaign_id?: string | null;
  library_id?: string | null;
  status: 'queued';
};

function isProjectGenerationJobsSchemaCacheError(error: any): boolean {
  const message = typeof error?.message === 'string' ? error.message : '';
  return error?.code === 'PGRST204'
    && message.includes('project_generation_jobs')
    && /column|schema cache/i.test(message);
}

function stripOptionalGenerationJobColumns(row: GenerationJobInsertRow) {
  return {
    project_id: row.project_id,
    user_id: row.user_id,
    kind: row.kind,
    target_key: row.target_key,
    theme_id: row.theme_id,
    status: row.status,
  };
}

async function insertGenerationJobsWithSchemaFallback(rows: GenerationJobInsertRow[]) {
  const primary = await (supabaseAdmin as any)
    .from('project_generation_jobs')
    .insert(rows);

  if (!primary.error || !isProjectGenerationJobsSchemaCacheError(primary.error)) {
    return primary;
  }

  console.warn('[PROJECT-GENERATE] Retrying generation job insert without optional columns after schema cache error:', primary.error);
  const fallbackRows = rows.map(stripOptionalGenerationJobColumns);
  return (supabaseAdmin as any)
    .from('project_generation_jobs')
    .insert(fallbackRows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let notificationOrganizationId: string | null = null;
  let notificationUserId: string | null = null;
  let notificationProjectTitle: string | null = null;
  try {
    const { id: projectId } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items as GenerateItem[] : [];
    const bodyGenerationContextIds = readGenerationContextIds(body);
    if (!items.length) {
      return NextResponse.json({ error: 'No generation items provided' }, { status: 400 });
    }

    let user: { id: string; email?: string | null };
    let project: {
      id: string;
      user_id: string;
      transcription_text: string | null;
      transcription_segments?: unknown;
      speaker_data?: unknown;
      metadata?: any;
      organization_id: string | null;
      title: string | null;
    };
    try {
      const ownership = await requireProjectOwner<{
        transcription_text: string | null;
        transcription_segments: unknown;
        speaker_data: unknown;
        metadata: any;
        organization_id: string | null;
        title: string | null;
      }>(request, projectId, 'id, user_id, transcription_text, transcription_segments, speaker_data, metadata, organization_id, title');
      user = ownership.user;
      project = ownership.project;
      notificationUserId = user.id;
      notificationProjectTitle = project.title || null;
    } catch (error) {
      if (error instanceof RouteAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const { success } = await aiRatelimit.limit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for AI operations. Please wait a moment.' },
        { status: 429 }
      );
    }

    if (!project.transcription_text) {
      return NextResponse.json({ error: 'Project transcription not available' }, { status: 400 });
    }
    if (project.organization_id) {
      const { membership, organization } = await getActiveOrganizationForUser(
        supabaseAdmin,
        user.id,
        project.organization_id
      );
      if (!can(
        {
          userId: user.id,
          organizationId: organization.id,
          organizationType: organization.type,
          role: membership.role,
        },
        'generation.run',
        { organizationId: organization.id }
      )) {
        return NextResponse.json({ error: 'You do not have permission to generate content in this workspace' }, { status: 403 });
      }
    }

    const projectOrganizationId = project.organization_id || await resolveOrganizationIdForWrite(project.user_id);
    notificationOrganizationId = projectOrganizationId;
    for (const item of items) {
      if (item?.kind !== 'content') continue;
      const itemGenerationContextIds = readGenerationContextIds(item);
      const effectiveGenerationContextIds = hasGenerationContextIds(itemGenerationContextIds)
        ? itemGenerationContextIds
        : bodyGenerationContextIds;
      if (hasGenerationContextIds(effectiveGenerationContextIds)) {
        try {
          await resolveGenerationContext(supabaseAdmin, projectOrganizationId, effectiveGenerationContextIds, {
            userId: project.user_id,
          });
        } catch (error) {
          if (error instanceof GenerationContextValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
          }
          throw error;
        }
      }
    }

    const normalizedItems = items.filter((item) => {
      if (!item || (item.kind !== 'analysis' && item.kind !== 'content')) return false;
      if (typeof item.targetKey !== 'string' || !item.targetKey.trim()) return false;
      if (item.kind === 'analysis') return isAnalysisJobKey(item.targetKey);
      return true;
    });

    if (!normalizedItems.length) {
      return NextResponse.json({ error: 'No valid generation items provided' }, { status: 400 });
    }

    const incompatibleItems = normalizedItems
      .filter((item) => item.kind === 'analysis')
      .map((item) => ({
        item,
        compatibility: getAnalysisCompatibility(project, item.targetKey as AnalysisOptionKey),
      }))
      .filter(({ compatibility }) => !compatibility.compatible);

    if (incompatibleItems.length > 0) {
      const invalidItems = incompatibleItems.map(({ item, compatibility }) => ({
        kind: item.kind,
        targetKey: item.targetKey,
        reason: compatibility.reason || 'This analysis cannot run for this project.',
      }));
      return NextResponse.json(
        {
          error: invalidItems[0]?.reason || 'One or more generation items cannot run for this project.',
          invalidItems,
        },
        { status: 422 }
      );
    }

    const entitlementGuard = await runEntitlementGuard({
      organizationId: projectOrganizationId,
      legacyUserId: project.user_id,
      action: 'content_generation',
      requestedAmount: normalizedItems.length,
      logContext: {
        route: 'app/api/projects/[id]/generate',
        userId: user.id,
        projectId,
        metadata: {
          itemCount: normalizedItems.length,
          contentItems: normalizedItems.filter((item) => item.kind === 'content').length,
          analysisItems: normalizedItems.filter((item) => item.kind === 'analysis').length,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
    }

    const itemCosts = await Promise.all(normalizedItems.map((item) => {
      if (item.kind === 'analysis') {
        return estimateAnalysisJobCostAsync({
          targetKey: item.targetKey,
          estimatedTranscriptLength: project.transcription_text?.length || 0,
        });
      }
      return estimateContentGenerationCostAsync([item.targetKey]);
    }));

    const estimatedCost = itemCosts.reduce((sum, cost) => sum + cost, 0);

    const estimatedReserveAmount = normalizedItems.reduce((sum, item, index) => {
      const itemCost = itemCosts[index] || 0;
      return Number((sum + estimateReservationAmount(itemCost, item.kind === 'analysis' ? 'analysis_job' : 'content_generation')).toFixed(4));
    }, 0);

    const targetKeys = normalizedItems.map((item) => item.targetKey);
    const { data: existingJobs } = await (supabaseAdmin as any)
      .from('project_generation_jobs')
      .select('id, kind, target_key, status')
      .eq('project_id', projectId)
      .in('status', ['queued', 'running'])
      .in('target_key', targetKeys);

    const activeKeys = new Set(
      ((existingJobs || []) as Array<{ kind: string; target_key: string }>).map((job) => `${job.kind}:${job.target_key}`)
    );

    const rowsToInsert: GenerationJobInsertRow[] = normalizedItems
      .filter((item) => !activeKeys.has(`${item.kind}:${item.targetKey}`))
      .map((item) => {
        const itemGenerationContextIds = item.kind === 'content' ? readGenerationContextIds(item) : bodyGenerationContextIds;
        const effectiveGenerationContextIds = item.kind === 'content' && hasGenerationContextIds(itemGenerationContextIds)
          ? itemGenerationContextIds
          : bodyGenerationContextIds;

        return {
          project_id: projectId,
          user_id: user.id,
          organization_id: projectOrganizationId,
          kind: item.kind,
          target_key: item.targetKey,
          theme_id: item.kind === 'content' ? (item.themeId || DEFAULT_THEME_ID) : null,
          custom_guidance: item.kind === 'content' ? (normalizeCustomGuidance(item.customGuidance) || null) : null,
          creator_profile_id: item.kind === 'content' ? effectiveGenerationContextIds.creatorProfileId : null,
          brand_voice_id: item.kind === 'content' ? effectiveGenerationContextIds.brandVoiceId : null,
          campaign_id: item.kind === 'content' ? effectiveGenerationContextIds.campaignId : null,
          library_id: item.kind === 'content' ? effectiveGenerationContextIds.libraryId : null,
          status: 'queued',
        };
      });

    const estimatedProductCredits = estimateDraftProductCredits(rowsToInsert.length);
    if (estimatedProductCredits > 0) {
      const balance = await getOrganizationPlanCreditBalance({
        organizationId: projectOrganizationId,
        userId: user.id,
        ensureGrant: true,
      });

      if (balance.available + 0.0001 < estimatedProductCredits) {
        throw new InsufficientPlanCreditsError(
          projectOrganizationId,
          estimatedProductCredits,
          balance.available,
          balance.subscription?.plan?.slug || null,
          Boolean(balance.subscription?.plan?.topUpEnabled)
        );
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await insertGenerationJobsWithSchemaFallback(rowsToInsert);

      if (insertError) {
        console.error('[PROJECT-GENERATE] Failed to insert jobs:', insertError);
        return NextResponse.json({ error: 'Failed to queue generation' }, { status: 500 });
      }

      await notifyContentGenerationStarted({
        organizationId: projectOrganizationId,
        actorUserId: user.id,
        projectId,
        projectTitle: notificationProjectTitle,
        count: rowsToInsert.length,
        idempotencyKey: `content_generation_started:${projectId}:${Date.now()}`,
        metadata: {
          source: 'project_generate',
          queued: rowsToInsert.length,
          targetKeys: rowsToInsert.map((row) => row.target_key),
        },
      });
    }

    const baseUrl = getInternalAppBaseUrl();
    const internalJobToken = getInternalJobToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (internalJobToken) {
      headers['x-internal-job-token'] = internalJobToken;
    }
    headers.Authorization = authHeader;

    scheduleBackgroundTask(
      fetch(`${baseUrl}/api/projects/${projectId}/generate/process`, {
        method: 'POST',
        headers,
      }).catch((error) => {
        console.error('[PROJECT-GENERATE] Failed to start processor:', error);
      })
    );

    return NextResponse.json({
      success: true,
      queued: rowsToInsert.length,
      skipped: normalizedItems.length - rowsToInsert.length,
      estimatedCost: Number(estimatedCost.toFixed(6)),
      estimatedReserveAmount,
      estimatedProductCredits,
    });
  } catch (error) {
    if (error instanceof GenerationContextValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) {
      if (error instanceof InsufficientPlanCreditsError) {
        await notifyCreditsDepleted({
          organizationId: notificationOrganizationId || error.organizationId,
          actorUserId: notificationUserId,
          idempotencyKey: `credits_depleted:project_generate:${notificationOrganizationId || error.organizationId}`,
          metadata: {
            source: 'project_generate',
            required: error.required,
            available: error.available,
            projectTitle: notificationProjectTitle,
          },
        });
      }
      return billingResponse;
    }
    console.error('[PROJECT-GENERATE] Error:', error);
    return NextResponse.json({ error: 'Failed to queue generation' }, { status: 500 });
  }
}
