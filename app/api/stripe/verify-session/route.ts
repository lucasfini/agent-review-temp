/**
 * Stripe Session Verification
 * Verifies payment and adds credits if webhook hasn't processed yet
 * This is a fallback for local development where webhooks don't work
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';
import { addCredit } from '@/lib/billing/credit';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

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

    if (user.email === process.env.DEMO_EMAIL) {
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
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify session belongs to this user
    if (session.metadata?.userId !== user.id) {
      return NextResponse.json(
        { error: 'Session does not belong to this user' },
        { status: 403 }
      );
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed', paymentStatus: session.payment_status },
        { status: 400 }
      );
    }

    // Dedup: check if this payment_intent was already processed (by webhook or prior verify call)
    const paymentIntentId = session.payment_intent as string;
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
        });
      }
    }

    // Add credits
    const packageId = session.metadata?.packageId;
    const pkg = resolveCreditPackage(
      packageId || '',
      session.metadata?.customAmount ? Number(session.metadata.customAmount) : undefined
    );

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

    console.log(`Processing payment verification for user ${user.id}: $${creditsAmount} credits`);

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

    const result = await addCredit(user.id, creditsAmount, 'purchase', {
      paymentId: session.payment_intent as string,
      invoiceNumber,
      reason: `Stripe purchase: ${packageId} package (verified on success page)`,
      metadata: {
        sessionId: session.id,
        packageId,
        baseAmount: pkg.amount,
        bonusAmount: pkg.bonus,
        amountPaid: (session.amount_total || 0) / 100,
        customerEmail: session.customer_email,
        verifiedViaSuccessPage: true,
      },
    });

    if (result.success) {
      console.log(`Successfully added ${creditsAmount} credits to user ${user.id}. New balance: $${result.newBalance}`);
      return NextResponse.json({
        success: true,
        alreadyProcessed: false,
        creditsAdded: creditsAmount,
        newBalance: result.newBalance,
      });
    } else {
      throw new Error('Failed to add credits');
    }
  } catch (error) {
    console.error('Error verifying session:', error);
    return NextResponse.json(
      { error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}
