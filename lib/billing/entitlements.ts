import type { SupabaseClient } from '@supabase/supabase-js';

import {
  emptyPlanLimits,
  getPlanLimits,
  type PlanLimits,
  type PlanSlug,
} from '@/lib/billing/plans';
import {
  getOrganizationSubscription,
  isSubscriptionUsable,
  type OrganizationSubscription,
  type SubscriptionStatus,
} from '@/lib/billing/subscriptions';
import { supabaseAdmin } from '@/lib/supabase/server';

export type EntitlementSource = 'subscription' | 'legacy_fallback';
export type EntitlementEnforcementMode = 'report_only' | 'none';

export interface EntitlementPlanSummary {
  id: string;
  name: string;
  slug: PlanSlug;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  monthlyCreditGrant: number | null;
  creditRolloverMonths: number;
  topUpEnabled: boolean;
  topUpCreditExpiryMonths: number;
  maxUploadMinutes: number | null;
  extraSeatPriceCents: number | null;
  isPopular: boolean;
}

export interface EntitlementSubscriptionSummary {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface OrganizationEntitlements {
  source: EntitlementSource;
  enforcementMode: EntitlementEnforcementMode;
  plan: EntitlementPlanSummary | null;
  subscription: EntitlementSubscriptionSummary | null;
  isSubscriptionUsable: boolean;
  legacyCreditsEnabled: boolean;
  limits: PlanLimits;
  features: Record<string, unknown>;
}

function summarizeSubscription(
  subscription?: OrganizationSubscription | null
): EntitlementSubscriptionSummary | null {
  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

export function getFallbackFreeOrLegacyEntitlements(
  subscription?: OrganizationSubscription | null
): OrganizationEntitlements {
  return {
    source: 'legacy_fallback',
    enforcementMode: 'none',
    plan: null,
    subscription: summarizeSubscription(subscription),
    isSubscriptionUsable: false,
    legacyCreditsEnabled: true,
    limits: emptyPlanLimits(),
    features: {
      creditPaygEnabled: true,
      subscriptionEnforcementEnabled: false,
    },
  };
}

export function getEntitlementsForSubscription(
  subscription?: OrganizationSubscription | null
): OrganizationEntitlements {
  const usable = isSubscriptionUsable(subscription?.status);
  const plan = subscription?.plan || null;

  if (!subscription || !plan || !usable) {
    return getFallbackFreeOrLegacyEntitlements(subscription);
  }

  return {
    source: 'subscription',
    enforcementMode: 'report_only',
    plan: {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      currency: plan.currency,
      monthlyCreditGrant: plan.monthlyCreditGrant,
      creditRolloverMonths: plan.creditRolloverMonths,
      topUpEnabled: plan.topUpEnabled,
      topUpCreditExpiryMonths: plan.topUpCreditExpiryMonths,
      maxUploadMinutes: plan.maxUploadMinutes,
      extraSeatPriceCents: plan.extraSeatPriceCents,
      isPopular: plan.isPopular,
    },
    subscription: summarizeSubscription(subscription),
    isSubscriptionUsable: true,
    legacyCreditsEnabled: true,
    limits: getPlanLimits(plan),
    features: {
      ...plan.features,
      monthlyCreditGrant: plan.monthlyCreditGrant,
      creditRolloverMonths: plan.creditRolloverMonths,
      topUpEnabled: plan.topUpEnabled,
      topUpCreditExpiryMonths: plan.topUpCreditExpiryMonths,
      maxUploadMinutes: plan.maxUploadMinutes,
      creditPaygEnabled: true,
      subscriptionEnforcementEnabled: false,
    },
  };
}

export async function getOrganizationEntitlements(
  supabase: SupabaseClient<any> = supabaseAdmin,
  organizationId: string
): Promise<OrganizationEntitlements> {
  const subscription = await getOrganizationSubscription(supabase, organizationId);
  return getEntitlementsForSubscription(subscription);
}
