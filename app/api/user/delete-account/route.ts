import { NextRequest, NextResponse } from 'next/server';
import { deleteUserAccountData } from '@/lib/account-lifecycle';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isDemoUser } from '@/lib/demo-mode';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || '';

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isDemoUser(user) || user.email === 'admin@audiorepurpose.com') {
      return NextResponse.json({ error: 'System accounts cannot be deleted' }, { status: 403 });
    }

    const result = await deleteUserAccountData(user);

    return NextResponse.json({
      success: true,
      message: 'Account and associated data deleted successfully',
      result,
    });
  } catch (error: any) {
    console.error('Account deletion final error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fully delete account' }, { status: 500 });
  }
}
