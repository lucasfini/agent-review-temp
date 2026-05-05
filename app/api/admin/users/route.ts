import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';
import { getAppBaseUrl } from '@/lib/app-url';
import { isValidEmail } from '@/lib/auth/validation';

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
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('perPage') || '30');
    const search = searchParams.get('search')?.trim().toLowerCase();

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    let users = data?.users || [];
    if (search) {
      users = users.filter((u) => (u.email || '').toLowerCase().includes(search));
    }
    const userIds = users.map((u) => u.id);

    const { data: credits } = await supabaseAdmin
      .from('account_credits')
      .select('user_id, balance, lifetime_credits_added, lifetime_credits_spent, updated_at')
      .in('user_id', userIds);

    const creditsByUser: Record<string, any> = {};
    for (const row of credits || []) {
      creditsByUser[row.user_id] = row;
    }

    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      bannedUntil: (u as any).banned_until || null,
      credits: creditsByUser[u.id] || null,
    }));

    return NextResponse.json({
      success: true,
      users: result,
      total: data?.total || result.length,
      page,
      perPage,
    });
  } catch (error) {
    console.error('[ADMIN USERS] Error:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid invite email address' }, { status: 400 });
    }

    const redirectTo = new URL('/auth/update-password', getAppBaseUrl()).toString();
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        invited_by: user.email || null,
      },
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        createdAt: data.user.created_at,
      } : null,
      message: `Invite sent to ${email}`,
    });
  } catch (error: any) {
    console.error('[ADMIN USERS INVITE] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send invite' },
      { status: 500 }
    );
  }
}
