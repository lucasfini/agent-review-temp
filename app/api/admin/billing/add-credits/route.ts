/**
 * Admin Add Credits API
 * POST /api/admin/billing/add-credits - Add credits to a user's account
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { adminAddCredits } from '@/lib/billing/admin';
import { isAdminEmail } from '@/lib/admin-access';

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const { userId, amount, reason, transactionType } = body;

    if (!userId || !amount || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, amount, reason' },
        { status: 400 }
      );
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    // Add credits
    const result = await adminAddCredits({
      userId,
      amount,
      reason,
      adminUserId: user.id,
      transactionType: transactionType || 'admin_adjustment',
    });

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      transactionId: result.transactionId,
      message: `Successfully added $${amount.toFixed(2)} to user ${userId}`,
    });
  } catch (error) {
    console.error('[ADMIN BILLING API] Error adding credits:', error);
    return NextResponse.json(
      {
        error: 'Failed to add credits',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
