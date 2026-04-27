import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { scheduleBackgroundTask } from '@/lib/background-task';
import { DEFAULT_THEME_ID } from '@/lib/content-themes';
import { normalizeCustomGuidance } from '@/lib/content-types';
import { isAnalysisJobKey } from '@/lib/project-generation-jobs';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { estimateAnalysisJobCostAsync, estimateContentGenerationCostAsync } from '@/lib/billing/cost-map';
import { aiRatelimit } from '@/lib/rate-limit';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';

type GenerateItem = {
  kind: 'analysis' | 'content';
  targetKey: string;
  themeId?: string;
  customGuidance?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { success } = await aiRatelimit.limit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for AI operations. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items as GenerateItem[] : [];
    if (!items.length) {
      return NextResponse.json({ error: 'No generation items provided' }, { status: 400 });
    }

    const { data: project, error: projectError } = await (supabaseAdmin as any)
      .from('projects')
      .select('id, user_id, transcription_text')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!project.transcription_text) {
      return NextResponse.json({ error: 'Project transcription not available' }, { status: 400 });
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

    if (estimatedReserveAmount > 0) {
      await requireCredits(user.id, estimatedReserveAmount);
    }

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

    const rowsToInsert = normalizedItems
      .filter((item) => !activeKeys.has(`${item.kind}:${item.targetKey}`))
      .map((item) => ({
        project_id: projectId,
        user_id: user.id,
        kind: item.kind,
        target_key: item.targetKey,
        theme_id: item.kind === 'content' ? (item.themeId || DEFAULT_THEME_ID) : null,
        custom_guidance: item.kind === 'content' ? (normalizeCustomGuidance(item.customGuidance) || null) : null,
        status: 'queued',
      }));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await (supabaseAdmin as any)
        .from('project_generation_jobs')
        .insert(rowsToInsert);

      if (insertError) {
        console.error('[PROJECT-GENERATE] Failed to insert jobs:', insertError);
        return NextResponse.json({ error: 'Failed to queue generation' }, { status: 500 });
      }
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
    });
  } catch (error) {
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) {
      return billingResponse;
    }
    console.error('[PROJECT-GENERATE] Error:', error);
    return NextResponse.json({ error: 'Failed to queue generation' }, { status: 500 });
  }
}
