import { NextRequest, NextResponse } from 'next/server';
import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

interface DeletePayload {
  // Deprecated: ignored for security; server-side auth user is always used.
  userId?: string;
  snapshotIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    let authenticatedUserId: string;
    try {
      const user = await requireAuthenticatedUser(request);
      authenticatedUserId = user.id;
    } catch (authError) {
      if (authError instanceof RouteAccessError) {
        return NextResponse.json({ error: authError.message }, { status: authError.status });
      }
      throw authError;
    }

    const payload = (await request.json()) as DeletePayload;
    const snapshotIds = payload.snapshotIds;

    if (!snapshotIds || !Array.isArray(snapshotIds) || snapshotIds.length === 0) {
      return NextResponse.json(
        { error: 'snapshotIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Fetch snapshots to verify ownership
    const { data: snapshots, error: fetchError } = await supabaseAdmin
      .from('narrative_coverage_snapshots')
      .select('id, user_id, ai_cost_usd')
      .in('id', snapshotIds)
      .eq('user_id', authenticatedUserId) as { data: Array<{ id: string; user_id: string; ai_cost_usd: number }> | null; error: any };

    if (fetchError || !snapshots || snapshots.length === 0) {
      return NextResponse.json(
        { error: 'No snapshots found or permission denied' },
        { status: 404 }
      );
    }

    // Security: verify all belong to user
    const unauthorized = snapshots.filter(s => s.user_id !== authenticatedUserId);
    if (unauthorized.length > 0) {
      return NextResponse.json(
        { error: 'Permission denied for some snapshots' },
        { status: 403 }
      );
    }

    const totalCostDeleted = snapshots.reduce(
      (sum, s) => sum + Number(s.ai_cost_usd || 0),
      0
    );

    // Delete with explicit server-side user scoping.
    const { error: deleteError } = await supabaseAdmin
      .from('narrative_coverage_snapshots')
      .delete()
      .in('id', snapshotIds)
      .eq('user_id', authenticatedUserId);

    if (deleteError) {
      console.error('[DELETE SNAPSHOTS] Error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    // NOTE: Do NOT reverse cost - AI work was performed, cost is historical
    return NextResponse.json({
      success: true,
      deletedCount: snapshots.length,
      totalCostDeleted: Number(totalCostDeleted.toFixed(4))
    });
  } catch (error: any) {
    console.error('[DELETE SNAPSHOTS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
