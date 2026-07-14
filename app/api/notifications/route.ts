import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { listOrganizationNotifications, markAllOrganizationNotificationsRead } from '@/lib/notifications/organization-notifications';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const includeRead = searchParams.get('include_read') === 'true' || searchParams.get('all') === 'true';
    const limit = Number(searchParams.get('limit') || 12);
    const before = searchParams.get('before');
    const { organization } = await getActiveOrganizationForUser(supabaseAdmin, user.id, requestedOrganizationId);
    const result = await listOrganizationNotifications(organization.id, {
      before,
      includeRead,
      limit,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[NOTIFICATIONS] Failed to load notifications:', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = typeof body?.organization_id === 'string'
      ? body.organization_id
      : null;
    const { organization } = await getActiveOrganizationForUser(supabaseAdmin, user.id, requestedOrganizationId);
    await markAllOrganizationNotificationsRead(organization.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[NOTIFICATIONS] Failed to mark notifications read:', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
