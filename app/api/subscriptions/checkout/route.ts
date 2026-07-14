import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { requireOrganizationBillingManager } from '@/lib/authz/billing-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { displayOrganizationName, setActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { getAppBaseUrl } from '@/lib/app-url';
import {
  getPlanBySlugOrId,
  getPlanStripePriceId,
  type Plan,
  type PlanBillingInterval,
} from '@/lib/billing/plans';
import {
  getOrganizationSubscription,
  getOrganizationStripeCustomerId,
  isSubscriptionUsable,
  type OrganizationSubscription,
  upsertOrganizationSubscriptionFromStripe,
  storeOrganizationStripeCustomerId,
  updateOrganizationSubscriptionMetadata,
} from '@/lib/billing/subscriptions';
import { ensureCurrentPlanCreditGrant } from '@/lib/billing/plan-credits';
import {
  getWorkspacePlanRestriction,
  isPersonalWorkspaceType,
  isTeamWorkspacePlanSlug,
} from '@/lib/billing/workspace-plan-policy';
import { isDemoUser } from '@/lib/demo-mode';
import { getStripeClient, isBillingTestMode } from '@/lib/billing/stripe-runtime';
import { isProductionUnsafeStripePriceId } from '@/lib/billing/stripe-price-safety';
import { supabaseAdmin } from '@/lib/supabase/server';
import { notifyPlanUpdated } from '@/lib/notifications/notification-events';
import { resolveInviteOrganization } from '@/lib/organizations/team';

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

function stringFromMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function subscriptionBillingInterval(subscription: OrganizationSubscription): PlanBillingInterval | null {
  const metadata = subscription.metadata || {};
  const metadataInterval = stringFromMetadata(metadata.billing_interval || metadata.billingInterval);
  if (metadataInterval === 'year' || metadataInterval === 'annual' || metadataInterval === 'annually') return 'year';
  if (metadataInterval === 'month' || metadataInterval === 'monthly') return 'month';

  const metadataPriceId = stringFromMetadata(metadata.stripePriceId);
  const plan = subscription.plan;
  if (plan?.stripeAnnualPriceId && metadataPriceId === plan.stripeAnnualPriceId) return 'year';
  if (
    (plan?.stripeMonthlyPriceId && metadataPriceId === plan.stripeMonthlyPriceId)
    || (plan?.stripePriceId && metadataPriceId === plan.stripePriceId)
  ) {
    return 'month';
  }

  return null;
}

function planMonthlyEquivalentPriceCents(plan: Plan | null, interval: PlanBillingInterval | null): number | null {
  if (!plan || !interval) return null;
  if (interval === 'year') {
    return typeof plan.annualPriceCents === 'number' ? plan.annualPriceCents / 12 : null;
  }
  return typeof plan.monthlyPriceCents === 'number' ? plan.monthlyPriceCents : null;
}

function isImmediateUpgrade(
  currentSubscription: OrganizationSubscription,
  targetPlan: Plan,
  targetInterval: PlanBillingInterval
): boolean {
  const currentPlan = currentSubscription.plan;
  const currentInterval = subscriptionBillingInterval(currentSubscription);
  const currentMonthlyPrice = planMonthlyEquivalentPriceCents(currentPlan, currentInterval);
  const targetMonthlyPrice = planMonthlyEquivalentPriceCents(targetPlan, targetInterval);

  if (currentMonthlyPrice === null || targetMonthlyPrice === null) {
    return false;
  }

  return targetMonthlyPrice > currentMonthlyPrice;
}

function isSamePlanAndInterval(
  currentSubscription: OrganizationSubscription,
  targetPlan: Plan,
  targetInterval: PlanBillingInterval
): boolean {
  return currentSubscription.planId === targetPlan.id
    && subscriptionBillingInterval(currentSubscription) === targetInterval;
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

function stripeSubscriptionItems(stripeSubscription: any): any[] {
  return Array.isArray(stripeSubscription?.items?.data) ? stripeSubscription.items.data : [];
}

function findStripeItemByPrice(stripeSubscription: any, priceId?: string | null): any | null {
  if (!priceId) return null;
  return stripeSubscriptionItems(stripeSubscription).find((item) => stripeItemPriceId(item) === priceId) || null;
}

function findBaseSubscriptionItem(stripeSubscription: any, currentSubscription: OrganizationSubscription): any | null {
  const metadataBaseItemId = stringFromMetadata(currentSubscription.metadata?.stripeBaseSubscriptionItemId);
  const items = stripeSubscriptionItems(stripeSubscription);
  if (metadataBaseItemId) {
    const metadataItem = items.find((item) => item?.id === metadataBaseItemId);
    if (metadataItem) return metadataItem;
  }

  const currentPlan = currentSubscription.plan;
  for (const priceId of [currentPlan?.stripeMonthlyPriceId, currentPlan?.stripeAnnualPriceId, currentPlan?.stripePriceId]) {
    const item = findStripeItemByPrice(stripeSubscription, priceId);
    if (item) return item;
  }

  return items[0] || null;
}

function unixSecondsFromIso(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function subscriptionItemPeriodEnd(stripeSubscription: any, currentSubscription: OrganizationSubscription): number | null {
  const baseItem = findBaseSubscriptionItem(stripeSubscription, currentSubscription);
  const itemEnd = Number(baseItem?.current_period_end || 0);
  if (Number.isFinite(itemEnd) && itemEnd > 0) return itemEnd;

  const subscriptionEnd = Number(stripeSubscription?.current_period_end || 0);
  if (Number.isFinite(subscriptionEnd) && subscriptionEnd > 0) return subscriptionEnd;

  return unixSecondsFromIso(currentSubscription.currentPeriodEnd);
}

function scheduleIdFromSubscription(stripeSubscription: any): string | null {
  return stripeIdFromValue(stripeSubscription?.schedule);
}

function scheduleItemsFromSubscription(stripeSubscription: any): Array<{ price: string; quantity: number }> {
  return stripeSubscriptionItems(stripeSubscription)
    .map((item) => {
      const price = stripeItemPriceId(item);
      if (!price) return null;
      const quantity = Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0
        ? Math.floor(Number(item.quantity))
        : 1;
      return { price, quantity };
    })
    .filter((item): item is { price: string; quantity: number } => Boolean(item));
}

async function persistPendingPlanChange(params: {
  subscription: OrganizationSubscription;
  targetPlan: Plan;
  targetInterval: PlanBillingInterval;
  stripePriceId: string;
  scheduleId: string | null;
  effectiveAt: string | null;
}) {
  const pendingPlanChange = {
    status: 'scheduled',
    targetPlanId: params.targetPlan.id,
    targetPlanSlug: params.targetPlan.slug,
    targetBillingInterval: params.targetInterval,
    targetStripePriceId: params.stripePriceId,
    stripeSubscriptionScheduleId: params.scheduleId,
    effectiveAt: params.effectiveAt,
    scheduledAt: new Date().toISOString(),
  };

  await updateOrganizationSubscriptionMetadata(supabaseAdmin, params.subscription.id, {
    ...(params.subscription.metadata || {}),
    pendingPlanChange,
  });
}

async function schedulePlanChangeAtPeriodEnd(params: {
  stripe: ReturnType<typeof getStripeClient>;
  stripeSubscription: any;
  currentSubscription: OrganizationSubscription;
  targetPlan: Plan;
  targetInterval: PlanBillingInterval;
  stripePriceId: string;
  metadata: Record<string, string>;
}): Promise<{ scheduleId: string | null; effectiveAt: string | null }> {
  const periodEnd = subscriptionItemPeriodEnd(params.stripeSubscription, params.currentSubscription);
  if (!periodEnd) {
    throw new Error('Unable to determine subscription period end for scheduled plan change');
  }

  const scheduleId = scheduleIdFromSubscription(params.stripeSubscription);
  const schedule = scheduleId
    ? await params.stripe.subscriptionSchedules.retrieve(scheduleId)
    : await params.stripe.subscriptionSchedules.create({
        from_subscription: params.currentSubscription.stripeSubscriptionId,
      });
  const currentPhaseStart = Number(schedule?.current_phase?.start_date || 0)
    || unixSecondsFromIso(params.currentSubscription.currentPeriodStart)
    || Number(params.stripeSubscription?.current_period_start || 0)
    || Math.floor(Date.now() / 1000);
  const currentPhaseEnd = Number(schedule?.current_phase?.end_date || 0) || periodEnd;
  const currentItems = scheduleItemsFromSubscription(params.stripeSubscription);

  if (currentItems.length === 0) {
    throw new Error('Unable to determine current Stripe subscription items for scheduled plan change');
  }

  await params.stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      {
        items: currentItems,
        start_date: currentPhaseStart,
        end_date: currentPhaseEnd,
        metadata: {
          organization_id: params.currentSubscription.organizationId,
          plan_id: params.currentSubscription.plan?.id || params.currentSubscription.planId || '',
          plan_slug: String(params.currentSubscription.plan?.slug || ''),
          billing_interval: subscriptionBillingInterval(params.currentSubscription) || 'month',
        },
      },
      {
        items: [
          {
            price: params.stripePriceId,
            quantity: 1,
          },
        ],
        metadata: params.metadata,
        iterations: 1,
      },
    ],
    metadata: {
      ...params.metadata,
      pending_plan_change: 'true',
      effective_at: new Date(periodEnd * 1000).toISOString(),
    },
  });

  return {
    scheduleId: schedule.id || null,
    effectiveAt: new Date(periodEnd * 1000).toISOString(),
  };
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
    let { organization } = await requireOrganizationBillingManager({
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

    if (isPersonalWorkspaceType(organization.type) && isTeamWorkspacePlanSlug(plan.slug) && organization.owner_user_id === user.id) {
      const inviteOrganization = await resolveInviteOrganization({
        supabase: supabaseAdmin,
        ownerUserId: user.id,
        fallbackWorkspaceName: displayOrganizationName(organization),
      });
      const teamBillingContext = await requireOrganizationBillingManager({
        userId: user.id,
        requestedOrganizationId: inviteOrganization.organization.id,
      });
      organization = teamBillingContext.organization;

      try {
        await setActiveOrganizationForUser(supabaseAdmin, user.id, organization.id);
      } catch (activeOrganizationError) {
        console.error('[SUBSCRIPTION CHECKOUT] Failed to switch active workspace for team plan checkout:', activeOrganizationError);
      }
    }

    const workspacePlanRestriction = getWorkspacePlanRestriction({
      planSlug: plan.slug,
      organizationType: organization.type,
    });
    if (workspacePlanRestriction) {
      return NextResponse.json({ error: workspacePlanRestriction }, { status: 400 });
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
    const existingSubscription = await getOrganizationSubscription(supabaseAdmin, organization.id);
    let stripeCustomerId = await getOrganizationStripeCustomerId(supabaseAdmin, organization.id)
      || existingSubscription?.stripeCustomerId
      || null;
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

    if (
      existingSubscription
      && isSubscriptionUsable(existingSubscription.status)
      && existingSubscription.plan
      && existingSubscription.plan.slug !== 'free'
      && existingSubscription.stripeSubscriptionId
    ) {
      const stripeSubscription = await stripe.subscriptions.retrieve(existingSubscription.stripeSubscriptionId, {
        expand: ['items.data.price'],
      });
      const liveStripeCustomerId = stripeIdFromValue(stripeSubscription.customer);
      if (existingSubscription.stripeCustomerId && liveStripeCustomerId && liveStripeCustomerId !== existingSubscription.stripeCustomerId) {
        return NextResponse.json({ error: 'Stripe subscription customer mismatch' }, { status: 409 });
      }

      if (isSamePlanAndInterval(existingSubscription, plan, billingInterval)) {
        return NextResponse.json({
          success: true,
          subscriptionChange: {
            status: 'unchanged',
            message: `${plan.name} is already active for this billing interval.`,
          },
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
      }

      if (isImmediateUpgrade(existingSubscription, plan, billingInterval)) {
        const baseItem = findBaseSubscriptionItem(stripeSubscription, existingSubscription);
        if (!baseItem?.id) {
          return NextResponse.json({ error: 'Unable to find the current Stripe subscription item' }, { status: 409 });
        }

        const updatedSubscription = await stripe.subscriptions.update(existingSubscription.stripeSubscriptionId, {
          items: [
            {
              id: baseItem.id,
              price: stripePriceId,
              quantity: 1,
            },
          ],
          proration_behavior: 'always_invoice',
          payment_behavior: 'allow_incomplete',
          cancel_at_period_end: false,
          metadata,
          expand: ['items.data.price'],
        });
        const syncedSubscription = await upsertOrganizationSubscriptionFromStripe(
          supabaseAdmin,
          updatedSubscription,
          {
            organizationId: organization.id,
            planId: plan.id,
            planSlug: plan.slug,
            eventType: 'subscription.plan_change.updated',
            source: 'plan_change_api',
          }
        );

        if (syncedSubscription) {
          await ensureCurrentPlanCreditGrant({
            organizationId: organization.id,
            userId: user.id,
            subscription: syncedSubscription,
          });
          await notifyPlanUpdated({
            organizationId: organization.id,
            actorUserId: user.id,
            planName: plan.name,
            idempotencyKey: `plan_changed:api:${syncedSubscription.id}:${plan.id}`,
            metadata: {
              source: 'subscription_checkout',
              subscriptionId: syncedSubscription.id,
              planId: plan.id,
              planSlug: plan.slug,
              billingInterval,
            },
          });
        }

        return NextResponse.json({
          success: true,
          subscription: syncedSubscription,
          subscriptionChange: {
            status: 'updated',
            message: `${plan.name} is now active.`,
            effectiveAt: new Date().toISOString(),
          },
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
      }

      const scheduled = await schedulePlanChangeAtPeriodEnd({
        stripe,
        stripeSubscription,
        currentSubscription: existingSubscription,
        targetPlan: plan,
        targetInterval: billingInterval,
        stripePriceId,
        metadata,
      });
      await persistPendingPlanChange({
        subscription: existingSubscription,
        targetPlan: plan,
        targetInterval: billingInterval,
        stripePriceId,
        scheduleId: scheduled.scheduleId,
        effectiveAt: scheduled.effectiveAt,
      });
      await notifyPlanUpdated({
        organizationId: organization.id,
        actorUserId: user.id,
        planName: plan.name,
        scheduled: true,
        idempotencyKey: `plan_changed:scheduled:${organization.id}:${scheduled.scheduleId}`,
        metadata: {
          source: 'subscription_checkout',
          scheduleId: scheduled.scheduleId,
          effectiveAt: scheduled.effectiveAt,
          planId: plan.id,
          planSlug: plan.slug,
          billingInterval,
        },
      });

      return NextResponse.json({
        success: true,
        subscriptionChange: {
          status: 'scheduled',
          message: `${plan.name} will start on your next billing period.`,
          effectiveAt: scheduled.effectiveAt,
          stripeSubscriptionScheduleId: scheduled.scheduleId,
        },
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
    }

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
      const testSubscriptionId = typeof session.subscription === 'string' && session.subscription
        ? session.subscription
        : `sub_test_${String(session.id).replace(/[^a-zA-Z0-9]/g, '')}`;
      const subscriptionSyncPayload = {
        id: testSubscriptionId,
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
        await notifyPlanUpdated({
          organizationId: organization.id,
          actorUserId: user.id,
          planName: plan.name,
          idempotencyKey: `plan_changed:test_mode:${session.id}`,
          metadata: {
            source: 'billing_test_mode',
            sessionId: session.id,
            planId: plan.id,
            planSlug: plan.slug,
            billingInterval,
          },
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
