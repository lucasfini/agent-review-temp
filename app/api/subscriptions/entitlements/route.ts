import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  ENTITLEMENT_ACTIONS,
  checkOrganizationEntitlement,
  getSubscriptionEnforcementMode,
  shouldEnforceSubscriptionEntitlements,
} from '@/lib/billing/entitlement-guards';
import { getOrganizationSubscription } from '@/lib/billing/subscriptions';
import { getSubscriptionUsageCounters } from '@/lib/billing/subscription-usage-counters';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const { organization, membership } = await getActiveOrganizationForUser(
      supabaseAdmin,
      user.id,
      requestedOrganizationId
    );
    const subscription = await getOrganizationSubscription(supabaseAdmin, organization.id);
    const enforcementMode = getSubscriptionEnforcementMode();
    const enforcementActive = shouldEnforceSubscriptionEntitlements(enforcementMode);
    const usageCounters = await getSubscriptionUsageCounters(supabaseAdmin, {
      organizationId: organization.id,
      subscription,
    });
    const decisions = await Promise.all(
      ENTITLEMENT_ACTIONS.map((action) => checkOrganizationEntitlement({
        organizationId: organization.id,
        legacyUserId: user.id,
        action,
        requestedAmount: action === 'storage' ? 0 : 1,
        subscription,
        dryRun: !enforcementActive,
      }))
    );

    return NextResponse.json(
      {
        success: true,
        enforcementMode,
        enforcementActive,
        dryRun: !enforcementActive,
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type,
        },
        membership: {
          role: membership.role,
          status: membership.status,
        },
        subscription,
        plan: subscription?.plan || null,
        usageCounters,
        decisions,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[SUBSCRIPTION_ENTITLEMENTS] Failed to load entitlement summary:', error);
    return NextResponse.json(
      { error: 'Failed to load entitlement summary' },
      { status: 500 }
    );
  }
}
