import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (projectsError) {
      console.error('[API] Dashboard analytics projects query failed:', projectsError);
      return NextResponse.json(
        { error: 'Failed to load analytics projects', details: projectsError.message },
        { status: 500 }
      );
    }

    const projectIds = (projects || []).map((project: any) => project.id);

    let outputs: any[] = [];
    if (projectIds.length > 0) {
      const { data: outputsData, error: outputsError } = await supabaseAdmin
        .from('outputs')
        .select('*')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(200);

      if (outputsError) {
        console.error('[API] Dashboard analytics outputs query failed:', outputsError);
        return NextResponse.json(
          { error: 'Failed to load analytics outputs', details: outputsError.message },
          { status: 500 }
        );
      }

      outputs = outputsData || [];
    }

    const { data: coverageSnapshots, error: coverageError } = await supabaseAdmin
      .from('narrative_coverage_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (coverageError) {
      console.error('[API] Dashboard analytics coverage query failed:', coverageError);
      return NextResponse.json(
        { error: 'Failed to load analytics coverage', details: coverageError.message },
        { status: 500 }
      );
    }

    const { data: coverageGoals, error: goalsError } = await supabaseAdmin
      .from('narrative_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (goalsError) {
      console.error('[API] Dashboard analytics goals query failed:', goalsError);
      return NextResponse.json(
        { error: 'Failed to load analytics goals', details: goalsError.message },
        { status: 500 }
      );
    }

    let insights: any[] = [];
    if (projectIds.length > 0) {
      const { data: insightsData, error: insightsError } = await supabaseAdmin
        .from('insights')
        .select('id, project_id, entity_id, label, category, confidence, cost_usd, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false });

      if (insightsError) {
        console.error('[API] Dashboard analytics insights query failed:', insightsError);
        return NextResponse.json(
          { error: 'Failed to load analytics insights', details: insightsError.message },
          { status: 500 }
        );
      }

      insights = insightsData || [];
    }

    return NextResponse.json(
      {
        projects: projects || [],
        outputs,
        coverageSnapshots: coverageSnapshots || [],
        coverageGoals: coverageGoals || [],
        insights,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API] Dashboard analytics exception:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
