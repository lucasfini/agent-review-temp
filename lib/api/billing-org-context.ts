import type { NextRequest } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  buildBillingOrgScopedLegacyFallbackFilter,
  type BillingOrganizationScope,
} from '@/lib/billing/organization-scope';

export async function getBillingOrganizationContext(
  request: NextRequest,
  userId: string
): Promise<BillingOrganizationScope> {
  const { searchParams } = new URL(request.url);
  const requestedOrganizationId = searchParams.get('organization_id');

  try {
    const { organization } = await getActiveOrganizationForUser(
      supabaseAdmin,
      userId,
      requestedOrganizationId
    );

    return {
      organizationId: organization.id,
      userId,
    };
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      throw new RouteAccessError(error.status, error.message);
    }
    throw error;
  }
}

export { buildBillingOrgScopedLegacyFallbackFilter };
