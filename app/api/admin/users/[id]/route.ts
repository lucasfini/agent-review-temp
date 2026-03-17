import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';

type AdminUserAction = 'ban' | 'unban' | 'block';

const BAN_DURATIONS: Record<string, string> = {
  '24h': '24h',
  '7d': '168h',
  // effectively permanent (~100 years)
  permanent: '876000h',
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const action = body?.action as AdminUserAction | undefined;
    const duration = body?.duration as string | undefined;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    if (action === 'unban') {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: 'none' } as any
      );
      if (error) throw error;
      return NextResponse.json({
        success: true,
        userId: targetUserId,
        action,
        bannedUntil: (data.user as any)?.banned_until || null,
        message: 'User unbanned',
      });
    }

    const selectedDuration =
      action === 'block'
        ? BAN_DURATIONS.permanent
        : duration && BAN_DURATIONS[duration]
          ? BAN_DURATIONS[duration]
          : null;

    if (!selectedDuration) {
      return NextResponse.json({ error: 'Invalid ban duration' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { ban_duration: selectedDuration } as any
    );
    if (error) throw error;

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      action,
      bannedUntil: (data.user as any)?.banned_until || null,
      message: action === 'block' ? 'User blocked' : 'User banned',
    });
  } catch (error: any) {
    console.error('[ADMIN USER ACTION] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update user status' },
      { status: 500 }
    );
  }
}
