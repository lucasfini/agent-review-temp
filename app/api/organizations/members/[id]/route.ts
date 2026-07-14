import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  getWorkspaceMember,
  getWorkspaceSeatSummary,
  updateWorkspaceMember,
  WorkspaceTeamError,
} from '@/lib/organizations/team';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  notifyMemberRemoved,
  notifyOrganization,
  notifyRoleUpdated,
} from '@/lib/notifications/notification-events';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestedOrganizationIdFrom(request: NextRequest, body: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const { user, organization, membership, permissionContext } = await requirePermissionContext(request, {
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

    const remove = body.action === 'remove' || body.status === 'removed' || body.remove === true;
    const previousMember = await getWorkspaceMember(supabaseAdmin, organization.id, id).catch((error) => {
      console.error('[ORGANIZATION_MEMBERS_UPDATE] Failed to load previous member state:', error);
      return null;
    });
    const member = await updateWorkspaceMember({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      memberId: id,
      actorUserId: user.id,
      actorRole: membership.role,
      role: body.role,
      remove,
    });
    const seats = await getWorkspaceSeatSummary(supabaseAdmin, organization.id);

    if (remove) {
      await recordOrganizationAuditLog({
        supabase: supabaseAdmin,
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'member.removed',
        resourceType: 'organization_member',
        resourceId: member.id,
        metadata: {
          email: member.email,
          previousRole: previousMember?.role || null,
          nextRole: member.role,
        },
      });
      await notifyMemberRemoved({
        organizationId: organization.id,
        actorUserId: user.id,
        email: member.email,
        idempotencyKey: `team_member_removed:${member.id}`,
        metadata: {
          memberId: member.id,
          previousRole: previousMember?.role || null,
          nextRole: member.role,
        },
      });
    } else if (body.role === 'owner') {
      await recordOrganizationAuditLog({
        supabase: supabaseAdmin,
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'ownership.transferred',
        resourceType: 'organization_member',
        resourceId: member.id,
        metadata: {
          previousRole: previousMember?.role || null,
          nextRole: member.role,
          email: member.email,
        },
      });
      await notifyOrganization({
        organizationId: organization.id,
        actorUserId: user.id,
        type: 'ownership_transferred',
        title: 'Owner updated',
        body: `${member.email || 'A teammate'} is now the workspace owner.`,
        href: '/dashboard/team',
        idempotencyKey: `ownership_transferred:${member.id}:${Date.now()}`,
        metadata: {
          memberId: member.id,
          previousRole: previousMember?.role || null,
          nextRole: member.role,
          email: member.email,
        },
      });
    } else if (previousMember && previousMember.role !== member.role) {
      await recordOrganizationAuditLog({
        supabase: supabaseAdmin,
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'member.role_changed',
        resourceType: 'organization_member',
        resourceId: member.id,
        metadata: {
          previousRole: previousMember.role,
          nextRole: member.role,
          email: member.email,
        },
      });
      await notifyRoleUpdated({
        organizationId: organization.id,
        actorUserId: user.id,
        email: member.email,
        role: member.role,
        idempotencyKey: `team_member_role_changed:${member.id}:${member.role}`,
        metadata: {
          memberId: member.id,
          previousRole: previousMember.role,
          nextRole: member.role,
        },
      });
    }

    return NextResponse.json({ member, seats });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError || error instanceof WorkspaceTeamError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_MEMBERS_UPDATE] Failed to update workspace member:', error);
    return NextResponse.json({ error: 'Failed to update workspace member' }, { status: 500 });
  }
}
