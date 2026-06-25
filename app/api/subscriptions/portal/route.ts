import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { requireOrganizationBillingManager } from '@/lib/authz/billing-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getAppBaseUrl } from '@/lib/app-url';
import { getOrganizationStripeCustomerId } from '@/lib/billing/subscriptions';
import { getStripeClient } from '@/lib/billing/stripe-runtime';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function safeReturnUrl(input: unknown): string {
  const appBaseUrl = getAppBaseUrl();
  const fallback = new URL('/dashboard/billing', appBaseUrl);
  if (typeof input !== 'string' || !input.trim()) {
    return fallback.toString();
  }

  try {
    const base = new URL(appBaseUrl);
    const candidate = new URL(input.trim(), appBaseUrl);
    if (candidate.origin !== base.origin) {
      return fallback.toString();
    }

    return candidate.toString();
  } catch {
    return fallback.toString();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      body?.organizationId || body?.organization_id || searchParams.get('organization_id');
    const { organization } = await requireOrganizationBillingManager({
      userId: user.id,
      requestedOrganizationId: typeof requestedOrganizationId === 'string' ? requestedOrganizationId : null,
    });
    const stripeCustomerId = await getOrganizationStripeCustomerId(supabaseAdmin, organization.id);

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe customer found for this organization' },
        { status: 404 }
      );
    }

    const returnUrl = safeReturnUrl(
      body?.returnUrl || body?.return_url || process.env.STRIPE_BILLING_PORTAL_RETURN_URL
    );
    const stripe = getStripeClient('subscription portal');
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[SUBSCRIPTION PORTAL] Failed to create portal session:', error);
    return NextResponse.json({ error: 'Failed to create billing portal session' }, { status: 500 });
  }
}
