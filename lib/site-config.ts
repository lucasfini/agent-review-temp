import { getAppBaseUrl } from '@/lib/app-url';

export const SITE_NAME = 'AudioRepurpose';
export const SITE_DOMAIN = 'audiorepurpose.com';
export const SUPPORT_EMAIL = 'support@audiorepurpose.com';
export const PRIVACY_EMAIL = 'privacy@audiorepurpose.com';
export const SITE_DESCRIPTION =
  'Audio Repurpose turns podcasts, interviews, webinars, and recorded conversations into accurate transcripts, speaker insights, summaries, and ready-to-publish content.';

export function getSiteUrl(): string {
  return getAppBaseUrl();
}
