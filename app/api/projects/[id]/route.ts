import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// ============================================================
// FORCE DYNAMIC: Disable all caching for this route
// This ensures fresh data is fetched on every request
// Critical for: speaker_data updates after debate correction
// ============================================================
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/projects/[id]
 *
 * Fetches complete project data including:
 * - Transcription text
 * - Speaker data (with corrected names from debate algorithm)
 * - AI-generated content (summary, chapters, takeaways, quotes)
 * - Processing metadata
 *
 * This route is force-dynamic to ensure no caching occurs,
 * which is critical after processing completes and speaker
 * names are corrected by the debate algorithm.
 */
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

    console.log(`[API] GET /api/projects/${projectId} - Fetching fresh data (no cache)`);

    // Fetch complete project data
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select(`
        *,
        transcription_segments,
        speaker_data,
        performance_level,
        project_type,
        ai_summary,
        chapters,
        key_takeaways,
        social_quotes
      `)
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('[API] Database error:', error);
      return NextResponse.json(
        { error: 'Project not found', details: error.message },
        { status: 404 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Log speaker data state for debugging
    const projectAny = project as any;
    if (projectAny.speaker_data?.speakers) {
      const speakerNames = Object.values(projectAny.speaker_data.speakers)
        .map((s: any) => s.finalName || s.fallbackName || 'unnamed')
        .filter(Boolean);
      console.log(`[API] Project ${projectId} speakers:`, speakerNames);
    }

    // Return with no-cache headers
    return NextResponse.json(project, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Data-Freshness': 'live',
        'X-Fetched-At': new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[API] Exception fetching project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 *
 * Updates project data (partial update)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams.id;
    const body = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    console.log(`[API] PATCH /api/projects/${projectId}`, Object.keys(body));

    // Update project
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase type inference issue with dynamic body
      .update(body)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('[API] Update error:', error);
      return NextResponse.json(
        { error: 'Failed to update project', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(project, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[API] Exception updating project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 *
 * Deletes a project and all associated data
 */
export async function DELETE(
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

    console.log(`[API] DELETE /api/projects/${projectId}`);

    // Demo account guard
    const { data: projectForDelete } = await supabaseAdmin
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .single() as { data: { user_id: string } | null };
    if (projectForDelete?.user_id) {
      const { data: { user: projectUser } } = await supabaseAdmin.auth.admin.getUserById(projectForDelete.user_id);
      if (projectUser?.email === process.env.DEMO_EMAIL) {
        return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
      }
    }

    // Delete project (cascade will handle related records)
    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('[API] Delete error:', error);
      return NextResponse.json(
        { error: 'Failed to delete project', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Exception deleting project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
