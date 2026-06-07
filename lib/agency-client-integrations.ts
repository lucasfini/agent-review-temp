import type { SupabaseClient } from '@supabase/supabase-js';

export const AGENCY_CLIENT_INTEGRATION_PROVIDERS = [
  'slack',
  'granola',
  'manual',
  'other',
] as const;

export const AGENCY_CLIENT_INTEGRATION_STATUSES = [
  'not_connected',
  'connected',
  'needs_attention',
  'disabled',
] as const;

export type AgencyClientIntegrationProvider = typeof AGENCY_CLIENT_INTEGRATION_PROVIDERS[number];
export type AgencyClientIntegrationStatus = typeof AGENCY_CLIENT_INTEGRATION_STATUSES[number];

export interface AgencyClientIntegration {
  id: string;
  clientId: string;
  provider: AgencyClientIntegrationProvider;
  status: AgencyClientIntegrationStatus;
  metadata: Record<string, unknown>;
  connectedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyClientIntegrationRow {
  id: string;
  client_id: string;
  provider: string;
  status: string;
  metadata_json: Record<string, unknown> | null;
  connected_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AgencyClientIntegrationInput = {
  provider?: unknown;
  status?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
  connectedAt?: unknown;
  connected_at?: unknown;
  lastSyncAt?: unknown;
  last_sync_at?: unknown;
};

export class AgencyClientIntegrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyClientIntegrationValidationError';
  }
}

const MAX_SHORT_TEXT_LENGTH = 240;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyClientIntegrationValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencyClientIntegrationValidationError(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function optionalTimestamp(value: unknown, field: string): string | null | undefined {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, field);
  if (normalized === undefined || normalized === null) return normalized;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new AgencyClientIntegrationValidationError(`${field} must be a valid timestamp`);
  }
  return date.toISOString();
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencyClientIntegrationValidationError('metadata must be an object');
  }
  return value as Record<string, unknown>;
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string
): T[number] | undefined {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, field);
  if (normalized === undefined || normalized === null) return undefined;
  if (!allowed.includes(normalized)) {
    throw new AgencyClientIntegrationValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return normalized as T[number];
}

function requiredProvider(value: unknown): AgencyClientIntegrationProvider {
  const provider = optionalEnum(value, AGENCY_CLIENT_INTEGRATION_PROVIDERS, 'provider');
  if (!provider) {
    throw new AgencyClientIntegrationValidationError('provider is required');
  }
  return provider;
}

function coalesceField(
  input: AgencyClientIntegrationInput,
  ...keys: Array<keyof AgencyClientIntegrationInput>
): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function normalizeProvider(value: string): AgencyClientIntegrationProvider {
  return AGENCY_CLIENT_INTEGRATION_PROVIDERS.includes(value as AgencyClientIntegrationProvider)
    ? value as AgencyClientIntegrationProvider
    : 'other';
}

function normalizeStatus(value: string): AgencyClientIntegrationStatus {
  return AGENCY_CLIENT_INTEGRATION_STATUSES.includes(value as AgencyClientIntegrationStatus)
    ? value as AgencyClientIntegrationStatus
    : 'not_connected';
}

export function mapAgencyClientIntegrationRow(row: AgencyClientIntegrationRow): AgencyClientIntegration {
  return {
    id: row.id,
    clientId: row.client_id,
    provider: normalizeProvider(row.provider),
    status: normalizeStatus(row.status),
    metadata: row.metadata_json || {},
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAgencyClientIntegrationInput(
  input: AgencyClientIntegrationInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const rawProvider = coalesceField(input, 'provider');
  if (!options.partial || rawProvider !== undefined) {
    payload.provider = requiredProvider(rawProvider);
  }

  const status = optionalEnum(input.status, AGENCY_CLIENT_INTEGRATION_STATUSES, 'status');
  if (status !== undefined) payload.status = status;

  const metadata = optionalObject(coalesceField(input, 'metadata', 'metadata_json'));
  if (metadata !== undefined) payload.metadata_json = metadata;

  const connectedAt = optionalTimestamp(coalesceField(input, 'connectedAt', 'connected_at'), 'connectedAt');
  if (connectedAt !== undefined) payload.connected_at = connectedAt;

  const lastSyncAt = optionalTimestamp(coalesceField(input, 'lastSyncAt', 'last_sync_at'), 'lastSyncAt');
  if (lastSyncAt !== undefined) payload.last_sync_at = lastSyncAt;

  return payload;
}

export async function listAgencyClientIntegrations(
  supabase: SupabaseClient<any>,
  clientId: string
): Promise<AgencyClientIntegration[]> {
  const { data, error } = await supabase
    .from('client_integrations')
    .select('*')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false }) as {
      data: AgencyClientIntegrationRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load client integrations');
  }

  return (data || []).map(mapAgencyClientIntegrationRow);
}

export async function getAgencyClientIntegration(
  supabase: SupabaseClient<any>,
  clientId: string,
  provider: AgencyClientIntegrationProvider
): Promise<AgencyClientIntegration | null> {
  const { data, error } = await supabase
    .from('client_integrations')
    .select('*')
    .eq('client_id', clientId)
    .eq('provider', provider)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: AgencyClientIntegrationRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load client integration');
  }

  return data ? mapAgencyClientIntegrationRow(data) : null;
}

export async function setAgencyClientIntegration(
  supabase: SupabaseClient<any>,
  clientId: string,
  input: AgencyClientIntegrationInput
): Promise<AgencyClientIntegration> {
  const provider = requiredProvider(input.provider);
  const existing = await getAgencyClientIntegration(supabase, clientId, provider);
  const normalized = normalizeAgencyClientIntegrationInput(input);
  const metadata = {
    ...(existing?.metadata || {}),
    ...(normalized.metadata_json as Record<string, unknown> | undefined || {}),
  };
  const now = new Date().toISOString();
  const payload = {
    ...normalized,
    client_id: clientId,
    metadata_json: metadata,
    connected_at: normalized.connected_at || existing?.connectedAt || (
      normalized.status === 'connected' ? now : null
    ),
  };

  const query = existing
    ? supabase
      .from('client_integrations')
      .update(payload as any)
      .eq('id', existing.id)
    : supabase
      .from('client_integrations')
      .insert(payload as any);

  const { data, error } = await query
    .select('*')
    .single() as { data: AgencyClientIntegrationRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save client integration');
  }

  return mapAgencyClientIntegrationRow(data);
}
