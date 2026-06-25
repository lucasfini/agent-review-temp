export const INTEGRATIONS_ENABLED = false;
export const YOUTUBE_INTEGRATION_ENABLED = true;
export const INTEGRATIONS_COMING_SOON_MESSAGE =
  'Most workspace integrations are temporarily unavailable while we finish the production rollout.';

export const isIntegrationEnabled = (provider: string) =>
  provider === 'youtube' ? YOUTUBE_INTEGRATION_ENABLED : INTEGRATIONS_ENABLED;
