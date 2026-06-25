import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
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
    const usage = await getSubscriptionUsageCounters(supabaseAdmin, {
      organizationId: organization.id,
      subscription,
    });

    return NextResponse.json(
      {
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type,
        },
        membership: {
          role: membership.role,
          status: membership.status,
        },
        subscriptionId: subscription?.id || null,
        period: usage.period,
        counters: usage.counters,
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

    console.error('[SUBSCRIPTION_USAGE_COUNTERS] Failed to load usage counters:', error);
    return NextResponse.json(
      { error: 'Failed to load subscription usage counters' },
      { status: 500 }
    );
  }
}
