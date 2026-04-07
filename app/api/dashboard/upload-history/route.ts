import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '10')));
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('projects')
      .select('id, title, audio_file_name, audio_file_size, audio_duration, audio_expires_at, audio_deleted_at, status, created_at, processing_completed_at', { count: 'exact' })
      .eq('user_id', user.id)
      .in('status', ['completed', 'failed'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1) as { data: any[] | null; error: any; count?: number | null };

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to load upload history' }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      items: (data || []).filter((item) => item.status === 'completed' || item.status === 'failed'),
      total,
      totalPages,
      page,
      limit,
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

    console.error('[API] Dashboard upload history exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
