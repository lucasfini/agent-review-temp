import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { assertCan, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  cancelWorkspaceInvitation,
  getWorkspaceSeatSummary,
  WorkspaceTeamError,
} from '@/lib/organizations/team';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organization, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    assertCan(permissionContext, 'invites.cancel', { organizationId: organization.id }, 'You do not have permission to cancel invites');

    const invitation = await cancelWorkspaceInvitation(supabaseAdmin, organization.id, id);
    const seats = await getWorkspaceSeatSummary(supabaseAdmin, organization.id);

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: permissionContext.userId,
      action: 'invite.canceled',
      resourceType: 'organization_invitation',
      resourceId: invitation.id,
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    return NextResponse.json({ invitation, seats });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError || error instanceof WorkspaceTeamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_INVITATIONS_CANCEL] Failed to cancel workspace invitation:', error);
    return NextResponse.json({ error: 'Failed to cancel workspace invitation' }, { status: 500 });
  }
}
