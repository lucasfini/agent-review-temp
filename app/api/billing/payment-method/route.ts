import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getOrganizationStripeCustomerId } from '@/lib/billing/subscriptions';
import { getStripeClient } from '@/lib/billing/stripe-runtime';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeCardPaymentMethod(paymentMethod: any) {
  const card = paymentMethod?.card;
  if (!paymentMethod?.id || !card) return null;

  return {
    id: paymentMethod.id,
    brand: typeof card.brand === 'string' ? card.brand : 'card',
    last4: typeof card.last4 === 'string' ? card.last4 : null,
    expMonth: typeof card.exp_month === 'number' ? card.exp_month : null,
    expYear: typeof card.exp_year === 'number' ? card.exp_year : null,
    billingEmail: typeof paymentMethod.billing_details?.email === 'string'
      ? paymentMethod.billing_details.email
      : null,
    isDefault: true,
  };
}

function uniquePaymentMethods(paymentMethods: Array<ReturnType<typeof normalizeCardPaymentMethod>>) {
  const seen = new Set<string>();
  return paymentMethods.filter((paymentMethod) => {
    if (!paymentMethod || seen.has(paymentMethod.id)) return false;
    seen.add(paymentMethod.id);
    return true;
  });
}

function isMissingStripeCustomer(error: unknown): boolean {
  const candidate = error as { code?: string; statusCode?: number; param?: string } | null;
  return Boolean(candidate && candidate.code === 'resource_missing' && candidate.statusCode === 404);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const { organization } = await getActiveOrganizationForUser(supabaseAdmin, user.id, requestedOrganizationId);
    const stripeCustomerId = await getOrganizationStripeCustomerId(supabaseAdmin, organization.id);

    if (!stripeCustomerId) {
      return NextResponse.json({
        success: true,
        paymentMethod: null,
        paymentMethods: [],
        stripeCustomerId: null,
      });
    }

    const stripe = getStripeClient('billing payment method');
    let customer: any;
    try {
      customer = await stripe.customers.retrieve(stripeCustomerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
    } catch (stripeError) {
      if (isMissingStripeCustomer(stripeError)) {
        return NextResponse.json({
          success: true,
          paymentMethod: null,
          paymentMethods: [],
          stripeCustomerId,
          missingStripeCustomer: true,
        });
      }
      throw stripeError;
    }
    const defaultPaymentMethod = normalizeCardPaymentMethod(customer?.invoice_settings?.default_payment_method);
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
      limit: 10,
    });
    const defaultPaymentMethodId = defaultPaymentMethod?.id || null;
    const savedPaymentMethods = uniquePaymentMethods([
      defaultPaymentMethod
        ? {
            ...defaultPaymentMethod,
            billingEmail: defaultPaymentMethod.billingEmail || customer?.email || null,
          }
        : null,
      ...(paymentMethods?.data || []).map((paymentMethod: any) => {
        const normalized = normalizeCardPaymentMethod(paymentMethod);
        if (!normalized) return null;
        return {
          ...normalized,
          isDefault: normalized.id === defaultPaymentMethodId,
          billingEmail: normalized.billingEmail || customer?.email || null,
        };
      }),
    ]);
    const primaryPaymentMethod = savedPaymentMethods.find((paymentMethod) => paymentMethod?.isDefault)
      || savedPaymentMethods[0]
      || null;

    return NextResponse.json({
      success: true,
      stripeCustomerId,
      paymentMethod: primaryPaymentMethod,
      paymentMethods: savedPaymentMethods,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[BILLING_PAYMENT_METHOD] Failed to load payment method:', error);
    return NextResponse.json({ error: 'Failed to load payment method' }, { status: 500 });
  }
}
