import { NextRequest, NextResponse } from 'next/server';
import { requireProjectOwner, RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    await requireProjectOwner(request, projectId);

    const { data, error } = await supabaseAdmin
      .from('outputs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to load outputs' }, { status: 500 });
    }

    return NextResponse.json({
      outputs: data || [],
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API] Project outputs exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
