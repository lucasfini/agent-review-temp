export const ZOOM_INTEGRATION_ENABLED = true;
export const MICROSOFT_INTEGRATION_ENABLED = true;
export const YOUTUBE_INTEGRATION_ENABLED = true;
export const NOTION_INTEGRATION_ENABLED = true;
export const ONEDRIVE_INTEGRATION_ENABLED = true;
export const GOOGLE_DRIVE_INTEGRATION_ENABLED = true;
export const GRANOLA_INTEGRATION_ENABLED = true;
export const SLACK_INTEGRATION_ENABLED = true;
export const INTEGRATIONS_COMING_SOON_MESSAGE =
  'Most workspace integrations are temporarily unavailable while we finish the production rollout.';

export const isIntegrationEnabled = (provider: string) =>
  provider === 'zoom' ? ZOOM_INTEGRATION_ENABLED :
  provider === 'microsoft' ? MICROSOFT_INTEGRATION_ENABLED :
  provider === 'youtube' ? YOUTUBE_INTEGRATION_ENABLED :
  provider === 'notion' ? NOTION_INTEGRATION_ENABLED :
  provider === 'onedrive' ? ONEDRIVE_INTEGRATION_ENABLED :
  provider === 'google_drive' ? GOOGLE_DRIVE_INTEGRATION_ENABLED :
  provider === 'granola' ? GRANOLA_INTEGRATION_ENABLED :
  provider === 'slack' ? SLACK_INTEGRATION_ENABLED :
  false;
