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

    // Demo account guard
    if (user.email === process.env.DEMO_EMAIL) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { packageId, customAmount } = body;

    // Validate package
    if (!packageId || (!(packageId in PACKAGES) && packageId !== 'custom')) {
      return NextResponse.json(
        { error: 'Invalid package selected' },
        { status: 400 }
      );
    }

    let pkg = PACKAGES[packageId as keyof typeof PACKAGES];
    if (packageId === 'custom') {
      const amount = Number(customAmount);
      if (!Number.isFinite(amount) || amount < 5) {
        return NextResponse.json(
          { error: 'Custom amount must be at least $5' },
          { status: 400 }
        );
      }
      pkg = { amount, price: amount, bonus: 0 };
    }

    const totalCredits = pkg.amount + pkg.bonus;
    const unitAmountCents = Math.round(pkg.price * 100);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      invoice_creation: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pkg.amount} Credits`,
              description: pkg.bonus > 0
                ? `${pkg.amount} credits + ${pkg.bonus} bonus credits`
                : packageId === 'custom'
                  ? `Custom credit purchase`
                  : `${pkg.amount} credits`,
              images: [], // Optional: Add your logo URL here
            },
            unit_amount: unitAmountCents, // Convert to cents
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
        creditsAmount: totalCredits.toFixed(2),
        baseAmount: pkg.amount.toFixed(2),
        bonusAmount: pkg.bonus.toFixed(2),
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
