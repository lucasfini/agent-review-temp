import { NextRequest, NextResponse } from 'next/server';
import { getRecentConversationLogs, generateQualityReport } from '@/lib/conversation-logger';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-access';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { data: { user } } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'recent';
    const limit = parseInt(searchParams.get('limit') || '10');

    switch (type) {
      case 'recent':
        const logs = await getRecentConversationLogs(limit);
        return NextResponse.json({
          success: true,
          logs,
          count: logs.length
        });

      case 'report':
        const report = await generateQualityReport();
        return NextResponse.json({
          success: true,
          report
        });

      default:
        return NextResponse.json(
          { error: 'Invalid type. Use "recent" or "report"' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Failed to get conversation logs:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve logs' },
      { status: 500 }
    );
  }
}