import type { SupabaseClient } from '@supabase/supabase-js';

import { can } from '@/lib/authz/permissions';
import {
  normalizeOrganizationMemberRole,
  type OrganizationMemberRole,
  type OrganizationType,
} from '@/lib/authz/types';

export type StudioAssetScope = 'private' | 'organization';

export interface BrandVoice {
  id: string;
  organizationId: string;
  clientId: string | null;
  sharedFromVoiceId: string | null;
  name: string;
  description: string | null;
  tone: string | null;
  audience: string | null;
  contentPillars: string[];
  writingExamples: string[];
  bannedPhrases: string[];
  ctaPreferences: string | null;
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

export interface BrandVoiceRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  shared_from_voice_id?: string | null;
  name: string;
  description: string | null;
  tone: string | null;
  audience: string | null;
  content_pillars_json: unknown;
  writing_examples_json: unknown;
  banned_phrases_json: unknown;
  cta_preferences: string | null;
  owner_user_id?: string | null;
  locked?: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BrandVoiceInput = {
  name?: unknown;
  description?: unknown;
  tone?: unknown;
  audience?: unknown;
  contentPillars?: unknown;
  content_pillars?: unknown;
  content_pillars_json?: unknown;
  writingExamples?: unknown;
  writing_examples?: unknown;
  writing_examples_json?: unknown;
  bannedPhrases?: unknown;
  banned_phrases?: unknown;
  banned_phrases_json?: unknown;
  ctaPreferences?: unknown;
  cta_preferences?: unknown;
};

export class BrandVoiceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandVoiceValidationError';
  }
}

const MAX_NAME_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_LONG_TEXT_LENGTH = 1200;
const MAX_LIST_ITEMS = 24;
const MAX_LIST_ITEM_LENGTH = 600;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BrandVoiceValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new BrandVoiceValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredName(value: unknown): string {
  const normalized = optionalString(value, MAX_NAME_LENGTH, 'name');
  if (!normalized) {
    throw new BrandVoiceValidationError('Brand voice name is required');
  }
  return normalized;
}

function stringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new BrandVoiceValidationError(`${field} must be an array`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    throw new BrandVoiceValidationError(`${field} can include at most ${MAX_LIST_ITEMS} items`);
  }

  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new BrandVoiceValidationError(`${field} items must be strings`);
    }

    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_LIST_ITEM_LENGTH) {
      throw new BrandVoiceValidationError(`${field} items must be ${MAX_LIST_ITEM_LENGTH} characters or fewer`);
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(trimmed);
  }

  return items;
}

function coalesceField(input: BrandVoiceInput, ...keys: Array<keyof BrandVoiceInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function parseStoredList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function canManageBrandVoice(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  const normalizedRole = normalizeOrganizationMemberRole(role);
  if (normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'editor') return true;
  return normalizedRole === 'agency_admin' && organizationType === 'internal_agency';
}

export function mapBrandVoiceRow(row: BrandVoiceRow): BrandVoice {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    sharedFromVoiceId: row.shared_from_voice_id || null,
    name: row.name,
    description: row.description,
    tone: row.tone,
    audience: row.audience,
    contentPillars: parseStoredList(row.content_pillars_json),
    writingExamples: parseStoredList(row.writing_examples_json),
    bannedPhrases: parseStoredList(row.banned_phrases_json),
    ctaPreferences: row.cta_preferences,
    ownerUserId: row.owner_user_id || null,
    locked: Boolean(row.locked),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function decorateBrandVoiceScope(
  voice: BrandVoice,
  options: {
    activeOrganizationId: string;
    privateOrganizationId: string;
    userId: string;
    role?: OrganizationMemberRole | string | null;
    organizationType?: OrganizationType | string | null;
  }
): BrandVoice {
  const scope: StudioAssetScope = voice.organizationId === options.privateOrganizationId ? 'private' : 'organization';
  const visibility = scope === 'private' ? 'private' : 'workspace';

  return {
    ...voice,
    scope,
    canEdit: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'voice.update', {
      organizationId: voice.organizationId,
      ownerUserId: voice.ownerUserId || voice.createdBy,
      createdByUserId: voice.createdBy,
      visibility,
      locked: voice.locked,
    }),
    canShare: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'voice.share', {
      organizationId: voice.organizationId,
      ownerUserId: voice.ownerUserId || voice.createdBy,
      createdByUserId: voice.createdBy,
      visibility,
      locked: voice.locked,
    }),
    canUnshare: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'voice.unshare', {
      organizationId: voice.organizationId,
      ownerUserId: voice.ownerUserId || voice.createdBy,
      createdByUserId: voice.createdBy,
      visibility,
      locked: voice.locked,
    }),
  };
}

export function normalizeBrandVoiceInput(
  input: BrandVoiceInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawName = coalesceField(input, 'name');
  if (!options.partial || rawName !== undefined) {
    payload.name = requiredName(rawName);
  }

  const description = optionalString(input.description, MAX_LONG_TEXT_LENGTH, 'description');
  if (description !== undefined) payload.description = description;

  const tone = optionalString(input.tone, MAX_SHORT_TEXT_LENGTH, 'tone');
  if (tone !== undefined) payload.tone = tone;

  const audience = optionalString(input.audience, MAX_LONG_TEXT_LENGTH, 'audience');
  if (audience !== undefined) payload.audience = audience;

  const contentPillars = stringList(
    coalesceField(input, 'contentPillars', 'content_pillars', 'content_pillars_json'),
    'contentPillars'
  );
  if (contentPillars !== undefined) payload.content_pillars_json = contentPillars;

  const writingExamples = stringList(
    coalesceField(input, 'writingExamples', 'writing_examples', 'writing_examples_json'),
    'writingExamples'
  );
  if (writingExamples !== undefined) payload.writing_examples_json = writingExamples;

  const bannedPhrases = stringList(
    coalesceField(input, 'bannedPhrases', 'banned_phrases', 'banned_phrases_json'),
    'bannedPhrases'
  );
  if (bannedPhrases !== undefined) payload.banned_phrases_json = bannedPhrases;

  const ctaPreferences = optionalString(
    coalesceField(input, 'ctaPreferences', 'cta_preferences'),
    MAX_LONG_TEXT_LENGTH,
    'ctaPreferences'
  );
  if (ctaPreferences !== undefined) payload.cta_preferences = ctaPreferences;

  return payload;
}

function isUniqueViolation(error: any): boolean {
  return error?.code === '23505'
    || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
}

export async function listBrandVoices(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<BrandVoice[]> {
  const { data, error } = await supabase
    .from('brand_voices')
    .select('*')
    .eq('organization_id', organizationId)
    .is('client_id', null)
    .order('updated_at', { ascending: false }) as {
      data: BrandVoiceRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load brand voices');
  }

  return (data || []).map(mapBrandVoiceRow);
}

export async function listBrandVoicesForOrganizations(
  supabase: SupabaseClient<any>,
  organizationIds: string[]
): Promise<BrandVoice[]> {
  const ids = Array.from(new Set(organizationIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('brand_voices')
    .select('*')
    .in('organization_id', ids)
    .is('client_id', null)
    .order('updated_at', { ascending: false }) as {
      data: BrandVoiceRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load brand voices');
  }

  return (data || []).map(mapBrandVoiceRow);
}

export async function getBrandVoice(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<BrandVoice | null> {
  const { data, error } = await supabase
    .from('brand_voices')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: BrandVoiceRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load brand voice');
  }

  return data ? mapBrandVoiceRow(data) : null;
}

export async function getBrandVoiceInOrganizations(
  supabase: SupabaseClient<any>,
  organizationIds: string[],
  id: string
): Promise<BrandVoice | null> {
  const ids = Array.from(new Set(organizationIds.filter(Boolean)));
  if (ids.length === 0) return null;

  const { data, error } = await supabase
    .from('brand_voices')
    .select('*')
    .in('organization_id', ids)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: BrandVoiceRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load brand voice');
  }

  return data ? mapBrandVoiceRow(data) : null;
}

export async function createBrandVoice(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: BrandVoiceInput
): Promise<BrandVoice> {
  const payload = {
    ...normalizeBrandVoiceInput(input),
    organization_id: organizationId,
    client_id: null,
    created_by: createdBy,
    owner_user_id: createdBy,
  };

  const { data, error } = await supabase
    .from('brand_voices')
    .insert(payload as any)
    .select('*')
    .single() as { data: BrandVoiceRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new BrandVoiceValidationError('A brand voice with this name already exists');
    }
    throw new Error(error?.message || 'Failed to create brand voice');
  }

  return mapBrandVoiceRow(data);
}

export async function updateBrandVoice(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: BrandVoiceInput
): Promise<BrandVoice | null> {
  const payload = normalizeBrandVoiceInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new BrandVoiceValidationError('No brand voice fields provided');
  }

  const { data, error } = await supabase
    .from('brand_voices')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('*')
    .maybeSingle() as { data: BrandVoiceRow | null; error: any };

  if (error) {
    if (isUniqueViolation(error)) {
      throw new BrandVoiceValidationError('A brand voice with this name already exists');
    }
    throw new Error(error.message || 'Failed to update brand voice');
  }

  return data ? mapBrandVoiceRow(data) : null;
}

export async function deleteBrandVoice(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('brand_voices')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to delete brand voice');
  }

  return Boolean(data);
}

export async function shareBrandVoiceToOrganization(
  supabase: SupabaseClient<any>,
  source: BrandVoice,
  targetOrganizationId: string,
  userId: string
): Promise<BrandVoice> {
  const sharedPayload = {
    name: source.name,
    description: source.description,
    tone: source.tone,
    audience: source.audience,
    content_pillars_json: source.contentPillars,
    writing_examples_json: source.writingExamples,
    banned_phrases_json: source.bannedPhrases,
    cta_preferences: source.ctaPreferences,
  };

  const { data: existing, error: existingError } = await supabase
    .from('brand_voices')
    .select('*')
    .eq('organization_id', targetOrganizationId)
    .eq('shared_from_voice_id', source.id)
    .is('client_id', null)
    .maybeSingle() as { data: BrandVoiceRow | null; error: any };

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load shared brand voice');
  }

  if (existing) {
    const { data, error } = await supabase
      .from('brand_voices')
      .update(sharedPayload as any)
      .eq('id', existing.id)
      .select('*')
      .single() as { data: BrandVoiceRow | null; error: any };

    if (error || !data) {
      if (isUniqueViolation(error)) {
        throw new BrandVoiceValidationError('A shared brand voice with this name already exists');
      }
      throw new Error(error?.message || 'Failed to update shared brand voice');
    }

    return mapBrandVoiceRow(data);
  }

  const { data, error } = await supabase
    .from('brand_voices')
    .insert({
      ...sharedPayload,
      organization_id: targetOrganizationId,
      client_id: null,
      created_by: userId,
      owner_user_id: userId,
      shared_from_voice_id: source.id,
    } as any)
    .select('*')
    .single() as { data: BrandVoiceRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new BrandVoiceValidationError('A shared brand voice with this name already exists');
    }
    throw new Error(error?.message || 'Failed to share brand voice');
  }

  return mapBrandVoiceRow(data);
}
