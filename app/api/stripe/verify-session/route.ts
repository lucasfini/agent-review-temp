/**
 * Stripe Session Verification
 * Verifies payment and adds credits if webhook hasn't processed yet
 * This is a fallback for local development where webhooks don't work
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isDemoUser } from '@/lib/demo-mode';
import { addStripePurchaseCredit } from '@/lib/billing/credit';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';
import { ensureCurrentPlanCreditGrant, grantTopUpCredits } from '@/lib/billing/plan-credits';
import { upsertOrganizationSubscriptionFromStripe } from '@/lib/billing/subscriptions';
import { getStripeClient } from '@/lib/billing/stripe-runtime';
import {
  notifyCreditsAdded,
  notifyPlanUpdated,
} from '@/lib/notifications/notification-events';

function metadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!metadata) return null;

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function stripeIdFromValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Retrieve session from Stripe
    const stripe = getStripeClient('top-up verification');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};
    const metadataUserId = metadataString(metadata, ['userId', 'user_id']);
    const metadataOrganizationId = metadataString(metadata, ['organizationId', 'organization_id']);
    const metadataPackageId = metadataString(metadata, ['packageId', 'package_id']);
    const metadataCreditUnit = metadataString(metadata, ['creditUnit', 'credit_unit']);
    const metadataPlanId = metadataString(metadata, ['planId', 'plan_id']);
    const metadataPlanSlug = metadataString(metadata, ['planSlug', 'plan_slug']);
    const isSubscriptionCheckout = session.mode === 'subscription'
      || Boolean(metadataPlanId || metadataPlanSlug) && !metadataPackageId;

    // Verify session belongs to this user
    if (!metadataUserId || metadataUserId !== user.id) {
      return NextResponse.json(
        { error: 'Session does not belong to this user' },
        { status: 403 }
      );
    }

    const paymentStatus = typeof session.payment_status === 'string' ? session.payment_status : null;
    const sessionStatus = typeof session.status === 'string' ? session.status : null;
    const paymentComplete = paymentStatus === 'paid'
      || paymentStatus === 'no_payment_required'
      || (isSubscriptionCheckout && sessionStatus === 'complete');

    // Check if payment was successful
    if (!paymentComplete) {
      return NextResponse.json(
        { error: 'Payment not completed', paymentStatus: session.payment_status },
        { status: 400 }
      );
    }

    if (isSubscriptionCheckout) {
      const subscriptionId = stripeIdFromValue(session.subscription);
      if (!subscriptionId) {
        return NextResponse.json(
          { error: 'Subscription checkout is still being confirmed' },
          { status: 202 }
        );
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      });
      const syncedSubscription = await upsertOrganizationSubscriptionFromStripe(
        supabaseAdmin,
        subscription,
        {
          organizationId: metadataOrganizationId,
          planId: metadataPlanId,
          planSlug: metadataPlanSlug,
          checkoutSessionId: session.id,
          eventType: 'checkout.session.verified',
          source: 'success_page_verify',
        }
      );

      if (syncedSubscription && metadataOrganizationId) {
        await ensureCurrentPlanCreditGrant({
          organizationId: metadataOrganizationId,
          userId: user.id,
          subscription: syncedSubscription,
        });
        await notifyPlanUpdated({
          organizationId: metadataOrganizationId,
          actorUserId: user.id,
          planName: syncedSubscription.plan?.name || metadataPlanSlug || 'Your plan',
          idempotencyKey: `plan_changed:verify_session:${session.id}`,
          metadata: {
            source: 'success_page_verify',
            sessionId: session.id,
            subscriptionId,
            planSlug: metadataPlanSlug || syncedSubscription.plan?.slug || null,
          },
        });
      }

      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        checkoutType: 'subscription',
        message: 'Subscription checkout confirmed',
        organizationId: metadataOrganizationId || syncedSubscription?.organizationId || null,
        subscriptionId,
        planSlug: metadataPlanSlug || syncedSubscription?.plan?.slug || null,
        creditUnit: 'plan_credit',
      });
    }

    // Dedup: check if this payment_intent was already processed (by webhook or prior verify call)
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
    if (paymentIntentId) {
      const { data: existingTransaction } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('payment_id', paymentIntentId)
        .limit(1)
        .maybeSingle();

      if (existingTransaction) {
        console.log(`Credits already added for payment ${paymentIntentId} (session ${sessionId})`);
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          message: 'Credits already added',
          creditUnit: metadataCreditUnit === 'plan_credit' || metadataOrganizationId
            ? 'plan_credit'
            : 'legacy_usd',
          organizationId: metadataOrganizationId || null,
        });
      }
    }

    if (metadataOrganizationId) {
      const { data: existingGrant, error: existingGrantError } = await supabaseAdmin
        .from('billing_credit_grants')
        .select('id')
        .eq('idempotency_key', `top_up:${paymentIntentId || session.id}`)
        .limit(1)
        .maybeSingle();

      if (existingGrantError) {
        throw new Error(existingGrantError.message || 'Failed to check existing top-up credit grant');
      }

      if (existingGrant) {
        console.log(`Top-up credits already granted for session ${sessionId}. Grant: ${existingGrant.id}`);
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          message: 'Credits already added',
          grantId: existingGrant.id,
          creditUnit: 'plan_credit',
          organizationId: metadataOrganizationId,
        });
      }
    }

    // Add credits
    const packageId = metadataPackageId;
    const pkg = resolveCreditPackage(packageId || '');

    if (!pkg) {
      return NextResponse.json(
        { error: 'Invalid credit package' },
        { status: 400 }
      );
    }

    const expectedAmountCents = Math.round(pkg.price * 100);
    if ((session.amount_total || 0) !== expectedAmountCents) {
      return NextResponse.json(
        { error: 'Checkout amount mismatch' },
        { status: 400 }
      );
    }

    const creditsAmount = getTotalCredits(pkg);

    console.log(`Processing payment verification for user ${user.id}: ${creditsAmount} product credits`);

    let invoiceNumber: string | undefined;
    if (session.invoice) {
      try {
        const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice.id;
        const invoice = await stripe.invoices.retrieve(invoiceId);
        invoiceNumber = invoice.number || invoice.id;
      } catch (error) {
        console.warn(`[STRIPE] Unable to resolve invoice for session ${session.id}:`, error);
      }
    }

    const organizationId = metadataOrganizationId;
    if (organizationId) {
      const idempotencyKey = `top_up:${paymentIntentId || session.id}`;
      const grant = await grantTopUpCredits({
        organizationId,
        userId: user.id,
        credits: creditsAmount,
        paymentId: paymentIntentId,
        invoiceNumber,
        idempotencyKey,
        metadata: {
          sessionId: session.id,
          packageId,
          amountPaid: (session.amount_total || 0) / 100,
          customerEmail: session.customer_email,
          verifiedViaSuccessPage: true,
        },
      });

      console.log(`Successfully granted ${creditsAmount} top-up credits to organization ${organizationId}. Grant: ${grant.id}`);
      await notifyCreditsAdded({
        organizationId,
        actorUserId: user.id,
        credits: creditsAmount,
        idempotencyKey,
        metadata: {
          source: 'success_page_verify',
          sessionId: session.id,
          packageId,
          paymentIntentId: paymentIntentId || null,
          credits: creditsAmount,
        },
      });
      return NextResponse.json({
        success: true,
        alreadyProcessed: false,
        creditsAdded: creditsAmount,
        grantId: grant.id,
        creditUnit: 'plan_credit',
        organizationId,
      });
    }

    const result = await addStripePurchaseCredit({
      userId: user.id,
      amount: creditsAmount,
      paymentId: paymentIntentId,
      sessionId: session.id,
      invoiceNumber,
      reason: `Legacy Stripe purchase: ${packageId} package (verified on success page)`,
      metadata: {
        packageId,
        credits: pkg.credits,
        expiresAfterMonths: pkg.expiresAfterMonths,
        amountPaid: (session.amount_total || 0) / 100,
        customerEmail: session.customer_email,
        verifiedViaSuccessPage: true,
        legacyCreditUnit: 'account_credit',
      },
    });

    if (result.alreadyProcessed) {
      console.log(`Credits already added for payment ${paymentIntentId || session.id} (session ${sessionId})`);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        message: 'Credits already added',
        newBalance: result.newBalance,
        creditUnit: 'legacy_usd',
      });
    }

    console.log(`Successfully added ${creditsAmount} legacy credits to user ${user.id}. New balance: $${result.newBalance}`);
    return NextResponse.json({
      success: true,
      alreadyProcessed: false,
      creditsAdded: creditsAmount,
      newBalance: result.newBalance,
      creditUnit: 'legacy_usd',
    });
  } catch (error) {
    console.error('Error verifying session:', error);
    return NextResponse.json(
      { error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}
