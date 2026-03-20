import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';

// ============================================================
// FORCE DYNAMIC: Disable all caching for this route
// This ensures fresh data is fetched on every request
// ============================================================
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
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

    const user = await requireAuthenticatedUser(request);

    const fullSelect = 'id, user_id, status, processing_stage, processing_progress, processing_message, stage_started_at, performance_level, transcription_text, processing_time_seconds, created_at, updated_at';
    const legacySelect = 'id, user_id, status, performance_level, transcription_text, processing_time_seconds, created_at, updated_at';

    let { data: project, error } = await supabaseAdmin
      .from('projects')
      .select(fullSelect)
      .eq('id', projectId)
      .single() as { data: any; error: any };

    if (error?.message?.includes('Could not find')) {
      const retry = await supabaseAdmin
        .from('projects')
        .select(legacySelect)
        .eq('id', projectId)
        .single() as { data: any; error: any };
      project = retry.data
        ? {
            ...retry.data,
            processing_stage: null,
            processing_progress: null,
            processing_message: null,
            stage_started_at: null,
          }
        : null;
      error = retry.error;
    }

    if (error || !project) {
      throw new RouteAccessError(404, 'Project not found');
    }

    if (project.user_id !== user.id) {
      throw new RouteAccessError(403, 'Forbidden');
    }

    // Get generated outputs count if completed
    let outputsCount = 0;
    if (project.status === 'completed') {
      const { count } = await supabaseAdmin
        .from('outputs')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);
      
      outputsCount = count || 0;
    }

    return NextResponse.json({
      status: project.status,
      progress: getProgressFromStatus(project.status),
      // New detailed progress fields
      processing_stage: project.processing_stage || 'pending',
      processing_progress: project.processing_progress || 0,
      processing_message: project.processing_message,
      stage_started_at: project.stage_started_at,
      performance_level: project.performance_level || 'content_kit',
      // Existing fields
      transcription_text: project.transcription_text,
      processing_time: project.processing_time_seconds,
      outputs_generated: outputsCount,
      created_at: project.created_at,
      updated_at: project.updated_at
    });

  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getProgressFromStatus(status: string): number {
  switch (status) {
    case 'uploading':
      return 20;
    case 'processing':
      return 60;
    case 'completed':
      return 100;
    case 'failed':
      return 0;
    case 'cancelled':
      return 0;
    default:
      return 0;
  }
}
