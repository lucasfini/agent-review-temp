/**
 * Admin API Root
 * GET /api/admin - List available admin endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
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

    // Return list of available admin endpoints
    return NextResponse.json({
      message: 'Admin API',
      version: '1.0.0',
      endpoints: {
        billing: {
          addCredits: {
            method: 'POST',
            path: '/api/admin/billing/add-credits',
            description: 'Add credits to a user account',
            body: {
              userId: 'string (required)',
              amount: 'number (required)',
              reason: 'string (required)',
              transactionType: 'bonus | refund | admin_adjustment (optional)',
            },
          },
          analytics: {
            method: 'GET',
            path: '/api/admin/billing/analytics',
            description: 'Get revenue analytics and health metrics',
            params: {
              startDate: 'ISO date string (optional)',
              endDate: 'ISO date string (optional)',
            },
          },
          userSummary: {
            method: 'GET',
            path: '/api/admin/billing/user-summary',
            description: 'Get detailed billing info for a specific user',
            params: {
              userId: 'string (required)',
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
