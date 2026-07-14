import type { KnownPlanSlug, Plan } from '@/lib/billing/plans';

export const PLAN_MAX_UPLOAD_MINUTES = {
  free: 30,
  standard: 90,
  pro: 180,
  teams: 240,
} as const satisfies Record<KnownPlanSlug, number>;

export const PLAN_MAX_UPLOAD_SECONDS = {
  free: 1_800,
  standard: 5_400,
  pro: 10_800,
  teams: 14_400,
} as const satisfies Record<KnownPlanSlug, number>;

const PLAN_UPGRADE_TARGETS: Partial<Record<KnownPlanSlug, KnownPlanSlug>> = {
  free: 'standard',
  standard: 'pro',
  pro: 'teams',
};

export const UPLOAD_PROCESSING_RESERVATION_TTL_MS = 12 * 3_600_000;
export const TRANSCRIPTION_AUDIO_URL_EXPIRES_SECONDS = 6 * 3_600;

export function isKnownPlanSlug(value?: string | null): value is KnownPlanSlug {
  return value === 'free' || value === 'standard' || value === 'pro' || value === 'teams';
}

export function getCanonicalPlanMaxUploadMinutes(slug?: string | null): number | null {
  return isKnownPlanSlug(slug) ? PLAN_MAX_UPLOAD_MINUTES[slug] : null;
}

export function getCanonicalPlanMaxUploadSeconds(slug?: string | null): number | null {
  return isKnownPlanSlug(slug) ? PLAN_MAX_UPLOAD_SECONDS[slug] : null;
}

export function getPlanMaxUploadMinutes(plan?: Pick<Plan, 'slug' | 'maxUploadMinutes'> | null): number | null {
  return getCanonicalPlanMaxUploadMinutes(plan?.slug) ?? plan?.maxUploadMinutes ?? null;
}

export function getPlanMaxUploadSeconds(plan?: Pick<Plan, 'slug' | 'maxUploadMinutes'> | null): number | null {
  const canonicalSeconds = getCanonicalPlanMaxUploadSeconds(plan?.slug);
  if (canonicalSeconds !== null) return canonicalSeconds;
  const minutes = plan?.maxUploadMinutes ?? null;
  return typeof minutes === 'number' ? minutes * 60 : null;
}

export function getUploadProcessingReservationExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + UPLOAD_PROCESSING_RESERVATION_TTL_MS).toISOString();
}

export function formatUploadDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function getUploadLimitUpgradeTarget(planSlug?: string | null): KnownPlanSlug | null {
  return isKnownPlanSlug(planSlug) ? PLAN_UPGRADE_TARGETS[planSlug] ?? null : null;
}

export function formatPlanName(slug?: string | null): string {
  if (!slug) return 'current';
  return slug === 'teams' ? 'Teams' : slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function buildPlanUploadLimitMessage(params: {
  requestedSeconds: number;
  planSlug?: string | null;
  maxUploadMinutes: number;
}): string {
  const planName = formatPlanName(params.planSlug);
  const duration = formatUploadDuration(params.requestedSeconds);
  const upgradeTarget = getUploadLimitUpgradeTarget(params.planSlug);

  if (upgradeTarget) {
    const upgradeName = formatPlanName(upgradeTarget);
    const upgradeLimit = PLAN_MAX_UPLOAD_MINUTES[upgradeTarget];
    return `This recording is ${duration}. Your ${planName} plan supports uploads up to ${params.maxUploadMinutes} minutes. Upgrade to ${upgradeName} for uploads up to ${upgradeLimit} minutes.`;
  }

  return `This recording is ${duration}. Your ${planName} plan supports uploads up to ${params.maxUploadMinutes} minutes.`;
}
