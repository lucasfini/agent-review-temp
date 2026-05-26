import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyzeNarrativeCoverage } from '@/lib/narrative-coverage-analyzer';
import {
  getActiveNarrativeGoals,
  saveNarrativeCoverageSnapshot,
  appendCoverageCostToProject
} from '@/lib/narrative-coverage';
import { estimateCoverageAnalysisCost } from '@/lib/billing/cost-map';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { createReservation, failReservation, settleReservation } from '@/lib/billing/credit';
import { normalizeTier } from '@/lib/tier-config';
import { aiRatelimit } from '@/lib/rate-limit';
import { estimateReservationAmount } from '@/lib/billing/reserve-amount';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

export const maxDuration = 300;

interface RunCoveragePayload {
  userId?: string;
  force?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams.id;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    let user: { id: string; email?: string | null };
    let project: {
      id: string;
      user_id: string;
      title: string;
      transcription_text: string;
      ai_summary: string;
      performance_level: string;
      project_type?: string | null;
    };
    try {
      const ownership = await requireProjectOwner<{
        title: string;
        transcription_text: string;
        ai_summary: string;
        performance_level: string;
        project_type?: string | null;
      }>(
        request,
        projectId,
        'id, user_id, title, transcription_text, ai_summary, performance_level, project_type'
      );
      user = ownership.user;
      project = ownership.project;
    } catch (error) {
      if (error instanceof RouteAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    const userId = user.id;

    const { success } = await aiRatelimit.limit(userId);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for AI operations. Please wait a moment.' },
        { status: 429 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as RunCoveragePayload;
    const force = Boolean(payload.force);

    if (!project.transcription_text) {
      return NextResponse.json(
        { error: 'Transcription missing. Run processing before coverage analysis.' },
        { status: 400 }
      );
    }

    const { data: existingSnapshot } = await supabaseAdmin
      .from('narrative_coverage_snapshots')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSnapshot && !force) {
      return NextResponse.json(
        {
          alreadyAnalyzed: true,
          message: 'Coverage snapshot already exists. Pass force=true to re-run.'
        },
        { status: 409 }
      );
    }

    const goals = await getActiveNarrativeGoals(userId);
    const tier = normalizeTier((project.performance_level as string) || 'content_kit');
    const estimatedCost = estimateCoverageAnalysisCost({
      estimatedTranscriptLength: project.transcription_text.length,
    });
    const estimatedHold = estimateReservationAmount(estimatedCost, 'coverage_analysis');

    if (estimatedHold > 0) {
      await requireCredits(userId, estimatedHold);
    }

    const reservation = estimatedHold > 0
      ? await createReservation({
          userId,
          projectId,
          workflowType: 'coverage_analysis',
          amount: estimatedHold,
          metadata: {
            estimatedCost,
            force,
          },
          expiresAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
        })
      : null;

    let coverageAnalysis;
    try {
      coverageAnalysis = await analyzeNarrativeCoverage(
        project.transcription_text,
        {
          projectTitle: project.title,
          summary: project.ai_summary || null,
          goals,
          tier,
          projectFormat: project.project_type || 'OTHER',
          maxTopics: tier === 'transcript' ? 6 : 10,
          coverageWindow: 'full_episode',
          userId,
          projectId,
          reservationId: reservation?.id,
        }
      );
    } catch (error) {
      if (reservation?.id) {
        await failReservation(reservation.id, error instanceof Error ? error.message : 'Coverage analysis failed').catch((billingError) => {
          console.error('[RUN COVERAGE] Failed to fail reservation:', billingError);
        });
      }
      throw error;
    }

    const snapshot = await saveNarrativeCoverageSnapshot({
      projectId,
      userId,
      projectTitle: project.title,
      coverageWindow: coverageAnalysis.coverageWindow,
      topics: coverageAnalysis.topics,
      ctas: coverageAnalysis.ctas,
      opportunities: coverageAnalysis.opportunities,
      aiUsage: coverageAnalysis.aiUsage,
      notes: coverageAnalysis.notes,
      activeGoals: goals
    });

    if (coverageAnalysis.aiUsage.costUsd > 0) {
      await appendCoverageCostToProject(projectId, coverageAnalysis.aiUsage);
    }

    if (reservation?.id) {
      await settleReservation(reservation.id);
    }

    return NextResponse.json({
      success: true,
      snapshotId: snapshot?.id,
      projectId,
      cost: coverageAnalysis.aiUsage.costUsd,
      topics: coverageAnalysis.topics.length,
      ctas: coverageAnalysis.ctas.length,
      opportunities: coverageAnalysis.opportunities.length,
      fallback: coverageAnalysis.notes?.includes('Heuristic') ? true : false
    });
  } catch (error: any) {
    console.error('[RUN COVERAGE] Error:', error);
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) {
      return billingResponse;
    }
    return NextResponse.json(
      { error: error.message || 'Failed to run narrative coverage' },
      { status: 500 }
    );
  }
}
