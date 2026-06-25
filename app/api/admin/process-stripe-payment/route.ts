/**
 * Admin Endpoint: Process Stripe Payment
 * Manually process a Stripe payment by session ID
 * Use this to retroactively process payments when webhooks didn't fire
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';
import { addStripePurchaseCredit } from '@/lib/billing/credit';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';
import { isAdminEmail } from '@/lib/admin-access';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

function getPaymentIntentId(session: Stripe.Checkout.Session): string | undefined {
  if (!session.payment_intent) return undefined;
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
}

async function findProcessedPurchase(userId: string, sessionId: string, paymentIntentId?: string) {
  if (paymentIntentId) {
    const { data } = await supabaseAdmin
      .from('credit_transactions')
      .select('id, amount, created_at, payment_id, metadata')
      .eq('user_id', userId)
      .eq('payment_id', paymentIntentId)
      .eq('transaction_type', 'purchase')
      .limit(1)
      .maybeSingle();

    if (data) return data;
  }

  const { data } = await supabaseAdmin
    .from('credit_transactions')
    .select('id, amount, created_at, payment_id, metadata')
    .eq('user_id', userId)
    .eq('transaction_type', 'purchase')
    .contains('metadata', { sessionId })
    .limit(1)
    .maybeSingle();

  return data || null;
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
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    console.log(`Admin processing payment for session: ${sessionId}`);

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        {
          error: 'Payment not completed',
          paymentStatus: session.payment_status,
          sessionId
        },
        { status: 400 }
      );
    }

    const userId = session.metadata?.userId;
    if (!userId) {
      return NextResponse.json(
        { error: 'No user ID in session metadata' },
        { status: 400 }
      );
    }

    if (session.metadata?.organizationId || session.metadata?.creditUnit === 'plan_credit') {
      return NextResponse.json(
        {
          error: 'Organization-scoped top-up recovery is not supported by this legacy recovery route',
          message: 'Do not process this payment into user-scoped legacy credits. Use the product-credit recovery path for organization-scoped top-ups.',
          sessionId,
          organizationId: session.metadata?.organizationId,
          creditUnit: session.metadata?.creditUnit || 'plan_credit',
        },
        { status: 409 }
      );
    }

    const paymentIntentId = getPaymentIntentId(session);

    // Check if already processed
    const existingTransaction = await findProcessedPurchase(userId, session.id, paymentIntentId);

    if (existingTransaction) {
      return NextResponse.json({
        success: false,
        alreadyProcessed: true,
        message: 'Payment already processed',
        transaction: existingTransaction,
        sessionId,
        paymentIntentId,
      });
    }

    // Process the payment
    const packageId = session.metadata?.packageId;
    const pkg = resolveCreditPackage(packageId || '');

    if (!pkg) {
      return NextResponse.json(
        { error: 'Invalid credit package in session' },
        { status: 400 }
      );
    }

    const expectedAmountCents = Math.round(pkg.price * 100);
    if ((session.amount_total || 0) !== expectedAmountCents) {
      return NextResponse.json(
        { error: 'Checkout amount mismatch in session' },
        { status: 400 }
      );
    }

    const creditsAmount = getTotalCredits(pkg);

    console.log(`Processing ${creditsAmount} credits for user ${userId}`);

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

    const result = await addStripePurchaseCredit({
      userId,
      amount: creditsAmount,
      paymentId: paymentIntentId,
      sessionId: session.id,
      invoiceNumber,
      reason: `Stripe purchase: ${packageId} package (admin processed)`,
      metadata: {
        packageId,
        credits: pkg.credits,
        expiresAfterMonths: pkg.expiresAfterMonths,
        amountPaid: (session.amount_total || 0) / 100,
        customerEmail: session.customer_email,
        adminProcessed: true,
        processedAt: new Date().toISOString(),
      },
    });

    if (result.alreadyProcessed) {
      return NextResponse.json({
        success: false,
        alreadyProcessed: true,
        message: 'Payment already processed',
        transaction: {
          id: result.transactionId,
          balance_after: result.newBalance,
        },
        sessionId,
        paymentIntentId,
      });
    }

    console.log(`Successfully added ${creditsAmount} credits to user ${userId}`);
    return NextResponse.json({
      success: true,
      creditsAdded: creditsAmount,
      newBalance: result.newBalance,
      transactionId: result.transactionId,
      creditUnit: 'legacy_usd',
      sessionId,
      paymentIntentId,
      userId,
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    return NextResponse.json(
      {
        error: 'Failed to process payment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
