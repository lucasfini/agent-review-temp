import { NextRequest, NextResponse } from 'next/server';

import { isDemoUser } from '@/lib/demo-mode';
import { ensureStarterProjectForUser } from '@/lib/starter-project';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function getAuthedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ success: true, skipped: true, reason: 'read_only_account' });
    }

    const result = await ensureStarterProjectForUser(user);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[STARTER PROJECT API] POST failed:', error);
    return NextResponse.json({ error: 'Failed to prepare starter project' }, { status: 500 });
  }
}
