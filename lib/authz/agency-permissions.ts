import type { NextRequest } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { requireActiveOrganizationForUser } from '@/lib/authz/permissions';
import type {
  OrganizationMemberRole,
  OrganizationRecord,
  OrganizationType,
} from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

const AGENCY_ACCESS_ROLES = new Set<string>([
  'owner',
  'admin',
  'member',
  'agency_admin',
  'agency_member',
]);

const AGENCY_CLIENT_MANAGE_ROLES = new Set<string>([
  'owner',
  'admin',
  'agency_admin',
]);

type OrganizationLike = Pick<OrganizationRecord, 'type'> | OrganizationType | string | null | undefined;

export interface AgencyClientAccessRecord {
  id: string;
  organization_id: string;
  name: string;
  status: string;
}

function organizationTypeFrom(value: OrganizationLike): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.type || null;
}

export function isInternalAgencyOrganization(organization: OrganizationLike): boolean {
  return organizationTypeFrom(organization) === 'internal_agency';
}

export function canAccessAgencyConsole(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  return isInternalAgencyOrganization(organizationType) && Boolean(role && AGENCY_ACCESS_ROLES.has(role));
}

export function canManageAgencyClient(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  return isInternalAgencyOrganization(organizationType) && Boolean(role && AGENCY_CLIENT_MANAGE_ROLES.has(role));
}

export async function requireAgencyAccess(
  request: NextRequest,
  options: {
    requestedOrganizationId?: string | null;
    requireClientManagement?: boolean;
  } = {}
) {
  const context = await requireActiveOrganizationForUser(request, {
    requestedOrganizationId: options.requestedOrganizationId,
  });

  if (!canAccessAgencyConsole(context.membership.role, context.organization.type)) {
    throw new RouteAccessError(403, 'Agency console access requires an internal agency organization');
  }

  if (
    options.requireClientManagement
    && !canManageAgencyClient(context.membership.role, context.organization.type)
  ) {
    throw new RouteAccessError(403, 'Agency client management requires internal agency admin access');
  }

  return context;
}

export async function requireAgencyClientAccess(
  request: NextRequest,
  clientId: string,
  options: {
    requestedOrganizationId?: string | null;
    requireClientManagement?: boolean;
  } = {}
) {
  const context = await requireAgencyAccess(request, options);

  const { data, error } = await supabaseAdmin
    .from('agency_clients')
    .select('id, organization_id, name, status')
    .eq('organization_id', context.organization.id)
    .eq('id', clientId)
    .maybeSingle() as {
      data: AgencyClientAccessRecord | null;
      error: any;
    };

  if (error) {
    throw new RouteAccessError(500, error.message || 'Failed to validate agency client access');
  }

  if (!data) {
    throw new RouteAccessError(404, 'Agency client not found');
  }

  return {
    ...context,
    agencyClient: data,
  };
}
