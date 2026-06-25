import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgencyClientProfile {
  id: string;
  clientId: string;
  businessOverview: string | null;
  idealCustomerProfile: string | null;
  positioning: string | null;
  offers: string[];
  competitors: string[];
  contentPillars: string[];
  customerPainPoints: string[];
  voiceNotes: string | null;
  customerServiceTone: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyClientProfileRow {
  id: string;
  client_id: string;
  business_overview: string | null;
  ideal_customer_profile: string | null;
  positioning: string | null;
  offers_json: unknown;
  competitors_json: unknown;
  content_pillars_json: unknown;
  customer_pain_points_json: unknown;
  voice_notes: string | null;
  customer_service_tone: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type AgencyClientProfileInput = {
  businessOverview?: unknown;
  business_overview?: unknown;
  idealCustomerProfile?: unknown;
  ideal_customer_profile?: unknown;
  positioning?: unknown;
  offers?: unknown;
  offers_json?: unknown;
  competitors?: unknown;
  competitors_json?: unknown;
  contentPillars?: unknown;
  content_pillars?: unknown;
  content_pillars_json?: unknown;
  customerPainPoints?: unknown;
  customer_pain_points?: unknown;
  customer_pain_points_json?: unknown;
  voiceNotes?: unknown;
  voice_notes?: unknown;
  customerServiceTone?: unknown;
  customer_service_tone?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
};

export class AgencyClientProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyClientProfileValidationError';
  }
}

const MAX_TEXT_LENGTH = 10000;
const MAX_LIST_ITEM_LENGTH = 300;
const MAX_LIST_ITEMS = 100;

function coalesceField(input: AgencyClientProfileInput, ...keys: Array<keyof AgencyClientProfileInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyClientProfileValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencyClientProfileValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function normalizeListValue(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new AgencyClientProfileValidationError(`${field} must be a list`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    throw new AgencyClientProfileValidationError(`${field} must have ${MAX_LIST_ITEMS} items or fewer`);
  }

  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new AgencyClientProfileValidationError(`${field} items must be strings`);
      }
      const trimmed = item.trim();
      if (trimmed.length > MAX_LIST_ITEM_LENGTH) {
        throw new AgencyClientProfileValidationError(`${field} items must be ${MAX_LIST_ITEM_LENGTH} characters or fewer`);
      }
      return trimmed;
    })
    .filter(Boolean);
}

function normalizeObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencyClientProfileValidationError('metadata must be an object');
  }
  return value as Record<string, unknown>;
}

function parseStoredList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function mapAgencyClientProfileRow(row: AgencyClientProfileRow): AgencyClientProfile {
  return {
    id: row.id,
    clientId: row.client_id,
    businessOverview: row.business_overview,
    idealCustomerProfile: row.ideal_customer_profile,
    positioning: row.positioning,
    offers: parseStoredList(row.offers_json),
    competitors: parseStoredList(row.competitors_json),
    contentPillars: parseStoredList(row.content_pillars_json),
    customerPainPoints: parseStoredList(row.customer_pain_points_json),
    voiceNotes: row.voice_notes,
    customerServiceTone: row.customer_service_tone,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAgencyClientProfileInput(input: AgencyClientProfileInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const businessOverview = optionalString(
    coalesceField(input, 'businessOverview', 'business_overview'),
    MAX_TEXT_LENGTH,
    'businessOverview'
  );
  if (businessOverview !== undefined) payload.business_overview = businessOverview;

  const idealCustomerProfile = optionalString(
    coalesceField(input, 'idealCustomerProfile', 'ideal_customer_profile'),
    MAX_TEXT_LENGTH,
    'idealCustomerProfile'
  );
  if (idealCustomerProfile !== undefined) payload.ideal_customer_profile = idealCustomerProfile;

  const positioning = optionalString(input.positioning, MAX_TEXT_LENGTH, 'positioning');
  if (positioning !== undefined) payload.positioning = positioning;

  const offers = normalizeListValue(coalesceField(input, 'offers', 'offers_json'), 'offers');
  if (offers !== undefined) payload.offers_json = offers;

  const competitors = normalizeListValue(coalesceField(input, 'competitors', 'competitors_json'), 'competitors');
  if (competitors !== undefined) payload.competitors_json = competitors;

  const contentPillars = normalizeListValue(
    coalesceField(input, 'contentPillars', 'content_pillars', 'content_pillars_json'),
    'contentPillars'
  );
  if (contentPillars !== undefined) payload.content_pillars_json = contentPillars;

  const customerPainPoints = normalizeListValue(
    coalesceField(input, 'customerPainPoints', 'customer_pain_points', 'customer_pain_points_json'),
    'customerPainPoints'
  );
  if (customerPainPoints !== undefined) payload.customer_pain_points_json = customerPainPoints;

  const voiceNotes = optionalString(
    coalesceField(input, 'voiceNotes', 'voice_notes'),
    MAX_TEXT_LENGTH,
    'voiceNotes'
  );
  if (voiceNotes !== undefined) payload.voice_notes = voiceNotes;

  const customerServiceTone = optionalString(
    coalesceField(input, 'customerServiceTone', 'customer_service_tone'),
    MAX_TEXT_LENGTH,
    'customerServiceTone'
  );
  if (customerServiceTone !== undefined) payload.customer_service_tone = customerServiceTone;

  const metadata = normalizeObject(coalesceField(input, 'metadata', 'metadata_json'));
  if (metadata !== undefined) payload.metadata_json = metadata;

  if (Object.keys(payload).length === 0) {
    throw new AgencyClientProfileValidationError('No agency client profile fields provided');
  }

  return payload;
}

export async function getAgencyClientProfile(
  supabase: SupabaseClient<any>,
  clientId: string
): Promise<AgencyClientProfile | null> {
  const { data, error } = await supabase
    .from('agency_client_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle() as { data: AgencyClientProfileRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load agency client profile');
  }

  return data ? mapAgencyClientProfileRow(data) : null;
}

export async function upsertAgencyClientProfile(
  supabase: SupabaseClient<any>,
  clientId: string,
  input: AgencyClientProfileInput
): Promise<AgencyClientProfile> {
  const payload = {
    ...normalizeAgencyClientProfileInput(input),
    client_id: clientId,
  };

  const { data, error } = await supabase
    .from('agency_client_profiles')
    .upsert(payload as any, { onConflict: 'client_id' })
    .select('*')
    .single() as { data: AgencyClientProfileRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to save agency client profile');
  }

  return mapAgencyClientProfileRow(data);
}
