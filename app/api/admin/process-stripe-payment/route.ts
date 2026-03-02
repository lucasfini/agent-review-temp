/**
 * Admin Endpoint: Process Stripe Payment
 * Manually process a Stripe payment by session ID
 * Use this to retroactively process payments when webhooks didn't fire
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';
import { addCredit } from '@/lib/billing/credit';
import { isAdminEmail } from '@/lib/admin-access';

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
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
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

    // Check if already processed
    const { data: existingTransaction } = await supabaseAdmin
      .from('credit_transactions')
      .select('id, amount, created_at')
      .eq('user_id', userId)
      .eq('transaction_type', 'purchase')
      .contains('metadata', { sessionId })
      .single();

    if (existingTransaction) {
      return NextResponse.json({
        success: false,
        alreadyProcessed: true,
        message: 'Payment already processed',
        transaction: existingTransaction,
      });
    }

    // Process the payment
    const creditsAmount = parseFloat(session.metadata?.creditsAmount || '0');
    const baseAmount = parseFloat(session.metadata?.baseAmount || '0');
    const bonusAmount = parseFloat(session.metadata?.bonusAmount || '0');
    const packageId = session.metadata?.packageId;

    if (!creditsAmount) {
      return NextResponse.json(
        { error: 'Invalid credits amount in session' },
        { status: 400 }
      );
    }

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

    const result = await addCredit(userId, creditsAmount, 'purchase', {
      paymentId: session.payment_intent as string,
      invoiceNumber,
      reason: `Stripe purchase: ${packageId} package (admin processed)`,
      metadata: {
        sessionId: session.id,
        packageId,
        baseAmount,
        bonusAmount,
        amountPaid: (session.amount_total || 0) / 100,
        customerEmail: session.customer_email,
        adminProcessed: true,
        processedAt: new Date().toISOString(),
      },
    });

    if (result.success) {
      console.log(`Successfully added ${creditsAmount} credits to user ${userId}`);
      return NextResponse.json({
        success: true,
        creditsAdded: creditsAmount,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
        sessionId,
        userId,
      });
    } else {
      throw new Error('Failed to add credits');
    }
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
