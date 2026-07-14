"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CreditCard, Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { DashboardPageShell } from '@/components/dashboard/shell';
import { useAuth } from '@/lib/auth/context';
import { canManageOrganizationBilling } from '@/lib/authz/billing-permission-rules';
import type { PlanBillingInterval } from '@/lib/billing/plans';
import {
  buildPublicPricingPlans,
  formatAnnualSavingsPercentSummary,
  formatPublicPlanPrice,
  getPublicPlanCardFeatures,
  hasCompleteAnnualPricing,
  normalizePublicBillingInterval,
  type PublicPricingPlan,
} from '@/lib/billing/public-pricing';
import { isCurrentSubscriptionPlan, subscriptionHasUsableStatus } from '@/lib/billing/subscription-ui';
import {
  getWorkspacePlanRestriction,
  isPersonalWorkspaceType,
  isTeamWorkspacePlanSlug,
} from '@/lib/billing/workspace-plan-policy';
import { useCurrentOrganization } from '@/lib/hooks/useCurrentOrganization';
import { useCurrentSubscription } from '@/lib/hooks/useCurrentSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useSubscriptionCheckout } from '@/lib/hooks/useSubscriptionCheckout';
import { cn } from '@/lib/utils';

function PlanCard({
  plan,
  interval,
  currentUsable,
  disabled,
  submitting,
  actionLabel,
  note,
  onSelect,
}: {
  plan: PublicPricingPlan;
  interval: PlanBillingInterval;
  currentUsable: boolean;
  disabled: boolean;
  submitting: boolean;
  actionLabel: string;
  note?: string | null;
  onSelect: () => void;
}) {
  const price = formatPublicPlanPrice(plan, interval);
  const emphasized = currentUsable || plan.isPopular;

  return (
    <article
      className={cn(
        'flex min-h-[32rem] flex-col rounded-2xl border bg-white p-6 shadow-[0_18px_60px_-42px_rgba(15,23,42,0.45)] transition-colors dark:bg-slate-950',
        emphasized
          ? 'border-blue-500 ring-1 ring-blue-500'
          : 'border-slate-200 dark:border-white/10'
      )}
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">{plan.name}</h2>
          <p className="mt-3 min-h-[3.5rem] text-base leading-7 text-slate-600 dark:text-slate-300">
            {plan.positioning}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {currentUsable && (
            <Badge className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-100">
              Current plan
            </Badge>
          )}
          {plan.isPopular && !currentUsable && (
            <Badge className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-400/30 dark:bg-purple-500/15 dark:text-purple-100">
              Most Popular
            </Badge>
          )}
          {price.savings && (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100">
              {price.savings}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">{price.main}</span>
        {price.suffix && <span className="pb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{price.suffix}</span>}
      </div>
      {price.helper && <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{price.helper}</p>}

      <div className="my-7 h-px bg-slate-200 dark:bg-white/10" />

      <ul className="space-y-4 text-base leading-7 text-slate-700 dark:text-slate-200">
        {getPublicPlanCardFeatures(plan).map((item) => (
          <li key={item} className="flex items-start gap-3">
            <Check className={cn('mt-1 h-5 w-5 flex-shrink-0', emphasized ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400')} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          'mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          currentUsable
            ? 'bg-blue-600 text-white'
            : emphasized
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
        )}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : currentUsable ? <Check className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
        {submitting ? 'Redirecting...' : actionLabel}
      </button>
      {note && <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{note}</p>}
    </article>
  );
}

export default function ChoosePlanPage() {
  const { user, loading: authLoading } = useAuth();
  const { organizationId } = useCurrentOrganization();
  const [interval, setInterval] = useState<PlanBillingInterval>('month');
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
    const subscriptionInterval = subscription?.metadata?.billing_interval;
    if (subscriptionInterval === 'year' || subscriptionInterval === 'annual') {
      setInterval('year');
    }
  }, [subscription?.metadata]);

  const canManageBilling = canManageOrganizationBilling(membership?.role, organization?.type);
  const loading = authLoading || loadingPlans || loadingSubscription;
  const error = plansError || subscriptionError || actionError;
  const publicPlans = useMemo(() => buildPublicPricingPlans(plans), [plans]);
  const annualPricingAvailable = hasCompleteAnnualPricing(publicPlans);
  const selectedInterval = normalizePublicBillingInterval(interval, publicPlans);
  const annualSavingsSummary = annualPricingAvailable
    ? formatAnnualSavingsPercentSummary(publicPlans)
    : null;
  const isPersonalWorkspace = isPersonalWorkspaceType(organization?.type);
  const workspaceName = organization?.name || 'this workspace';
  const hasPersonalTeamPlan = isPersonalWorkspace
    && subscriptionHasUsableStatus(subscription?.status)
    && isTeamWorkspacePlanSlug(subscription?.plan?.slug);

  if (loading) {
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
          Please log in to choose a plan.
        </div>
      </DashboardPageShell>
    );
  }

  return (
    <DashboardPageShell maxWidth="full" contentClassName="max-w-[1480px]">
      <div className="space-y-8">
        <div>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to billing
          </Link>
          <div className="mt-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Choose plan</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Select the plan for {workspaceName}. Pro and Teams checkout from a personal workspace will continue in your team workspace.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/5">
                {(['month', 'year'] as const).map((value) => {
                  const disabled = value === 'year' && !annualPricingAvailable;
                  const selected = interval === value && !disabled;

                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setInterval(value)}
                      className={cn(
                        'min-w-[8rem] rounded-full px-5 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                        selected
                          ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-100 dark:text-slate-950'
                          : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                      )}
                    >
                      {value === 'month' ? 'Monthly' : 'Annual'}
                    </button>
                  );
                })}
              </div>
              {annualSavingsSummary ? (
                <p className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {annualSavingsSummary}
                </p>
              ) : (
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Annual billing appears when every paid plan has a configured annual price.
                </p>
              )}
            </div>
          </div>
        </div>

        {subscription?.plan && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-100">
            You&apos;re currently on the {subscription.plan.name} plan. Changes will apply through the configured billing flow.
          </div>
        )}

        {isPersonalWorkspace && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
            Personal workspace billing is separate from team billing. Standard applies here; Pro and Teams will create or switch to your team workspace before checkout.
          </div>
        )}

        {organization?.type === 'saas_customer' && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
            This team workspace has separate billing from your personal workspace. Team workspaces require Pro or Teams.
          </div>
        )}

        {hasPersonalTeamPlan && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100">
            This personal workspace already has a seat-based plan. Keep managing it here, but new team collaboration should be billed from your team workspace.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 min-[1320px]:grid-cols-4">
          {publicPlans.map((plan) => {
            const current = isCurrentSubscriptionPlan(plan, subscription);
            const currentUsable = current && subscriptionHasUsableStatus(subscription?.status);
            const isSubmitting = checkoutPlanId === plan.slug || checkoutPlanId === plan.id;
            const stripePriceConfigured = selectedInterval === 'year'
              ? plan.stripeAnnualPriceConfigured
              : plan.stripeMonthlyPriceConfigured;
            const workspaceRestriction = getWorkspacePlanRestriction({
              planSlug: plan.slug,
              organizationType: organization?.type,
            });
            const routesToTeamWorkspace = isPersonalWorkspace && isTeamWorkspacePlanSlug(plan.slug);
            const actionLabel = currentUsable
              ? 'Current plan'
              : workspaceRestriction
                ? 'Not available'
                : plan.slug === 'free'
                  ? 'Free plan'
                  : !stripePriceConfigured
                    ? 'Not configured'
                    : routesToTeamWorkspace
                      ? 'Continue in team workspace'
                      : 'Select plan';
            const disabled = !canManageBilling
              || currentUsable
              || Boolean(workspaceRestriction)
              || Boolean(checkoutPlanId)
              || openingPortal
              || (plan.slug !== 'free' && !stripePriceConfigured);

            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                interval={selectedInterval}
                currentUsable={currentUsable}
                disabled={disabled}
                submitting={isSubmitting}
                actionLabel={actionLabel}
                note={workspaceRestriction || (!currentUsable && routesToTeamWorkspace ? 'Checkout will apply to your team workspace, not your personal workspace.' : null)}
                onSelect={() => {
                  if (plan.slug === 'free') {
                    if (subscription?.stripeCustomerId) void openPortal();
                    return;
                  }
                  void startCheckout({ planSlug: plan.slug, billingInterval: selectedInterval });
                }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh subscription status
          </button>
        </div>
      </div>
    </DashboardPageShell>
  );
}
