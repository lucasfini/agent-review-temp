import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAgencyClient,
  type AgencyClient,
  type AgencyClientInput,
} from '@/lib/agency-clients';

export const AGENCY_LEAD_STATUSES = [
  'new',
  'reviewed',
  'qualified',
  'converted',
  'archived',
  'spam',
] as const;

export type AgencyLeadStatus = typeof AGENCY_LEAD_STATUSES[number];

export interface AgencyLead {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  website: string | null;
  role: string | null;
  packageInterest: string | null;
  budgetRange: string | null;
  timeline: string | null;
  message: string | null;
  source: string;
  status: AgencyLeadStatus;
  metadata: Record<string, unknown>;
  convertedClientId: string | null;
  convertedAt: string | null;
  convertedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyLeadRow {
  id: string;
  name: string | null;
  email: string;
  company: string | null;
  website: string | null;
  role: string | null;
  package_interest: string | null;
  budget_range: string | null;
  timeline: string | null;
  message: string | null;
  source: string;
  status: string;
  metadata_json: Record<string, unknown> | null;
  converted_client_id?: string | null;
  converted_at?: string | null;
  converted_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type AgencyLeadInput = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  website?: unknown;
  role?: unknown;
  packageInterest?: unknown;
  package_interest?: unknown;
  budgetRange?: unknown;
  budget_range?: unknown;
  timeline?: unknown;
  message?: unknown;
  source?: unknown;
  referralCode?: unknown;
  metadata?: unknown;
};

export type AgencyLeadUpdateInput = {
  status?: unknown;
  metadata?: unknown;
};

export class AgencyLeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyLeadValidationError';
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 160;
const MAX_EMAIL_LENGTH = 320;
const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_URL_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_SOURCE_LENGTH = 120;

function coalesceField(input: AgencyLeadInput, ...keys: Array<keyof AgencyLeadInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyLeadValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencyLeadValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredEmail(value: unknown): string {
  const email = optionalString(value, MAX_EMAIL_LENGTH, 'email');
  if (!email) {
    throw new AgencyLeadValidationError('Email is required');
  }

  const normalized = email.toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AgencyLeadValidationError('Please enter a valid email address');
  }

  return normalized;
}

function optionalStatus(value: unknown): AgencyLeadStatus | undefined {
  const status = optionalString(value, MAX_SHORT_TEXT_LENGTH, 'status');
  if (status === undefined || status === null) return undefined;
  if (!AGENCY_LEAD_STATUSES.includes(status as AgencyLeadStatus)) {
    throw new AgencyLeadValidationError(`status must be one of: ${AGENCY_LEAD_STATUSES.join(', ')}`);
  }
  return status as AgencyLeadStatus;
}

function metadataObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencyLeadValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeLeadStatus(value: string): AgencyLeadStatus {
  return AGENCY_LEAD_STATUSES.includes(value as AgencyLeadStatus)
    ? value as AgencyLeadStatus
    : 'new';
}

export function mapAgencyLeadRow(row: AgencyLeadRow): AgencyLead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    website: row.website,
    role: row.role,
    packageInterest: row.package_interest,
    budgetRange: row.budget_range,
    timeline: row.timeline,
    message: row.message,
    source: row.source,
    status: normalizeLeadStatus(row.status),
    metadata: row.metadata_json || {},
    convertedClientId: row.converted_client_id || null,
    convertedAt: row.converted_at || null,
    convertedBy: row.converted_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAgencyLeadSubmission(input: AgencyLeadInput): Record<string, unknown> {
  const honeypot = optionalString(input.referralCode, MAX_SHORT_TEXT_LENGTH, 'referralCode');
  if (honeypot) {
    throw new AgencyLeadValidationError('Lead submission rejected');
  }

  const source = optionalString(input.source, MAX_SOURCE_LENGTH, 'source') || 'agency_website';
  const metadata = metadataObject(input.metadata, 'metadata');

  return {
    name: optionalString(input.name, MAX_NAME_LENGTH, 'name') ?? null,
    email: requiredEmail(input.email),
    company: optionalString(input.company, MAX_SHORT_TEXT_LENGTH, 'company') ?? null,
    website: optionalString(input.website, MAX_URL_LENGTH, 'website') ?? null,
    role: optionalString(input.role, MAX_SHORT_TEXT_LENGTH, 'role') ?? null,
    package_interest: optionalString(
      coalesceField(input, 'packageInterest', 'package_interest'),
      MAX_SHORT_TEXT_LENGTH,
      'packageInterest'
    ) ?? null,
    budget_range: optionalString(
      coalesceField(input, 'budgetRange', 'budget_range'),
      MAX_SHORT_TEXT_LENGTH,
      'budgetRange'
    ) ?? null,
    timeline: optionalString(input.timeline, MAX_SHORT_TEXT_LENGTH, 'timeline') ?? null,
    message: optionalString(input.message, MAX_MESSAGE_LENGTH, 'message') ?? null,
    source,
    status: 'new',
    metadata_json: metadata,
  };
}

export async function createAgencyLead(
  supabase: SupabaseClient<any>,
  input: AgencyLeadInput
): Promise<AgencyLead> {
  const payload = normalizeAgencyLeadSubmission(input);

  const { data, error } = await supabase
    .from('agency_leads')
    .insert(payload as any)
    .select('*')
    .single() as { data: AgencyLeadRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create agency lead');
  }

  return mapAgencyLeadRow(data);
}

export async function listAgencyLeads(
  supabase: SupabaseClient<any>,
  options: { status?: AgencyLeadStatus | null; limit?: number } = {}
): Promise<AgencyLead[]> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  let query = supabase
    .from('agency_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query as { data: AgencyLeadRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load agency leads');
  }

  return (data || []).map(mapAgencyLeadRow);
}

export async function getAgencyLead(
  supabase: SupabaseClient<any>,
  id: string
): Promise<AgencyLead | null> {
  const { data, error } = await supabase
    .from('agency_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle() as { data: AgencyLeadRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load agency lead');
  }

  return data ? mapAgencyLeadRow(data) : null;
}

export async function updateAgencyLead(
  supabase: SupabaseClient<any>,
  id: string,
  input: AgencyLeadUpdateInput
): Promise<AgencyLead | null> {
  const status = optionalStatus(input.status);
  const metadata = metadataObject(input.metadata, 'metadata');

  if (!status && Object.keys(metadata).length === 0) {
    throw new AgencyLeadValidationError('No agency lead fields provided');
  }

  const current = await getAgencyLead(supabase, id);
  if (!current) return null;

  const payload: Record<string, unknown> = {};
  if (status) payload.status = status;
  if (Object.keys(metadata).length > 0) {
    payload.metadata_json = {
      ...current.metadata,
      ...metadata,
    };
  }

  const { data, error } = await supabase
    .from('agency_leads')
    .update(payload as any)
    .eq('id', id)
    .select('*')
    .maybeSingle() as { data: AgencyLeadRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update agency lead');
  }

  return data ? mapAgencyLeadRow(data) : null;
}

export function buildAgencyClientInputFromLead(lead: AgencyLead): AgencyClientInput {
  const clientName = lead.company || lead.name || lead.email;
  const notesParts = [
    lead.message ? `Lead message:\n${lead.message}` : null,
    lead.role ? `Role: ${lead.role}` : null,
    lead.timeline ? `Timeline: ${lead.timeline}` : null,
    lead.budgetRange ? `Budget range: ${lead.budgetRange}` : null,
    `Lead source: ${lead.source}`,
    `Original lead email: ${lead.email}`,
  ].filter(Boolean);

  return {
    name: clientName,
    website: lead.website || undefined,
    primaryContactName: lead.name || undefined,
    primaryContactEmail: lead.email,
    packageType: lead.packageInterest || undefined,
    status: 'lead',
    notes: notesParts.join('\n\n'),
  };
}

export async function convertAgencyLeadToClient(
  supabase: SupabaseClient<any>,
  organizationId: string,
  userId: string,
  leadId: string
): Promise<{ lead: AgencyLead; client: AgencyClient }> {
  const lead = await getAgencyLead(supabase, leadId);

  if (!lead) {
    throw new AgencyLeadValidationError('Agency lead not found');
  }

  if (lead.status === 'converted' || lead.convertedClientId) {
    throw new AgencyLeadValidationError('Agency lead has already been converted');
  }

  if (lead.status === 'spam' || lead.status === 'archived') {
    throw new AgencyLeadValidationError('Archived or spam leads cannot be converted');
  }

  const client = await createAgencyClient(
    supabase,
    organizationId,
    userId,
    buildAgencyClientInputFromLead(lead)
  );
  const convertedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('agency_leads')
    .update({
      status: 'converted',
      converted_client_id: client.id,
      converted_at: convertedAt,
      converted_by: userId,
      metadata_json: {
        ...lead.metadata,
        conversion: {
          clientId: client.id,
          convertedAt,
          convertedBy: userId,
        },
      },
    } as any)
    .eq('id', lead.id)
    .select('*')
    .maybeSingle() as { data: AgencyLeadRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update converted agency lead');
  }

  return {
    client,
    lead: mapAgencyLeadRow(data),
  };
}
