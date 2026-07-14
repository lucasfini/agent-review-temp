import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { requireOrganizationBillingManager } from '@/lib/authz/billing-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isProductionUnsafeStripePriceId } from '@/lib/billing/stripe-price-safety';
import { getStripeClient } from '@/lib/billing/stripe-runtime';
import type { Plan } from '@/lib/billing/plans';
import {
  getOrganizationSubscription,
  getSubscriptionBaseSeatLimit,
  getSubscriptionSeatLimit,
  isSubscriptionUsable,
  upsertOrganizationSubscriptionFromStripe,
} from '@/lib/billing/subscriptions';
import { isDemoUser } from '@/lib/demo-mode';
import { getWorkspaceSeatSummary } from '@/lib/organizations/team';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function integerFromBody(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function positiveInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function bodyOrganizationId(body: any, request: NextRequest): string | null {
  const { searchParams } = new URL(request.url);
  const value = body?.organizationId || body?.organization_id || searchParams.get('organization_id');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function subscriptionBillingInterval(subscription: Awaited<ReturnType<typeof getOrganizationSubscription>>): 'month' | 'year' | null {
  const plan = subscription?.plan;
  const metadata = subscription?.metadata || {};
  const metadataInterval = stringFromMetadata(metadata.billing_interval || metadata.billingInterval);
  if (metadataInterval === 'year' || metadataInterval === 'annual' || metadataInterval === 'annually') return 'year';
  if (metadataInterval === 'month' || metadataInterval === 'monthly') return 'month';

  const metadataPriceId = stringFromMetadata(metadata.stripePriceId);
  if (plan?.stripeAnnualPriceId && metadataPriceId === plan.stripeAnnualPriceId) return 'year';
  if (
    (plan?.stripeMonthlyPriceId && metadataPriceId === plan.stripeMonthlyPriceId)
    || (plan?.stripePriceId && metadataPriceId === plan.stripePriceId)
  ) {
    return 'month';
  }

  return null;
}

function extraSeatPriceIdForInterval(
  plan: Plan,
  interval: 'month' | 'year'
): string | null {
  if (interval === 'year') {
    return plan.stripeExtraSeatAnnualPriceId || null;
  }

  return plan.stripeExtraSeatMonthlyPriceId || null;
}

function stripeIdFromValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

function stripeItemPriceId(item: any): string | null {
  const price = item?.price;
  if (typeof price === 'string') return price;
  if (price && typeof price === 'object' && typeof price.id === 'string') return price.id;
  return null;
}

function findStripeItemByPrice(subscription: any, priceId: string): any | null {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  return items.find((item: any) => stripeItemPriceId(item) === priceId) || null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = bodyOrganizationId(body, request);
    const { organization } = await requireOrganizationBillingManager({
      userId: user.id,
      requestedOrganizationId,
    });
    const targetSeatLimit = integerFromBody(body?.targetSeatLimit || body?.target_seat_limit);

    if (!targetSeatLimit) {
      return NextResponse.json({ error: 'Missing target seat limit' }, { status: 400 });
    }

    const subscription = await getOrganizationSubscription(supabaseAdmin, organization.id);
    if (!subscription || !isSubscriptionUsable(subscription.status) || !subscription.plan) {
      return NextResponse.json({ error: 'A usable Teams subscription is required to add seats' }, { status: 400 });
    }

    if (subscription.plan.slug !== 'teams') {
      return NextResponse.json({ error: 'Extra seats are only available on the Teams plan' }, { status: 400 });
    }

    const billingInterval = subscriptionBillingInterval(subscription);
    if (billingInterval !== 'month' && billingInterval !== 'year') {
      return NextResponse.json({ error: 'Unable to determine Teams billing interval' }, { status: 400 });
    }

    const baseSeatLimit = getSubscriptionBaseSeatLimit(subscription);
    const currentSeatLimit = getSubscriptionSeatLimit(subscription);
    if (!baseSeatLimit || !currentSeatLimit) {
      return NextResponse.json({ error: 'Teams seat entitlement is not configured' }, { status: 400 });
    }

    if (targetSeatLimit < currentSeatLimit) {
      return NextResponse.json({ error: 'Target seat limit must be higher than the current seat limit' }, { status: 400 });
    }

    const seats = await getWorkspaceSeatSummary(supabaseAdmin, organization.id);
    if (targetSeatLimit < seats.active + seats.pending) {
      return NextResponse.json(
        { error: 'Target seat limit cannot be lower than active members and pending invites' },
        { status: 400 }
      );
    }

    const extraSeatPriceId = extraSeatPriceIdForInterval(subscription.plan, billingInterval);
    if (!extraSeatPriceId) {
      return NextResponse.json({ error: `Teams ${billingInterval === 'year' ? 'annual' : 'monthly'} extra-seat Stripe price is not configured` }, { status: 400 });
    }

    if (isProductionUnsafeStripePriceId(extraSeatPriceId)) {
      return NextResponse.json({ error: 'Teams extra-seat Stripe price configuration is unsafe' }, { status: 400 });
    }

    if (!subscription.stripeSubscriptionId) {
      return NextResponse.json({ error: 'No Stripe subscription is synced for this organization' }, { status: 400 });
    }

    const stripe = getStripeClient('subscription seats');
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });
    const stripeCustomerId = stripeIdFromValue(stripeSubscription.customer);
    if (subscription.stripeCustomerId && stripeCustomerId && stripeCustomerId !== subscription.stripeCustomerId) {
      return NextResponse.json({ error: 'Stripe subscription customer mismatch' }, { status: 409 });
    }

    const existingExtraSeatItem = findStripeItemByPrice(stripeSubscription, extraSeatPriceId);
    const liveExtraSeatCount = positiveInteger(existingExtraSeatItem?.quantity);
    const liveCurrentSeatLimit = baseSeatLimit + liveExtraSeatCount;
    if (targetSeatLimit < liveCurrentSeatLimit) {
      await upsertOrganizationSubscriptionFromStripe(
        supabaseAdmin,
        stripeSubscription,
        {
          organizationId: organization.id,
          planId: subscription.plan.id,
          planSlug: subscription.plan.slug,
          eventType: 'subscription.seats.refresh',
          source: 'seat_update_api',
        }
      );
      return NextResponse.json({ error: 'Target seat limit must be higher than the current seat limit' }, { status: 400 });
    }

    if (targetSeatLimit === liveCurrentSeatLimit) {
      const syncedSubscription = await upsertOrganizationSubscriptionFromStripe(
        supabaseAdmin,
        stripeSubscription,
        {
          organizationId: organization.id,
          planId: subscription.plan.id,
          planSlug: subscription.plan.slug,
          eventType: 'subscription.seats.refresh',
          source: 'seat_update_api',
        }
      );

      return NextResponse.json({
        success: true,
        subscription: syncedSubscription,
        seats: {
          base: baseSeatLimit,
          extra: liveExtraSeatCount,
          limit: liveCurrentSeatLimit,
        },
      });
    }

    const extraSeatCount = targetSeatLimit - baseSeatLimit;
    const itemUpdate = existingExtraSeatItem?.id
      ? { id: existingExtraSeatItem.id, quantity: extraSeatCount }
      : {
          price: extraSeatPriceId,
          quantity: extraSeatCount,
          metadata: {
            organization_id: organization.id,
            plan_id: subscription.plan.id,
            plan_slug: subscription.plan.slug,
            billing_component: 'extra_seat',
          },
        };

    const updatedSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [itemUpdate],
      proration_behavior: 'always_invoice',
      payment_behavior: 'allow_incomplete',
      metadata: {
        organization_id: organization.id,
        plan_id: subscription.plan.id,
        plan_slug: subscription.plan.slug,
        billing_interval: billingInterval,
      },
      expand: ['items.data.price'],
    });

    const syncedSubscription = await upsertOrganizationSubscriptionFromStripe(
      supabaseAdmin,
      updatedSubscription,
      {
        organizationId: organization.id,
        planId: subscription.plan.id,
        planSlug: subscription.plan.slug,
        eventType: 'subscription.seats.updated',
        source: 'seat_update_api',
      }
    );

    return NextResponse.json({
      success: true,
      subscription: syncedSubscription,
      seats: {
        base: baseSeatLimit,
        extra: extraSeatCount,
        limit: baseSeatLimit + extraSeatCount,
      },
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[SUBSCRIPTION SEATS] Failed to update seats:', error);
    return NextResponse.json({ error: 'Failed to update Teams seats' }, { status: 500 });
  }
}
