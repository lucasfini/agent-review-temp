/**
 * User Credit Balance API
 * GET /api/billing/balance - Get current user's credit balance
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getDisplayBalance } from '@/lib/billing/credit';
import { formatSiteCreditsFromUsd } from '@/lib/billing/display';

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

    // Get user's credit balance
    const balance = await getDisplayBalance(user.id);

    return NextResponse.json({
      success: true,
      balance: balance.visibleBalance,
      availableBalance: balance.availableBalance,
      reservedPending: balance.reservedPending,
      formatted: formatSiteCreditsFromUsd(balance.visibleBalance),
      lifetimeCreditsAdded: balance.lifetimeCreditsAdded,
      lifetimeCreditsSpent: balance.lifetimeCreditsSpent,
      lastUpdated: balance.updatedAt,
    });
  } catch (error) {
    console.error('[BILLING API] Error fetching balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}
