"use client";

import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth/context';

type CheckoutInput = {
  planSlug?: string;
  planId?: string;
  billingInterval?: 'month' | 'year';
};

type CheckoutResponse = {
  url?: string;
  error?: string;
};

type PortalResponse = {
  url?: string;
  error?: string;
};

type UseSubscriptionCheckoutResult = {
  checkoutPlanId: string | null;
  openingPortal: boolean;
  error: string | null;
  startCheckout: (input: CheckoutInput) => Promise<void>;
  openPortal: () => Promise<void>;
  clearError: () => void;
};

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || fallback;
}

export function useSubscriptionCheckout(organizationId?: string | null): UseSubscriptionCheckoutResult {
  const { session } = useAuth();
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const startCheckout = useCallback(async (input: CheckoutInput) => {
    if (!session?.access_token) {
      setError('Please log in to manage subscriptions.');
      return;
    }

    const requestedPlan = input.planSlug || input.planId;
    if (!requestedPlan) {
      setError('Choose a subscription plan first.');
      return;
    }

    setCheckoutPlanId(requestedPlan);
    setError(null);

    try {
      const response = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          planSlug: input.planSlug,
          planId: input.planId,
          billingInterval: input.billingInterval || 'month',
          organization_id: organizationId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to start subscription checkout'));
      }

      const payload = await response.json() as CheckoutResponse;
      if (!payload.url) {
        throw new Error('No checkout URL returned');
      }

      window.location.href = payload.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Failed to start subscription checkout');
      setCheckoutPlanId(null);
    }
  }, [organizationId, session?.access_token]);

  const openPortal = useCallback(async () => {
    if (!session?.access_token) {
      setError('Please log in to manage subscriptions.');
      return;
    }

    setOpeningPortal(true);
    setError(null);

    try {
      const response = await fetch('/api/subscriptions/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organization_id: organizationId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to open billing portal'));
      }

      const payload = await response.json() as PortalResponse;
      if (!payload.url) {
        throw new Error('No portal URL returned');
      }

      window.location.href = payload.url;
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : 'Failed to open billing portal');
      setOpeningPortal(false);
    }
  }, [organizationId, session?.access_token]);

  return {
    checkoutPlanId,
    openingPortal,
    error,
    startCheckout,
    openPortal,
    clearError,
  };
}
