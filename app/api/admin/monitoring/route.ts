import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';

function parseRangeToIso(range: string | null): string | null {
  if (!range || range === 'all') return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const map: Record<string, number> = {
    '7d': 7 * day,
    '30d': 30 * day,
    '6m': 180 * day,
  };
  const offset = map[range];
  if (!offset) return null;
  return new Date(now - offset).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range');
    const search = searchParams.get('search')?.trim();
    const recentLimit = parseInt(searchParams.get('recentLimit') || '30');
    const recentOffset = parseInt(searchParams.get('recentOffset') || '0');
    const failedLimit = parseInt(searchParams.get('failedLimit') || '30');
    const failedOffset = parseInt(searchParams.get('failedOffset') || '0');

    const sinceIso = parseRangeToIso(range);

    let recentQuery = supabaseAdmin
      .from('projects')
      .select('id, title, status, processing_stage, processing_progress, processing_message, updated_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(recentOffset, recentOffset + recentLimit - 1);
    if (sinceIso) recentQuery = recentQuery.gte('created_at', sinceIso);
    if (search) recentQuery = recentQuery.ilike('title', `%${search}%`);

    let failedQuery = supabaseAdmin
      .from('projects')
      .select('id, title, status, processing_stage, processing_message, updated_at', { count: 'exact' })
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .range(failedOffset, failedOffset + failedLimit - 1);
    if (sinceIso) failedQuery = failedQuery.gte('updated_at', sinceIso);
    if (search) failedQuery = failedQuery.ilike('title', `%${search}%`);

    const [{ data: recentProjects, count: recentTotal }, { data: failedProjects, count: failedTotal }] =
      await Promise.all([recentQuery, failedQuery]);

    return NextResponse.json({
      success: true,
      recentProjects: recentProjects || [],
      failedProjects: failedProjects || [],
      recentTotal: recentTotal || 0,
      failedTotal: failedTotal || 0,
    });
  } catch (error) {
    console.error('[ADMIN MONITORING] Error:', error);
    return NextResponse.json({ error: 'Failed to load monitoring data' }, { status: 500 });
  }
}
