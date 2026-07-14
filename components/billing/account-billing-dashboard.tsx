"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Clock, CreditCard, Download, Loader2, MoreHorizontal, Plus, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { DashboardPageShell } from '@/components/dashboard/shell';
import { useAuth } from '@/lib/auth/context';
import { canManageOrganizationBilling } from '@/lib/authz/billing-permission-rules';
import { CREDIT_PACKAGES } from '@/lib/billing/credit-packages';
import { formatProductCredits } from '@/lib/billing/product-credits';
import {
  buildPublicPricingPlans,
  formatPublicPlanPrice,
  getPublicPlanCardFeatures,
} from '@/lib/billing/public-pricing';
import { formatSubscriptionStatus, subscriptionHasUsableStatus } from '@/lib/billing/subscription-ui';
import { isPersonalWorkspaceType, isTeamWorkspacePlanSlug, isTeamWorkspaceType } from '@/lib/billing/workspace-plan-policy';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { useCurrentSubscription } from '@/lib/hooks/useCurrentSubscription';
import { useSubscriptionCheckout } from '@/lib/hooks/useSubscriptionCheckout';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type Balance = {
  balance: number;
  monthlyCreditGrant: number;
  currentPlanCredits: number;
  rolloverCredits: number;
  topUpCredits: number;
};

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  billingEmail: string | null;
  isDefault: boolean;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  currency: string;
  total: number;
  amountPaid: number;
  createdAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

const TOP_UP_OPTIONS = Object.entries(CREDIT_PACKAGES).map(([id, pkg]) => ({
  id,
  credits: pkg.credits,
  price: pkg.price,
}));

function currencyFromCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'paid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100';
    case 'past_due':
    case 'unpaid':
    case 'open':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300';
  }
}

function CardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_-44px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-950', className)}>
      {children}
    </section>
  );
}

function CurrentPlanCard({
  subscription,
  canManageBilling,
}: {
  subscription: ReturnType<typeof useCurrentSubscription>['subscription'];
  canManageBilling: boolean;
}) {
  const plan = subscription?.plan || null;
  const interval = subscription?.metadata?.billing_interval === 'year' || subscription?.metadata?.billing_interval === 'annual'
    ? 'year'
    : 'month';
  const publicPlan = plan ? buildPublicPricingPlans([plan])[0] || null : null;
  const price = publicPlan
    ? formatPublicPlanPrice(publicPlan, interval)
    : { main: 'No plan', suffix: '', helper: null };

  return (
    <CardShell>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge className={statusClass(subscription?.status)}>
              {formatSubscriptionStatus(subscription?.status)}
            </Badge>
            <h2 className="mt-5 text-xl font-bold text-slate-950 dark:text-white">{plan?.name || 'Subscription plan'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {publicPlan ? publicPlan.positioning : 'Choose a plan for your workspace.'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">{price.main}</p>
            {price.suffix && <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{price.suffix}</p>}
            {price.helper && <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">{price.helper}</p>}
          </div>
        </div>

        {publicPlan && (
          <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
            {getPublicPlanCardFeatures(publicPlan).map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/dashboard/billing/plans"
          aria-disabled={!canManageBilling}
          className={cn(
            'mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10',
            !canManageBilling && 'pointer-events-none opacity-60'
          )}
        >
          Change plan
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </CardShell>
  );
}

function CreditsCard({
  balance,
  topUpsEnabled,
  canManageBilling,
  organizationId,
}: {
  balance: Balance | null;
  topUpsEnabled: boolean;
  canManageBilling: boolean;
  organizationId?: string | null;
}) {
  const { session } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState(TOP_UP_OPTIONS[1]?.id || TOP_UP_OPTIONS[0]?.id || '');
  const [processing, setProcessing] = useState(false);
  const totalCredits = Number(balance?.balance || 0);
  const monthlyGrant = Number(balance?.monthlyCreditGrant || 0);
  const percentRemaining = monthlyGrant > 0
    ? Math.max(0, Math.min(100, Math.round((Number(balance?.currentPlanCredits || 0) / monthlyGrant) * 100)))
    : 0;
  const selected = TOP_UP_OPTIONS.find((option) => option.id === selectedPackage) || TOP_UP_OPTIONS[0];

  const buyTopUp = async () => {
    if (!session?.access_token || !selected || !topUpsEnabled) return;
    setProcessing(true);
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selected.id,
          organization_id: organizationId || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Failed to start top-up checkout');
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start top-up checkout');
      setProcessing(false);
    }
  };

  return (
    <CardShell>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Credits</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Credits remaining</p>
          </div>
          <div className="relative h-20 w-20 rounded-full bg-slate-100 p-2 dark:bg-white/10">
            <div
              className="h-full w-full rounded-full"
              style={{ background: `conic-gradient(#4f46e5 ${percentRemaining * 3.6}deg, rgba(148,163,184,0.25) 0deg)` }}
            />
            <div className="absolute inset-3 flex items-center justify-center rounded-full bg-white text-sm font-bold text-slate-950 dark:bg-slate-950 dark:text-white">
              {percentRemaining}%
            </div>
          </div>
        </div>

        <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
          {formatProductCredits(totalCredits)}
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {monthlyGrant > 0
            ? `${formatProductCredits(Number(balance?.currentPlanCredits || 0))} monthly credits left of ${formatProductCredits(monthlyGrant)}`
            : 'Credits are available for processing and generation.'}
        </p>

        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">Top up credits</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {topUpsEnabled ? 'Top-ups available when you need more credits.' : 'Top-ups unavailable on this plan.'}
              </p>
            </div>
            <WalletCards className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {TOP_UP_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedPackage(option.id)}
                disabled={!topUpsEnabled}
                className={cn(
                  'rounded-xl border px-3 py-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  selectedPackage === option.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                )}
              >
                <span className="block text-sm font-bold">{formatProductCredits(option.credits)}</span>
                <span className="mt-1 block text-xs">${option.price}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void buyTopUp()}
            disabled={!topUpsEnabled || !canManageBilling || processing}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {selected ? `Top up ${formatProductCredits(selected.credits)} credits · $${selected.price}` : 'Top up credits'}
          </button>
        </div>
      </div>
    </CardShell>
  );
}

function PaymentMethodCard({
  paymentMethods,
  loading,
  canManageBilling,
  hasStripeCustomer,
  openPortal,
  openingPortal,
}: {
  paymentMethods: PaymentMethod[];
  loading: boolean;
  canManageBilling: boolean;
  hasStripeCustomer: boolean;
  openPortal: () => Promise<void>;
  openingPortal: boolean;
}) {
  return (
    <CardShell>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Payment methods</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Saved cards for this workspace.</p>
          </div>
          <CreditCard className="h-5 w-5 text-slate-400" />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
          {loading ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />
          ) : paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map((paymentMethod) => {
                const brand = paymentMethod.brand ? paymentMethod.brand.toUpperCase() : 'CARD';
                const expiry = paymentMethod.expMonth && paymentMethod.expYear
                  ? `${String(paymentMethod.expMonth).padStart(2, '0')}/${paymentMethod.expYear}`
                  : null;

                return (
                  <div key={paymentMethod.id} className="flex items-center gap-4">
                    <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-black text-blue-700 dark:border-white/10 dark:bg-slate-950 dark:text-blue-200">
                      {brand}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                        {brand} ending in {paymentMethod.last4 || '----'}
                        {paymentMethod.isDefault && (
                          <span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 dark:border-white/20 dark:text-slate-300">
                            Default
                          </span>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {expiry && <span>Expires {expiry}</span>}
                        {paymentMethod.billingEmail && <span className="truncate">{paymentMethod.billingEmail}</span>}
                      </div>
                    </div>
                    <MoreHorizontal className="h-5 w-5 flex-shrink-0 text-slate-400" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold text-slate-950 dark:text-white">No saved payment method</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Add a card during checkout, then manage it here.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={!canManageBilling || !hasStripeCustomer || openingPortal}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        >
          {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {hasStripeCustomer ? 'Manage payment methods' : 'Add payment method'}
        </button>

        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4" />
          Card information is stored by Stripe.
        </p>
      </div>
    </CardShell>
  );
}

function BillingHistory({
  invoices,
  loading,
}: {
  invoices: Invoice[];
  loading: boolean;
}) {
  return (
    <CardShell>
      <div className="flex flex-col gap-4 border-b border-slate-200 p-6 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Billing history</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Download previous invoices and view payment details.</p>
        </div>
      </div>

      {loading ? (
        <div className="p-6">
          <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm font-bold text-slate-950 dark:text-white">No invoices yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Stripe invoices will appear here after billing activity.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-[0.08em] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <tr>
                  <th className="px-6 py-4">Invoice</th>
                  <th className="px-6 py-4">Billing date</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-950 dark:text-white">{invoice.number}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(invoice.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{currencyFromCents(invoice.total || invoice.amountPaid, invoice.currency)}</td>
                    <td className="px-6 py-4">
                      <Badge className={statusClass(invoice.status)}>{invoice.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {invoice.invoicePdf || invoice.hostedInvoiceUrl ? (
                        <a
                          href={invoice.invoicePdf || invoice.hostedInvoiceUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/10 lg:hidden">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-950 dark:text-white">{invoice.number}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(invoice.createdAt)}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-950 dark:text-white">{currencyFromCents(invoice.total || invoice.amountPaid, invoice.currency)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Badge className={statusClass(invoice.status)}>{invoice.status}</Badge>
                  {(invoice.invoicePdf || invoice.hostedInvoiceUrl) && (
                    <a href={invoice.invoicePdf || invoice.hostedInvoiceUrl || '#'} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-700 dark:text-blue-300">
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </CardShell>
  );
}

export default function AccountBillingDashboard() {
  const { user, session, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const { organizationId, refresh: refreshOrganization } = useCurrentOrganization();
  const {
    organization,
    membership,
    subscription,
    loading: loadingSubscription,
    error: subscriptionError,
    refresh,
  } = useCurrentSubscription(organizationId);
  const {
    openingPortal,
    error: portalError,
    openPortal,
  } = useSubscriptionCheckout(organizationId);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingBillingData, setLoadingBillingData] = useState(true);
  const [billingDataError, setBillingDataError] = useState<string | null>(null);
  const [verifyingCheckoutSession, setVerifyingCheckoutSession] = useState(false);
  const verifiedCheckoutSessionRef = useRef<string | null>(null);

  const canManageBilling = canManageOrganizationBilling(membership?.role, organization?.type);
  const topUpsEnabled = Boolean(subscription?.plan?.topUpEnabled);
  const error = subscriptionError || portalError || billingDataError;
  const workspaceName = organization?.name || 'this workspace';
  const isPersonalWorkspace = isPersonalWorkspaceType(organization?.type);
  const isTeamWorkspace = isTeamWorkspaceType(organization?.type);
  const hasPersonalTeamPlan = isPersonalWorkspace
    && subscriptionHasUsableStatus(subscription?.status)
    && isTeamWorkspacePlanSlug(subscription?.plan?.slug);

  const loadBillingData = useCallback(async (overrideOrganizationId?: string | null) => {
    if (!session?.access_token) {
      setLoadingBillingData(false);
      return;
    }

    const billingOrganizationId = overrideOrganizationId === undefined
      ? organizationId
      : overrideOrganizationId;

    setLoadingBillingData(true);
    setBillingDataError(null);
    try {
      const [balanceResponse, paymentResponse, invoicesResponse] = await Promise.all([
        fetch(withOrganizationId('/api/billing/balance', billingOrganizationId), {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/billing/payment-method', billingOrganizationId), {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        }),
        fetch(withOrganizationId('/api/billing/invoices?limit=12', billingOrganizationId), {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        }),
      ]);

      const balancePayload = await balanceResponse.json().catch(() => ({}));
      if (balanceResponse.ok) {
        setBalance({
          balance: Number(balancePayload.balance || 0),
          monthlyCreditGrant: Number(balancePayload.monthlyCreditGrant || 0),
          currentPlanCredits: Number(balancePayload.currentPlanCredits || 0),
          rolloverCredits: Number(balancePayload.rolloverCredits || 0),
          topUpCredits: Number(balancePayload.topUpCredits || 0),
        });
      }

      const paymentPayload = await paymentResponse.json().catch(() => ({}));
      if (paymentResponse.ok) {
        const savedPaymentMethods = Array.isArray(paymentPayload.paymentMethods)
          ? paymentPayload.paymentMethods
          : paymentPayload.paymentMethod
            ? [paymentPayload.paymentMethod]
            : [];
        setPaymentMethods(savedPaymentMethods);
        setHasStripeCustomer(Boolean(paymentPayload.stripeCustomerId));
      }

      const invoicesPayload = await invoicesResponse.json().catch(() => ({}));
      if (invoicesResponse.ok) {
        setInvoices(Array.isArray(invoicesPayload.invoices) ? invoicesPayload.invoices : []);
      }

      if (!balanceResponse.ok || !paymentResponse.ok || !invoicesResponse.ok) {
        throw new Error(balancePayload.error || paymentPayload.error || invoicesPayload.error || 'Failed to load billing data');
      }
    } catch (loadError) {
      setBillingDataError(loadError instanceof Error ? loadError.message : 'Failed to load billing data');
    } finally {
      setLoadingBillingData(false);
    }
  }, [organizationId, session?.access_token]);

  useEffect(() => {
    void loadBillingData();
  }, [loadBillingData]);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const subscriptionResult = searchParams.get('subscription');
    if (subscriptionResult !== 'success' || !sessionId || !session?.access_token) return;
    if (verifiedCheckoutSessionRef.current === sessionId) return;
    verifiedCheckoutSessionRef.current = sessionId;

    const verifyCheckoutSession = async () => {
      setVerifyingCheckoutSession(true);
      try {
        const response = await fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success !== true) {
          throw new Error(payload.error || 'Could not verify subscription checkout yet');
        }

        const verifiedOrganizationId = typeof payload.organizationId === 'string'
          ? payload.organizationId
          : organizationId;
        await refreshOrganization();
        await refresh();
        await loadBillingData(verifiedOrganizationId);
        toast.success('Subscription checkout confirmed.');
      } catch (error) {
        verifiedCheckoutSessionRef.current = null;
        toast.error(error instanceof Error ? error.message : 'Could not verify subscription checkout yet');
      } finally {
        setVerifyingCheckoutSession(false);
      }
    };

    void verifyCheckoutSession();
  }, [loadBillingData, organizationId, refresh, refreshOrganization, searchParams, session?.access_token]);

  if (authLoading || loadingSubscription) {
    return (
      <DashboardPageShell maxWidth="full" contentClassName="max-w-[1480px]">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </DashboardPageShell>
    );
  }

  if (!user) {
    return (
      <DashboardPageShell maxWidth="5xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Please log in to access billing.
        </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell maxWidth="full" contentClassName="max-w-[1480px]">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Billing for {workspaceName}</h1>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
              Manage this workspace&apos;s plan, credits, payment methods, and billing history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {verifyingCheckoutSession && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming your subscription with Stripe...
          </div>
        )}

        {isPersonalWorkspace && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
            Plans apply only to this personal workspace. Team billing is managed separately, and Pro or Teams checkout will continue in your team workspace.
          </div>
        )}

        {isTeamWorkspace && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
            This team workspace has separate billing from your personal workspace. Team workspaces require Pro or Teams.
          </div>
        )}

        {hasPersonalTeamPlan && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100">
            This personal workspace already has a seat-based plan. Keep managing it here, but new team collaboration should be billed from your team workspace.
          </div>
        )}

        {subscription?.cancelAtPeriodEnd && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100">
            <Clock className="h-4 w-4 flex-shrink-0" />
            Your plan is scheduled to cancel at the end of the current billing period.
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          <CurrentPlanCard subscription={subscription} canManageBilling={canManageBilling} />
          <CreditsCard
            balance={balance}
            topUpsEnabled={topUpsEnabled}
            canManageBilling={canManageBilling && subscriptionHasUsableStatus(subscription?.status)}
            organizationId={organizationId}
          />
          <PaymentMethodCard
            paymentMethods={paymentMethods}
            loading={loadingBillingData}
            canManageBilling={canManageBilling}
            hasStripeCustomer={hasStripeCustomer}
            openPortal={openPortal}
            openingPortal={openingPortal}
          />
        </div>

        <BillingHistory invoices={invoices} loading={loadingBillingData} />
      </div>
    </DashboardPageShell>
  );
}
