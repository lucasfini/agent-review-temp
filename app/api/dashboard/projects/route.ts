import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROJECT_LIST_SELECT = 'id, title, status, created_at, audio_duration, audio_file_size, audio_file_name, audio_expires_at, audio_deleted_at, processing_time_seconds, selected_content_types, estimated_cost, audio_duration_seconds, performance_level, metadata, project_type, processing_stage, actual_processing_cost';
const OUTPUT_LIST_SELECT = 'id, project_id, type, platform, status, created_at';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const includeOutputs = searchParams.get('includeOutputs') === '1';
    const rawLimit = Number(searchParams.get('limit') || '100');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 100;

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('projects')
      .select(PROJECT_LIST_SELECT)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (projectsError) {
      console.error('[API] Dashboard projects query failed:', projectsError);
      return NextResponse.json(
        { error: 'Failed to load projects', details: projectsError.message },
        { status: 500 }
      );
    }

    let outputs: any[] = [];
    if (includeOutputs && projects && projects.length > 0) {
      const projectIds = projects.map((project: any) => project.id);
      const { data: outputsData, error: outputsError } = await supabaseAdmin
        .from('outputs')
        .select(OUTPUT_LIST_SELECT)
        .in('project_id', projectIds);

      if (outputsError) {
        console.error('[API] Dashboard outputs query failed:', outputsError);
        return NextResponse.json(
          { error: 'Failed to load outputs', details: outputsError.message },
          { status: 500 }
        );
      }

      outputs = outputsData || [];
    }

    return NextResponse.json(
      {
        projects: projects || [],
        outputs,
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

    console.error('[API] Dashboard projects exception:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
