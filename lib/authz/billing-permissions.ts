import type { SupabaseClient } from '@supabase/supabase-js';

import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import type { ActiveOrganizationContext } from '@/lib/authz/types';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  canManageOrganizationBilling,
  canReadOrganizationBilling,
} from '@/lib/authz/billing-permission-rules';

export {
  canManageOrganizationBilling,
  canReadOrganizationBilling,
};

export interface RequireOrganizationBillingManagerOptions {
  supabase?: SupabaseClient<any>;
  userId: string;
  requestedOrganizationId?: string | null;
}

export async function requireOrganizationBillingManager(
  options: RequireOrganizationBillingManagerOptions
): Promise<ActiveOrganizationContext> {
  const supabase = options.supabase || supabaseAdmin;
  const context = await getActiveOrganizationForUser(
    supabase,
    options.userId,
    options.requestedOrganizationId || null
  );

  if (!canManageOrganizationBilling(context.membership.role, context.organization.type)) {
    throw new OrganizationAccessError(
      403,
      'Billing management requires organization owner or admin access'
    );
  }

  return context;
}
