"use client";

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth/context';
import type { OrganizationSubscription } from '@/lib/billing/subscriptions';
import { withOrganizationId } from '@/lib/organizations/current-organization';

type CurrentSubscriptionOrganization = {
  id: string;
  name: string;
  type: string;
};

type CurrentSubscriptionMembership = {
  role: string;
  status: string;
};

type CurrentSubscriptionResponse = {
  organization?: CurrentSubscriptionOrganization;
  membership?: CurrentSubscriptionMembership;
  subscription?: OrganizationSubscription | null;
  entitlements?: unknown;
  error?: string;
};

type UseCurrentSubscriptionResult = {
  organization: CurrentSubscriptionOrganization | null;
  membership: CurrentSubscriptionMembership | null;
  subscription: OrganizationSubscription | null;
  entitlements: unknown;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCurrentSubscription(organizationId?: string | null): UseCurrentSubscriptionResult {
  const { session, user } = useAuth();
  const [organization, setOrganization] = useState<CurrentSubscriptionOrganization | null>(null);
  const [membership, setMembership] = useState<CurrentSubscriptionMembership | null>(null);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [entitlements, setEntitlements] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !session?.access_token) {
      setOrganization(null);
      setMembership(null);
      setSubscription(null);
      setEntitlements(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(withOrganizationId('/api/subscriptions/current', organizationId), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as CurrentSubscriptionResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load current subscription');
      }

      setOrganization(payload.organization || null);
      setMembership(payload.membership || null);
      setSubscription(payload.subscription || null);
      setEntitlements(payload.entitlements || null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load current subscription';
      setError(message);
      setOrganization(null);
      setMembership(null);
      setSubscription(null);
      setEntitlements(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, session?.access_token, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    organization,
    membership,
    subscription,
    entitlements,
    loading,
    error,
    refresh: load,
  };
}
