"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/context';
import { canManageOrganizationBilling } from '@/lib/authz/billing-permission-rules';
import {
  formatSiteCreditDeltaFromUsd,
  formatSiteCredits,
  formatSiteCreditsFromUsd,
  usdToSiteCredits,
} from '@/lib/billing/display';
import type { Plan, PlanBillingInterval } from '@/lib/billing/plans';
import { getPlanStripePriceId } from '@/lib/billing/plans';
import { formatProductCredits } from '@/lib/billing/product-credits';
import {
  formatPlanPrice,
  formatSubscriptionStatus,
  getPlanCreditItems,
  isCurrentSubscriptionPlan,
  subscriptionHasUsableStatus,
} from '@/lib/billing/subscription-ui';
import type { OrganizationSubscription } from '@/lib/billing/subscriptions';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { useCurrentSubscription } from '@/lib/hooks/useCurrentSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useSubscriptionCheckout } from '@/lib/hooks/useSubscriptionCheckout';
import { withOrganizationId } from '@/lib/organizations/current-organization';
import { cn } from '@/lib/utils';

type Balance = {
  balance: number;
  formatted: string;
  availableBalance?: number;
  reservedPending?: number;
  lifetimeCreditsAdded: number;
  lifetimeCreditsSpent: number;
  creditUnit?: string;
  planSlug?: string | null;
  monthlyCreditGrant?: number;
  rolloverCredits?: number;
  currentPlanCredits?: number;
  topUpCredits?: number;
  legacyBalance?: number;
  legacyAvailableBalance?: number;
  legacyReservedPending?: number;
};

type GroupedTransaction = {
  id: string;
  type: 'single' | 'workflow' | 'project';
  createdAt: string;
  transactionType: string;
  amount: number;
  reason: string;
  projectTitle?: string;
  balanceAfter: number;
  invoiceNumber?: string | null;
  creditUnit?: string;
  children?: Array<{
    reason: string;
    amount: number;
    createdAt: string;
    kind?: 'hold' | 'charge' | 'release' | 'usage';
    detail?: string;
    creditUnit?: string;
  }>;
};

type UsageEvent = {
  id: string;
  serviceName: string;
  provider: string;
  units: number;
  billedCost: number;
  createdAt: string;
  projectId?: string;
  projectTitle?: string;
};

type BillingData = {
  balance: Balance | null;
  transactions: GroupedTransaction[];
  transactionTotal: number;
  usageEvents: UsageEvent[];
  usageTrend: Array<{ date: string; cost: number; events: number }>;
};

const TRANSACTIONS_PER_PAGE = 10;

const planCopy: Record<string, { description: string; Icon: typeof Rocket; iconClass: string }> = {
  free: {
    description: 'Try the full workflow with one complete project each month.',
    Icon: Rocket,
    iconClass: 'bg-blue-50 text-blue-600',
  },
  standard: {
    description: 'For solo founders, consultants, and small B2B workflows.',
    Icon: UserRound,
    iconClass: 'bg-teal-50 text-teal-600',
  },
  pro: {
    description: 'For teams producing recurring content across channels.',
    Icon: Star,
    iconClass: 'bg-orange-50 text-orange-600',
  },
  teams: {
    description: 'For marketing teams running a shared content engine.',
    Icon: UsersRound,
    iconClass: 'bg-violet-50 text-violet-600',
  },
};

const topUpOptions = [
  { id: 'top_up_1000', credits: 1000, price: 19, helper: 'Good for shorter batches' },
  { id: 'top_up_5000', credits: 5000, price: 79, helper: 'Best for recurring workflows', badge: 'Best value' },
  { id: 'top_up_15000', credits: 15000, price: 229, helper: 'For heavy content periods' },
];

function softMotion(shouldReduceMotion: boolean | null) {
  if (shouldReduceMotion) {
    return {};
  }

  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, ease: 'easeOut' as const },
  };
}

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
      </div>
    </div>
  );
}

function BillingStatusBadge({ status }: { status?: string | null }) {
  const label = formatSubscriptionStatus(status);
  const active = status === 'active' || status === 'trialing';

  return (
    <Badge
      className={cn(
        'gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-amber-500')} />
      {label}
    </Badge>
  );
}

function formatProductCreditDelta(amount: number): string {
  const prefix = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${prefix}${formatProductCredits(Math.abs(amount))} credits`;
}

function formatBillingAmount(amount: number, creditUnit?: string | null): string {
  if (creditUnit === 'plan_credit') {
    return formatProductCreditDelta(amount);
  }

  return formatSiteCreditDeltaFromUsd(amount);
}

function CreditBalanceCard({ balance, loading }: { balance: Balance | null; loading: boolean }) {
  if (loading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />;
  }

  if (balance?.creditUnit === 'plan_credit') {
    const availableCredits = Number(balance.balance || 0);
    const monthlyGrant = Number(balance.monthlyCreditGrant || 0);
    const currentPlanCredits = Number(balance.currentPlanCredits || 0);
    const rolloverCredits = Number(balance.rolloverCredits || 0);
    const topUpCredits = Number(balance.topUpCredits || 0);
    const usedMonthlyCredits = monthlyGrant > 0
      ? Math.max(0, monthlyGrant - currentPlanCredits)
      : 0;
    const percentRemaining = monthlyGrant > 0
      ? Math.max(0, Math.min(100, Math.round((currentPlanCredits / monthlyGrant) * 100)))
      : 0;

    return (
      <Card className="relative overflow-hidden rounded-2xl border-slate-200/90 bg-[#f8fbff] shadow-[0_18px_55px_-38px_rgba(15,23,42,0.55)] dark:bg-slate-900">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/3 right-8 opacity-50"
        >
          <svg viewBox="0 0 640 160" className="h-full w-full text-blue-200">
            <path
              d="M0 132 C 70 118, 88 88, 152 88 S 236 42, 304 52 S 398 12, 454 48 S 524 110, 640 92"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M0 150 C 80 130, 126 112, 198 118 S 318 58, 396 76 S 470 126, 640 120 L640 160 L0 160 Z"
              fill="currentColor"
              opacity="0.25"
            />
          </svg>
        </div>

        <CardContent className="relative p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-700">Credit Balance</p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                {formatProductCredits(availableCredits)} credits
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {monthlyGrant > 0
                  ? `${formatProductCredits(usedMonthlyCredits)} used of ${formatProductCredits(monthlyGrant)} monthly credits`
                  : 'Credits are available processing capacity for uploads and generated content.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-slate-200">
                  Current {formatProductCredits(currentPlanCredits)}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-slate-200">
                  Rollover {formatProductCredits(rolloverCredits)}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-slate-200">
                  Top-up {formatProductCredits(topUpCredits)}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 p-4 ring-1 ring-slate-200/80 backdrop-blur-sm dark:bg-slate-950/40 dark:ring-slate-800">
              <div className="mb-3 flex items-center justify-between gap-4 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>{percentRemaining}% of monthly grant left</span>
                <span>{formatProductCredits(currentPlanCredits)} left</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${percentRemaining}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentUsd = Number(balance?.balance || 0);
  const totalUsd = Math.max(Number(balance?.lifetimeCreditsAdded || 0), currentUsd + Number(balance?.lifetimeCreditsSpent || 0), 0);
  const spentUsd = Number(balance?.lifetimeCreditsSpent || 0);
  const percentRemaining = totalUsd > 0 ? Math.max(0, Math.min(100, Math.round((currentUsd / totalUsd) * 100))) : 0;

  return (
    <Card className="relative overflow-hidden rounded-2xl border-slate-200/90 bg-[#f8fbff] shadow-[0_18px_55px_-38px_rgba(15,23,42,0.55)] dark:bg-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/3 right-8 opacity-50"
      >
        <svg viewBox="0 0 640 160" className="h-full w-full text-blue-200">
          <path
            d="M0 132 C 70 118, 88 88, 152 88 S 236 42, 304 52 S 398 12, 454 48 S 524 110, 640 92"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M0 150 C 80 130, 126 112, 198 118 S 318 58, 396 76 S 470 126, 640 120 L640 160 L0 160 Z"
            fill="currentColor"
            opacity="0.25"
          />
        </svg>
      </div>

      <CardContent className="relative p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">Credit Balance</p>
            <p className="mt-2 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              {formatSiteCreditsFromUsd(currentUsd)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {formatSiteCreditsFromUsd(spentUsd)} spent of {formatSiteCreditsFromUsd(totalUsd)} total
            </p>
            {balance?.reservedPending ? (
              <p className="mt-3 text-xs text-slate-500">
                Pending reservations are hidden until final charges post.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl bg-white/70 p-4 ring-1 ring-slate-200/80 backdrop-blur-sm dark:bg-slate-950/40 dark:ring-slate-800">
            <div className="mb-3 flex items-center justify-between gap-4 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{percentRemaining}% remaining</span>
              <span>{formatSiteCreditsFromUsd(currentUsd)} left</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${percentRemaining}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingIntervalToggle({
  value,
  onChange,
}: {
  value: PlanBillingInterval;
  onChange: (value: PlanBillingInterval) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1"
    >
      {(['month', 'year'] as const).map((interval) => {
        const selected = value === interval;
        return (
          <button
            key={interval}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(interval)}
            className={cn(
              'rounded-full px-4 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              selected ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'
            )}
          >
            {interval === 'month' ? 'Monthly' : 'Annual'}
          </button>
        );
      })}
      <span className="ml-1 inline-flex items-center rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700">
        Save 15%
      </span>
    </div>
  );
}

function displayPlanPrice(plan: Plan, interval: PlanBillingInterval) {
  if (plan.slug === 'free' || plan.monthlyPriceCents === 0) {
    return { main: '$0', suffix: 'forever', helper: null };
  }

  const price = formatPlanPrice(plan, interval).replace('/mo', '');
  return {
    main: price,
    suffix: '/month',
    helper: interval === 'year' ? `${price} /month annually` : null,
  };
}

function PlanCard({
  plan,
  billingInterval,
  subscription,
  canManageBilling,
  checkoutPlanId,
  openingPortal,
  onSelect,
}: {
  plan: Plan;
  billingInterval: PlanBillingInterval;
  subscription: OrganizationSubscription | null;
  canManageBilling: boolean;
  checkoutPlanId: string | null;
  openingPortal: boolean;
  onSelect: (plan: Plan) => void;
}) {
  const copy = planCopy[String(plan.slug)] || {
    description: plan.description || 'Subscription plan for recurring content operations.',
    Icon: Sparkles,
    iconClass: 'bg-slate-100 text-slate-600',
  };
  const isCurrent = isCurrentSubscriptionPlan(plan, subscription);
  const hasUsableCurrentStatus = isCurrent && subscriptionHasUsableStatus(subscription?.status);
  const stripePriceId = getPlanStripePriceId(plan, billingInterval);
  const isFree = plan.slug === 'free';
  const isSubmitting = checkoutPlanId === plan.slug || checkoutPlanId === plan.id;
  const disabled = !canManageBilling || hasUsableCurrentStatus || isFree || !stripePriceId || Boolean(checkoutPlanId) || openingPortal;
  const price = displayPlanPrice(plan, billingInterval);
  const Icon = copy.Icon;

  return (
    <motion.article
      whileHover={{ y: disabled ? 0 : -2 }}
      className={cn(
        'relative flex h-full min-h-[360px] flex-col rounded-2xl border bg-white p-5 shadow-[0_16px_45px_-36px_rgba(15,23,42,0.45)] transition-colors',
        hasUsableCurrentStatus ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300',
        plan.isPopular && !hasUsableCurrentStatus ? 'border-slate-300' : ''
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', copy.iconClass)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          {plan.isPopular && (
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700">
              Most popular
            </span>
          )}
          {hasUsableCurrentStatus && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white" aria-label="Current plan">
              <Check className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-950">{plan.name}</h3>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-3xl font-bold tracking-tight text-slate-950">{price.main}</span>
        <span className="pb-1 text-sm font-medium text-slate-700">{price.suffix}</span>
      </div>
      {price.helper && <p className="mt-1 text-xs font-medium text-blue-700">{price.helper}</p>}
      <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-600">
        {copy.description}
      </p>

      <ul className="mt-5 space-y-2.5 text-xs text-slate-700">
        {getPlanCreditItems(plan).slice(0, 6).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        disabled={disabled}
        title={!canManageBilling ? 'Only organization owners and admins can manage subscription billing.' : undefined}
        className={cn(
          'mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
          hasUsableCurrentStatus
            ? 'border border-blue-200 bg-blue-50 text-blue-700'
            : 'border border-slate-200 bg-white text-slate-700 hover:-translate-y-px hover:border-blue-300 hover:text-blue-700'
        )}
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : hasUsableCurrentStatus ? <CheckCircle2 className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
        {isSubmitting ? 'Redirecting...' : hasUsableCurrentStatus ? 'Current plan' : 'Select plan'}
      </button>
    </motion.article>
  );
}

function SubscriptionPlansCard({
  organizationId,
}: {
  organizationId?: string | null;
}) {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('month');
  const { plans, loading: loadingPlans, error: plansError } = usePlans();
  const {
    organization,
    membership,
    subscription,
    loading: loadingSubscription,
    error: subscriptionError,
    refresh,
  } = useCurrentSubscription(organizationId);
  const {
    checkoutPlanId,
    openingPortal,
    error: actionError,
    startCheckout,
    openPortal,
  } = useSubscriptionCheckout(organizationId);

  useEffect(() => {
    const interval = subscription?.metadata?.billing_interval;
    if (interval === 'year' || interval === 'annual') {
      setBillingInterval('year');
    }
  }, [subscription?.metadata]);

  const canManageBilling = canManageOrganizationBilling(membership?.role, organization?.type);
  const canOpenPortal = canManageBilling && Boolean(subscription?.stripeCustomerId);
  const loading = loadingPlans || loadingSubscription;
  const error = plansError || subscriptionError || actionError;

  return (
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)]">
      <CardHeader className="gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="text-xl text-slate-950">Subscription</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-slate-600">
              View organization plans for recurring B2B content operations and manage Stripe subscription billing.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BillingStatusBadge status={subscription?.status} />
            <button
              type="button"
              onClick={openPortal}
              disabled={!canOpenPortal || openingPortal}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-all hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Manage subscription
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
        <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-[360px] animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No subscription plans are available yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                billingInterval={billingInterval}
                subscription={subscription}
                canManageBilling={canManageBilling}
                checkoutPlanId={checkoutPlanId}
                openingPortal={openingPortal}
                onSelect={(selectedPlan) => {
                  if (selectedPlan.slug === 'free') return;
                  void startCheckout({ planSlug: selectedPlan.slug, billingInterval });
                }}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {organization?.name || 'Default workspace'}
            {subscription?.cancelAtPeriodEnd ? ' - cancels at period end' : ''}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex w-fit items-center gap-1.5 font-semibold text-slate-500 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh subscription status
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function TopUpOptionCard({
  option,
  selected,
  onSelect,
}: {
  option: typeof topUpOptions[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative w-full rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        selected ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-slate-950">{formatProductCredits(option.credits)} credits</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-950">${option.price}</span>
            <span className="text-[11px] font-medium text-slate-500">{option.helper}</span>
          </div>
        </div>
        {selected ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {option.badge && (
        <span className="absolute right-3 top-3 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">
          {option.badge}
        </span>
      )}
    </button>
  );
}

function CreditTopUpsCard({ organizationId }: { organizationId?: string | null }) {
  const [selectedPackage, setSelectedPackage] = useState('top_up_5000');
  const [processing, setProcessing] = useState(false);
  const { session } = useAuth();
  const { subscription, loading } = useCurrentSubscription(organizationId);
  const topUpsEnabled = Boolean(subscription?.plan?.topUpEnabled);

  const handlePurchase = async () => {
    if (!topUpsEnabled) {
      return;
    }

    if (!session?.access_token) {
      toast.error('Please log in to purchase credits.');
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          packageId: selectedPackage,
          organization_id: organizationId || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to create checkout session');
      }

      const payload = await response.json();
      if (!payload.url) {
        throw new Error('No checkout URL received');
      }

      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to initiate checkout. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)]">
      <CardHeader className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <WalletCards className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-lg text-slate-950">Credit Top-Ups</CardTitle>
            <CardDescription className="mt-1 text-slate-600">Need more credits? Add them anytime.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        {!loading && !topUpsEnabled && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Top-ups are available on paid plans. Upgrade from Free to buy credits.</p>
          </div>
        )}

        <div className="space-y-3">
          {topUpOptions.map((option) => (
            <TopUpOptionCard
              key={option.id}
              option={option}
              selected={selectedPackage === option.id}
              onSelect={() => setSelectedPackage(option.id)}
            />
          ))}
        </div>

        <p className="text-xs leading-5 text-slate-600">
          Top-ups are consumed after rollover and current monthly credits.
        </p>

        <button
          type="button"
          onClick={() => void handlePurchase()}
          disabled={processing || loading || !topUpsEnabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(37,99,235,0.8)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : topUpsEnabled ? <CreditCard className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
          {topUpsEnabled ? 'Buy credits' : 'Upgrade to buy top-ups'}
        </button>

        <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
          <ShieldCheck className="h-4 w-4" />
          Secure payment via Stripe
        </div>
      </CardContent>
    </Card>
  );
}

function transactionTypeClass(type: string) {
  switch (type) {
    case 'bonus':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'purchase':
    case 'top_up':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'subscription':
      return 'border-purple-200 bg-purple-50 text-purple-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function transactionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    bonus: 'Bonus',
    purchase: 'Top-up',
    subscription: 'Subscription',
    debit: 'Usage',
    workflow: 'Workflow',
    project: 'Project',
    refund: 'Refund',
    reserve: 'Hold',
    release: 'Release',
    settle: 'Charge',
    adjustment: 'Adjustment',
    admin_adjustment: 'Adjustment',
  };

  return labels[type] || type.replace(/_/g, ' ');
}

function formatTransactionAmount(transaction: GroupedTransaction) {
  if (transaction.transactionType === 'subscription' && transaction.amount < 0) {
    return `-$${Math.abs(transaction.amount).toFixed(2)}`;
  }

  return formatBillingAmount(transaction.amount, transaction.creditUnit);
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Copy command failed');
  }
}

async function copyTransactionDetails(transaction: GroupedTransaction) {
  const date = new Date(transaction.createdAt);
  const details = [
    `Date: ${Number.isNaN(date.getTime()) ? '-' : date.toISOString()}`,
    `Type: ${transactionTypeLabel(transaction.transactionType)}`,
    `Description: ${transaction.reason || '-'}`,
    `Project: ${transaction.projectTitle || '-'}`,
    `Invoice: ${transaction.invoiceNumber || '-'}`,
    `Amount: ${formatTransactionAmount(transaction)}`,
    `Balance after: ${formatBillingAmount(transaction.balanceAfter, transaction.creditUnit)}`,
    transaction.children?.length
      ? `Line items:\n${transaction.children.map((child) => {
        const childDate = new Date(child.createdAt);
        return `- ${Number.isNaN(childDate.getTime()) ? '-' : childDate.toISOString()} | ${child.kind || 'usage'} | ${formatBillingAmount(child.amount, child.creditUnit || transaction.creditUnit)} | ${child.reason}`;
      }).join('\n')}`
      : null,
  ].filter(Boolean).join('\n');

  try {
    await copyTextToClipboard(details);
    toast.success('Transaction details copied.');
  } catch {
    toast.error('Could not copy transaction details.');
  }
}

function TransactionRow({ transaction }: { transaction: GroupedTransaction }) {
  const amount = formatTransactionAmount(transaction);
  const isPositive = transaction.amount > 0;
  const date = new Date(transaction.createdAt);

  return (
    <tr className="transition-colors hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
        {Number.isNaN(date.getTime())
          ? '-'
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', transactionTypeClass(transaction.transactionType))}>
          {transactionTypeLabel(transaction.transactionType)}
        </span>
      </td>
      <td className="min-w-[220px] px-4 py-3 text-sm text-slate-700">
        <div className="font-medium text-slate-900">{transaction.reason || '-'}</div>
        {transaction.projectTitle && <div className="mt-0.5 text-xs text-slate-500">{transaction.projectTitle}</div>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{transaction.invoiceNumber || '-'}</td>
      <td className={cn('whitespace-nowrap px-4 py-3 text-right text-sm font-bold', isPositive ? 'text-emerald-600' : 'text-slate-950')}>
        {amount}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Completed
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => void copyTransactionDetails(transaction)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`Copy details for ${transaction.reason || 'transaction'}`}
          title="Copy transaction details"
        >
          <Copy className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

function TransactionHistoryCard({
  transactions,
  transactionTotal,
  transactionPage,
  setTransactionPage,
  loading,
}: {
  transactions: GroupedTransaction[];
  transactionTotal: number;
  transactionPage: number;
  setTransactionPage: (updater: (page: number) => number) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return transactions;

    return transactions.filter((transaction) => (
      transaction.transactionType.toLowerCase().includes(term)
      || transaction.reason.toLowerCase().includes(term)
      || (transaction.projectTitle || '').toLowerCase().includes(term)
      || (transaction.invoiceNumber || '').toLowerCase().includes(term)
    ));
  }, [search, transactions]);

  const exportTransactions = () => {
    const rows = transactions.flatMap((transaction) => {
      const parent = [
        new Date(transaction.createdAt).toISOString(),
        transaction.transactionType,
        transaction.amount.toFixed(4),
        transaction.creditUnit || 'legacy_usd',
        transaction.reason,
        transaction.invoiceNumber || '',
      ];

      if (!transaction.children?.length) return [parent];

      return [
        parent,
        ...transaction.children.map((child) => [
          new Date(child.createdAt).toISOString(),
          child.kind || 'usage',
          child.amount.toFixed(4),
          child.creditUnit || transaction.creditUnit || 'legacy_usd',
          `${transaction.reason} - ${child.reason}`,
          '',
        ]),
      ];
    });

    const csv = [
      ['Date', 'Type', 'Amount', 'Credit Unit', 'Reason', 'Invoice Number'],
      ...rows,
    ].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)]">
      <CardHeader className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl text-slate-950">Transaction History</CardTitle>
            <CardDescription className="mt-1 text-slate-600">All billing activity for your organization</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative">
              <span className="sr-only">Search transactions</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:w-64"
              />
            </label>
            <button
              type="button"
              onClick={exportTransactions}
              disabled={transactions.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="p-6">
            <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-slate-900">No transactions yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Billing activity will appear here once your organization makes a purchase or receives credits.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3">Type</th>
                    <th scope="col" className="px-4 py-3">Description</th>
                    <th scope="col" className="px-4 py-3">Invoice</th>
                    <th scope="col" className="px-4 py-3 text-right">Amount</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((transaction) => (
                    <TransactionRow key={transaction.id} transaction={transaction} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', transactionTypeClass(transaction.transactionType))}>
                        {transactionTypeLabel(transaction.transactionType)}
                      </span>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{transaction.reason || '-'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(transaction.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <p className={cn('text-sm font-bold', transaction.amount > 0 ? 'text-emerald-600' : 'text-slate-950')}>
                      {formatTransactionAmount(transaction)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {transactionTotal > TRANSACTIONS_PER_PAGE && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                <span>
                  Showing {((transactionPage - 1) * TRANSACTIONS_PER_PAGE) + 1} to {Math.min(transactionPage * TRANSACTIONS_PER_PAGE, transactionTotal)} of {transactionTotal}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTransactionPage((page) => Math.max(1, page - 1))}
                    disabled={transactionPage === 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Previous transactions page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionPage((page) => page + 1)}
                    disabled={transactionPage * TRANSACTIONS_PER_PAGE >= transactionTotal}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Next transactions page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UsageSparkline({ data }: { data: Array<{ date: string; cost: number; events: number }> }) {
  const points = useMemo(() => {
    const series = data.length > 0 ? data.slice(-12) : [
      { cost: 0.2 }, { cost: 0.4 }, { cost: 0.25 }, { cost: 0.5 }, { cost: 0.35 }, { cost: 0.68 },
      { cost: 0.52 }, { cost: 0.62 }, { cost: 0.74 }, { cost: 0.66 }, { cost: 0.82 }, { cost: 1 },
    ];
    const max = Math.max(...series.map((item) => Number(item.cost || 0)), 1);
    return series.map((item, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * 300;
      const y = 72 - (Number(item.cost || 0) / max) * 58;
      return `${x},${y}`;
    }).join(' ');
  }, [data]);

  return (
    <svg viewBox="0 0 300 80" className="h-24 w-full text-blue-500" aria-hidden="true">
      <defs>
        <linearGradient id="billing-usage-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,80 ${points} 300,80`} fill="url(#billing-usage-fill)" />
    </svg>
  );
}

function UsageThisMonthCard({
  balance,
  usageEvents,
  usageTrend,
}: {
  balance: Balance | null;
  usageEvents: UsageEvent[];
  usageTrend: Array<{ date: string; cost: number; events: number }>;
}) {
  const isPlanCredit = balance?.creditUnit === 'plan_credit';
  const now = new Date();
  const monthlyUsedUsd = isPlanCredit
    ? 0
    : usageEvents.reduce((sum, event) => {
        const created = new Date(event.createdAt);
        if (created.getFullYear() !== now.getFullYear() || created.getMonth() !== now.getMonth()) {
          return sum;
        }
        return sum + Number(event.billedCost || 0);
      }, 0);
  const currentCredits = isPlanCredit
    ? Number(balance?.currentPlanCredits || 0)
    : usdToSiteCredits(Number(balance?.balance || 0));
  const usedCredits = isPlanCredit
    ? Math.max(0, Number(balance?.monthlyCreditGrant || 0) - currentCredits)
    : usdToSiteCredits(monthlyUsedUsd);
  const totalCredits = isPlanCredit
    ? Number(balance?.monthlyCreditGrant || 0)
    : Math.max(currentCredits + usedCredits, usedCredits, 0);
  const percentUsed = totalCredits > 0 ? Math.min(100, Math.round((usedCredits / totalCredits) * 100)) : 0;

  return (
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)]">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-lg text-slate-950">Usage this month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <UsageSparkline data={usageTrend} />
        <div>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold tracking-tight text-slate-950">{percentUsed}%</p>
            <p className="pb-1 text-sm font-medium text-slate-600">of monthly credits used</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${percentUsed}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>
              {isPlanCredit ? `${formatProductCredits(usedCredits)} credits` : formatSiteCredits(usedCredits)} used
            </span>
            <span>
              {isPlanCredit ? `${formatProductCredits(totalCredits)} credits` : formatSiteCredits(totalCredits)} total
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/usage"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          View detailed usage
          <ChevronRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

export default function BillingDashboard() {
  const shouldReduceMotion = useReducedMotion();
  const { user, session, loading: authLoading } = useAuth();
  const { organizationId } = useCurrentOrganization();
  const [data, setData] = useState<BillingData>({
    balance: null,
    transactions: [],
    transactionTotal: 0,
    usageEvents: [],
    usageTrend: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [transactionPage, setTransactionPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBillingData = async () => {
      if (!session?.access_token) {
        setLoading(false);
        setLoadingTransactions(false);
        return;
      }

      setLoading(true);
      setLoadingTransactions(true);
      setError(null);

      try {
        const [settingsResponse, balanceResponse] = await Promise.all([
          fetch(
            withOrganizationId(
              `/api/dashboard/settings?transactionLimit=${TRANSACTIONS_PER_PAGE}&transactionOffset=0&usageLimit=200`,
              organizationId
            ),
            {
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: 'no-store',
            }
          ),
          fetch(withOrganizationId('/api/billing/balance', organizationId), {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          }),
        ]);

        const payload = await settingsResponse.json().catch(() => ({}));
        if (!settingsResponse.ok) {
          throw new Error(payload.error || 'Failed to load billing data');
        }

        const balancePayload = await balanceResponse.json().catch(() => ({}));
        const balance = balanceResponse.ok && balancePayload?.success
          ? {
              ...(payload.balance || {}),
              balance: Number(balancePayload.balance || 0),
              formatted: balancePayload.formatted || `${formatProductCredits(Number(balancePayload.balance || 0))} credits`,
              availableBalance: Number(balancePayload.availableBalance || 0),
              reservedPending: Number(balancePayload.reservedPending || 0),
              creditUnit: balancePayload.creditUnit || 'plan_credit',
              planSlug: balancePayload.planSlug || null,
              monthlyCreditGrant: Number(balancePayload.monthlyCreditGrant || 0),
              rolloverCredits: Number(balancePayload.rolloverCredits || 0),
              currentPlanCredits: Number(balancePayload.currentPlanCredits || 0),
              topUpCredits: Number(balancePayload.topUpCredits || 0),
              legacyBalance: Number(balancePayload.legacyBalance || 0),
              legacyAvailableBalance: Number(balancePayload.legacyAvailableBalance || 0),
              legacyReservedPending: Number(balancePayload.legacyReservedPending || 0),
              lifetimeCreditsAdded: Number(balancePayload.lifetimeCreditsAdded || payload.balance?.lifetimeCreditsAdded || 0),
              lifetimeCreditsSpent: Number(balancePayload.lifetimeCreditsSpent || payload.balance?.lifetimeCreditsSpent || 0),
            }
          : payload.balance || null;

        setData({
          balance,
          transactions: payload.transactions || [],
          transactionTotal: payload.transactionTotal || 0,
          usageEvents: payload.usageEvents || [],
          usageTrend: payload.usageTrend || [],
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load billing data');
      } finally {
        setLoading(false);
        setLoadingTransactions(false);
      }
    };

    void loadBillingData();
  }, [organizationId, session?.access_token]);

  useEffect(() => {
    const loadTransactions = async () => {
      if (!session?.access_token) {
        setLoadingTransactions(false);
        return;
      }

      setLoadingTransactions(true);
      try {
        const response = await fetch(
          withOrganizationId(
            `/api/billing/transactions/grouped?limit=${TRANSACTIONS_PER_PAGE}&offset=${(transactionPage - 1) * TRANSACTIONS_PER_PAGE}`,
            organizationId
          ),
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          }
        );

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load transactions');
        }

        setData((current) => ({
          ...current,
          transactions: payload.transactions || [],
          transactionTotal: payload.total || 0,
        }));
      } catch (loadError) {
        toast.error(loadError instanceof Error ? loadError.message : 'Failed to load transactions');
      } finally {
        setLoadingTransactions(false);
      }
    };

    void loadTransactions();
  }, [organizationId, session?.access_token, transactionPage]);

  if (authLoading || loading) {
    return (
      <main className="min-h-full bg-[#f7fbff] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1560px]">
          <BillingSkeleton />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-full bg-[#f7fbff] px-4 py-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          Please log in to access billing.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f7fbff] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <motion.div
        {...softMotion(shouldReduceMotion)}
        className="mx-auto w-full max-w-[1560px] space-y-6"
      >
        <header className="max-w-4xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Billing</h1>
          <p className="mt-2 text-base text-slate-600">
            Manage subscription plans, credits, purchases, and transaction history.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <CreditBalanceCard balance={data.balance} loading={loading} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_410px]">
          <div className="space-y-4">
            <SubscriptionPlansCard organizationId={organizationId} />
            <TransactionHistoryCard
              transactions={data.transactions}
              transactionTotal={data.transactionTotal}
              transactionPage={transactionPage}
              setTransactionPage={setTransactionPage}
              loading={loadingTransactions}
            />
          </div>
          <aside className="space-y-4">
            <CreditTopUpsCard organizationId={organizationId} />
            <UsageThisMonthCard
              balance={data.balance}
              usageEvents={data.usageEvents}
              usageTrend={data.usageTrend}
            />
          </aside>
        </div>
      </motion.div>
    </main>
  );
}
