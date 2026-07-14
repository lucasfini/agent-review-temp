import type { Plan } from '@/lib/billing/plans';
import { getPlanStripePriceId, type PlanBillingInterval } from '@/lib/billing/plans';
import type { OrganizationSubscription, SubscriptionStatus } from '@/lib/billing/subscriptions';
import { formatProductCredits } from '@/lib/billing/product-credits';

function formatCurrency(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'usd',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatPlanPrice(
  plan: Pick<Plan, 'monthlyPriceCents' | 'annualPriceCents' | 'currency' | 'slug'>,
  interval: PlanBillingInterval = 'month'
): string {
  if (plan.slug === 'free' || plan.monthlyPriceCents === 0) {
    return '$0 forever';
  }

  if (interval === 'year' && typeof plan.annualPriceCents === 'number') {
    return `${formatCurrency(plan.annualPriceCents, plan.currency)}/year`;
  }

  if (interval === 'year') {
    return 'Annual unavailable';
  }

  if (plan.monthlyPriceCents === null || plan.monthlyPriceCents === undefined) {
    return 'Custom';
  }

  return `${formatCurrency(plan.monthlyPriceCents, plan.currency)}/mo`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatStorageLimit(storageMb: number): string {
  if (storageMb >= 1024) {
    const gb = storageMb / 1024;
    const formattedGb = Number.isInteger(gb) ? gb.toFixed(0) : gb.toFixed(1);
    return `${formattedGb} GB storage`;
  }

  return `${formatCompactNumber(storageMb)} MB storage`;
}

export function getPlanLimitItems(plan: Pick<Plan, 'limits'>): string[] {
  const limits = plan.limits;
  const items: string[] = [];

  if (typeof limits.seatLimit === 'number') items.push(`${formatCompactNumber(limits.seatLimit)} seats`);
  if (typeof limits.monthlyGenerationLimit === 'number') {
    items.push(`${formatCompactNumber(limits.monthlyGenerationLimit)} generations/mo`);
  }
  if (typeof limits.monthlyTranscriptionMinuteLimit === 'number') {
    items.push(`${formatCompactNumber(limits.monthlyTranscriptionMinuteLimit)} transcription min/mo`);
  }
  if (typeof limits.monthlyImportLimit === 'number') items.push(`${formatCompactNumber(limits.monthlyImportLimit)} imports/mo`);
  if (typeof limits.monthlyStorageMbLimit === 'number') items.push(formatStorageLimit(limits.monthlyStorageMbLimit));
  if (typeof limits.integrationLimit === 'number') items.push(`${formatCompactNumber(limits.integrationLimit)} integrations`);

  return items.length ? items : ['Custom limits'];
}

export function getPlanCreditItems(
  plan: Pick<
    Plan,
    | 'features'
    | 'monthlyCreditGrant'
    | 'maxUploadMinutes'
    | 'creditRolloverMonths'
    | 'topUpEnabled'
    | 'topUpCreditExpiryMonths'
    | 'extraSeatPriceCents'
    | 'limits'
  >
): string[] {
  const items: string[] = [];
  const creditLabel = typeof plan.features.credit_label === 'string'
    ? plan.features.credit_label
    : null;

  if (creditLabel) {
    items.push(creditLabel);
  } else if (typeof plan.monthlyCreditGrant === 'number') {
    items.push(`${formatProductCredits(plan.monthlyCreditGrant)} credits/month`);
  }

  if (typeof plan.maxUploadMinutes === 'number') {
    items.push(`${plan.maxUploadMinutes}-minute max upload`);
  }
  if (typeof plan.limits.seatLimit === 'number') {
    items.push(`${formatCompactNumber(plan.limits.seatLimit)} ${plan.limits.seatLimit === 1 ? 'seat' : 'seats'}`);
  }
  items.push(plan.creditRolloverMonths > 0 ? 'Credits roll over for 1 billing cycle' : 'Credits reset monthly');
  items.push(plan.topUpEnabled
    ? `Top-ups enabled; expire after ${plan.topUpCreditExpiryMonths} months`
    : 'Top-ups disabled');
  if (typeof plan.extraSeatPriceCents === 'number') {
    items.push(`Extra seats ${formatCurrency(plan.extraSeatPriceCents, 'usd')}/user/mo`);
  }

  return items;
}

export function formatSubscriptionStatus(status?: SubscriptionStatus | null): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Trialing';
    case 'past_due':
      return 'Past due';
    case 'canceled':
      return 'Canceled';
    case 'unpaid':
      return 'Unpaid';
    case 'incomplete':
      return 'Incomplete';
    case 'incomplete_expired':
      return 'Incomplete expired';
    case 'inactive':
    case null:
    case undefined:
      return 'No active subscription';
    default:
      return String(status).replace(/_/g, ' ');
  }
}

export function subscriptionHasUsableStatus(status?: SubscriptionStatus | null): boolean {
  return status === 'active' || status === 'trialing';
}

export function isCurrentSubscriptionPlan(
  plan: Pick<Plan, 'id'>,
  subscription?: Pick<OrganizationSubscription, 'planId' | 'status'> | null
): boolean {
  return Boolean(subscription?.planId && subscription.planId === plan.id);
}

export function getPlanActionLabel(
  plan: Pick<Plan, 'id' | 'slug' | 'stripePriceId' | 'stripeMonthlyPriceId' | 'stripeAnnualPriceId'>,
  subscription?: Pick<OrganizationSubscription, 'planId' | 'status'> | null,
  interval: PlanBillingInterval = 'month'
): string {
  if (isCurrentSubscriptionPlan(plan, subscription) && subscriptionHasUsableStatus(subscription?.status)) {
    return 'Current plan';
  }

  if (plan.slug === 'free') {
    return 'Free plan';
  }

  if (!getPlanStripePriceId(plan, interval)) {
    return 'Not configured';
  }

  return subscriptionHasUsableStatus(subscription?.status) ? 'Upgrade' : 'Start subscription';
}

export function isPlanActionDisabled(
  plan: Pick<Plan, 'id' | 'slug' | 'stripePriceId' | 'stripeMonthlyPriceId' | 'stripeAnnualPriceId'>,
  subscription?: Pick<OrganizationSubscription, 'planId' | 'status'> | null,
  interval: PlanBillingInterval = 'month'
): boolean {
  return plan.slug === 'free'
    || !getPlanStripePriceId(plan, interval)
    || (isCurrentSubscriptionPlan(plan, subscription) && subscriptionHasUsableStatus(subscription?.status));
}
