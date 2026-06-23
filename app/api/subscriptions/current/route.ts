import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getEntitlementsForSubscription } from '@/lib/billing/entitlements';
import { getOrCreateCreditSubscription, ensureCurrentPlanCreditGrant } from '@/lib/billing/plan-credits';
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
    const subscription = await getOrCreateCreditSubscription({
      organizationId: organization.id,
    });
    await ensureCurrentPlanCreditGrant({
      organizationId: organization.id,
      userId: user.id,
      subscription,
    });
    const entitlements = getEntitlementsForSubscription(subscription);

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
        subscription,
        entitlements,
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

    console.error('[SUBSCRIPTIONS_CURRENT] Failed to load current subscription:', error);
    return NextResponse.json(
      { error: 'Failed to load current subscription' },
      { status: 500 }
    );
  }
}
