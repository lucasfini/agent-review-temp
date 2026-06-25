import type { SupabaseClient } from '@supabase/supabase-js';

import { can } from '@/lib/authz/permissions';
import {
  normalizeOrganizationMemberRole,
  type OrganizationMemberRole,
  type OrganizationType,
} from '@/lib/authz/types';

export type StudioAssetScope = 'private' | 'organization';

export interface CreatorProfile {
  id: string;
  organizationId: string;
  clientId: string | null;
  sharedFromProfileId: string | null;
  name: string;
  website: string | null;
  positioning: string | null;
  audience: string | null;
  contentGoal: string | null;
  isDefault: boolean;
  ownerUserId?: string | null;
  locked?: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  scope?: StudioAssetScope;
  canEdit?: boolean;
  canShare?: boolean;
  canUnshare?: boolean;
}

export interface CreatorProfileRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  shared_from_profile_id?: string | null;
  name: string;
  website: string | null;
  positioning: string | null;
  audience: string | null;
  content_goal: string | null;
  is_default: boolean;
  owner_user_id?: string | null;
  locked?: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreatorProfileInput = {
  name?: unknown;
  website?: unknown;
  positioning?: unknown;
  description?: unknown;
  audience?: unknown;
  contentGoal?: unknown;
  content_goal?: unknown;
  isDefault?: unknown;
  is_default?: unknown;
};

export class CreatorProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreatorProfileValidationError';
  }
}

const MAX_NAME_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_LONG_TEXT_LENGTH = 2000;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new CreatorProfileValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new CreatorProfileValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new CreatorProfileValidationError(`${field} must be a boolean`);
  }
  return value;
}

function requiredName(value: unknown): string {
  const normalized = optionalString(value, MAX_NAME_LENGTH, 'name');
  if (!normalized) {
    throw new CreatorProfileValidationError('Profile name is required');
  }
  return normalized;
}

function coalesceField(input: CreatorProfileInput, ...keys: Array<keyof CreatorProfileInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function isUniqueViolation(error: any): boolean {
  return error?.code === '23505'
    || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
}

export function canManageCreatorProfiles(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  const normalizedRole = normalizeOrganizationMemberRole(role);
  if (normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'editor') return true;
  return normalizedRole === 'agency_admin' && organizationType === 'internal_agency';
}

export function mapCreatorProfileRow(row: CreatorProfileRow): CreatorProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    sharedFromProfileId: row.shared_from_profile_id || null,
    name: row.name,
    website: row.website,
    positioning: row.positioning,
    audience: row.audience,
    contentGoal: row.content_goal,
    isDefault: Boolean(row.is_default),
    ownerUserId: row.owner_user_id || null,
    locked: Boolean(row.locked),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function decorateCreatorProfileScope(
  profile: CreatorProfile,
  options: {
    activeOrganizationId: string;
    privateOrganizationId: string;
    userId: string;
    role?: OrganizationMemberRole | string | null;
    organizationType?: OrganizationType | string | null;
  }
): CreatorProfile {
  const scope: StudioAssetScope = profile.organizationId === options.privateOrganizationId ? 'private' : 'organization';
  const visibility = scope === 'private' ? 'private' : 'workspace';

  return {
    ...profile,
    scope,
    canEdit: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'profile.update', {
      organizationId: profile.organizationId,
      ownerUserId: profile.ownerUserId || profile.createdBy,
      createdByUserId: profile.createdBy,
      visibility,
      locked: profile.locked,
    }),
    canShare: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'profile.share', {
      organizationId: profile.organizationId,
      ownerUserId: profile.ownerUserId || profile.createdBy,
      createdByUserId: profile.createdBy,
      visibility,
      locked: profile.locked,
    }),
    canUnshare: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'profile.unshare', {
      organizationId: profile.organizationId,
      ownerUserId: profile.ownerUserId || profile.createdBy,
      createdByUserId: profile.createdBy,
      visibility,
      locked: profile.locked,
    }),
  };
}

export function normalizeCreatorProfileInput(
  input: CreatorProfileInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawName = coalesceField(input, 'name');
  if (!options.partial || rawName !== undefined) {
    payload.name = requiredName(rawName);
  }

  const website = optionalString(input.website, MAX_SHORT_TEXT_LENGTH, 'website');
  if (website !== undefined) payload.website = website;

  const positioning = optionalString(
    coalesceField(input, 'positioning', 'description'),
    MAX_LONG_TEXT_LENGTH,
    'positioning'
  );
  if (positioning !== undefined) payload.positioning = positioning;

  const audience = optionalString(input.audience, MAX_LONG_TEXT_LENGTH, 'audience');
  if (audience !== undefined) payload.audience = audience;

  const contentGoal = optionalString(
    coalesceField(input, 'contentGoal', 'content_goal'),
    MAX_LONG_TEXT_LENGTH,
    'contentGoal'
  );
  if (contentGoal !== undefined) payload.content_goal = contentGoal;

  const isDefault = optionalBoolean(coalesceField(input, 'isDefault', 'is_default'), 'isDefault');
  if (isDefault !== undefined) payload.is_default = isDefault;

  return payload;
}

async function unsetOtherDefaultProfiles(
  supabase: SupabaseClient<any>,
  organizationId: string,
  exceptId?: string
): Promise<void> {
  let query = supabase
    .from('creator_profiles')
    .update({ is_default: false })
    .eq('organization_id', organizationId)
    .is('client_id', null)
    .eq('is_default', true) as any;

  if (exceptId) {
    query = query.neq('id', exceptId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to update default profile');
  }
}

export async function listCreatorProfiles(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<CreatorProfile[]> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .is('client_id', null)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false }) as {
      data: CreatorProfileRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load profiles');
  }

  return (data || []).map(mapCreatorProfileRow);
}

export async function listCreatorProfilesForOrganizations(
  supabase: SupabaseClient<any>,
  organizationIds: string[]
): Promise<CreatorProfile[]> {
  const ids = Array.from(new Set(organizationIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .in('organization_id', ids)
    .is('client_id', null)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false }) as {
      data: CreatorProfileRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load profiles');
  }

  return (data || []).map(mapCreatorProfileRow);
}

export async function getCreatorProfile(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<CreatorProfile | null> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: CreatorProfileRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load profile');
  }

  return data ? mapCreatorProfileRow(data) : null;
}

export async function getCreatorProfileInOrganizations(
  supabase: SupabaseClient<any>,
  organizationIds: string[],
  id: string
): Promise<CreatorProfile | null> {
  const ids = Array.from(new Set(organizationIds.filter(Boolean)));
  if (ids.length === 0) return null;

  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .in('organization_id', ids)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: CreatorProfileRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load profile');
  }

  return data ? mapCreatorProfileRow(data) : null;
}

export async function createCreatorProfile(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: CreatorProfileInput
): Promise<CreatorProfile> {
  const normalized = normalizeCreatorProfileInput(input);
  const wantsDefault = normalized.is_default === true;
  if (wantsDefault) {
    await unsetOtherDefaultProfiles(supabase, organizationId);
  }

  const payload = {
    ...normalized,
    organization_id: organizationId,
    client_id: null,
    created_by: createdBy,
    owner_user_id: createdBy,
  };

  const { data, error } = await supabase
    .from('creator_profiles')
    .insert(payload as any)
    .select('*')
    .single() as { data: CreatorProfileRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new CreatorProfileValidationError('A profile with this name already exists');
    }
    throw new Error(error?.message || 'Failed to create profile');
  }

  return mapCreatorProfileRow(data);
}

export async function updateCreatorProfile(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: CreatorProfileInput
): Promise<CreatorProfile | null> {
  const payload = normalizeCreatorProfileInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new CreatorProfileValidationError('No profile fields provided');
  }

  if (payload.is_default === true) {
    await unsetOtherDefaultProfiles(supabase, organizationId, id);
  }

  const { data, error } = await supabase
    .from('creator_profiles')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('*')
    .maybeSingle() as { data: CreatorProfileRow | null; error: any };

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CreatorProfileValidationError('A profile with this name already exists');
    }
    throw new Error(error.message || 'Failed to update profile');
  }

  return data ? mapCreatorProfileRow(data) : null;
}

export async function deleteCreatorProfile(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('creator_profiles')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to delete profile');
  }

  return Boolean(data);
}

export async function shareCreatorProfileToOrganization(
  supabase: SupabaseClient<any>,
  source: CreatorProfile,
  targetOrganizationId: string,
  userId: string
): Promise<CreatorProfile> {
  const sharedPayload = {
    name: source.name,
    website: source.website,
    positioning: source.positioning,
    audience: source.audience,
    content_goal: source.contentGoal,
  };

  const { data: existing, error: existingError } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('organization_id', targetOrganizationId)
    .eq('shared_from_profile_id', source.id)
    .is('client_id', null)
    .maybeSingle() as { data: CreatorProfileRow | null; error: any };

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load shared profile');
  }

  if (existing) {
    const { data, error } = await supabase
      .from('creator_profiles')
      .update(sharedPayload as any)
      .eq('id', existing.id)
      .select('*')
      .single() as { data: CreatorProfileRow | null; error: any };

    if (error || !data) {
      if (isUniqueViolation(error)) {
        throw new CreatorProfileValidationError('A shared profile with this name already exists');
      }
      throw new Error(error?.message || 'Failed to update shared profile');
    }

    return mapCreatorProfileRow(data);
  }

  const { data, error } = await supabase
    .from('creator_profiles')
    .insert({
      ...sharedPayload,
      organization_id: targetOrganizationId,
      client_id: null,
      created_by: userId,
      owner_user_id: userId,
      is_default: false,
      shared_from_profile_id: source.id,
    } as any)
    .select('*')
    .single() as { data: CreatorProfileRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new CreatorProfileValidationError('A shared profile with this name already exists');
    }
    throw new Error(error?.message || 'Failed to share profile');
  }

  return mapCreatorProfileRow(data);
}
