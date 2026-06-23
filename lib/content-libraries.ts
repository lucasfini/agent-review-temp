import type { SupabaseClient } from '@supabase/supabase-js';

import { can } from '@/lib/authz/permissions';
import {
  normalizeOrganizationMemberRole,
  type OrganizationMemberRole,
  type OrganizationType,
} from '@/lib/authz/types';

export type ContentLibraryScope = 'private' | 'organization';

export interface ContentLibrary {
  id: string;
  organizationId: string;
  clientId: string | null;
  sharedFromLibraryId: string | null;
  name: string;
  description: string | null;
  ownerUserId?: string | null;
  locked?: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  scope?: ContentLibraryScope;
  canEdit?: boolean;
  canShare?: boolean;
  canUnshare?: boolean;
}

export interface ContentLibraryRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  shared_from_library_id?: string | null;
  name: string;
  description: string | null;
  owner_user_id?: string | null;
  locked?: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentLibraryInput = {
  name?: unknown;
  description?: unknown;
};

export class ContentLibraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentLibraryValidationError';
  }
}

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1200;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ContentLibraryValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new ContentLibraryValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredName(value: unknown): string {
  const normalized = optionalString(value, MAX_NAME_LENGTH, 'name');
  if (!normalized) {
    throw new ContentLibraryValidationError('Library name is required');
  }
  return normalized;
}

function isUniqueViolation(error: any): boolean {
  return error?.code === '23505'
    || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
}

export function canManageContentLibraries(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  const normalizedRole = normalizeOrganizationMemberRole(role);
  if (normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'editor') return true;
  return normalizedRole === 'agency_admin' && organizationType === 'internal_agency';
}

export function mapContentLibraryRow(row: ContentLibraryRow): ContentLibrary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    sharedFromLibraryId: row.shared_from_library_id || null,
    name: row.name,
    description: row.description,
    ownerUserId: row.owner_user_id || null,
    locked: Boolean(row.locked),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function decorateContentLibraryScope(
  library: ContentLibrary,
  options: {
    activeOrganizationId: string;
    privateOrganizationId: string;
    userId: string;
    role?: OrganizationMemberRole | string | null;
    organizationType?: OrganizationType | string | null;
  }
): ContentLibrary {
  const scope: ContentLibraryScope = library.organizationId === options.privateOrganizationId ? 'private' : 'organization';
  const visibility = scope === 'private' ? 'private' : 'workspace';

  return {
    ...library,
    scope,
    canEdit: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'collection.update', {
      organizationId: library.organizationId,
      ownerUserId: library.ownerUserId || library.createdBy,
      createdByUserId: library.createdBy,
      visibility,
      locked: library.locked,
    }),
    canShare: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'collection.share', {
      organizationId: library.organizationId,
      ownerUserId: library.ownerUserId || library.createdBy,
      createdByUserId: library.createdBy,
      visibility,
      locked: library.locked,
    }),
    canUnshare: can({
      userId: options.userId,
      organizationId: options.activeOrganizationId,
      role: options.role,
      organizationType: options.organizationType,
    }, 'collection.unshare', {
      organizationId: library.organizationId,
      ownerUserId: library.ownerUserId || library.createdBy,
      createdByUserId: library.createdBy,
      visibility,
      locked: library.locked,
    }),
  };
}

export function normalizeContentLibraryInput(
  input: ContentLibraryInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (!options.partial || input.name !== undefined) {
    payload.name = requiredName(input.name);
  }

  const description = optionalString(input.description, MAX_DESCRIPTION_LENGTH, 'description');
  if (description !== undefined) payload.description = description;

  return payload;
}

export async function listContentLibraries(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<ContentLibrary[]> {
  return listContentLibrariesForOrganizations(supabase, [organizationId]);
}

export async function listContentLibrariesForOrganizations(
  supabase: SupabaseClient<any>,
  organizationIds: string[]
): Promise<ContentLibrary[]> {
  const ids = Array.from(new Set(organizationIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('content_libraries')
    .select('*')
    .in('organization_id', ids)
    .is('client_id', null)
    .order('updated_at', { ascending: false }) as {
      data: ContentLibraryRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load libraries');
  }

  return (data || []).map(mapContentLibraryRow);
}

export async function getContentLibrary(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<ContentLibrary | null> {
  return getContentLibraryInOrganizations(supabase, [organizationId], id);
}

export async function getContentLibraryInOrganizations(
  supabase: SupabaseClient<any>,
  organizationIds: string[],
  id: string
): Promise<ContentLibrary | null> {
  const ids = Array.from(new Set(organizationIds.filter(Boolean)));
  if (ids.length === 0) return null;

  const { data, error } = await supabase
    .from('content_libraries')
    .select('*')
    .in('organization_id', ids)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: ContentLibraryRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load library');
  }

  return data ? mapContentLibraryRow(data) : null;
}

export async function createContentLibrary(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: ContentLibraryInput
): Promise<ContentLibrary> {
  const payload = {
    ...normalizeContentLibraryInput(input),
    organization_id: organizationId,
    client_id: null,
    shared_from_library_id: null,
    created_by: createdBy,
    owner_user_id: createdBy,
  };

  const { data, error } = await supabase
    .from('content_libraries')
    .insert(payload as any)
    .select('*')
    .single() as { data: ContentLibraryRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new ContentLibraryValidationError('A library with this name already exists');
    }
    throw new Error(error?.message || 'Failed to create library');
  }

  return mapContentLibraryRow(data);
}

export async function shareContentLibraryToOrganization(
  supabase: SupabaseClient<any>,
  source: ContentLibrary,
  targetOrganizationId: string,
  userId: string
): Promise<ContentLibrary> {
  const sharedPayload = {
    name: source.name,
    description: source.description,
  };

  const { data: existing, error: existingError } = await supabase
    .from('content_libraries')
    .select('*')
    .eq('organization_id', targetOrganizationId)
    .eq('shared_from_library_id', source.id)
    .is('client_id', null)
    .maybeSingle() as { data: ContentLibraryRow | null; error: any };

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load shared library');
  }

  if (existing) {
    const { data, error } = await supabase
      .from('content_libraries')
      .update(sharedPayload as any)
      .eq('id', existing.id)
      .select('*')
      .single() as { data: ContentLibraryRow | null; error: any };

    if (error || !data) {
      if (isUniqueViolation(error)) {
        throw new ContentLibraryValidationError('A shared library with this name already exists');
      }
      throw new Error(error?.message || 'Failed to update shared library');
    }

    return mapContentLibraryRow(data);
  }

  const { data, error } = await supabase
    .from('content_libraries')
    .insert({
      ...sharedPayload,
      organization_id: targetOrganizationId,
      client_id: null,
      shared_from_library_id: source.id,
      created_by: userId,
      owner_user_id: userId,
    } as any)
    .select('*')
    .single() as { data: ContentLibraryRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new ContentLibraryValidationError('A shared library with this name already exists');
    }
    throw new Error(error?.message || 'Failed to share library');
  }

  return mapContentLibraryRow(data);
}

export async function updateContentLibrary(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: ContentLibraryInput
): Promise<ContentLibrary | null> {
  const payload = normalizeContentLibraryInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new ContentLibraryValidationError('No library fields provided');
  }

  const { data, error } = await supabase
    .from('content_libraries')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('*')
    .maybeSingle() as { data: ContentLibraryRow | null; error: any };

  if (error) {
    if (isUniqueViolation(error)) {
      throw new ContentLibraryValidationError('A library with this name already exists');
    }
    throw new Error(error.message || 'Failed to update library');
  }

  return data ? mapContentLibraryRow(data) : null;
}

export async function deleteContentLibrary(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<boolean> {
  const { error: unfileError } = await supabase
    .from('content_library_items')
    .update({ library_id: null } as any)
    .eq('organization_id', organizationId)
    .eq('library_id', id)
    .is('client_id', null);

  if (unfileError) {
    throw new Error(unfileError.message || 'Failed to unfile library drafts');
  }

  const { data, error } = await supabase
    .from('content_libraries')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to delete library');
  }

  return Boolean(data);
}
