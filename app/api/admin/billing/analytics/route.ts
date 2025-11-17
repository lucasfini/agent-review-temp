/**
 * Admin Billing Analytics API
 * GET /api/admin/billing/analytics - Get billing analytics and revenue reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getRevenueReport, getBillingHealthMetrics } from '@/lib/billing/admin';

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

    // TODO: Add proper admin check
    const isAdmin = true; // REPLACE WITH ACTUAL ADMIN CHECK

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    // Get revenue report
    const revenueReport = await getRevenueReport({
      startDate,
      endDate,
    });

    // Get health metrics
    const healthMetrics = await getBillingHealthMetrics();

    return NextResponse.json({
      success: true,
      revenue: revenueReport,
      health: healthMetrics,
    });
  } catch (error) {
    console.error('[ADMIN BILLING API] Error fetching analytics:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
