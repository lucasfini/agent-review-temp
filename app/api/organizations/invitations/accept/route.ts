import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { setActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import { acceptWorkspaceInvitation, WorkspaceTeamError } from '@/lib/organizations/team';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const user = await requireAuthenticatedUser(request);
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    const result = await acceptWorkspaceInvitation({
      supabase: supabaseAdmin,
      token: body.token,
      userId: user.id,
      userEmail: user.email,
    });
    const activeContext = await setActiveOrganizationForUser(
      supabaseAdmin,
      user.id,
      result.invitation.organizationId
    );

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: result.invitation.organizationId,
      actorUserId: user.id,
      action: 'invite.accepted',
      resourceType: 'organization_invitation',
      resourceId: result.invitation.id,
      metadata: {
        email: result.invitation.email,
        role: result.invitation.role,
        membershipId: result.membership.id,
      },
    });

    return NextResponse.json({
      invitation: result.invitation,
      organization: {
        id: activeContext.organization.id,
        name: activeContext.organization.name,
        type: activeContext.organization.type,
      },
      membership: {
        id: result.membership.id,
        organizationId: result.membership.organization_id,
        role: result.membership.role,
        status: result.membership.status,
        joinedAt: result.membership.joined_at,
      },
    });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof WorkspaceTeamError || error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_INVITATIONS_ACCEPT] Failed to accept workspace invitation:', error);
    return NextResponse.json({ error: 'Failed to accept workspace invitation' }, { status: 500 });
  }
}
