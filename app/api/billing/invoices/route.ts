import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import { getActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getOrganizationStripeCustomerId } from '@/lib/billing/subscriptions';
import { getStripeClient } from '@/lib/billing/stripe-runtime';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function mapInvoice(invoice: any) {
  const createdSeconds = typeof invoice.created === 'number' ? invoice.created : null;
  return {
    id: invoice.id,
    number: invoice.number || invoice.id,
    status: invoice.status || 'draft',
    currency: invoice.currency || 'usd',
    amountDue: Number(invoice.amount_due || 0),
    amountPaid: Number(invoice.amount_paid || 0),
    total: Number(invoice.total || invoice.amount_due || invoice.amount_paid || 0),
    createdAt: createdSeconds ? new Date(createdSeconds * 1000).toISOString() : null,
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdf: invoice.invoice_pdf || null,
  };
}

function isMissingStripeCustomer(error: unknown): boolean {
  const candidate = error as { code?: string; statusCode?: number } | null;
  return Boolean(candidate && candidate.code === 'resource_missing' && (candidate.statusCode === 400 || candidate.statusCode === 404));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get('organization_id');
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 12)));
    const { organization } = await getActiveOrganizationForUser(supabaseAdmin, user.id, requestedOrganizationId);
    const stripeCustomerId = await getOrganizationStripeCustomerId(supabaseAdmin, organization.id);

    if (!stripeCustomerId) {
      return NextResponse.json({ success: true, invoices: [] });
    }

    const stripe = getStripeClient('billing invoices');
    let invoices: any;
    try {
      invoices = await stripe.invoices.list({
        customer: stripeCustomerId,
        limit,
      });
    } catch (stripeError) {
      if (isMissingStripeCustomer(stripeError)) {
        return NextResponse.json({ success: true, invoices: [], missingStripeCustomer: true });
      }
      throw stripeError;
    }

    return NextResponse.json({
      success: true,
      invoices: Array.isArray(invoices?.data) ? invoices.data.map(mapInvoice) : [],
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[BILLING_INVOICES] Failed to load invoices:', error);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}
