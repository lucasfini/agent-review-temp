/**
 * Stripe Checkout Session Creation
 * Creates a Stripe checkout session for credit purchases
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

// Credit packages matching the UI
const PACKAGES = {
  starter: { amount: 10, price: 10, bonus: 0 },
  basic: { amount: 25, price: 25, bonus: 2 },
  pro: { amount: 50, price: 50, bonus: 5 },
  enterprise: { amount: 100, price: 100, bonus: 15 },
} as const;

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
    const { packageId } = body;

    // Validate package
    if (!packageId || !(packageId in PACKAGES)) {
      return NextResponse.json(
        { error: 'Invalid package selected' },
        { status: 400 }
      );
    }

    const pkg = PACKAGES[packageId as keyof typeof PACKAGES];
    const totalCredits = pkg.amount + pkg.bonus;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pkg.amount} Credits`,
              description: pkg.bonus > 0
                ? `${pkg.amount} credits + ${pkg.bonus} bonus credits`
                : `${pkg.amount} credits`,
              images: [], // Optional: Add your logo URL here
            },
            unit_amount: pkg.price * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing/cancel`,
      metadata: {
        userId: user.id,
        packageId,
        creditsAmount: totalCredits.toString(),
        baseAmount: pkg.amount.toString(),
        bonusAmount: pkg.bonus.toString(),
      },
      customer_email: user.email,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
