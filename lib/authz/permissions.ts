import type { NextRequest } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

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
      membership: context.membership,
    };
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      throw new RouteAccessError(error.status, error.message);
    }
    throw error;
  }
}
