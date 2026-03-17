/**
 * Insights Refresh API - POST endpoint
 * Purpose: Regenerate insights for a project (Premium only)
 * Use case: User wants to refresh insights after editing transcript or getting better results
 */

import { NextRequest, NextResponse } from 'next/server';
import { processInsightsForProject } from '@/lib/insight-extraction';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

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

    const { user, project } = await requireProjectOwner<{ performance_level: string | null }>(
      request,
      projectId,
      'performance_level'
    );

    if (user.email === process.env.DEMO_EMAIL) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const projectLevel = project.performance_level || 'standard';
    if (projectLevel !== 'pro' && projectLevel !== 'premium') {
      return NextResponse.json({ error: 'Pro tier required' }, { status: 403 });
    }

    console.log(`[Insights Refresh] Starting for project ${projectId}`);

    // Process insights (this will delete existing and create new ones)
    const result = await processInsightsForProject(projectId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to process insights',
        },
        { status: 500 }
      );
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
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
