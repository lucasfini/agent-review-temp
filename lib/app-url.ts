export function getAppBaseUrl(): string {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, '');
  }

  const appDomain = process.env.APP_DOMAIN?.trim();
  if (appDomain) {
    return appDomain.startsWith('http://') || appDomain.startsWith('https://')
      ? appDomain.replace(/\/+$/, '')
      : `https://${appDomain.replace(/\/+$/, '')}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')
      ? vercelUrl.replace(/\/+$/, '')
      : `https://${vercelUrl.replace(/\/+$/, '')}`;
  }

  return 'http://localhost:3000';
}
