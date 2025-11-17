/**
 * Stripe Session Verification
 * Verifies payment and adds credits if webhook hasn't processed yet
 * This is a fallback for local development where webhooks don't work
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';
import { addCredit } from '@/lib/billing/credit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
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

    // Check if credits already added (check for existing transaction with this session)
    const { data: existingTransaction } = await supabaseAdmin
      .from('credit_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('transaction_type', 'purchase')
      .contains('metadata', { sessionId })
      .single();

    if (existingTransaction) {
      console.log(`Credits already added for session ${sessionId}`);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        message: 'Credits already added',
      });
    }

    // Add credits
    const creditsAmount = parseFloat(session.metadata?.creditsAmount || '0');
    const baseAmount = parseFloat(session.metadata?.baseAmount || '0');
    const bonusAmount = parseFloat(session.metadata?.bonusAmount || '0');
    const packageId = session.metadata?.packageId;

    if (!creditsAmount) {
      return NextResponse.json(
        { error: 'Invalid credits amount' },
        { status: 400 }
      );
    }

    console.log(`Processing payment verification for user ${user.id}: $${creditsAmount} credits`);

    const result = await addCredit(user.id, creditsAmount, 'purchase', {
      paymentId: session.payment_intent as string,
      reason: `Stripe purchase: ${packageId} package (verified on success page)`,
      metadata: {
        sessionId: session.id,
        packageId,
        baseAmount,
        bonusAmount,
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
