import type { Plan } from '@/lib/billing/plans';
import type { OrganizationSubscription, SubscriptionStatus } from '@/lib/billing/subscriptions';

export function formatPlanPrice(plan: Pick<Plan, 'monthlyPriceCents' | 'currency'>): string {
  if (plan.monthlyPriceCents === null || plan.monthlyPriceCents === undefined) {
    return 'Custom';
  }

  const amount = plan.monthlyPriceCents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency || 'usd',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

  return `${formatted}/mo`;
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
  plan: Pick<Plan, 'id' | 'stripePriceId'>,
  subscription?: Pick<OrganizationSubscription, 'planId' | 'status'> | null
): string {
  if (isCurrentSubscriptionPlan(plan, subscription) && subscriptionHasUsableStatus(subscription?.status)) {
    return 'Current plan';
  }

  if (!plan.stripePriceId) {
    return 'Not configured';
  }

  return subscriptionHasUsableStatus(subscription?.status) ? 'Upgrade' : 'Start subscription';
}

export function isPlanActionDisabled(
  plan: Pick<Plan, 'id' | 'stripePriceId'>,
  subscription?: Pick<OrganizationSubscription, 'planId' | 'status'> | null
): boolean {
  return !plan.stripePriceId
    || (isCurrentSubscriptionPlan(plan, subscription) && subscriptionHasUsableStatus(subscription?.status));
}
