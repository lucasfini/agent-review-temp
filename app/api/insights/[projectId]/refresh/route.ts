/**
 * Insights Refresh API - POST endpoint
 * Purpose: Regenerate insights for a project (Premium only)
 * Use case: User wants to refresh insights after editing transcript or getting better results
 */

import { NextRequest, NextResponse } from 'next/server';
import { processInsightsForProject } from '@/lib/insight-extraction';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import { estimateAnalysisJobCost } from '@/lib/billing/cost-map';
import { billingErrorResponse, requireCredits } from '@/lib/billing/middleware';
import { createReservation, failReservation, settleReservation } from '@/lib/billing/credit';

interface RouteContext {
  params: Promise<{
    projectId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const { user, project } = await requireProjectOwner<{ performance_level: string | null; transcription_text: string | null }>(
      request,
      projectId,
      'performance_level, transcription_text'
    );

    if (user.email === process.env.DEMO_EMAIL) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!project.transcription_text) {
      return NextResponse.json({ error: 'Project transcription not available' }, { status: 400 });
    }

    const estimatedCost = estimateAnalysisJobCost({
      targetKey: 'insights',
      estimatedTranscriptLength: project.transcription_text.length,
    });
    const estimatedHold = Number((estimatedCost * 1.15).toFixed(4));
    if (estimatedHold > 0) {
      await requireCredits(user.id, estimatedHold);
    }

    const reservation = estimatedHold > 0
      ? await createReservation({
          userId: user.id,
          projectId,
          workflowType: 'analysis_job',
          amount: estimatedHold,
          metadata: {
            targetKey: 'insights',
            source: 'insights_refresh',
            estimatedCost,
          },
          expiresAt: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
        })
      : null;

    console.log(`[Insights Refresh] Starting for project ${projectId}`);

    // Process insights (this will delete existing and create new ones)
    const result = await processInsightsForProject(projectId, user.id, reservation?.id);

    if (!result.success) {
      if (reservation?.id) {
        await failReservation(reservation.id, result.error || 'Failed to process insights').catch((billingError) => {
          console.error('[Insights Refresh] Failed to fail reservation:', billingError);
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to process insights',
        },
        { status: 500 }
      );
    }

    if (reservation?.id) {
      await settleReservation(reservation.id);
    }

    return NextResponse.json({
      success: true,
      insight_count: result.insightCount,
      cost_usd: result.totalCost,
      message: `Successfully generated ${result.insightCount} insights`,
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Insights Refresh] Unexpected error:', error);
    const billingResponse = billingErrorResponse(error);
    if (billingResponse.status === 402) {
      return billingResponse;
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
