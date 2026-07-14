import { OrganizationAccessError, type OrganizationType } from '@/lib/authz/types';

export type NamedStudioAsset = {
  id: string;
  name: string;
};

export type StudioAssetWriteVisibility = 'private' | 'team';

export function normalizeStudioAssetWriteVisibility(value: unknown): StudioAssetWriteVisibility | null {
  if (value === 'private' || value === 'team') return value;
  if (value === 'organization') return 'team';
  return null;
}

export function resolveStudioAssetWriteOrganizationId(
  target: {
    activeOrganizationId: string;
    privateOrganizationId: string;
    organizationType?: OrganizationType | string | null;
  },
  requestedVisibility?: unknown
): string {
  const visibility = normalizeStudioAssetWriteVisibility(requestedVisibility);
  if (
    visibility === 'private'
    || target.activeOrganizationId === target.privateOrganizationId
    || target.organizationType === 'personal_legacy'
  ) {
    return target.privateOrganizationId;
  }

  return target.activeOrganizationId;
}

export function assertShareTargetIsTeamOrganization(
  target: {
    activeOrganizationId: string;
    privateOrganizationId: string;
    organizationType?: OrganizationType | string | null;
  },
  entityLabel: string
) {
  if (
    target.activeOrganizationId === target.privateOrganizationId
    || target.organizationType === 'personal_legacy'
  ) {
    throw new OrganizationAccessError(
      409,
      `Switch to a team workspace before publishing this ${entityLabel}.`
    );
  }
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function withSuffix(baseName: string, suffix: string, maxNameLength: number): string {
  const trimmedBase = baseName.trim();
  const maxBaseLength = Math.max(1, maxNameLength - suffix.length);
  return `${trimmedBase.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

export function getAvailableStudioAssetName(
  baseName: string,
  assets: NamedStudioAsset[],
  options: {
    excludeId?: string | null;
    maxNameLength?: number;
    suffixLabel: 'team' | 'private';
  }
): string {
  const maxNameLength = options.maxNameLength || 120;
  const taken = new Set(
    assets
      .filter((asset) => asset.id !== options.excludeId)
      .map((asset) => normalizeName(asset.name))
  );

  if (!taken.has(normalizeName(baseName))) return baseName;

  const firstCandidate = withSuffix(baseName, ` (${options.suffixLabel})`, maxNameLength);
  if (!taken.has(normalizeName(firstCandidate))) return firstCandidate;

  for (let index = 2; index <= 1000; index += 1) {
    const candidate = withSuffix(baseName, ` (${options.suffixLabel} ${index})`, maxNameLength);
    if (!taken.has(normalizeName(candidate))) return candidate;
  }

  throw new Error('No available asset name');
}

export function hideLegacySharedSources<T extends { id: string }>(
  assets: T[],
  getSharedFromId: (asset: T) => string | null | undefined
): T[] {
  const hiddenSourceIds = new Set(
    assets
      .map((asset) => getSharedFromId(asset))
      .filter((id): id is string => Boolean(id))
  );

  return assets.filter((asset) => !hiddenSourceIds.has(asset.id));
}
