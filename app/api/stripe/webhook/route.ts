/**
 * Stripe Webhook Handler
 * Processes Stripe events (payment completion, refunds, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addStripePurchaseCredit, debitCredit } from '@/lib/billing/credit';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';
import { isSubscriptionUsable, upsertOrganizationSubscriptionFromStripe } from '@/lib/billing/subscriptions';
import { ensureCurrentPlanCreditGrant, grantTopUpCredits } from '@/lib/billing/plan-credits';
import {
  notifyCreditsAdded,
  notifyPaymentFailed,
  notifyPlanUpdated,
} from '@/lib/notifications/notification-events';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const WEBHOOK_LEDGER_MISSING_CODES = new Set(['42P01', 'PGRST205']);
const WEBHOOK_PROCESSING_STALE_MS = 15 * 60 * 1000;

type WebhookLedgerStatus = 'processing' | 'processed' | 'failed' | 'ignored';

type BeginWebhookLedgerResult = {
  skip: boolean;
  disabled: boolean;
  reason?: 'duplicate_final' | 'already_processing' | 'retry_not_claimed';
};

function webhookObjectId(event: Stripe.Event): string | null {
  const object = event.data?.object as { id?: string } | undefined;
  return typeof object?.id === 'string' ? object.id : null;
}

function isLedgerMissing(error: any) {
  return error && WEBHOOK_LEDGER_MISSING_CODES.has(error.code);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function getPaymentIntentId(session: Stripe.Checkout.Session): string | undefined {
  if (!session.payment_intent) return undefined;
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
}

function processingStartedAt(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isProcessingStale(startedAt: unknown, now = Date.now()) {
  const timestamp = processingStartedAt(startedAt);
  return timestamp === null || now - timestamp > WEBHOOK_PROCESSING_STALE_MS;
}

async function claimExistingWebhookLedger(event: Stripe.Event, existing: any): Promise<BeginWebhookLedgerResult> {
  if (existing?.status === 'processed' || existing?.status === 'ignored') {
    console.log(`[STRIPE] Webhook event ${event.id} already ${existing.status}; skipping duplicate delivery`);
    return { skip: true, disabled: false, reason: 'duplicate_final' };
  }

  if (existing?.status === 'processing' && !isProcessingStale(existing.processing_started_at)) {
    console.log(`[STRIPE] Webhook event ${event.id} is already processing; skipping overlapping delivery`);
    return { skip: true, disabled: false, reason: 'already_processing' };
  }

  let claimQuery = supabaseAdmin
    .from('stripe_webhook_events')
    .update({
      status: 'processing',
      attempts: Number(existing?.attempts || 0) + 1,
      processing_started_at: new Date().toISOString(),
      last_error: null,
      payload: event as any,
    } as any)
    .eq('event_id', event.id);

  if (existing?.status === 'processing') {
    claimQuery = claimQuery.eq('status', 'processing');
    if (typeof existing.processing_started_at === 'string' && existing.processing_started_at) {
      claimQuery = claimQuery.eq('processing_started_at', existing.processing_started_at);
    } else {
      claimQuery = claimQuery.is('processing_started_at', null);
    }
  } else {
    claimQuery = claimQuery.eq('status', existing?.status || 'failed');
  }

  const { data: claimed, error: updateError } = await claimQuery
    .select('event_id')
    .maybeSingle() as { data: any; error: any };

  if (updateError) {
    if (isLedgerMissing(updateError)) {
      console.warn('[STRIPE] stripe_webhook_events table missing during retry claim; continuing');
      return { skip: false, disabled: true };
    }
    throw new Error(`Failed to claim Stripe webhook event ${event.id}: ${updateError.message}`);
  }

  if (!claimed) {
    console.log(`[STRIPE] Webhook event ${event.id} retry was not claimed; skipping duplicate delivery`);
    return { skip: true, disabled: false, reason: 'retry_not_claimed' };
  }

  return { skip: false, disabled: false };
}

export async function beginWebhookLedger(event: Stripe.Event): Promise<BeginWebhookLedgerResult> {
  const { error } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      api_version: event.api_version || null,
      object_id: webhookObjectId(event),
      status: 'processing',
      attempts: 1,
      received_at: new Date(event.created * 1000).toISOString(),
      processing_started_at: new Date().toISOString(),
      payload: event as any,
    } as any) as { error: any };

  if (!error) {
    return { skip: false, disabled: false };
  }

  if (isLedgerMissing(error)) {
    console.warn('[STRIPE] stripe_webhook_events table missing; continuing without persisted event ledger');
    return { skip: false, disabled: true };
  }

  if (error.code !== '23505') {
    throw new Error(`Failed to record Stripe webhook event ${event.id}: ${error.message}`);
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('status, attempts, processing_started_at')
    .eq('event_id', event.id)
    .maybeSingle() as { data: any; error: any };

  if (lookupError) {
    if (isLedgerMissing(lookupError)) {
      console.warn('[STRIPE] stripe_webhook_events table missing during duplicate lookup; continuing');
      return { skip: false, disabled: true };
    }
    throw new Error(`Failed to read Stripe webhook event ${event.id}: ${lookupError.message}`);
  }

  return claimExistingWebhookLedger(event, existing);
}

async function finishWebhookLedger(eventId: string, status: WebhookLedgerStatus, error?: unknown) {
  const { error: updateError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .update({
      status,
      processed_at: status === 'processed' || status === 'ignored' ? new Date().toISOString() : null,
      last_error: error ? errorMessage(error).slice(0, 4000) : null,
    } as any)
    .eq('event_id', eventId) as { error: any };

  if (updateError && !isLedgerMissing(updateError)) {
    console.warn(`[STRIPE] Failed to update webhook ledger for ${eventId}:`, updateError);
  }
}

export async function POST(request: NextRequest) {
  let event: Stripe.Event | null = null;
  let ledgerDisabled = false;

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
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    const ledger = await beginWebhookLedger(event);
    ledgerDisabled = ledger.disabled;

    if (ledger.skip) {
      return NextResponse.json({ received: true, duplicate: true });
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
        if (!ledgerDisabled) await finishWebhookLedger(event.id, 'ignored');
        return NextResponse.json({ received: true, ignored: true });
    }

    if (!ledgerDisabled) await finishWebhookLedger(event.id, 'processed');
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    if (event && !ledgerDisabled) {
      await finishWebhookLedger(event.id, 'failed', error);
    }
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

  if (synced) {
    const metadata = {
      eventType,
      subscriptionId: synced.id,
      stripeSubscriptionId: synced.stripeSubscriptionId,
      planSlug: synced.plan?.slug || null,
      status: synced.status,
    };
    if (eventType === 'invoice.payment_failed') {
      await notifyPaymentFailed({
        organizationId: synced.organizationId,
        idempotencyKey: `payment_failed:${eventType}:${synced.stripeSubscriptionId || synced.id}`,
        metadata,
      });
    } else {
      await notifyPlanUpdated({
        organizationId: synced.organizationId,
        planName: synced.plan?.name || 'Your plan',
        idempotencyKey: `plan_changed:${eventType}:${synced.stripeSubscriptionId || synced.id}`,
        metadata,
      });
    }
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
    const paymentIntentId = getPaymentIntentId(session);

    // Dedup: check if this payment_intent was already processed
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
      const result = await addStripePurchaseCredit({
        userId,
        amount: creditsAmount,
        paymentId: paymentIntentId,
        sessionId: session.id,
        invoiceNumber,
        reason: `Legacy Stripe purchase: ${packageId} package`,
        metadata: {
          packageId,
          credits: pkg.credits,
          expiresAfterMonths: pkg.expiresAfterMonths,
          amountPaid: (session.amount_total || 0) / 100,
          customerEmail: session.customer_email,
          legacyCreditUnit: 'account_credit',
        },
      });
      if (result.alreadyProcessed) {
        console.log(`Payment ${paymentIntentId || session.id} already processed for user ${userId}, skipping`);
        return;
      }
      console.log(`Successfully added ${creditsAmount} legacy credits to user ${userId}. New balance: ${result.newBalance}`);
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
    await notifyCreditsAdded({
      organizationId,
      actorUserId: userId,
      credits: creditsAmount,
      idempotencyKey: `top_up:${paymentIntentId || session.id}`,
      metadata: {
        sessionId: session.id,
        packageId,
        paymentIntentId: paymentIntentId || null,
        credits: creditsAmount,
      },
    });
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
    const paymentIntent = getStripeId(charge.payment_intent as any);

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
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!originalTx) {
      console.warn(`[STRIPE] No original purchase found for payment_intent ${paymentIntent}`);
      return;
    }

    const refundId = charge.refunds?.data?.[0]?.id || charge.id;

    const refundedCents = charge.amount_refunded || 0;
    const totalCents = charge.amount || 0;
    if (!totalCents || refundedCents <= 0) {
      console.warn('[STRIPE] Refund amount is zero, skipping');
      return;
    }

    const ratio = refundedCents / totalCents;
    const originalCredits = Math.abs(Number(originalTx.amount));
    const cumulativeRefundCredits = Number((originalCredits * ratio).toFixed(4));

    const { data: refundRows, error: refundLookupError } = await supabaseAdmin
      .from('credit_transactions')
      .select('amount')
      .eq('payment_id', paymentIntent)
      .eq('transaction_type', 'refund') as { data: Array<{ amount: string | number }> | null; error: any };

    if (refundLookupError) {
      throw new Error(refundLookupError.message || 'Failed to load prior refunds');
    }

    const alreadyRefundedCredits = Number(
      ((refundRows || []).reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)).toFixed(4)
    );
    const refundCredits = Number(Math.max(0, cumulativeRefundCredits - alreadyRefundedCredits).toFixed(4));

    if (refundCredits <= 0) {
      console.log(`[STRIPE] Refund for ${paymentIntent} already applied up to ${alreadyRefundedCredits} credits, skipping`);
      return;
    }

    const metadata = originalTx.metadata && typeof originalTx.metadata === 'object' ? originalTx.metadata : {};
    if (metadata.creditUnit === 'plan_credit' && typeof metadata.grantId === 'string') {
      const { data: grantRow, error: grantError } = await supabaseAdmin
        .from('billing_credit_grants')
        .select('credits_remaining, metadata_json')
        .eq('id', metadata.grantId)
        .maybeSingle() as { data: { credits_remaining: string | number; metadata_json?: any } | null; error: any };

      if (grantError || !grantRow) {
        console.warn(`[STRIPE] Could not locate credit grant ${metadata.grantId} for refund ${refundId}`);
        return;
      }

      const currentRemaining = Number(grantRow.credits_remaining || 0);
      const revokedCredits = Number(Math.min(currentRemaining, refundCredits).toFixed(4));
      const unrecoveredCredits = Number(Math.max(0, refundCredits - revokedCredits).toFixed(4));
      const nextRemaining = Number(Math.max(0, currentRemaining - revokedCredits).toFixed(4));
      const grantMetadata = grantRow.metadata_json && typeof grantRow.metadata_json === 'object'
        ? grantRow.metadata_json
        : {};
      const { error: updateError } = await supabaseAdmin
        .from('billing_credit_grants')
        .update({
          credits_remaining: nextRemaining,
          metadata_json: {
            ...grantMetadata,
            cumulativeRefundCredits,
            alreadyRefundedCredits,
            latestRefundCredits: refundCredits,
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

      const { error: txError } = await supabaseAdmin.from('credit_transactions').insert({
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
          cumulativeRefundCredits,
          alreadyRefundedCredits,
          refundedCredits: refundCredits,
          revokedCredits,
          unrecoveredRefundCredits: unrecoveredCredits,
        },
      } as any);

      if (txError) {
        throw new Error(txError.message || 'Failed to log top-up refund transaction');
      }

      console.log(`[STRIPE] Refunded ${revokedCredits} top-up credits for ${paymentIntent}`);
      return;
    }

    await debitCredit(originalTx.user_id, refundCredits, undefined, {
      transactionType: 'refund',
      paymentId: paymentIntent,
      invoiceNumber: originalTx.invoice_number || undefined,
      reason: 'Stripe refund',
      metadata: {
        refundId,
        paymentIntent,
        refundedAmount: refundedCents / 100,
        originalAmount: totalCents / 100,
        refundRatio: ratio,
        cumulativeRefundCredits,
        alreadyRefundedCredits,
        refundedCredits: refundCredits,
        chargeId: charge.id,
      },
    });

    console.log(`[STRIPE] Refunded ${refundCredits} credits for ${paymentIntent}`);
  } catch (error) {
    console.error('Error in handleRefund:', error);
    throw error;
  }
}
