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
import { DashboardPageHeader, DashboardPageShell } from '@/components/dashboard/shell';
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

type TeamSeatSummary = {
  active: number;
  pending: number;
  limit: number;
  available: number;
  isFull: boolean;
};

type TeamPreviewMember = {
  id: string;
  email: string | null;
  name: string | null;
};

type TeamPreviewInvitation = {
  id: string;
  email: string;
};

type TeamSeatSnapshot = {
  seats: TeamSeatSummary;
  members?: TeamPreviewMember[];
  invitations?: TeamPreviewInvitation[];
};

const TRANSACTIONS_PER_PAGE = 10;

const planCopy: Record<string, { description: string; Icon: typeof Rocket; iconClass: string }> = {
  free: {
    description: 'Try the full workflow with one complete project each month.',
    Icon: Rocket,
    iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  },
  standard: {
    description: 'For solo founders, consultants, and small B2B workflows.',
    Icon: UserRound,
    iconClass: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  },
  pro: {
    description: 'For teams producing recurring content across channels.',
    Icon: Star,
    iconClass: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  },
  teams: {
    description: 'For marketing teams running a shared content engine.',
    Icon: UsersRound,
    iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
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
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
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

function HeaderCreditSummary({ balance }: { balance: Balance | null }) {
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
      <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:w-[30rem]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Total available credits</p>
            <p className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] dark:text-white">
              {formatProductCredits(availableCredits)} credits
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {monthlyGrant > 0
                ? `${formatProductCredits(currentPlanCredits)} current monthly credits left · ${formatProductCredits(usedMonthlyCredits)} used of ${formatProductCredits(monthlyGrant)}`
                : 'Credits are ready for processing and generation.'}
            </p>
          </div>
          <div className="min-w-[8rem]">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span>{percentRemaining}% of grant left</span>
              <span className="text-right">{formatProductCredits(currentPlanCredits)} left</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${percentRemaining}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>Grant {formatProductCredits(currentPlanCredits)}</span>
              <span>Rollover {formatProductCredits(rolloverCredits)}</span>
              <span>Top-up {formatProductCredits(topUpCredits)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentUsd = Number(balance?.balance || 0);
  const totalUsd = Math.max(Number(balance?.lifetimeCreditsAdded || 0), currentUsd + Number(balance?.lifetimeCreditsSpent || 0), 0);
  const spentUsd = Number(balance?.lifetimeCreditsSpent || 0);
  const percentRemaining = totalUsd > 0 ? Math.max(0, Math.min(100, Math.round((currentUsd / totalUsd) * 100))) : 0;

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200 sm:w-[24rem]">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Credit balance</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <p className="break-words text-2xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] dark:text-white">
          {formatSiteCreditsFromUsd(currentUsd)}
        </p>
        <p className="pb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {percentRemaining}% left
        </p>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {formatSiteCreditsFromUsd(spentUsd)} spent of {formatSiteCreditsFromUsd(totalUsd)} total
      </p>
    </div>
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
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950"
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
              'min-w-[5.5rem] flex-1 rounded-full px-4 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:flex-none',
              selected ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            )}
          >
            {interval === 'month' ? 'Monthly' : 'Annual'}
          </button>
        );
      })}
      <span className="inline-flex min-h-8 flex-1 items-center justify-center rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 sm:flex-none">
        Annual savings
      </span>
    </div>
  );
}

function displayPlanPrice(plan: Plan, interval: PlanBillingInterval) {
  if (plan.slug === 'free' || plan.monthlyPriceCents === 0) {
    return { main: '$0', suffix: 'forever', helper: null };
  }

  const formattedPrice = formatPlanPrice(plan, interval);
  const periodToken = interval === 'year' ? '/year' : '/mo';

  if (!formattedPrice.endsWith(periodToken)) {
    return { main: formattedPrice, suffix: null, helper: null };
  }

  const price = formattedPrice.slice(0, -periodToken.length);
  return {
    main: price,
    suffix: interval === 'year' ? '/year' : '/month',
    helper: interval === 'year' ? 'Billed annually' : null,
  };
}

function subscriptionBillingInterval(subscription?: OrganizationSubscription | null): PlanBillingInterval | null {
  const plan = subscription?.plan;
  const metadata = subscription?.metadata || {};
  const interval = metadata.billing_interval || metadata.billingInterval;

  if (interval === 'year' || interval === 'annual' || interval === 'annually') return 'year';
  if (interval === 'month' || interval === 'monthly') return 'month';

  const stripePriceId = typeof metadata.stripePriceId === 'string' ? metadata.stripePriceId : null;
  if (plan?.stripeAnnualPriceId && stripePriceId === plan.stripeAnnualPriceId) return 'year';
  if (
    (plan?.stripeMonthlyPriceId && stripePriceId === plan.stripeMonthlyPriceId)
    || (plan?.stripePriceId && stripePriceId === plan.stripePriceId)
  ) {
    return 'month';
  }

  return null;
}

function getSubscriptionSeatCounts(subscription?: OrganizationSubscription | null) {
  const base = typeof subscription?.plan?.limits.seatLimit === 'number' && subscription.plan.limits.seatLimit > 0
    ? subscription.plan.limits.seatLimit
    : 0;
  const extra = typeof subscription?.extraSeatCount === 'number' && subscription.extraSeatCount > 0
    ? subscription.extraSeatCount
    : 0;

  return {
    base,
    extra,
    total: base + extra,
  };
}

function getPersonInitial(name?: string | null, email?: string | null): string {
  const source = (name || email || '').trim();
  if (!source) return '?';

  return source.slice(0, 1).toUpperCase();
}

function useTeamSeatSnapshot(organizationId?: string | null) {
  const { session } = useAuth();
  const [snapshot, setSnapshot] = useState<TeamSeatSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSeats = async () => {
      if (!session?.access_token) {
        setSnapshot(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          withOrganizationId('/api/organizations/members', organizationId),
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          }
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load team seats');
        }

        if (payload?.seats) {
          setSnapshot({
            seats: payload.seats,
            members: Array.isArray(payload.members) ? payload.members : [],
            invitations: Array.isArray(payload.invitations) ? payload.invitations : [],
          });
        } else {
          setSnapshot(null);
        }
      } catch (seatError) {
        setError(seatError instanceof Error ? seatError.message : 'Failed to load team seats');
        setSnapshot(null);
      } finally {
        setLoading(false);
      }
    };

    void loadSeats();
  }, [organizationId, session?.access_token]);

  return { snapshot, loading, error };
}

function TeamAvatarStack({
  members,
  invitations,
}: {
  members: TeamPreviewMember[];
  invitations: TeamPreviewInvitation[];
}) {
  const people = [
    ...members.map((member) => ({
      id: member.id,
      label: member.name || member.email || 'Team member',
      initial: getPersonInitial(member.name, member.email),
      pending: false,
    })),
    ...invitations.map((invitation) => ({
      id: invitation.id,
      label: invitation.email,
      initial: getPersonInitial(null, invitation.email),
      pending: true,
    })),
  ];
  const visiblePeople = people.slice(0, 8);
  const remaining = Math.max(0, people.length - visiblePeople.length);

  if (people.length === 0) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
        0
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {visiblePeople.map((person, index) => (
        <span
          key={`${person.pending ? 'invite' : 'member'}-${person.id}`}
          title={person.label}
          className={cn(
            '-ml-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold shadow-sm first:ml-0 dark:border-slate-950',
            person.pending
              ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900'
              : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
          )}
          style={{ zIndex: visiblePeople.length - index }}
        >
          {person.initial}
        </span>
      ))}
      {remaining > 0 && (
        <span className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-bold text-slate-600 shadow-sm dark:border-slate-950 dark:bg-slate-800 dark:text-slate-300">
          +{remaining}
        </span>
      )}
    </div>
  );
}

function PlansBillingSummaryCards({
  organizationId,
  plansOpen,
  onTogglePlans,
  onOpenPlans,
}: {
  organizationId?: string | null;
  plansOpen: boolean;
  onTogglePlans: () => void;
  onOpenPlans: () => void;
}) {
  const {
    organization,
    membership,
    subscription,
    loading: loadingSubscription,
    error: subscriptionError,
  } = useCurrentSubscription(organizationId);
  const {
    openingPortal,
    error: portalError,
    openPortal,
  } = useSubscriptionCheckout(organizationId);
  const { snapshot, loading: loadingSeats, error: seatsError } = useTeamSeatSnapshot(organizationId);
  const canManageBilling = canManageOrganizationBilling(membership?.role, organization?.type);
  const plan = subscription?.plan || null;
  const interval = subscriptionBillingInterval(subscription) || 'month';
  const planPrice = plan
    ? displayPlanPrice(plan, interval)
    : { main: 'No plan', suffix: null, helper: null };
  const seatCounts = getSubscriptionSeatCounts(subscription);
  const seatLimit = Number(snapshot?.seats.limit || seatCounts.total || plan?.limits.seatLimit || 0);
  const seatsUsed = Number(snapshot ? snapshot.seats.active + snapshot.seats.pending : 0);
  const seatPercent = seatLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0;
  const hasStripeCustomer = Boolean(subscription?.stripeCustomerId);
  const planActionLabel = subscriptionHasUsableStatus(subscription?.status) && plan?.slug !== 'free'
    ? 'Change plan'
    : 'Upgrade plan';

  if (loadingSubscription) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-44 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
        <div className="h-44 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                  {plan?.name || 'Subscription plan'}
                </h2>
                <BillingStatusBadge status={subscription?.status} />
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {plan?.description || 'Choose a plan for your organization workspace.'}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="flex min-w-0 flex-wrap items-end gap-x-1 gap-y-1 sm:justify-end">
                <span className="break-words text-4xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] dark:text-white">
                  {planPrice.main}
                </span>
                {planPrice.suffix && (
                  <span className="pb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {planPrice.suffix}
                  </span>
                )}
              </div>
              {planPrice.helper && (
                <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">{planPrice.helper}</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <TeamAvatarStack
                  members={snapshot?.members || []}
                  invitations={snapshot?.invitations || []}
                />
                <div>
                  <p className="text-sm font-bold text-slate-950 dark:text-white">
                    {loadingSeats ? 'Loading users...' : `${seatsUsed} of ${seatLimit || 0} users`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {snapshot
                      ? `${snapshot.seats.active} active, ${snapshot.seats.pending} invited, ${snapshot.seats.available} available`
                      : seatsError || 'Team seats use your current plan limit.'}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <motion.div
                  className="h-full rounded-full bg-slate-950 dark:bg-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${seatPercent}%` }}
                  transition={{ duration: 0.65, ease: 'easeOut' }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onTogglePlans}
              aria-expanded={plansOpen}
              aria-controls="subscription-plans"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-900"
            >
              {plansOpen ? 'Hide plans' : planActionLabel}
              <ChevronRight className={cn('h-4 w-4 transition-transform', plansOpen && 'rotate-90')} />
            </button>
          </div>

          {subscriptionError && (
            <p className="mt-4 text-sm text-red-700 dark:text-red-300">{subscriptionError}</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Payment method</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Change how you pay for your plan.
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <CreditCard className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-black text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300">
                  VISA
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-950 dark:text-white">
                    {hasStripeCustomer ? 'Saved in Stripe' : 'No saved payment method'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {hasStripeCustomer
                      ? 'Use Stripe to securely edit card details and billing email.'
                      : 'Add a card during checkout, then manage it here.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={hasStripeCustomer ? () => void openPortal() : onOpenPlans}
                disabled={openingPortal || (hasStripeCustomer && !canManageBilling)}
                title={hasStripeCustomer && !canManageBilling ? 'Only organization owners and admins can manage payment methods.' : undefined}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-px hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {hasStripeCustomer ? 'Edit' : 'Set up'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4" />
            Card information is stored and encrypted by Stripe.
          </div>

          {portalError && (
            <p className="mt-4 text-sm text-red-700 dark:text-red-300">{portalError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExtraSeatsManager({
  organizationId,
  subscription,
  canManageBilling,
  onUpdated,
}: {
  organizationId?: string | null;
  subscription: OrganizationSubscription | null;
  canManageBilling: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { session } = useAuth();
  const [targetSeatLimit, setTargetSeatLimit] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTeams = subscription?.plan?.slug === 'teams';
  const usable = subscriptionHasUsableStatus(subscription?.status);
  const interval = subscriptionBillingInterval(subscription);
  const counts = getSubscriptionSeatCounts(subscription);
  const seatPriceCents = subscription?.plan?.extraSeatPriceCents ?? null;
  const hasSeatPrice = interval === 'year'
    ? Boolean(subscription?.plan?.stripeExtraSeatAnnualPriceId)
    : Boolean(subscription?.plan?.stripeExtraSeatMonthlyPriceId);
  const canSubmit = canManageBilling
    && isTeams
    && usable
    && (interval === 'month' || interval === 'year')
    && hasSeatPrice
    && targetSeatLimit > counts.total
    && !updating;

  useEffect(() => {
    if (counts.total > 0) {
      setTargetSeatLimit(counts.total + 1);
    }
  }, [counts.total]);

  if (!isTeams || !subscription) {
    return null;
  }

  const seatPriceLabel = typeof seatPriceCents === 'number'
    ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(seatPriceCents / 100)}/seat/month${interval === 'year' ? ' billed annually' : ''}`
    : 'Configured in Stripe';

  const submit = async () => {
    if (!session?.access_token) {
      setError('Please log in to manage seats.');
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const response = await fetch('/api/subscriptions/seats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organization_id: organizationId || undefined,
          targetSeatLimit,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add seats');
      }

      toast.success(`Seat limit updated to ${payload.seats?.limit || targetSeatLimit}.`);
      await onUpdated();
    } catch (seatError) {
      setError(seatError instanceof Error ? seatError.message : 'Failed to add seats');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Teams seats</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {counts.base} included, {counts.extra} paid extra, {counts.total} total seats.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{seatPriceLabel}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="teams-seat-target" className="sr-only">Target seat limit</label>
          <input
            id="teams-seat-target"
            type="number"
            min={counts.total + 1}
            value={targetSeatLimit || ''}
            onChange={(event) => setTargetSeatLimit(Number(event.target.value))}
            disabled={!canManageBilling || updating}
            className="h-10 w-28 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            title={!canManageBilling ? 'Only organization owners and admins can manage seats.' : undefined}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
            Add seats
          </button>
        </div>
      </div>

      {interval !== 'month' && interval !== 'year' && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          Extra seats require a synced monthly or annual Teams subscription.
        </p>
      )}
      {!hasSeatPrice && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          Extra-seat billing is not configured in Stripe yet.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
      )}
    </div>
  );
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
    iconClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
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
        'relative flex h-full min-h-[440px] flex-col rounded-2xl border bg-white p-5 shadow-[0_16px_45px_-36px_rgba(15,23,42,0.45)] transition-colors dark:bg-slate-950',
        hasUsableCurrentStatus ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
        plan.isPopular && !hasUsableCurrentStatus ? 'border-slate-300 dark:border-slate-700' : ''
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', copy.iconClass)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {plan.isPopular && (
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
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

      <h3 className="text-lg font-bold text-slate-950 dark:text-white">{plan.name}</h3>
      <div className="mt-2 flex min-w-0 flex-wrap items-end gap-x-1 gap-y-0.5">
        <span className="break-words text-3xl font-bold tracking-tight text-slate-950 [overflow-wrap:anywhere] dark:text-white">{price.main}</span>
        {price.suffix && <span className="pb-1 text-sm font-medium text-slate-700 dark:text-slate-300">{price.suffix}</span>}
      </div>
      {price.helper && <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">{price.helper}</p>}
      <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-600 dark:text-slate-300">
        {copy.description}
      </p>

      <ul className="mt-5 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
        {getPlanCreditItems(plan).slice(0, 6).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
            <span className="min-w-0 break-words">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        disabled={disabled}
        title={!canManageBilling ? 'Only organization owners and admins can select subscription plans.' : undefined}
        className={cn(
          'mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
          hasUsableCurrentStatus
            ? 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
            : 'border border-slate-200 bg-white text-slate-700 hover:-translate-y-px hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:text-blue-300'
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
  } = useSubscriptionCheckout(organizationId);

  useEffect(() => {
    const interval = subscription?.metadata?.billing_interval;
    if (interval === 'year' || interval === 'annual') {
      setBillingInterval('year');
    }
  }, [subscription?.metadata]);

  const canManageBilling = canManageOrganizationBilling(membership?.role, organization?.type);
  const loading = loadingPlans || loadingSubscription;
  const error = plansError || subscriptionError || actionError;
  const orderedPlans = useMemo(() => {
    return [...plans].sort((firstPlan, secondPlan) => {
      const firstCurrent = isCurrentSubscriptionPlan(firstPlan, subscription);
      const secondCurrent = isCurrentSubscriptionPlan(secondPlan, subscription);

      if (firstCurrent === secondCurrent) return 0;
      return firstCurrent ? -1 : 1;
    });
  }, [plans, subscription]);

  return (
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)] dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="text-xl text-slate-950 dark:text-white">Subscription</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">
              View organization plans for recurring B2B content operations.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BillingStatusBadge status={subscription?.status} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5 pt-0 sm:p-6 sm:pt-0">
        <BillingIntervalToggle value={billingInterval} onChange={setBillingInterval} />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2 min-[1800px]:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-[440px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : orderedPlans.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            No subscription plans are available yet.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 min-[1800px]:grid-cols-4">
            {orderedPlans.map((plan) => (
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

        {!loading && (
          <ExtraSeatsManager
            organizationId={organizationId}
            subscription={subscription}
            canManageBilling={canManageBilling}
            onUpdated={refresh}
          />
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {organization?.name || 'Default workspace'}
            {subscription?.cancelAtPeriodEnd ? ' - cancels at period end' : ''}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex w-fit items-center gap-1.5 font-semibold text-slate-500 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:text-blue-300"
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
        selected ? 'border-blue-600 bg-blue-50 shadow-sm dark:bg-blue-950/40' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-bold text-slate-950 [overflow-wrap:anywhere] dark:text-white">{formatProductCredits(option.credits)} credits</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xl font-bold text-slate-950 dark:text-white">${option.price}</span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{option.helper}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          {option.badge && (
            <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              {option.badge}
            </span>
          )}
          {selected ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
              <Check className="h-4 w-4" />
            </span>
          ) : null}
        </div>
      </div>
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
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)] dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <WalletCards className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-lg text-slate-950 dark:text-white">Credit Top-Ups</CardTitle>
            <CardDescription className="mt-1 text-slate-600 dark:text-slate-400">Need more credits? Add them anytime.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        {!loading && !topUpsEnabled && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
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

        <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">
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

        <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
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
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300';
    case 'purchase':
    case 'top_up':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300';
    case 'subscription':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300';
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
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900">
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
        {Number.isNaN(date.getTime())
          ? '-'
          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', transactionTypeClass(transaction.transactionType))}>
          {transactionTypeLabel(transaction.transactionType)}
        </span>
      </td>
      <td className="min-w-[220px] px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
        <div className="font-medium text-slate-900 dark:text-slate-100">{transaction.reason || '-'}</div>
        {transaction.projectTitle && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{transaction.projectTitle}</div>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{transaction.invoiceNumber || '-'}</td>
      <td className={cn('whitespace-nowrap px-4 py-3 text-right text-sm font-bold', isPositive ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-950 dark:text-white')}>
        {amount}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Check className="h-3.5 w-3.5" />
          Completed
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => void copyTransactionDetails(transaction)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)] dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl text-slate-950 dark:text-white">Transaction History</CardTitle>
            <CardDescription className="mt-1 text-slate-600 dark:text-slate-400">All billing activity for your organization</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative">
              <span className="sr-only">Search transactions</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transactions..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 sm:w-64"
              />
            </label>
            <button
              type="button"
              onClick={exportTransactions}
              disabled={transactions.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900"
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
            <div className="h-44 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No transactions yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Billing activity will appear here once your organization makes a purchase or receives credits.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[800px] text-left">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3">Type</th>
                    <th scope="col" className="px-4 py-3">Description</th>
                    <th scope="col" className="px-4 py-3">Invoice</th>
                    <th scope="col" className="px-4 py-3 text-right">Amount</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTransactions.map((transaction) => (
                    <TransactionRow key={transaction.id} transaction={transaction} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', transactionTypeClass(transaction.transactionType))}>
                        {transactionTypeLabel(transaction.transactionType)}
                      </span>
                      <p className="mt-2 break-words text-sm font-semibold text-slate-950 dark:text-white">{transaction.reason || '-'}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(transaction.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <p className={cn('max-w-[45%] flex-shrink-0 break-words text-right text-sm font-bold [overflow-wrap:anywhere]', transaction.amount > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-950 dark:text-white')}>
                      {formatTransactionAmount(transaction)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {transactionTotal > TRANSACTIONS_PER_PAGE && (
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {((transactionPage - 1) * TRANSACTIONS_PER_PAGE) + 1} to {Math.min(transactionPage * TRANSACTIONS_PER_PAGE, transactionTotal)} of {transactionTotal}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTransactionPage((page) => Math.max(1, page - 1))}
                    disabled={transactionPage === 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
                    aria-label="Previous transactions page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionPage((page) => page + 1)}
                    disabled={transactionPage * TRANSACTIONS_PER_PAGE >= transactionTotal}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
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
    <Card className="rounded-2xl border-slate-200/90 bg-white shadow-[0_18px_55px_-42px_rgba(15,23,42,0.65)] dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-lg text-slate-950 dark:text-white">Usage this month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <UsageSparkline data={usageTrend} />
        <div>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
            <p className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">{percentUsed}%</p>
            <p className="pb-1 text-sm font-medium text-slate-600 dark:text-slate-400">of monthly credits used</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${percentUsed}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {isPlanCredit ? `${formatProductCredits(usedCredits)} credits` : formatSiteCredits(usedCredits)} used
            </span>
            <span className="min-w-0 break-words text-right [overflow-wrap:anywhere]">
              {isPlanCredit ? `${formatProductCredits(totalCredits)} credits` : formatSiteCredits(totalCredits)} total
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/usage"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-blue-300 dark:hover:text-blue-200"
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
  const [plansOpen, setPlansOpen] = useState(false);

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
      <DashboardPageShell maxWidth="full" contentClassName="max-w-[1560px]">
          <BillingSkeleton />
      </DashboardPageShell>
    );
  }

  if (!user) {
    return (
      <DashboardPageShell maxWidth="5xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Please log in to access billing.
        </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell maxWidth="full" contentClassName="max-w-[1560px]">
      <motion.div
        {...softMotion(shouldReduceMotion)}
        className="space-y-6"
      >
        <DashboardPageHeader
          icon={CreditCard}
          title="Plans and Billing"
          description="Manage your plan and billing details."
          actions={<HeaderCreditSummary balance={data.balance} />}
        />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <PlansBillingSummaryCards
          organizationId={organizationId}
          plansOpen={plansOpen}
          onTogglePlans={() => setPlansOpen((open) => !open)}
          onOpenPlans={() => setPlansOpen(true)}
        />

        {plansOpen ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] min-[1800px]:grid-cols-[minmax(0,1fr)_410px]">
            <div className="min-w-0 space-y-4">
              <div id="subscription-plans">
                <SubscriptionPlansCard organizationId={organizationId} />
              </div>
            </div>
            <aside className="min-w-0 space-y-4">
              <CreditTopUpsCard organizationId={organizationId} />
              <UsageThisMonthCard
                balance={data.balance}
                usageEvents={data.usageEvents}
                usageTrend={data.usageTrend}
              />
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <CreditTopUpsCard organizationId={organizationId} />
            </div>
            <div className="min-w-0">
              <UsageThisMonthCard
                balance={data.balance}
                usageEvents={data.usageEvents}
                usageTrend={data.usageTrend}
              />
            </div>
          </div>
        )}

        <TransactionHistoryCard
          transactions={data.transactions}
          transactionTotal={data.transactionTotal}
          transactionPage={transactionPage}
          setTransactionPage={setTransactionPage}
          loading={loadingTransactions}
        />
      </motion.div>
    </DashboardPageShell>
  );
}
