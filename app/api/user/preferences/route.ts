import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, first_name, last_name, full_name, email, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const fullName = typeof profile?.full_name === 'string' && profile.full_name
      ? profile.full_name
      : typeof meta.full_name === 'string'
        ? meta.full_name
        : '';
    const firstName = typeof profile?.first_name === 'string' && profile.first_name
      ? profile.first_name
      : typeof meta.first_name === 'string'
        ? meta.first_name
        : fullName.split(' ')[0] || '';
    const lastName = typeof profile?.last_name === 'string' && profile.last_name
      ? profile.last_name
      : typeof meta.last_name === 'string'
        ? meta.last_name
        : fullName.split(' ').slice(1).join(' ');

    return NextResponse.json({
      username: (profile as any)?.username || (typeof meta.username === 'string' ? meta.username : ''),
      firstName,
      lastName,
      avatarUrl:
        typeof profile?.avatar_url === 'string' && profile.avatar_url
          ? profile.avatar_url
          : typeof meta.avatar_url === 'string'
            ? meta.avatar_url
            : typeof meta.picture === 'string'
              ? meta.picture
              : '',
      email: user.email || profile?.email || '',
    });
  } catch (error) {
    console.error('[PREFERENCES API] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    if (username) {
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('username', username)
        .neq('id', user.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email || '',
        username: username || null,
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName || null,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      return NextResponse.json({ error: profileError.message || 'Failed to save preferences' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PREFERENCES API] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
