/**
 * Insights Refresh API - POST endpoint
 * Purpose: Regenerate insights for a project (Premium only)
 * Use case: User wants to refresh insights after editing transcript or getting better results
 */

import { NextRequest, NextResponse } from 'next/server';
import { processInsightsForProject } from '@/lib/insight-extraction';

interface RouteContext {
  params: {
    projectId: string;
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // TODO: Add authentication check here
    // Verify user has Premium tier access
    // Example:
    // const session = await getServerSession();
    // if (!session || session.user.tier !== 'premium') {
    //   return NextResponse.json({ error: 'Premium tier required' }, { status: 403 });
    // }

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
