import type { OrganizationMemberRole, OrganizationType } from '@/lib/authz/types';

export function canManageOrganizationBilling(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  if (role === 'owner' || role === 'admin') {
    return true;
  }

  return role === 'agency_admin' && organizationType === 'internal_agency';
}

export function canReadOrganizationBilling(
  role?: OrganizationMemberRole | string | null
): boolean {
  return role === 'owner'
    || role === 'admin'
    || role === 'agency_admin'
    || role === 'agency_member';
}
