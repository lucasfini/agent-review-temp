import { NextRequest, NextResponse } from 'next/server';
import { requireProjectOwner, RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isMissingFailureNotifiedAtColumn(error: any): boolean {
  return error?.code === 'PGRST204'
    && typeof error?.message === 'string'
    && error.message.includes('failure_notified_at');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    await requireProjectOwner(request, projectId);

    const body = await request.json().catch(() => null);
    const requestedIds = Array.isArray(body?.jobIds)
      ? body.jobIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    let query = (supabaseAdmin as any)
      .from('project_generation_jobs')
      .update({
        failure_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('project_id', projectId)
      .eq('status', 'failed')
      .is('failure_notified_at', null);

    if (requestedIds.length > 0) {
      query = query.in('id', requestedIds);
    }

    const { data, error } = await query
      .select('id');

    if (error && isMissingFailureNotifiedAtColumn(error)) {
      return NextResponse.json({
        acknowledgedJobIds: requestedIds,
        persistenceDisabled: true,
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        },
      });
    }

    if (error) {
      console.error('[API] Failed to acknowledge generation job failures:', error);
      return NextResponse.json({ error: error.message || 'Failed to acknowledge generation job failures' }, { status: 500 });
    }

    return NextResponse.json({
      acknowledgedJobIds: (data || []).map((row: { id: string }) => row.id),
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API] Generation job acknowledgment exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
