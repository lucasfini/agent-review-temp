import type { NextRequest } from 'next/server';

import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { RouteAccessError } from '@/lib/api/route-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function getDashboardOrganizationContext(
  request: NextRequest,
  userId: string
): Promise<{ organizationId: string }> {
  const { searchParams } = new URL(request.url);
  const requestedOrganizationId = searchParams.get('organization_id');

  try {
    const { organization } = await getActiveOrganizationForUser(
      supabaseAdmin,
      userId,
      requestedOrganizationId
    );
    return { organizationId: organization.id };
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      throw new RouteAccessError(error.status, error.message);
    }
    throw error;
  }
}

export function buildOrgScopedLegacyFallbackFilter(
  organizationId: string,
  userId: string
): string {
  return `organization_id.eq.${organizationId},and(organization_id.is.null,user_id.eq.${userId})`;
}
