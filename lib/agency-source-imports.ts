import type { SupabaseClient } from '@supabase/supabase-js';

export const AGENCY_SOURCE_IMPORT_PROVIDERS = [
  'audio_upload',
  'transcript',
  'slack',
  'granola',
  'manual_note',
  'url',
  'document',
] as const;

export const MANUAL_AGENCY_SOURCE_IMPORT_PROVIDERS = [
  'manual_note',
  'url',
  'document',
  'transcript',
] as const;

export type AgencySourceImportProvider = typeof AGENCY_SOURCE_IMPORT_PROVIDERS[number];

export interface AgencySourceImport {
  id: string;
  organizationId: string;
  clientId: string | null;
  campaignId: string | null;
  provider: AgencySourceImportProvider;
  sourceTitle: string | null;
  sourceUrl: string | null;
  rawText: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  importedBy: string | null;
  createdAt: string;
}

export interface AgencySourceImportRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  campaign_id: string | null;
  provider: string;
  source_title: string | null;
  source_url: string | null;
  raw_text: string | null;
  summary: string | null;
  metadata_json: Record<string, unknown> | null;
  imported_by: string | null;
  created_at: string;
}

export type AgencySourceImportInput = {
  clientId?: unknown;
  client_id?: unknown;
  provider?: unknown;
  sourceTitle?: unknown;
  source_title?: unknown;
  sourceUrl?: unknown;
  source_url?: unknown;
  rawText?: unknown;
  raw_text?: unknown;
  summary?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
};

export class AgencySourceImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencySourceImportValidationError';
  }
}

const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_URL_LENGTH = 1000;
const MAX_SOURCE_TEXT_LENGTH = 200000;
const MAX_SUMMARY_LENGTH = 20000;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencySourceImportValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencySourceImportValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredProvider(value: unknown): AgencySourceImportProvider {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, 'provider');
  if (!normalized) {
    throw new AgencySourceImportValidationError('provider is required');
  }
  if (!AGENCY_SOURCE_IMPORT_PROVIDERS.includes(normalized as AgencySourceImportProvider)) {
    throw new AgencySourceImportValidationError(`provider must be one of: ${AGENCY_SOURCE_IMPORT_PROVIDERS.join(', ')}`);
  }
  return normalized as AgencySourceImportProvider;
}

function optionalMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencySourceImportValidationError('metadata must be an object');
  }
  return value as Record<string, unknown>;
}

function coalesceField(input: AgencySourceImportInput, ...keys: Array<keyof AgencySourceImportInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function normalizeProvider(value: string): AgencySourceImportProvider {
  return AGENCY_SOURCE_IMPORT_PROVIDERS.includes(value as AgencySourceImportProvider)
    ? value as AgencySourceImportProvider
    : 'manual_note';
}

export function sourceImportClientIdFrom(input: AgencySourceImportInput): string | null | undefined {
  return optionalString(coalesceField(input, 'clientId', 'client_id'), MAX_SHORT_TEXT_LENGTH, 'clientId');
}

export function mapAgencySourceImportRow(row: AgencySourceImportRow): AgencySourceImport {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    campaignId: row.campaign_id,
    provider: normalizeProvider(row.provider),
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    rawText: row.raw_text,
    summary: row.summary,
    metadata: row.metadata_json || {},
    importedBy: row.imported_by,
    createdAt: row.created_at,
  };
}

export function normalizeAgencySourceImportInput(
  input: AgencySourceImportInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawProvider = coalesceField(input, 'provider');
  if (!options.partial || rawProvider !== undefined) {
    payload.provider = requiredProvider(rawProvider);
  }

  const clientId = sourceImportClientIdFrom(input);
  if (clientId !== undefined) payload.client_id = clientId;

  const sourceTitle = optionalString(
    coalesceField(input, 'sourceTitle', 'source_title'),
    MAX_SHORT_TEXT_LENGTH,
    'sourceTitle'
  );
  if (sourceTitle !== undefined) payload.source_title = sourceTitle;

  const sourceUrl = optionalString(
    coalesceField(input, 'sourceUrl', 'source_url'),
    MAX_URL_LENGTH,
    'sourceUrl'
  );
  if (sourceUrl !== undefined) payload.source_url = sourceUrl;

  const rawText = optionalString(
    coalesceField(input, 'rawText', 'raw_text'),
    MAX_SOURCE_TEXT_LENGTH,
    'rawText'
  );
  if (rawText !== undefined) payload.raw_text = rawText;

  const summary = optionalString(input.summary, MAX_SUMMARY_LENGTH, 'summary');
  if (summary !== undefined) payload.summary = summary;

  const metadata = optionalMetadata(coalesceField(input, 'metadata', 'metadata_json'));
  if (metadata !== undefined) payload.metadata_json = metadata;

  if (!options.partial && !payload.source_title && !payload.source_url && !payload.raw_text && !payload.summary) {
    throw new AgencySourceImportValidationError('Provide a title, URL, source text, or summary');
  }

  return payload;
}

export async function listAgencySourceImports(
  supabase: SupabaseClient<any>,
  organizationId: string,
  options: {
    clientId?: string | null;
    provider?: string | null;
    limit?: number;
  } = {}
): Promise<AgencySourceImport[]> {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  let query = supabase
    .from('source_imports')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.clientId) {
    query = query.eq('client_id', options.clientId);
  }
  if (options.provider && AGENCY_SOURCE_IMPORT_PROVIDERS.includes(options.provider as AgencySourceImportProvider)) {
    query = query.eq('provider', options.provider);
  }

  const { data, error } = await query as {
    data: AgencySourceImportRow[] | null;
    error: any;
  };

  if (error) {
    throw new Error(error.message || 'Failed to load source imports');
  }

  return (data || []).map(mapAgencySourceImportRow);
}

export async function getAgencySourceImport(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<AgencySourceImport | null> {
  const { data, error } = await supabase
    .from('source_imports')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle() as { data: AgencySourceImportRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load source import');
  }

  return data ? mapAgencySourceImportRow(data) : null;
}

export async function createAgencySourceImport(
  supabase: SupabaseClient<any>,
  organizationId: string,
  importedBy: string,
  input: AgencySourceImportInput
): Promise<AgencySourceImport> {
  const payload = {
    ...normalizeAgencySourceImportInput(input),
    organization_id: organizationId,
    imported_by: importedBy,
  };

  const { data, error } = await supabase
    .from('source_imports')
    .insert(payload as any)
    .select('*')
    .single() as { data: AgencySourceImportRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create source import');
  }

  return mapAgencySourceImportRow(data);
}

export async function updateAgencySourceImport(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: AgencySourceImportInput
): Promise<AgencySourceImport | null> {
  const payload = normalizeAgencySourceImportInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new AgencySourceImportValidationError('No source import fields provided');
  }

  const { data, error } = await supabase
    .from('source_imports')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('*')
    .maybeSingle() as { data: AgencySourceImportRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update source import');
  }

  return data ? mapAgencySourceImportRow(data) : null;
}
