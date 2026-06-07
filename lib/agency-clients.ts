import type { SupabaseClient } from '@supabase/supabase-js';

export const AGENCY_CLIENT_STATUSES = ['active', 'paused', 'archived', 'lead'] as const;

export type AgencyClientStatus = typeof AGENCY_CLIENT_STATUSES[number];

export interface AgencyClient {
  id: string;
  organizationId: string;
  name: string;
  website: string | null;
  industry: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  packageType: string | null;
  status: AgencyClientStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyClientRow {
  id: string;
  organization_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  package_type: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AgencyClientInput = {
  name?: unknown;
  website?: unknown;
  industry?: unknown;
  primaryContactName?: unknown;
  primary_contact_name?: unknown;
  primaryContactEmail?: unknown;
  primary_contact_email?: unknown;
  packageType?: unknown;
  package_type?: unknown;
  status?: unknown;
  notes?: unknown;
};

export class AgencyClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyClientValidationError';
  }
}

const MAX_NAME_LENGTH = 160;
const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_EMAIL_LENGTH = 320;
const MAX_URL_LENGTH = 500;
const MAX_NOTES_LENGTH = 5000;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyClientValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencyClientValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredName(value: unknown): string {
  const normalized = optionalString(value, MAX_NAME_LENGTH, 'name');
  if (!normalized) {
    throw new AgencyClientValidationError('Agency client name is required');
  }
  return normalized;
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string
): T[number] | undefined {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, field);
  if (normalized === undefined || normalized === null) return undefined;
  if (!allowed.includes(normalized)) {
    throw new AgencyClientValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return normalized as T[number];
}

function coalesceField(input: AgencyClientInput, ...keys: Array<keyof AgencyClientInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function normalizeAgencyClientStatus(value: string): AgencyClientStatus {
  return AGENCY_CLIENT_STATUSES.includes(value as AgencyClientStatus)
    ? value as AgencyClientStatus
    : 'active';
}

function isUniqueViolation(error: any): boolean {
  return error?.code === '23505'
    || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
}

export function hasAgencyClientInput(input: AgencyClientInput): boolean {
  return [
    'name',
    'website',
    'industry',
    'primaryContactName',
    'primary_contact_name',
    'primaryContactEmail',
    'primary_contact_email',
    'packageType',
    'package_type',
    'status',
    'notes',
  ].some((key) => (input as Record<string, unknown>)[key] !== undefined);
}

export function mapAgencyClientRow(row: AgencyClientRow): AgencyClient {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    primaryContactName: row.primary_contact_name,
    primaryContactEmail: row.primary_contact_email,
    packageType: row.package_type,
    status: normalizeAgencyClientStatus(row.status),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAgencyClientInput(
  input: AgencyClientInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawName = coalesceField(input, 'name');
  if (!options.partial || rawName !== undefined) {
    payload.name = requiredName(rawName);
  }

  const website = optionalString(input.website, MAX_URL_LENGTH, 'website');
  if (website !== undefined) payload.website = website;

  const industry = optionalString(input.industry, MAX_SHORT_TEXT_LENGTH, 'industry');
  if (industry !== undefined) payload.industry = industry;

  const primaryContactName = optionalString(
    coalesceField(input, 'primaryContactName', 'primary_contact_name'),
    MAX_SHORT_TEXT_LENGTH,
    'primaryContactName'
  );
  if (primaryContactName !== undefined) payload.primary_contact_name = primaryContactName;

  const primaryContactEmail = optionalString(
    coalesceField(input, 'primaryContactEmail', 'primary_contact_email'),
    MAX_EMAIL_LENGTH,
    'primaryContactEmail'
  );
  if (primaryContactEmail !== undefined) payload.primary_contact_email = primaryContactEmail;

  const packageType = optionalString(
    coalesceField(input, 'packageType', 'package_type'),
    MAX_SHORT_TEXT_LENGTH,
    'packageType'
  );
  if (packageType !== undefined) payload.package_type = packageType;

  const status = optionalEnum(input.status, AGENCY_CLIENT_STATUSES, 'status');
  if (status !== undefined) payload.status = status;

  const notes = optionalString(input.notes, MAX_NOTES_LENGTH, 'notes');
  if (notes !== undefined) payload.notes = notes;

  return payload;
}

export async function listAgencyClients(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<AgencyClient[]> {
  const { data, error } = await supabase
    .from('agency_clients')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false }) as {
      data: AgencyClientRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load agency clients');
  }

  return (data || []).map(mapAgencyClientRow);
}

export async function getAgencyClient(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<AgencyClient | null> {
  const { data, error } = await supabase
    .from('agency_clients')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle() as { data: AgencyClientRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load agency client');
  }

  return data ? mapAgencyClientRow(data) : null;
}

export async function createAgencyClient(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: AgencyClientInput
): Promise<AgencyClient> {
  const payload = {
    ...normalizeAgencyClientInput(input),
    organization_id: organizationId,
    created_by: createdBy,
  };

  const { data, error } = await supabase
    .from('agency_clients')
    .insert(payload as any)
    .select('*')
    .single() as { data: AgencyClientRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new AgencyClientValidationError('An agency client with this name already exists');
    }
    throw new Error(error?.message || 'Failed to create agency client');
  }

  return mapAgencyClientRow(data);
}

export async function updateAgencyClient(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: AgencyClientInput
): Promise<AgencyClient | null> {
  const payload = normalizeAgencyClientInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new AgencyClientValidationError('No agency client fields provided');
  }

  const { data, error } = await supabase
    .from('agency_clients')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('*')
    .maybeSingle() as { data: AgencyClientRow | null; error: any };

  if (error) {
    if (isUniqueViolation(error)) {
      throw new AgencyClientValidationError('An agency client with this name already exists');
    }
    throw new Error(error.message || 'Failed to update agency client');
  }

  return data ? mapAgencyClientRow(data) : null;
}
