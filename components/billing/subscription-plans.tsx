"use client";

import { useState } from 'react';
import { Check, CreditCard, ExternalLink, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatPlanPrice,
  formatSubscriptionStatus,
  getPlanActionLabel,
  getPlanCreditItems,
  isCurrentSubscriptionPlan,
  isPlanActionDisabled,
  subscriptionHasUsableStatus,
} from '@/lib/billing/subscription-ui';
import type { PlanBillingInterval } from '@/lib/billing/plans';
import { canManageOrganizationBilling } from '@/lib/authz/billing-permission-rules';
import { useCurrentSubscription } from '@/lib/hooks/useCurrentSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useSubscriptionCheckout } from '@/lib/hooks/useSubscriptionCheckout';
import { cn } from '@/lib/utils';

interface SubscriptionPlansProps {
  organizationId?: string | null;
}

function statusBadgeClass(status?: string | null): string {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    case 'past_due':
    case 'unpaid':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
      return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300';
  }
}

function PlanSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-56 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

export default function SubscriptionPlans({ organizationId }: SubscriptionPlansProps) {
  const [billingInterval, setBillingInterval] = useState<PlanBillingInterval>('month');
  const { plans, loading: loadingPlans, error: plansError } = usePlans();
  const {
    organization,
    membership,
    subscription,
    loading: loadingSubscription,
    error: subscriptionError,
    refresh: refreshSubscription,
  } = useCurrentSubscription(organizationId);
  const {
    checkoutPlanId,
    openingPortal,
    error: actionError,
    startCheckout,
    openPortal,
  } = useSubscriptionCheckout(organizationId);

  const loading = loadingPlans || loadingSubscription;
  const currentPlanName = subscription?.plan?.name || (subscription ? 'Plan unavailable' : 'No subscription plan');
  const currentStatus = formatSubscriptionStatus(subscription?.status);
  const canManageBilling = canManageOrganizationBilling(membership?.role, organization?.type);
  const canOpenPortal = canManageBilling && Boolean(subscription?.stripeCustomerId);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              View organization plans for recurring B2B content operations and manage Stripe subscription billing.
            </CardDescription>
          </div>
          {canOpenPortal && (
            <button
              type="button"
              onClick={openPortal}
              disabled={openingPortal}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Manage subscription
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Current organization
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {organization?.name || 'Default workspace'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Badge className={cn('w-fit border', statusBadgeClass(subscription?.status))}>
                {currentStatus}
              </Badge>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {currentPlanName}
                {subscription?.cancelAtPeriodEnd ? ' - cancels at period end' : ''}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Credits are monthly processing capacity, not cash value. Paid plan credits roll over for one extra billing cycle.
          </p>
        </div>

        <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
          {(['month', 'year'] as const).map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() => setBillingInterval(interval)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                billingInterval === interval
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              )}
            >
              {interval === 'month' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>

        {(plansError || subscriptionError || actionError) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {actionError || subscriptionError || plansError}
          </div>
        )}

        {loading ? (
          <PlanSkeleton />
        ) : plans.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
            No subscription plans are available yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const isCurrent = isCurrentSubscriptionPlan(plan, subscription);
              const hasUsableCurrentStatus = isCurrent && subscriptionHasUsableStatus(subscription?.status);
              const actionLabel = getPlanActionLabel(plan, subscription, billingInterval);
              const disabled = !canManageBilling
                || isPlanActionDisabled(plan, subscription, billingInterval)
                || Boolean(checkoutPlanId)
                || openingPortal;
              const isSubmitting = checkoutPlanId === plan.slug || checkoutPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'flex flex-col rounded-xl border p-4 transition-colors',
                    hasUsableCurrentStatus
                      ? 'border-blue-300 bg-blue-50/70 dark:border-blue-800/70 dark:bg-blue-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h3>
                        {plan.isPopular && (
                          <Badge className="border-blue-200 bg-blue-50 text-[10px] uppercase tracking-[0.12em] text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                            Most Popular
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
                        {formatPlanPrice(plan, billingInterval)}
                      </p>
                      {billingInterval === 'year' && plan.slug !== 'free' && typeof plan.annualPriceCents === 'number' && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Billed annually
                        </p>
                      )}
                    </div>
                    {hasUsableCurrentStatus && (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>

                  <p className="mb-4 min-h-[48px] text-sm text-slate-500 dark:text-slate-400">
                    {plan.description || 'Subscription plan for organization content workspaces.'}
                  </p>

                  <ul className="mb-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {getPlanCreditItems(plan).slice(0, 6).map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => startCheckout({ planSlug: plan.slug, billingInterval })}
                    disabled={disabled}
                    title={!canManageBilling ? 'Only organization owners and admins can manage subscription billing.' : undefined}
                    className={cn(
                      'mt-auto inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55',
                      hasUsableCurrentStatus
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : !isPlanActionDisabled(plan, null, billingInterval)
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'border border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                    )}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {isSubmitting ? 'Redirecting...' : actionLabel}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {subscription?.stripeCustomerId && !subscription?.stripeSubscriptionId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            Stripe customer exists, but no active subscription has synced yet. Use the portal to finish or review billing setup.
          </div>
        )}

        <div className="text-right">
          <button
            type="button"
            onClick={refreshSubscription}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Refresh subscription status
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
