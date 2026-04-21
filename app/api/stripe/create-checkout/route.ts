/**
 * Stripe Checkout Session Creation
 * Creates a Stripe checkout session for credit purchases
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isDemoUser } from '@/lib/demo-mode';
import { getAppBaseUrl } from '@/lib/app-url';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';
import { formatSiteCreditsFromUsd } from '@/lib/billing/display';

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

    // Demo account guard
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { packageId, customAmount } = body;

    // Validate package
    if (!packageId) {
      return NextResponse.json(
        { error: 'Invalid package selected' },
        { status: 400 }
      );
    }

    const pkg = resolveCreditPackage(packageId, customAmount);
    if (!pkg) {
      return NextResponse.json(
        { error: 'Invalid package selected' },
        { status: 400 }
      );
    }

    const unitAmountCents = Math.round(pkg.price * 100);
    const appBaseUrl = getAppBaseUrl();
    const totalCreditsLabel = formatSiteCreditsFromUsd(getTotalCredits(pkg));
    const baseCreditsLabel = formatSiteCreditsFromUsd(pkg.amount);
    const bonusCreditsLabel = pkg.bonus > 0 ? formatSiteCreditsFromUsd(pkg.bonus) : null;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      invoice_creation: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: totalCreditsLabel,
              description: pkg.bonus > 0
                ? `${baseCreditsLabel} + ${bonusCreditsLabel} bonus`
                : packageId === 'custom'
                  ? `Custom credit purchase - ${formatSiteCreditsFromUsd(pkg.amount)}`
                  : baseCreditsLabel,
              images: [], // Optional: Add your logo URL here
            },
            unit_amount: unitAmountCents, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/billing/cancel`,
      metadata: {
        userId: user.id,
        packageId,
        customAmount: packageId === 'custom' ? pkg.amount.toFixed(2) : '',
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
