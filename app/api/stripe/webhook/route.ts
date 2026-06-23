/**
 * Stripe Webhook Handler
 * Processes Stripe events (payment completion, refunds, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addCredit, debitCredit } from '@/lib/billing/credit';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';
import { isSubscriptionUsable, upsertOrganizationSubscriptionFromStripe } from '@/lib/billing/subscriptions';
import { ensureCurrentPlanCreditGrant, grantTopUpCredits } from '@/lib/billing/plan-credits';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('No Stripe signature found');
      return NextResponse.json(
        { error: 'No signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription') {
          await handleSubscriptionCheckoutComplete(session);
        } else {
          await handleCheckoutComplete(session);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(subscription, event.type);
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await syncSubscriptionFromInvoice(invoice, event.type);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleRefund(charge);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

function getStripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
}

async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  eventType: string,
  options: {
    organizationId?: string | null;
    planId?: string | null;
    planSlug?: string | null;
    checkoutSessionId?: string | null;
    source?: string | null;
  } = {}
) {
  const synced = await upsertOrganizationSubscriptionFromStripe(supabaseAdmin, subscription, {
    ...options,
    eventType,
    source: options.source || 'stripe_webhook',
  });

  if (synced && isSubscriptionUsable(synced.status) && synced.plan?.monthlyCreditGrant) {
    await ensureCurrentPlanCreditGrant({
      organizationId: synced.organizationId,
      subscription: synced,
    });
  }
}

async function handleSubscriptionCheckoutComplete(session: Stripe.Checkout.Session) {
  const subscriptionId = getStripeId(session.subscription);
  if (!subscriptionId) {
    console.warn(`[STRIPE] Subscription checkout session ${session.id} missing subscription id`);
    return;
  }

  const subscription = await retrieveSubscription(subscriptionId);
  await syncSubscriptionFromStripe(subscription, 'checkout.session.completed', {
    organizationId: session.metadata?.organization_id || null,
    planId: session.metadata?.plan_id || null,
    planSlug: session.metadata?.plan_slug || null,
    checkoutSessionId: session.id,
    source: 'stripe_checkout',
  });
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription
    || (invoice as any).subscription;
  return getStripeId(subscription);
}

async function syncSubscriptionFromInvoice(invoice: Stripe.Invoice, eventType: string) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    console.log(`[STRIPE] Invoice ${invoice.id} has no subscription reference for ${eventType}`);
    return;
  }

  const subscription = await retrieveSubscription(subscriptionId);
  await syncSubscriptionFromStripe(subscription, eventType, {
    source: 'stripe_invoice',
  });
}

/**
 * Handle successful checkout - add credits to user account
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  try {
    const userId = session.metadata?.userId;
    const organizationId = session.metadata?.organizationId;
    const packageId = session.metadata?.packageId;
    const pkg = resolveCreditPackage(packageId || '');

    if (!userId || !pkg) {
      console.error('Missing metadata in checkout session:', session.id);
      return;
    }

    const expectedAmountCents = Math.round(pkg.price * 100);
    if ((session.amount_total || 0) !== expectedAmountCents) {
      console.error(`[STRIPE] Checkout amount mismatch for session ${session.id}: expected ${expectedAmountCents}, got ${session.amount_total}`);
      return;
    }

    const creditsAmount = getTotalCredits(pkg);

    // Dedup: check if this payment_intent was already processed
    const paymentIntentId = session.payment_intent as string;
    if (paymentIntentId) {
      const { data: existing } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('payment_id', paymentIntentId)
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(`Payment ${paymentIntentId} already processed for user ${userId}, skipping`);
        return;
      }
    }

    console.log(`Processing payment for user ${userId}: ${creditsAmount} product credits`);

    // Resolve invoice number from Stripe if available
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

    if (!organizationId) {
      const result = await addCredit(userId, creditsAmount, 'purchase', {
        paymentId: session.payment_intent as string,
        invoiceNumber,
        reason: `Legacy Stripe purchase: ${packageId} package`,
        metadata: {
          sessionId: session.id,
          packageId,
          amountPaid: (session.amount_total || 0) / 100,
          customerEmail: session.customer_email,
          legacyCreditUnit: 'account_credit',
        },
      });
      console.log(`Successfully added ${creditsAmount} legacy credits to user ${userId}. New balance: $${result.newBalance}`);
      return;
    }

    const grant = await grantTopUpCredits({
      organizationId,
      userId,
      credits: creditsAmount,
      paymentId: paymentIntentId,
      invoiceNumber,
      idempotencyKey: `top_up:${paymentIntentId || session.id}`,
      metadata: {
        sessionId: session.id,
        packageId,
        amountPaid: (session.amount_total || 0) / 100,
        customerEmail: session.customer_email,
      },
    });

    console.log(`Successfully granted ${creditsAmount} top-up credits to organization ${organizationId}. Grant: ${grant.id}`);
  } catch (error) {
    console.error('Error in handleCheckoutComplete:', error);
    throw error;
  }
}

/**
 * Handle refund - deduct credits from user account
 */
async function handleRefund(charge: Stripe.Charge) {
  try {
    // Find the original transaction by payment intent
    const paymentIntent = charge.payment_intent as string;

    console.log(`Processing refund for payment: ${paymentIntent}`);

    if (!paymentIntent) {
      console.warn('[STRIPE] Refund missing payment_intent, skipping');
      return;
    }

    const { data: originalTx } = await supabaseAdmin
      .from('credit_transactions')
      .select('id, user_id, amount, invoice_number, payment_id, metadata')
      .eq('payment_id', paymentIntent)
      .eq('transaction_type', 'purchase')
      .maybeSingle();

    if (!originalTx) {
      console.warn(`[STRIPE] No original purchase found for payment_intent ${paymentIntent}`);
      return;
    }

    const refundId = charge.refunds?.data?.[0]?.id || charge.id;
    if (refundId) {
      const { data: existingRefund } = await supabaseAdmin
        .from('credit_transactions')
        .select('id')
        .eq('payment_id', paymentIntent)
        .eq('transaction_type', 'refund')
        .contains('metadata', { refundId })
        .maybeSingle();

      if (existingRefund) {
        console.log(`[STRIPE] Refund ${refundId} already processed, skipping`);
        return;
      }
    }

    const refundedCents = charge.amount_refunded || 0;
    const totalCents = charge.amount || 0;
    if (!totalCents || refundedCents <= 0) {
      console.warn('[STRIPE] Refund amount is zero, skipping');
      return;
    }

    const ratio = refundedCents / totalCents;
    const originalCredits = Number(originalTx.amount);
    const refundCredits = Number((originalCredits * ratio).toFixed(4));

    if (refundCredits <= 0) {
      console.warn('[STRIPE] Computed refund credits is zero, skipping');
      return;
    }

    const metadata = originalTx.metadata && typeof originalTx.metadata === 'object' ? originalTx.metadata : {};
    if (metadata.creditUnit === 'plan_credit' && typeof metadata.grantId === 'string') {
      const { data: grantRow, error: grantError } = await supabaseAdmin
        .from('billing_credit_grants')
        .select('credits_remaining')
        .eq('id', metadata.grantId)
        .maybeSingle() as { data: { credits_remaining: string | number } | null; error: any };

      if (grantError || !grantRow) {
        console.warn(`[STRIPE] Could not locate credit grant ${metadata.grantId} for refund ${refundId}`);
        return;
      }

      const currentRemaining = Number(grantRow.credits_remaining || 0);
      const revokedCredits = Number(Math.min(currentRemaining, refundCredits).toFixed(4));
      const unrecoveredCredits = Number(Math.max(0, refundCredits - revokedCredits).toFixed(4));
      const nextRemaining = Number(Math.max(0, currentRemaining - revokedCredits).toFixed(4));
      const { error: updateError } = await supabaseAdmin
        .from('billing_credit_grants')
        .update({
          credits_remaining: nextRemaining,
          metadata_json: {
            ...metadata,
            refundedCredits: refundCredits,
            revokedCredits,
            unrecoveredRefundCredits: unrecoveredCredits,
            refundId,
            refundedAt: new Date().toISOString(),
          },
        } as any)
        .eq('id', metadata.grantId);

      if (updateError) {
        throw new Error(updateError.message || 'Failed to refund top-up credit grant');
      }

      await supabaseAdmin.from('credit_transactions').insert({
        user_id: originalTx.user_id,
        amount: -revokedCredits,
        balance_before: currentRemaining,
        balance_after: nextRemaining,
        transaction_type: 'refund',
        payment_id: paymentIntent,
        invoice_number: originalTx.invoice_number || undefined,
        reason: 'Stripe top-up refund',
        metadata: {
          ...metadata,
          refundId,
          paymentIntent,
          chargeId: charge.id,
          creditUnit: 'plan_credit',
          refundedCredits: refundCredits,
          revokedCredits,
          unrecoveredRefundCredits: unrecoveredCredits,
        },
      } as any);

      console.log(`[STRIPE] Refunded ${refundCredits} top-up credits for ${paymentIntent}`);
      return;
    }

    await debitCredit(originalTx.user_id, refundCredits, undefined, {
      transactionType: 'refund',
      invoiceNumber: originalTx.invoice_number || undefined,
      reason: 'Stripe refund',
      metadata: {
        refundId,
        paymentIntent,
        refundedAmount: refundedCents / 100,
        originalAmount: totalCents / 100,
        refundRatio: ratio,
        chargeId: charge.id,
      },
    });

    console.log(`[STRIPE] Refunded ${refundCredits} credits for ${paymentIntent}`);
  } catch (error) {
    console.error('Error in handleRefund:', error);
    throw error;
  }
}
