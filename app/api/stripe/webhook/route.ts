/**
 * Stripe Webhook Handler
 * Processes Stripe events (payment completion, refunds, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addCredit } from '@/lib/billing/credit';
import { supabaseAdmin } from '@/lib/supabase/server';

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
        await handleCheckoutComplete(session);
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

/**
 * Handle successful checkout - add credits to user account
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  try {
    const userId = session.metadata?.userId;
    const creditsAmount = parseFloat(session.metadata?.creditsAmount || '0');
    const baseAmount = parseFloat(session.metadata?.baseAmount || '0');
    const bonusAmount = parseFloat(session.metadata?.bonusAmount || '0');
    const packageId = session.metadata?.packageId;

    if (!userId || !creditsAmount) {
      console.error('Missing metadata in checkout session:', session.id);
      return;
    }

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

    console.log(`Processing payment for user ${userId}: $${creditsAmount} credits`);

    // Add credits to user account
    const result = await addCredit(userId, creditsAmount, 'purchase', {
      paymentId: session.payment_intent as string,
      reason: `Stripe purchase: ${packageId} package`,
      metadata: {
        sessionId: session.id,
        packageId,
        baseAmount,
        bonusAmount,
        amountPaid: (session.amount_total || 0) / 100, // Convert cents to dollars
        customerEmail: session.customer_email,
      },
    });

    console.log(`Successfully added ${creditsAmount} credits to user ${userId}. New balance: $${result.newBalance}`);
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

    // TODO: Implement refund logic
    // This would involve:
    // 1. Finding the original credit transaction by payment_id
    // 2. Deducting the refunded amount from user's balance
    // 3. Creating a new transaction with type 'refund' (negative amount)

    console.warn('Refund handling not fully implemented yet');
  } catch (error) {
    console.error('Error in handleRefund:', error);
    throw error;
  }
}
