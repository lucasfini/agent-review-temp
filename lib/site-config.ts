import { getAppBaseUrl } from '@/lib/app-url';

export const SITE_NAME = 'AudioRepurpose';
export const SITE_DOMAIN = 'audiorepurpose.com';
export const SUPPORT_EMAIL = 'support@audiorepurpose.com';
export const PRIVACY_EMAIL = 'privacy@audiorepurpose.com';
export const SITE_DESCRIPTION =
  'Turn audio into transcript, insights, and publish-ready content from one workflow built for interviews, podcasts, and recorded conversations.';

export function getSiteUrl(): string {
  return getAppBaseUrl();
}
