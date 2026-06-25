"use client";

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth/context';
import {
  fetchCurrentOrganization,
  type CurrentOrganization,
  type CurrentOrganizationRequestOptions,
} from '@/lib/organizations/current-organization';

type UseCurrentOrganizationResult = {
  organization: CurrentOrganization | null;
  organizationId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useCurrentOrganization(options: CurrentOrganizationRequestOptions = {}): UseCurrentOrganizationResult {
  const { user, session } = useAuth();
  const [organization, setOrganization] = useState<CurrentOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const requestedOrganizationId = options.organizationId ?? null;
  const requestedOrganizationType = options.organizationType ?? null;

  const load = useCallback(async () => {
    if (!user?.id) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const currentOrganization = await fetchCurrentOrganization(session?.access_token, {
        organizationId: requestedOrganizationId,
        organizationType: requestedOrganizationType,
      });
      setOrganization(currentOrganization);
    } catch (error) {
      console.warn('[ORG] Failed to load current organization context:', error);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, [requestedOrganizationId, requestedOrganizationType, session?.access_token, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    organization,
    organizationId: organization?.id || null,
    loading,
    refresh: load,
  };
}
