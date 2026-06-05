"use client";

import { useCallback, useEffect, useState } from 'react';
import type { Plan } from '@/lib/billing/plans';

type PlansResponse = {
  plans?: Plan[];
  error?: string;
};

type UsePlansResult = {
  plans: Plan[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function usePlans(): UsePlansResult {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/plans', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as PlansResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load subscription plans');
      }

      setPlans(Array.isArray(payload.plans) ? payload.plans : []);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load subscription plans';
      setError(message);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { plans, loading, error, refresh: load };
}
