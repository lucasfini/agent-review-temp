import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { requireOrganizationBillingManager } from '@/lib/authz/billing-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getAppBaseUrl } from '@/lib/app-url';
import {
  getPlanBySlugOrId,
  getPlanStripePriceId,
  type PlanBillingInterval,
} from '@/lib/billing/plans';
import {
  getOrganizationStripeCustomerId,
  upsertOrganizationSubscriptionFromStripe,
  storeOrganizationStripeCustomerId,
} from '@/lib/billing/subscriptions';
import { ensureCurrentPlanCreditGrant } from '@/lib/billing/plan-credits';
import { isDemoUser } from '@/lib/demo-mode';
import { getStripeClient, isBillingTestMode } from '@/lib/billing/stripe-runtime';
import { supabaseAdmin } from '@/lib/supabase/server';

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

function billingIntervalFromBody(body: any): PlanBillingInterval {
  const value = body?.billingInterval || body?.billing_interval || body?.interval;
  return value === 'year' || value === 'annual' || value === 'annually' ? 'year' : 'month';
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
    'standard',
    'teams',
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
    const { organization } = await requireOrganizationBillingManager({
      userId: user.id,
      requestedOrganizationId: typeof requestedOrganizationId === 'string' ? requestedOrganizationId : null,
    });
    const planIdentifier = planIdentifierFromBody(body);
    const billingInterval = billingIntervalFromBody(body);

    if (!planIdentifier) {
      return NextResponse.json({ error: 'Missing plan slug or id' }, { status: 400 });
    }

    const plan = await getPlanBySlugOrId(supabaseAdmin, planIdentifier, { activeOnly: true });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan.slug === 'free') {
      return NextResponse.json(
        { error: 'The Free plan does not require Stripe checkout' },
        { status: 400 }
      );
    }

    const stripePriceId = getPlanStripePriceId(plan, billingInterval);
    if (!stripePriceId) {
      return NextResponse.json(
        { error: 'Plan is not configured for Stripe subscription checkout' },
        { status: 400 }
      );
    }

    if (isProductionUnsafeStripePriceId(stripePriceId)) {
      return NextResponse.json(
        { error: 'Plan has an unsafe Stripe price configuration' },
        { status: 400 }
      );
    }

    const stripe = getStripeClient('subscription checkout');
    let stripeCustomerId = await getOrganizationStripeCustomerId(supabaseAdmin, organization.id);
    let createdNewCustomer = false;
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
      createdNewCustomer = true;
    }
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Unable to create or load a Stripe customer for this organization' },
        { status: 500 }
      );
    }

    const organizationStripeCustomerId = stripeCustomerId;
    if (createdNewCustomer) {
      await storeOrganizationStripeCustomerId(supabaseAdmin, organization.id, organizationStripeCustomerId, {
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
      billing_interval: billingInterval,
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: organizationStripeCustomerId,
      client_reference_id: organization.id,
      line_items: [
        {
          price: stripePriceId,
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

    if (isBillingTestMode()) {
      const startAt = new Date();
      const endAt = new Date(startAt);
      if (billingInterval === 'year') {
        endAt.setUTCFullYear(endAt.getUTCFullYear() + 1);
      } else {
        endAt.setUTCMonth(endAt.getUTCMonth() + 1);
      }
      const subscriptionSyncPayload = {
        id: `sub_test_${String(session.id).replace(/[^a-zA-Z0-9]/g, '')}`,
        customer: organizationStripeCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: null,
        current_period_end: null,
        items: {
          data: [
            {
              current_period_start: Math.floor(startAt.getTime() / 1000),
              current_period_end: Math.floor(endAt.getTime() / 1000),
              price: { id: stripePriceId },
            },
          ],
        },
        metadata: {
          organization_id: organization.id,
          user_id: user.id,
          plan_id: plan.id,
          plan_slug: plan.slug,
          billing_interval: billingInterval,
        },
      };
      const testModeSyncedSubscription = await upsertOrganizationSubscriptionFromStripe(
        supabaseAdmin,
        subscriptionSyncPayload as never,
        {
          organizationId: organization.id,
          planId: plan.id,
          planSlug: plan.slug,
          checkoutSessionId: session.id,
          source: 'billing_test_mode',
        }
      );
      if (testModeSyncedSubscription) {
        await ensureCurrentPlanCreditGrant({
          organizationId: organization.id,
          userId: user.id,
          subscription: testModeSyncedSubscription,
        });
      }
    }

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
        billingInterval,
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
