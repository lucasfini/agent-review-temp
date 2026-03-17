export const SITE_CREDITS_PER_USD = 10_000;

export function usdToSiteCredits(amountUsd: number): number {
  if (!Number.isFinite(amountUsd)) return 0;
  return Math.round(amountUsd * SITE_CREDITS_PER_USD);
}

export function formatSiteCredits(credits: number): string {
  return `${Math.round(credits).toLocaleString('en-US')} credits`;
}

export function formatSiteCreditsFromUsd(amountUsd: number): string {
  return formatSiteCredits(usdToSiteCredits(amountUsd));
}

export function formatSiteCreditDeltaFromUsd(amountUsd: number): string {
  const credits = usdToSiteCredits(Math.abs(amountUsd));
  const prefix = amountUsd > 0 ? '+' : amountUsd < 0 ? '-' : '';
  return `${prefix}${formatSiteCredits(credits)}`;
}
