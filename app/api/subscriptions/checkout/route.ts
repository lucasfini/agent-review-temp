import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getAppBaseUrl } from '@/lib/app-url';
import { getPlanBySlugOrId } from '@/lib/billing/plans';
import {
  getOrganizationStripeCustomerId,
  storeOrganizationStripeCustomerId,
} from '@/lib/billing/subscriptions';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function safeRedirectUrl(input: unknown, fallbackPath: string): string {
  const appBaseUrl = getAppBaseUrl();
  const fallback = new URL(fallbackPath, appBaseUrl);
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

function planIdentifierFromBody(body: any): string | null {
  const value = body?.planSlug || body?.plan_slug || body?.planId || body?.plan_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isProductionUnsafeStripePriceId(priceId: string): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  const normalized = priceId.trim().toLowerCase();
  if (!normalized.startsWith('price_')) {
    return true;
  }

  const placeholderTokens = [
    'placeholder',
    'replace',
    'example',
    'mock',
    'todo',
    'starter',
    'growth',
    'scale',
    'enterprise',
  ];

  return normalized.length < 14 || placeholderTokens.some((token) => normalized.includes(token));
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      body?.organizationId || body?.organization_id || searchParams.get('organization_id');
    const { organization } = await getActiveOrganizationForUser(
      supabaseAdmin,
      user.id,
      typeof requestedOrganizationId === 'string' ? requestedOrganizationId : null
    );
    const planIdentifier = planIdentifierFromBody(body);

    if (!planIdentifier) {
      return NextResponse.json({ error: 'Missing plan slug or id' }, { status: 400 });
    }

    const plan = await getPlanBySlugOrId(supabaseAdmin, planIdentifier, { activeOnly: true });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (!plan.stripePriceId) {
      return NextResponse.json(
        { error: 'Plan is not configured for Stripe subscription checkout' },
        { status: 400 }
      );
    }

    if (isProductionUnsafeStripePriceId(plan.stripePriceId)) {
      return NextResponse.json(
        { error: 'Plan has an unsafe Stripe price configuration' },
        { status: 400 }
      );
    }

    let stripeCustomerId = await getOrganizationStripeCustomerId(supabaseAdmin, organization.id);
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: organization.name,
        metadata: {
          organization_id: organization.id,
          created_by_user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;
      await storeOrganizationStripeCustomerId(supabaseAdmin, organization.id, stripeCustomerId, {
        planId: plan.id,
        metadata: {
          source: 'subscription_checkout',
          createdByUserId: user.id,
        },
      });
    }

    const successUrl = safeRedirectUrl(
      body?.successUrl || body?.success_url || process.env.STRIPE_SUBSCRIPTION_SUCCESS_URL,
      '/dashboard/billing?subscription=success&session_id={CHECKOUT_SESSION_ID}'
    );
    const cancelUrl = safeRedirectUrl(
      body?.cancelUrl || body?.cancel_url || process.env.STRIPE_SUBSCRIPTION_CANCEL_URL,
      '/dashboard/billing?subscription=cancel'
    );
    const metadata = {
      organization_id: organization.id,
      user_id: user.id,
      plan_id: plan.id,
      plan_slug: plan.slug,
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: organization.id,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata,
      subscription_data: {
        metadata,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      plan: {
        id: plan.id,
        slug: plan.slug,
        name: plan.name,
      },
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[SUBSCRIPTION CHECKOUT] Failed to create checkout session:', error);
    return NextResponse.json({ error: 'Failed to create subscription checkout' }, { status: 500 });
  }
}
