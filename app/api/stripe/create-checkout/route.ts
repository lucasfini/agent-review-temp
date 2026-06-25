/**
 * Stripe Checkout Session Creation
 * Creates a Stripe checkout session for credit purchases
 */

import { NextRequest, NextResponse } from 'next/server';
import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { requireOrganizationBillingManager } from '@/lib/authz/billing-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { getAppBaseUrl } from '@/lib/app-url';
import { getTotalCredits, resolveCreditPackage } from '@/lib/billing/credit-packages';
import { formatProductCredits } from '@/lib/billing/product-credits';
import { getOrCreateCreditSubscription } from '@/lib/billing/plan-credits';
import { getStripeClient } from '@/lib/billing/stripe-runtime';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);

    // Demo account guard
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { packageId } = body;
    const requestedOrganizationId = typeof body?.organization_id === 'string'
      ? body.organization_id
      : null;

    // Validate package
    if (!packageId) {
      return NextResponse.json(
        { error: 'Invalid package selected' },
        { status: 400 }
      );
    }

    const pkg = resolveCreditPackage(packageId);
    if (!pkg) {
      return NextResponse.json(
        { error: 'Invalid package selected' },
        { status: 400 }
      );
    }

    const { organization } = await requireOrganizationBillingManager({
      userId: user.id,
      requestedOrganizationId,
    });
    const organizationId = organization.id;
    const subscription = await getOrCreateCreditSubscription({ organizationId });
    if (!subscription.plan?.topUpEnabled) {
      return NextResponse.json(
        {
          error: 'Top-ups are not available on the Free plan. Upgrade to buy credits.',
          code: 'TOP_UPS_DISABLED',
          upgradeRequired: true,
          planSlug: subscription.plan?.slug || null,
        },
        { status: 403 }
      );
    }

    const unitAmountCents = Math.round(pkg.price * 100);
    const appBaseUrl = getAppBaseUrl();
    const totalCredits = getTotalCredits(pkg);
    const totalCreditsLabel = `${formatProductCredits(totalCredits)} product credits`;

    // Create Stripe checkout session
    const stripe = getStripeClient('top-up checkout');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      invoice_creation: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: totalCreditsLabel,
              description: `Top-up credits expire after ${pkg.expiresAfterMonths} months`,
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
        organizationId,
        packageId,
        credits: String(totalCredits),
        expiresAfterMonths: String(pkg.expiresAfterMonths),
        creditUnit: 'plan_credit',
      },
      customer_email: user.email,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
