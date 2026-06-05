import type { SupabaseClient } from '@supabase/supabase-js';

import type { OrganizationMemberRole, OrganizationType } from '@/lib/authz/types';

export const CAMPAIGN_STATUSES = ['planned', 'active', 'paused', 'completed', 'archived'] as const;
export const CONTENT_LIBRARY_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'] as const;

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];
export type ContentLibraryStatus = typeof CONTENT_LIBRARY_STATUSES[number];

export interface Campaign {
  id: string;
  organizationId: string;
  clientId: string | null;
  brandVoiceId: string | null;
  name: string;
  status: CampaignStatus;
  objective: string | null;
  audience: string | null;
  channels: string[];
  startDate: string | null;
  endDate: string | null;
  ownerUserId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  brand_voice_id: string | null;
  name: string;
  status: string;
  objective: string | null;
  audience: string | null;
  channels_json: unknown;
  start_date: string | null;
  end_date: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentLibraryItem {
  id: string;
  organizationId: string;
  clientId: string | null;
  campaignId: string | null;
  brandVoiceId: string | null;
  projectId: string | null;
  outputId: string | null;
  title: string;
  contentType: string;
  platform: string | null;
  status: ContentLibraryStatus;
  body: string | null;
  excerpt: string | null;
  sourceLabel: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentLibraryItemRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  campaign_id: string | null;
  brand_voice_id: string | null;
  project_id: string | null;
  output_id: string | null;
  title: string;
  content_type: string;
  platform: string | null;
  status: string;
  body: string | null;
  excerpt: string | null;
  source_label: string | null;
  tags_json: unknown;
  metadata_json: unknown;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CampaignInput = {
  name?: unknown;
  status?: unknown;
  objective?: unknown;
  audience?: unknown;
  channels?: unknown;
  channels_json?: unknown;
  brandVoiceId?: unknown;
  brand_voice_id?: unknown;
  startDate?: unknown;
  start_date?: unknown;
  endDate?: unknown;
  end_date?: unknown;
  ownerUserId?: unknown;
  owner_user_id?: unknown;
};

export type ContentLibraryItemInput = {
  title?: unknown;
  contentType?: unknown;
  content_type?: unknown;
  platform?: unknown;
  status?: unknown;
  body?: unknown;
  excerpt?: unknown;
  sourceLabel?: unknown;
  source_label?: unknown;
  tags?: unknown;
  tags_json?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
  publishedAt?: unknown;
  published_at?: unknown;
  campaignId?: unknown;
  campaign_id?: unknown;
  brandVoiceId?: unknown;
  brand_voice_id?: unknown;
  projectId?: unknown;
  project_id?: unknown;
  outputId?: unknown;
  output_id?: unknown;
};

export class CampaignLibraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignLibraryValidationError';
  }
}

const MAX_NAME_LENGTH = 160;
const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_LONG_TEXT_LENGTH = 2000;
const MAX_BODY_LENGTH = 30000;
const MAX_LIST_ITEMS = 32;
const MAX_LIST_ITEM_LENGTH = 120;
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

function requiredString(value: unknown, maxLength: number, field: string): string {
  const normalized = optionalString(value, maxLength, field);
  if (!normalized) {
    throw new CampaignLibraryValidationError(`${field} is required`);
  }
  return normalized;
}

function optionalId(value: unknown, field: string): string | null | undefined {
  const normalized = optionalString(value, MAX_ID_LENGTH, field);
  return normalized === undefined ? undefined : normalized;
}

function optionalDate(value: unknown, field: string): string | null | undefined {
  const normalized = optionalString(value, 10, field);
  if (normalized === undefined || normalized === null) return normalized;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new CampaignLibraryValidationError(`${field} must use YYYY-MM-DD format`);
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new CampaignLibraryValidationError(`${field} must be a valid date`);
  }

  return normalized;
}

function optionalTimestamp(value: unknown, field: string): string | null | undefined {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, field);
  if (normalized === undefined || normalized === null) return normalized;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new CampaignLibraryValidationError(`${field} must be a valid timestamp`);
  }

  return date.toISOString();
}

function stringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new CampaignLibraryValidationError(`${field} must be an array`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    throw new CampaignLibraryValidationError(`${field} can include at most ${MAX_LIST_ITEMS} items`);
  }

  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new CampaignLibraryValidationError(`${field} items must be strings`);
    }

    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_LIST_ITEM_LENGTH) {
      throw new CampaignLibraryValidationError(`${field} items must be ${MAX_LIST_ITEM_LENGTH} characters or fewer`);
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(trimmed);
  }

  return items;
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new CampaignLibraryValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string
): T[number] | null | undefined {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, field);
  if (normalized === undefined || normalized === null) return normalized;
  if (!allowed.includes(normalized)) {
    throw new CampaignLibraryValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return normalized as T[number];
}

function coalesceField<T extends Record<string, unknown>>(input: T, ...keys: Array<keyof T>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function parseStoredList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseStoredObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeCampaignStatus(value: string): CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus) ? value as CampaignStatus : 'planned';
}

function normalizeContentStatus(value: string): ContentLibraryStatus {
  return CONTENT_LIBRARY_STATUSES.includes(value as ContentLibraryStatus) ? value as ContentLibraryStatus : 'draft';
}

function isUniqueViolation(error: any): boolean {
  return error?.code === '23505'
    || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
}

export function canManageCampaignLibrary(
  role?: OrganizationMemberRole | string | null,
  organizationType?: OrganizationType | string | null
): boolean {
  if (role === 'owner' || role === 'admin') return true;
  return role === 'agency_admin' && organizationType === 'internal_agency';
}

export function mapCampaignRow(row: CampaignRow): Campaign {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    brandVoiceId: row.brand_voice_id,
    name: row.name,
    status: normalizeCampaignStatus(row.status),
    objective: row.objective,
    audience: row.audience,
    channels: parseStoredList(row.channels_json),
    startDate: row.start_date,
    endDate: row.end_date,
    ownerUserId: row.owner_user_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapContentLibraryItemRow(row: ContentLibraryItemRow): ContentLibraryItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    campaignId: row.campaign_id,
    brandVoiceId: row.brand_voice_id,
    projectId: row.project_id,
    outputId: row.output_id,
    title: row.title,
    contentType: row.content_type,
    platform: row.platform,
    status: normalizeContentStatus(row.status),
    body: row.body,
    excerpt: row.excerpt,
    sourceLabel: row.source_label,
    tags: parseStoredList(row.tags_json),
    metadata: parseStoredObject(row.metadata_json),
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeCampaignInput(
  input: CampaignInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawName = coalesceField(input, 'name');
  if (!options.partial || rawName !== undefined) {
    payload.name = requiredString(rawName, MAX_NAME_LENGTH, 'Campaign name');
  }

  const status = optionalEnum(input.status, CAMPAIGN_STATUSES, 'status');
  if (status !== undefined) payload.status = status;

  const objective = optionalString(input.objective, MAX_LONG_TEXT_LENGTH, 'objective');
  if (objective !== undefined) payload.objective = objective;

  const audience = optionalString(input.audience, MAX_LONG_TEXT_LENGTH, 'audience');
  if (audience !== undefined) payload.audience = audience;

  const channels = stringList(coalesceField(input, 'channels', 'channels_json'), 'channels');
  if (channels !== undefined) payload.channels_json = channels;

  const brandVoiceId = optionalId(coalesceField(input, 'brandVoiceId', 'brand_voice_id'), 'brandVoiceId');
  if (brandVoiceId !== undefined) payload.brand_voice_id = brandVoiceId;

  const startDate = optionalDate(coalesceField(input, 'startDate', 'start_date'), 'startDate');
  if (startDate !== undefined) payload.start_date = startDate;

  const endDate = optionalDate(coalesceField(input, 'endDate', 'end_date'), 'endDate');
  if (endDate !== undefined) payload.end_date = endDate;

  if (typeof payload.start_date === 'string' && typeof payload.end_date === 'string' && payload.end_date < payload.start_date) {
    throw new CampaignLibraryValidationError('endDate must be on or after startDate');
  }

  const ownerUserId = optionalId(coalesceField(input, 'ownerUserId', 'owner_user_id'), 'ownerUserId');
  if (ownerUserId !== undefined) payload.owner_user_id = ownerUserId;

  return payload;
}

export function normalizeContentLibraryItemInput(
  input: ContentLibraryItemInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawTitle = coalesceField(input, 'title');
  if (!options.partial || rawTitle !== undefined) {
    payload.title = requiredString(rawTitle, MAX_NAME_LENGTH, 'Content title');
  }

  const rawContentType = coalesceField(input, 'contentType', 'content_type');
  if (rawContentType !== undefined) {
    payload.content_type = requiredString(rawContentType, MAX_SHORT_TEXT_LENGTH, 'contentType');
  }

  const platform = optionalString(input.platform, MAX_SHORT_TEXT_LENGTH, 'platform');
  if (platform !== undefined) payload.platform = platform;

  const status = optionalEnum(input.status, CONTENT_LIBRARY_STATUSES, 'status');
  if (status !== undefined) payload.status = status;

  const body = optionalString(input.body, MAX_BODY_LENGTH, 'body');
  if (body !== undefined) payload.body = body;

  const excerpt = optionalString(input.excerpt, MAX_LONG_TEXT_LENGTH, 'excerpt');
  if (excerpt !== undefined) payload.excerpt = excerpt;

  const sourceLabel = optionalString(coalesceField(input, 'sourceLabel', 'source_label'), MAX_SHORT_TEXT_LENGTH, 'sourceLabel');
  if (sourceLabel !== undefined) payload.source_label = sourceLabel;

  const tags = stringList(coalesceField(input, 'tags', 'tags_json'), 'tags');
  if (tags !== undefined) payload.tags_json = tags;

  const metadata = optionalObject(coalesceField(input, 'metadata', 'metadata_json'), 'metadata');
  if (metadata !== undefined) payload.metadata_json = metadata;

  const publishedAt = optionalTimestamp(coalesceField(input, 'publishedAt', 'published_at'), 'publishedAt');
  if (publishedAt !== undefined) payload.published_at = publishedAt;

  const campaignId = optionalId(coalesceField(input, 'campaignId', 'campaign_id'), 'campaignId');
  if (campaignId !== undefined) payload.campaign_id = campaignId;

  const brandVoiceId = optionalId(coalesceField(input, 'brandVoiceId', 'brand_voice_id'), 'brandVoiceId');
  if (brandVoiceId !== undefined) payload.brand_voice_id = brandVoiceId;

  const projectId = optionalId(coalesceField(input, 'projectId', 'project_id'), 'projectId');
  if (projectId !== undefined) payload.project_id = projectId;

  const outputId = optionalId(coalesceField(input, 'outputId', 'output_id'), 'outputId');
  if (outputId !== undefined) payload.output_id = outputId;

  return payload;
}

export async function listCampaigns(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', organizationId)
    .is('client_id', null)
    .order('updated_at', { ascending: false }) as {
      data: CampaignRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load campaigns');
  }

  return (data || []).map(mapCampaignRow);
}

export async function getCampaign(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: CampaignRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load campaign');
  }

  return data ? mapCampaignRow(data) : null;
}

export async function createCampaign(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: CampaignInput
): Promise<Campaign> {
  const normalized = normalizeCampaignInput(input);
  const payload = {
    ...normalized,
    organization_id: organizationId,
    client_id: null,
    created_by: createdBy,
    owner_user_id: normalized.owner_user_id === undefined ? createdBy : normalized.owner_user_id,
  };

  const { data, error } = await supabase
    .from('campaigns')
    .insert(payload as any)
    .select('*')
    .single() as { data: CampaignRow | null; error: any };

  if (error || !data) {
    if (isUniqueViolation(error)) {
      throw new CampaignLibraryValidationError('A campaign with this name already exists');
    }
    throw new Error(error?.message || 'Failed to create campaign');
  }

  return mapCampaignRow(data);
}

export async function updateCampaign(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: CampaignInput
): Promise<Campaign | null> {
  const payload = normalizeCampaignInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new CampaignLibraryValidationError('No campaign fields provided');
  }

  const { data, error } = await supabase
    .from('campaigns')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('*')
    .maybeSingle() as { data: CampaignRow | null; error: any };

  if (error) {
    if (isUniqueViolation(error)) {
      throw new CampaignLibraryValidationError('A campaign with this name already exists');
    }
    throw new Error(error.message || 'Failed to update campaign');
  }

  return data ? mapCampaignRow(data) : null;
}

export async function deleteCampaign(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('campaigns')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to delete campaign');
  }

  return Boolean(data);
}

export async function listContentLibraryItems(
  supabase: SupabaseClient<any>,
  organizationId: string,
  filters: { campaignId?: string | null; status?: ContentLibraryStatus | string | null; limit?: number } = {}
): Promise<ContentLibraryItem[]> {
  const limit = Math.max(1, Math.min(200, filters.limit || 100));
  if (filters.status && !CONTENT_LIBRARY_STATUSES.includes(filters.status as ContentLibraryStatus)) {
    throw new CampaignLibraryValidationError(`status must be one of: ${CONTENT_LIBRARY_STATUSES.join(', ')}`);
  }

  let query = supabase
    .from('content_library_items')
    .select('*')
    .eq('organization_id', organizationId)
    .is('client_id', null) as any;

  if (filters.campaignId) {
    query = query.eq('campaign_id', filters.campaignId);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(limit) as { data: ContentLibraryItemRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load content library');
  }

  return (data || []).map(mapContentLibraryItemRow);
}

export async function getContentLibraryItem(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<ContentLibraryItem | null> {
  const { data, error } = await supabase
    .from('content_library_items')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .maybeSingle() as { data: ContentLibraryItemRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load content library item');
  }

  return data ? mapContentLibraryItemRow(data) : null;
}

export async function createContentLibraryItem(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: ContentLibraryItemInput
): Promise<ContentLibraryItem> {
  const payload = {
    ...normalizeContentLibraryItemInput(input),
    organization_id: organizationId,
    client_id: null,
    created_by: createdBy,
  };

  const { data, error } = await supabase
    .from('content_library_items')
    .insert(payload as any)
    .select('*')
    .single() as { data: ContentLibraryItemRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create content library item');
  }

  return mapContentLibraryItemRow(data);
}

export async function updateContentLibraryItem(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: ContentLibraryItemInput
): Promise<ContentLibraryItem | null> {
  const payload = normalizeContentLibraryItemInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new CampaignLibraryValidationError('No content library fields provided');
  }

  const { data, error } = await supabase
    .from('content_library_items')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('*')
    .maybeSingle() as { data: ContentLibraryItemRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update content library item');
  }

  return data ? mapContentLibraryItemRow(data) : null;
}

export async function deleteContentLibraryItem(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('content_library_items')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('client_id', null)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to delete content library item');
  }

  return Boolean(data);
}
