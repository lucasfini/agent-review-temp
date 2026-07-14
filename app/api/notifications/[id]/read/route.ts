import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { markOrganizationNotificationRead } from '@/lib/notifications/organization-notifications';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = typeof body?.organization_id === 'string'
      ? body.organization_id
      : new URL(request.url).searchParams.get('organization_id');
    const { organization } = await getActiveOrganizationForUser(supabaseAdmin, user.id, requestedOrganizationId);
    await markOrganizationNotificationRead(organization.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[NOTIFICATIONS] Failed to mark notification read:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
