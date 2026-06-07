import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CONTENT_LIBRARY_STATUSES,
  CampaignLibraryValidationError,
  type ContentLibraryItem,
  type ContentLibraryItemInput,
  type ContentLibraryItemRow,
  type ContentLibraryStatus,
  mapContentLibraryItemRow,
  normalizeContentLibraryItemInput,
} from '@/lib/campaigns-content-library';

export type AgencyDraft = ContentLibraryItem;

export type AgencyDraftInput = ContentLibraryItemInput & {
  clientId?: unknown;
  client_id?: unknown;
};

const MAX_ID_LENGTH = 120;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new CampaignLibraryValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new CampaignLibraryValidationError(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function optionalId(value: unknown, field: string): string | null | undefined {
  return optionalString(value, MAX_ID_LENGTH, field);
}

function coalesceField(input: AgencyDraftInput, ...keys: Array<keyof AgencyDraftInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function agencyDraftContentInput(input: AgencyDraftInput): ContentLibraryItemInput {
  return {
    title: input.title,
    contentType: input.contentType,
    content_type: input.content_type,
    platform: input.platform,
    status: input.status,
    body: input.body,
    excerpt: input.excerpt,
    sourceLabel: input.sourceLabel,
    source_label: input.source_label,
    tags: input.tags,
    tags_json: input.tags_json,
    metadata: input.metadata,
    metadata_json: input.metadata_json,
    publishedAt: input.publishedAt,
    published_at: input.published_at,
    campaignId: input.campaignId,
    campaign_id: input.campaign_id,
    brandVoiceId: input.brandVoiceId,
    brand_voice_id: input.brand_voice_id,
  };
}

export function agencyDraftClientIdFrom(input: AgencyDraftInput): string | null | undefined {
  return optionalId(coalesceField(input, 'clientId', 'client_id'), 'clientId');
}

export function agencyDraftReferenceIdsFrom(input: AgencyDraftInput): {
  campaignId: string | null | undefined;
  brandVoiceId: string | null | undefined;
} {
  return {
    campaignId: optionalId(coalesceField(input, 'campaignId', 'campaign_id'), 'campaignId'),
    brandVoiceId: optionalId(coalesceField(input, 'brandVoiceId', 'brand_voice_id'), 'brandVoiceId'),
  };
}

export function normalizeAgencyDraftInput(
  input: AgencyDraftInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload = normalizeContentLibraryItemInput(agencyDraftContentInput(input), options);
  const clientId = agencyDraftClientIdFrom(input);
  if (clientId !== undefined) payload.client_id = clientId;
  return payload;
}

async function validateReference(
  supabase: SupabaseClient<any>,
  table: 'campaigns' | 'brand_voices',
  organizationId: string,
  id: string,
  field: 'campaignId' | 'brandVoiceId',
  clientId?: string | null
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('id, client_id')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle() as { data: { id: string; client_id: string | null } | null; error: any };

  if (error) {
    throw new Error(error.message || `Failed to validate ${field}`);
  }
  if (!data) {
    throw new CampaignLibraryValidationError(`${field} must reference a record in this agency organization`);
  }
  if (clientId && data.client_id && data.client_id !== clientId) {
    throw new CampaignLibraryValidationError(`${field} must belong to the selected agency client`);
  }
}

export async function validateAgencyDraftReferences(
  supabase: SupabaseClient<any>,
  organizationId: string,
  input: AgencyDraftInput,
  options: { clientId?: string | null } = {}
): Promise<void> {
  const { campaignId, brandVoiceId } = agencyDraftReferenceIdsFrom(input);
  if (campaignId) {
    await validateReference(supabase, 'campaigns', organizationId, campaignId, 'campaignId', options.clientId);
  }
  if (brandVoiceId) {
    await validateReference(supabase, 'brand_voices', organizationId, brandVoiceId, 'brandVoiceId', options.clientId);
  }
}

export async function listAgencyDrafts(
  supabase: SupabaseClient<any>,
  organizationId: string,
  filters: {
    clientId?: string | null;
    status?: ContentLibraryStatus | string | null;
    limit?: number;
  } = {}
): Promise<AgencyDraft[]> {
  const limit = Math.max(1, Math.min(200, filters.limit || 100));
  if (filters.status && !CONTENT_LIBRARY_STATUSES.includes(filters.status as ContentLibraryStatus)) {
    throw new CampaignLibraryValidationError(`status must be one of: ${CONTENT_LIBRARY_STATUSES.join(', ')}`);
  }

  let query = supabase
    .from('content_library_items')
    .select('*')
    .eq('organization_id', organizationId) as any;

  if (filters.clientId) {
    query = query.eq('client_id', filters.clientId);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(limit) as { data: ContentLibraryItemRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load agency drafts');
  }

  return (data || []).map(mapContentLibraryItemRow);
}

export async function getAgencyDraft(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<AgencyDraft | null> {
  const { data, error } = await supabase
    .from('content_library_items')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle() as { data: ContentLibraryItemRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load agency draft');
  }

  return data ? mapContentLibraryItemRow(data) : null;
}

export async function createAgencyDraft(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: AgencyDraftInput
): Promise<AgencyDraft> {
  const payload = {
    ...normalizeAgencyDraftInput(input),
    organization_id: organizationId,
    created_by: createdBy,
  };

  const { data, error } = await supabase
    .from('content_library_items')
    .insert(payload as any)
    .select('*')
    .single() as { data: ContentLibraryItemRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create agency draft');
  }

  return mapContentLibraryItemRow(data);
}

export async function updateAgencyDraft(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: AgencyDraftInput
): Promise<AgencyDraft | null> {
  const payload = normalizeAgencyDraftInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new CampaignLibraryValidationError('No agency draft fields provided');
  }

  const { data, error } = await supabase
    .from('content_library_items')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('*')
    .maybeSingle() as { data: ContentLibraryItemRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update agency draft');
  }

  return data ? mapContentLibraryItemRow(data) : null;
}
