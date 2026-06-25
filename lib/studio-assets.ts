import type { NextRequest } from 'next/server';

import { requireActiveOrganizationForUser } from '@/lib/authz/permissions';
import { ensureDefaultOrganizationForUser } from '@/lib/authz/organization-context';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function requireStudioAssetContext(
  request: NextRequest,
  options: {
    requestedOrganizationId?: string | null;
  } = {}
) {
  const activeContext = await requireActiveOrganizationForUser(request, {
    requestedOrganizationId: options.requestedOrganizationId || null,
  });
  const privateOrganization = await ensureDefaultOrganizationForUser(supabaseAdmin, activeContext.user.id);
  const organizationIds = Array.from(new Set([
    privateOrganization.id,
    activeContext.organization.id,
  ]));

  return {
    ...activeContext,
    privateOrganization,
    privateOrganizationId: privateOrganization.id,
    activeOrganizationId: activeContext.organization.id,
    organizationIds,
  };
}
