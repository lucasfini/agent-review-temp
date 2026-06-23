import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { assertCan, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import { sendWorkspaceInvitationEmail } from '@/lib/organizations/invitation-mailer';
import {
  createWorkspaceInvitation,
  WorkspaceTeamError,
} from '@/lib/organizations/team';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function shouldExposeInviteLink() {
  return process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_INVITE_LINKS === 'true';
}

function requestedOrganizationIdFrom(request: NextRequest, body: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user, organization, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    const requestedRole = body.role || 'editor';
    assertCan(
      permissionContext,
      'invites.create',
      { organizationId: organization.id, targetRole: requestedRole },
      'You do not have permission to invite that role'
    );

    const result = await createWorkspaceInvitation({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      email: body.email,
      role: requestedRole,
      invitedBy: user.id,
    });

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'member.invited',
      resourceType: 'organization_invitation',
      resourceId: result.invitation.id,
      metadata: {
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
      },
    });

    let emailDelivery: Awaited<ReturnType<typeof sendWorkspaceInvitationEmail>>;
    const exposeInviteLink = shouldExposeInviteLink();
    if (exposeInviteLink) {
      emailDelivery = {
        delivered: false,
        reason: 'Invite link generated for local testing',
      };
    } else {
      try {
        emailDelivery = await sendWorkspaceInvitationEmail({
          invitation: result.invitation,
          workspaceName: organization.name,
          acceptUrl: result.acceptUrl,
          invitedByEmail: user.email,
        });
      } catch (emailError) {
        console.error('[ORGANIZATION_INVITATIONS] Email delivery failed:', emailError);
        emailDelivery = {
          delivered: false,
          reason: 'Invite was created, but email delivery failed',
        };
      }
    }

    return NextResponse.json({
      invitation: result.invitation,
      seats: result.seats,
      ...(exposeInviteLink ? { inviteLink: result.acceptUrl } : {}),
      emailDelivery,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError || error instanceof WorkspaceTeamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_INVITATIONS] Failed to create workspace invitation:', error);
    return NextResponse.json({ error: 'Failed to create workspace invitation' }, { status: 500 });
  }
}
