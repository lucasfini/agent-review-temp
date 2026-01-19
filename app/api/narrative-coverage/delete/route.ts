import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

interface DeletePayload {
  userId: string;
  snapshotIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as DeletePayload;
    const { userId, snapshotIds } = payload;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

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
      .eq('user_id', userId) as { data: Array<{ id: string; user_id: string; ai_cost_usd: number }> | null; error: any };

    if (fetchError || !snapshots || snapshots.length === 0) {
      return NextResponse.json(
        { error: 'No snapshots found or permission denied' },
        { status: 404 }
      );
    }

    // Security: verify all belong to user
    const unauthorized = snapshots.filter(s => s.user_id !== userId);
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

    // Delete (RLS enforces user_id check)
    const { error: deleteError } = await supabaseAdmin
      .from('narrative_coverage_snapshots')
      .delete()
      .in('id', snapshotIds)
      .eq('user_id', userId);

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
