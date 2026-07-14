import type { IntegrationProvider } from '@/lib/integrations/error-messages';

export type IntegrationHealthStatus = 'disconnected' | 'connected' | 'review';

export type IntegrationConnectionHealthInput = {
  status?: string | null;
  access_token_enc?: string | null;
  refresh_token_enc?: string | null;
  expires_at?: string | null;
};

export function getIntegrationConnectionHealth(row: IntegrationConnectionHealthInput | null | undefined): {
  healthStatus: IntegrationHealthStatus;
  connected: boolean;
  needsReview: boolean;
  issue: string | null;
} {
  if (!row || row.status === 'revoked') {
    return {
      healthStatus: 'disconnected',
      connected: false,
      needsReview: false,
      issue: null,
    };
  }

  if (row.status && row.status !== 'connected') {
    return {
      healthStatus: 'review',
      connected: false,
      needsReview: true,
      issue: 'needs_attention',
    };
  }

  if (!row.access_token_enc) {
    return {
      healthStatus: 'review',
      connected: false,
      needsReview: true,
      issue: 'missing_token',
    };
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  if (expiresAt && expiresAt <= Date.now() && !row.refresh_token_enc) {
    return {
      healthStatus: 'review',
      connected: false,
      needsReview: true,
      issue: 'expired_token',
    };
  }

  return {
    healthStatus: 'connected',
    connected: true,
    needsReview: false,
    issue: null,
  };
}

export const INTEGRATION_HEALTH_PROVIDERS: IntegrationProvider[] = [
  'zoom',
  'microsoft',
  'youtube',
  'notion',
  'onedrive',
  'google_drive',
  'granola',
  'slack',
];
