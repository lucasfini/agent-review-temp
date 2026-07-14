import type { NextRequest } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import {
  isWorkspaceRole,
  normalizeOrganizationMemberRole,
  type OrganizationMemberRole,
  type OrganizationType,
  type WorkspaceAssignableRole,
  type WorkspaceRole,
} from '@/lib/authz/types';
import { OrganizationAccessError as OrganizationAccessErrorClass } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export type PermissionAction =
  | 'workspace.read'
  | 'workspace.update'
  | 'workspace.delete'
  | 'workspace.transfer_owner'
  | 'billing.read'
  | 'billing.manage'
  | 'members.invite'
  | 'members.update_role'
  | 'members.remove'
  | 'invites.create'
  | 'invites.resend'
  | 'invites.cancel'
  | 'profile.create'
  | 'profile.read'
  | 'profile.update'
  | 'profile.share'
  | 'profile.unshare'
  | 'profile.delete'
  | 'voice.create'
  | 'voice.read'
  | 'voice.update'
  | 'voice.share'
  | 'voice.unshare'
  | 'voice.delete'
  | 'plan.create'
  | 'plan.read'
  | 'plan.update'
  | 'plan.share'
  | 'plan.unshare'
  | 'plan.delete'
  | 'generation.run'
  | 'generation.save_to_library'
  | 'library_item.create'
  | 'library_item.read'
  | 'library_item.update'
  | 'library_item.delete'
  | 'library_item.restore'
  | 'library_item.publish'
  | 'library_item.export'
  | 'collection.create'
  | 'collection.read'
  | 'collection.update'
  | 'collection.delete'
  | 'collection.share'
  | 'collection.unshare'
  | 'audit_log.read'
  | 'integration.manage';

export type PermissionResource = {
  organizationId?: string | null;
  ownerUserId?: string | null;
  createdByUserId?: string | null;
  visibility?: 'private' | 'workspace' | 'organization' | null;
  locked?: boolean | null;
  targetRole?: WorkspaceRole | WorkspaceAssignableRole | null;
  targetCurrentRole?: WorkspaceRole | null;
  targetUserId?: string | null;
  approvalRequired?: boolean | null;
  nextStatus?: string | null;
};

export type PermissionContext = {
  userId?: string | null;
  organizationId?: string | null;
  role?: OrganizationMemberRole | string | null;
  organizationType?: OrganizationType | string | null;
  isDemo?: boolean;
};

function asWorkspaceRole(role?: OrganizationMemberRole | string | null): WorkspaceRole | null {
  const normalized = normalizeOrganizationMemberRole(role);
  return isWorkspaceRole(normalized) ? normalized : null;
}

function isSameOrganization(context: PermissionContext, resource: PermissionResource): boolean {
  if (!resource.organizationId || !context.organizationId) return true;
  return resource.organizationId === context.organizationId;
}

function isOwnResource(context: PermissionContext, resource: PermissionResource): boolean {
  if (!context.userId) return false;
  return resource.ownerUserId === context.userId || resource.createdByUserId === context.userId;
}

function isWorkspaceReadableRole(role: WorkspaceRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor' || role === 'reader';
}

function isWorkspaceEditorRole(role: WorkspaceRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function canReadScopedResource(context: PermissionContext, resource: PermissionResource): boolean {
  const role = asWorkspaceRole(context.role);
  if (!isWorkspaceReadableRole(role)) return false;
  if (resource.visibility === 'private') {
    return isOwnResource(context, resource);
  }
  return isSameOrganization(context, resource);
}

function canMutateStudioLikeResource(
  context: PermissionContext,
  resource: PermissionResource,
  options: { requireOwnershipForSharedDelete?: boolean } = {}
): boolean {
  const role = asWorkspaceRole(context.role);
  if (!isWorkspaceEditorRole(role)) return false;

  if (resource.visibility === 'private') {
    return isOwnResource(context, resource);
  }

  if (!isSameOrganization(context, resource)) return false;

  if (resource.locked) {
    return role === 'owner' || role === 'admin';
  }

  if (role === 'owner' || role === 'admin') return true;
  if (options.requireOwnershipForSharedDelete) {
    return isOwnResource(context, resource);
  }
  return true;
}

export function can(
  context: PermissionContext,
  action: PermissionAction,
  resource: PermissionResource = {}
): boolean {
  const role = asWorkspaceRole(context.role);
  const isDemo = Boolean(context.isDemo);

  if (!role || !isWorkspaceReadableRole(role)) {
    return false;
  }

  if (isDemo && action !== 'workspace.read' && !action.endsWith('.read') && action !== 'library_item.export') {
    return false;
  }

  switch (action) {
    case 'workspace.read':
      return true;
    case 'workspace.update':
    case 'integration.manage':
    case 'audit_log.read':
      return role === 'owner' || role === 'admin';
    case 'workspace.delete':
    case 'workspace.transfer_owner':
    case 'billing.manage':
      return role === 'owner';
    case 'billing.read':
      return role === 'owner' || role === 'admin';
    case 'members.invite':
    case 'invites.create':
      if (resource.targetRole === 'owner') return false;
      if (role === 'owner') {
        return resource.targetRole === 'admin' || resource.targetRole === 'editor' || resource.targetRole === 'reader';
      }
      if (role === 'admin') {
        return resource.targetRole === 'editor' || resource.targetRole === 'reader';
      }
      return false;
    case 'invites.resend':
    case 'invites.cancel':
      return role === 'owner' || role === 'admin';
    case 'members.update_role':
      if (resource.targetCurrentRole === 'owner' || resource.targetRole === 'owner') {
        return role === 'owner';
      }
      if (role === 'owner') {
        return resource.targetRole === 'admin' || resource.targetRole === 'editor' || resource.targetRole === 'reader';
      }
      if (role === 'admin') {
        return resource.targetCurrentRole === 'editor'
          || resource.targetCurrentRole === 'reader';
      }
      return false;
    case 'members.remove':
      if (resource.targetCurrentRole === 'owner') return false;
      if (resource.targetUserId && context.userId && resource.targetUserId === context.userId) return false;
      if (role === 'owner') return true;
      if (role === 'admin') {
        return resource.targetCurrentRole === 'editor' || resource.targetCurrentRole === 'reader';
      }
      return false;
    case 'profile.read':
    case 'voice.read':
    case 'plan.read':
    case 'collection.read':
    case 'library_item.read':
      return canReadScopedResource(context, resource);
    case 'profile.create':
    case 'voice.create':
    case 'plan.create':
    case 'collection.create':
    case 'library_item.create':
    case 'generation.run':
    case 'generation.save_to_library':
      return isWorkspaceEditorRole(role);
    case 'profile.update':
    case 'voice.update':
    case 'plan.update':
    case 'collection.update':
      return canMutateStudioLikeResource(context, resource);
    case 'profile.delete':
    case 'voice.delete':
    case 'plan.delete':
    case 'collection.delete':
      return canMutateStudioLikeResource(context, resource, { requireOwnershipForSharedDelete: role === 'editor' });
    case 'profile.share':
    case 'voice.share':
    case 'plan.share':
    case 'collection.share':
      return isWorkspaceEditorRole(role)
        && resource.visibility === 'private'
        && isOwnResource(context, resource);
    case 'profile.unshare':
    case 'voice.unshare':
    case 'plan.unshare':
    case 'collection.unshare':
      if (!isWorkspaceEditorRole(role) || !isSameOrganization(context, resource)) return false;
      if (resource.locked && role === 'editor') return false;
      if (role === 'owner' || role === 'admin') return true;
      return resource.visibility !== 'private' && isOwnResource(context, resource);
    case 'library_item.update':
      if (!canReadScopedResource(context, resource) || !isWorkspaceEditorRole(role)) return false;
      if (resource.locked && role === 'editor') return false;
      if (role === 'owner' || role === 'admin') return true;
      if (resource.visibility === 'private') return isOwnResource(context, resource);
      return true;
    case 'library_item.delete':
      if (!canReadScopedResource(context, resource) || !isWorkspaceEditorRole(role)) return false;
      if (resource.locked && role === 'editor') return false;
      if (role === 'owner' || role === 'admin') return true;
      if (resource.visibility === 'private') return isOwnResource(context, resource);
      return isOwnResource(context, resource);
    case 'library_item.restore':
      return role === 'owner' || role === 'admin';
    case 'library_item.publish':
      return role === 'owner' || role === 'admin';
    case 'library_item.export':
      return canReadScopedResource(context, resource);
    default:
      return false;
  }
}

export function assertCan(
  context: PermissionContext,
  action: PermissionAction,
  resource: PermissionResource = {},
  message = 'Not authorized'
) {
  if (!can(context, action, resource)) {
    throw new RouteAccessError(403, message);
  }
}

export async function requireActiveOrganizationForUser(
  request: NextRequest,
  options?: {
    requestedOrganizationId?: string | null;
  }
) {
  const user = await requireAuthenticatedUser(request);

  try {
    const context = await getActiveOrganizationForUser(
      supabaseAdmin,
      user.id,
      options?.requestedOrganizationId || null
    );

    return {
      user,
      organization: context.organization,
      membership: {
        ...context.membership,
        role: normalizeOrganizationMemberRole(context.membership.role),
      },
    };
  } catch (error) {
    if (error instanceof OrganizationAccessErrorClass) {
      throw new RouteAccessError(error.status, error.message);
    }
    throw error;
  }
}

export async function requirePermissionContext(
  request: NextRequest,
  options?: {
    requestedOrganizationId?: string | null;
  }
) {
  const context = await requireActiveOrganizationForUser(request, options);
  return {
    ...context,
    permissionContext: {
      userId: context.user.id,
      organizationId: context.organization.id,
      organizationType: context.organization.type,
      role: context.membership.role,
      isDemo: isDemoUser(context.user),
    } satisfies PermissionContext,
  };
}
