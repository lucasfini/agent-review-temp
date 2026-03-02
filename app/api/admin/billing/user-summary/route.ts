/**
 * Admin User Billing Summary API
 * GET /api/admin/billing/user-summary?userId=xxx - Get detailed billing info for a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getUserBillingSummary, auditUserBalance } from '@/lib/billing/admin';
import { isAdminEmail } from '@/lib/admin-access';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = isAdminEmail(user.email);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Get userId from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Get user billing summary
    const summary = await getUserBillingSummary(userId);

    // Run audit to check for discrepancies
    const audit = await auditUserBalance(userId);

    return NextResponse.json({
      success: true,
      userId,
      summary,
      audit: {
        isCorrect: audit.isCorrect,
        discrepancy: audit.discrepancy,
        details: audit.details,
      },
    });
  } catch (error) {
    console.error('[ADMIN BILLING API] Error fetching user summary:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch user summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
