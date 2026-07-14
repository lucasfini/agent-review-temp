import { NextRequest, NextResponse } from 'next/server';

import { displayOrganizationName } from '@/lib/authz/organization-context';
import { RouteAccessError } from '@/lib/api/route-auth';
import { assertCan, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import { sendWorkspaceInvitationEmail } from '@/lib/organizations/invitation-mailer';
import {
  resendWorkspaceInvitation,
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const { user, organization, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });
    if (organization.type !== 'saas_customer') {
      return NextResponse.json(
        { error: 'Team workspace settings are only available for team workspaces' },
        { status: 400 }
      );
    }

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    assertCan(permissionContext, 'invites.resend', { organizationId: organization.id }, 'You do not have permission to resend invites');

    const result = await resendWorkspaceInvitation({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      invitationId: id,
    });

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'invite.resent',
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
          workspaceName: displayOrganizationName(organization),
          acceptUrl: result.acceptUrl,
          invitedByEmail: user.email,
        });
      } catch (emailError) {
        console.error('[ORGANIZATION_INVITATIONS_RESEND] Email delivery failed:', emailError);
        emailDelivery = {
          delivered: false,
          reason: 'Invite was resent, but email delivery failed',
        };
      }
    }

    return NextResponse.json({
      invitation: result.invitation,
      seats: result.seats,
      ...(exposeInviteLink ? { inviteLink: result.acceptUrl } : {}),
      emailDelivery,
    });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError || error instanceof WorkspaceTeamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_INVITATIONS_RESEND] Failed to resend workspace invitation:', error);
    return NextResponse.json({ error: 'Failed to resend workspace invitation' }, { status: 500 });
  }
}
