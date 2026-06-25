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
import { grantTopUpCredits } from '@/lib/billing/plan-credits';
import { getStripeClient } from '@/lib/billing/stripe-runtime';

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
          creditUnit: session.metadata?.creditUnit === 'plan_credit' || session.metadata?.organizationId
            ? 'plan_credit'
            : 'legacy_usd',
        });
      }
    }

    // Add credits
    const packageId = session.metadata?.packageId;
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

    const organizationId = session.metadata?.organizationId;
    if (organizationId) {
      const grant = await grantTopUpCredits({
        organizationId,
        userId: user.id,
        credits: creditsAmount,
        paymentId: paymentIntentId,
        invoiceNumber,
        idempotencyKey: `top_up:${paymentIntentId || session.id}`,
        metadata: {
          sessionId: session.id,
          packageId,
          amountPaid: (session.amount_total || 0) / 100,
          customerEmail: session.customer_email,
          verifiedViaSuccessPage: true,
        },
      });

      console.log(`Successfully granted ${creditsAmount} top-up credits to organization ${organizationId}. Grant: ${grant.id}`);
      return NextResponse.json({
        success: true,
        alreadyProcessed: false,
        creditsAdded: creditsAmount,
        grantId: grant.id,
        creditUnit: 'plan_credit',
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
