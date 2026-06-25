import type { SupabaseClient } from '@supabase/supabase-js';

import type { ContentLibraryItem, ContentLibraryItemRow } from '@/lib/campaigns-content-library';
import { mapContentLibraryItemRow } from '@/lib/campaigns-content-library';

export const AGENCY_DELIVERY_PACKAGE_STATUSES = ['draft', 'ready', 'delivered', 'archived'] as const;
export type AgencyDeliveryPackageStatus = typeof AGENCY_DELIVERY_PACKAGE_STATUSES[number];
export type AgencyDeliveryExportFormat = 'markdown' | 'csv' | 'text' | 'json';

export interface AgencyDeliveryPackage {
  id: string;
  organizationId: string;
  clientId: string;
  title: string;
  status: AgencyDeliveryPackageStatus;
  deliveryNotes: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: ContentLibraryItem[];
}

export interface AgencyDeliveryPackageRow {
  id: string;
  organization_id: string;
  client_id: string;
  title: string;
  status: string;
  delivery_notes: string | null;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AgencyDeliveryPackageInput = {
  clientId?: unknown;
  client_id?: unknown;
  title?: unknown;
  status?: unknown;
  deliveryNotes?: unknown;
  delivery_notes?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
  itemIds?: unknown;
  item_ids?: unknown;
  deliveredAt?: unknown;
  delivered_at?: unknown;
};

export class AgencyDeliveryPackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyDeliveryPackageValidationError';
  }
}

const MAX_TITLE_LENGTH = 160;
const MAX_TEXT_LENGTH = 10000;
const MAX_ID_LENGTH = 120;
const MAX_ITEMS = 100;

function coalesceField(input: AgencyDeliveryPackageInput, ...keys: Array<keyof AgencyDeliveryPackageInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyDeliveryPackageValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencyDeliveryPackageValidationError(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function requiredString(value: unknown, maxLength: number, field: string): string {
  const normalized = optionalString(value, maxLength, field);
  if (!normalized) {
    throw new AgencyDeliveryPackageValidationError(`${field} is required`);
  }
  return normalized;
}

function optionalId(value: unknown, field: string): string | null | undefined {
  return optionalString(value, MAX_ID_LENGTH, field);
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencyDeliveryPackageValidationError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalTimestamp(value: unknown, field: string): string | null | undefined {
  const normalized = optionalString(value, 240, field);
  if (normalized === undefined || normalized === null) return normalized;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new AgencyDeliveryPackageValidationError(`${field} must be a valid timestamp`);
  }
  return date.toISOString();
}

function normalizeStatus(value: string): AgencyDeliveryPackageStatus {
  return AGENCY_DELIVERY_PACKAGE_STATUSES.includes(value as AgencyDeliveryPackageStatus)
    ? value as AgencyDeliveryPackageStatus
    : 'draft';
}

function optionalStatus(value: unknown): AgencyDeliveryPackageStatus | null | undefined {
  const normalized = optionalString(value, 80, 'status');
  if (normalized === undefined || normalized === null) return normalized;
  if (!AGENCY_DELIVERY_PACKAGE_STATUSES.includes(normalized as AgencyDeliveryPackageStatus)) {
    throw new AgencyDeliveryPackageValidationError(`status must be one of: ${AGENCY_DELIVERY_PACKAGE_STATUSES.join(', ')}`);
  }
  return normalized as AgencyDeliveryPackageStatus;
}

export function deliveryPackageClientIdFrom(input: AgencyDeliveryPackageInput): string | null | undefined {
  return optionalId(coalesceField(input, 'clientId', 'client_id'), 'clientId');
}

export function deliveryPackageItemIdsFrom(input: AgencyDeliveryPackageInput): string[] | undefined {
  const value = coalesceField(input, 'itemIds', 'item_ids');
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AgencyDeliveryPackageValidationError('itemIds must be an array');
  }
  if (value.length > MAX_ITEMS) {
    throw new AgencyDeliveryPackageValidationError(`itemIds can include at most ${MAX_ITEMS} items`);
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = optionalId(item, 'itemIds');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function mapAgencyDeliveryPackageRow(row: AgencyDeliveryPackageRow): AgencyDeliveryPackage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    title: row.title,
    status: normalizeStatus(row.status),
    deliveryNotes: row.delivery_notes,
    metadata: row.metadata_json || {},
    createdBy: row.created_by,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAgencyDeliveryPackageInput(
  input: AgencyDeliveryPackageInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const clientId = deliveryPackageClientIdFrom(input);
  if (!options.partial || clientId !== undefined) {
    if (!clientId) throw new AgencyDeliveryPackageValidationError('clientId is required');
    payload.client_id = clientId;
  }

  const rawTitle = coalesceField(input, 'title');
  if (!options.partial || rawTitle !== undefined) {
    payload.title = requiredString(rawTitle, MAX_TITLE_LENGTH, 'title');
  }

  const status = optionalStatus(input.status);
  if (status !== undefined) payload.status = status;

  const deliveryNotes = optionalString(coalesceField(input, 'deliveryNotes', 'delivery_notes'), MAX_TEXT_LENGTH, 'deliveryNotes');
  if (deliveryNotes !== undefined) payload.delivery_notes = deliveryNotes;

  const metadata = optionalObject(coalesceField(input, 'metadata', 'metadata_json'), 'metadata');
  if (metadata !== undefined) payload.metadata_json = metadata;

  const deliveredAt = optionalTimestamp(coalesceField(input, 'deliveredAt', 'delivered_at'), 'deliveredAt');
  if (deliveredAt !== undefined) payload.delivered_at = deliveredAt;

  if (options.partial && Object.keys(payload).length === 0 && deliveryPackageItemIdsFrom(input) === undefined) {
    throw new AgencyDeliveryPackageValidationError('No delivery package fields provided');
  }

  return payload;
}

export async function validateDeliveryPackageItems(
  supabase: SupabaseClient<any>,
  organizationId: string,
  clientId: string,
  itemIds: string[]
): Promise<void> {
  if (!itemIds.length) return;

  const { data, error } = await supabase
    .from('content_library_items')
    .select('id, organization_id, client_id')
    .in('id', itemIds) as {
      data: Array<{ id: string; organization_id: string; client_id: string | null }> | null;
      error: any;
    };

  if (error) throw new Error(error.message || 'Failed to validate delivery package items');

  const rows = data || [];
  const found = new Set(rows.map((row) => row.id));
  for (const itemId of itemIds) {
    if (!found.has(itemId)) {
      throw new AgencyDeliveryPackageValidationError('itemIds must reference content items in this agency organization');
    }
  }
  for (const row of rows) {
    if (row.organization_id !== organizationId || row.client_id !== clientId) {
      throw new AgencyDeliveryPackageValidationError('itemIds must belong to the selected agency client');
    }
  }
}

export async function listAgencyDeliveryPackages(
  supabase: SupabaseClient<any>,
  organizationId: string,
  filters: { clientId?: string | null; status?: string | null; limit?: number } = {}
): Promise<AgencyDeliveryPackage[]> {
  const limit = Math.max(1, Math.min(200, filters.limit || 100));
  if (filters.status && !AGENCY_DELIVERY_PACKAGE_STATUSES.includes(filters.status as AgencyDeliveryPackageStatus)) {
    throw new AgencyDeliveryPackageValidationError(`status must be one of: ${AGENCY_DELIVERY_PACKAGE_STATUSES.join(', ')}`);
  }

  let query = supabase
    .from('agency_delivery_packages')
    .select('*')
    .eq('organization_id', organizationId) as any;

  if (filters.clientId) query = query.eq('client_id', filters.clientId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(limit) as { data: AgencyDeliveryPackageRow[] | null; error: any };

  if (error) throw new Error(error.message || 'Failed to load delivery packages');

  const packages = (data || []).map(mapAgencyDeliveryPackageRow);
  if (!packages.length) return packages;

  const packageIds = packages.map((pkg) => pkg.id);
  const { data: items, error: itemError } = await supabase
    .from('agency_delivery_package_items')
    .select('package_id')
    .in('package_id', packageIds) as {
      data: Array<{ package_id: string }> | null;
      error: any;
    };

  if (itemError) throw new Error(itemError.message || 'Failed to load delivery package item counts');

  const counts = new Map<string, number>();
  for (const item of items || []) counts.set(item.package_id, (counts.get(item.package_id) || 0) + 1);
  return packages.map((pkg) => ({ ...pkg, itemCount: counts.get(pkg.id) || 0 }));
}

export async function getAgencyDeliveryPackage(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<AgencyDeliveryPackage | null> {
  const { data, error } = await supabase
    .from('agency_delivery_packages')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle() as { data: AgencyDeliveryPackageRow | null; error: any };

  if (error) throw new Error(error.message || 'Failed to load delivery package');
  if (!data) return null;

  const pkg = mapAgencyDeliveryPackageRow(data);
  const { data: itemRows, error: itemError } = await supabase
    .from('agency_delivery_package_items')
    .select('content_item_id, sort_order')
    .eq('package_id', pkg.id)
    .order('sort_order', { ascending: true }) as {
      data: Array<{ content_item_id: string; sort_order: number }> | null;
      error: any;
    };

  if (itemError) throw new Error(itemError.message || 'Failed to load delivery package items');

  const itemIds = (itemRows || []).map((item) => item.content_item_id);
  const items = itemIds.length ? await getContentItemsByIds(supabase, organizationId, itemIds) : [];
  return { ...pkg, itemCount: itemIds.length, items };
}

async function getContentItemsByIds(
  supabase: SupabaseClient<any>,
  organizationId: string,
  ids: string[]
): Promise<ContentLibraryItem[]> {
  const { data, error } = await supabase
    .from('content_library_items')
    .select('*')
    .eq('organization_id', organizationId)
    .in('id', ids) as { data: ContentLibraryItemRow[] | null; error: any };

  if (error) throw new Error(error.message || 'Failed to load delivery package content items');
  const byId = new Map((data || []).map((row) => [row.id, mapContentLibraryItemRow(row)]));
  return ids.map((id) => byId.get(id)).filter((item): item is ContentLibraryItem => Boolean(item));
}

async function replaceDeliveryPackageItems(
  supabase: SupabaseClient<any>,
  packageId: string,
  itemIds: string[]
) {
  const { error: deleteError } = await supabase
    .from('agency_delivery_package_items')
    .delete()
    .eq('package_id', packageId) as { error: any };
  if (deleteError) throw new Error(deleteError.message || 'Failed to clear delivery package items');

  if (!itemIds.length) return;

  const rows = itemIds.map((contentItemId, index) => ({
    package_id: packageId,
    content_item_id: contentItemId,
    sort_order: index,
  }));
  const { error } = await supabase
    .from('agency_delivery_package_items')
    .insert(rows as any) as { error: any };
  if (error) throw new Error(error.message || 'Failed to save delivery package items');
}

export async function createAgencyDeliveryPackage(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: AgencyDeliveryPackageInput
): Promise<AgencyDeliveryPackage> {
  const payload: Record<string, unknown> = {
    ...normalizeAgencyDeliveryPackageInput(input),
    organization_id: organizationId,
    created_by: createdBy,
  };
  const itemIds = deliveryPackageItemIdsFrom(input) || [];
  await validateDeliveryPackageItems(supabase, organizationId, payload.client_id as string, itemIds);

  const { data, error } = await supabase
    .from('agency_delivery_packages')
    .insert(payload as any)
    .select('*')
    .single() as { data: AgencyDeliveryPackageRow | null; error: any };

  if (error || !data) throw new Error(error?.message || 'Failed to create delivery package');

  await replaceDeliveryPackageItems(supabase, data.id, itemIds);
  return getAgencyDeliveryPackage(supabase, organizationId, data.id) as Promise<AgencyDeliveryPackage>;
}

export async function updateAgencyDeliveryPackage(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: AgencyDeliveryPackageInput
): Promise<AgencyDeliveryPackage | null> {
  const existing = await getAgencyDeliveryPackage(supabase, organizationId, id);
  if (!existing) return null;

  const payload = normalizeAgencyDeliveryPackageInput(input, { partial: true });
  const itemIds = deliveryPackageItemIdsFrom(input);
  const nextClientId = (payload.client_id as string | undefined) || existing.clientId;
  if (itemIds !== undefined) {
    await validateDeliveryPackageItems(supabase, organizationId, nextClientId, itemIds);
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase
      .from('agency_delivery_packages')
      .update(payload as any)
      .eq('organization_id', organizationId)
      .eq('id', id) as { error: any };
    if (error) throw new Error(error.message || 'Failed to update delivery package');
  }

  if (itemIds !== undefined) {
    await replaceDeliveryPackageItems(supabase, id, itemIds);
  }

  return getAgencyDeliveryPackage(supabase, organizationId, id);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function packageMarkdown(pkg: AgencyDeliveryPackage): string {
  const lines = [
    `# ${pkg.title}`,
    '',
    `Status: ${pkg.status}`,
    pkg.deliveryNotes ? `Delivery notes: ${pkg.deliveryNotes}` : null,
  ].filter((line): line is string => line !== null);

  for (const item of pkg.items || []) {
    lines.push('', `## ${item.title}`, '');
    if (item.platform) lines.push(`Platform: ${item.platform}`);
    lines.push(`Content type: ${item.contentType}`, '');
    lines.push(item.body || item.excerpt || '');
  }

  return lines.join('\n');
}

function packageText(pkg: AgencyDeliveryPackage): string {
  return (pkg.items || [])
    .map((item) => `${item.title}\n${item.body || item.excerpt || ''}`.trim())
    .join('\n\n---\n\n');
}

function packageCsv(pkg: AgencyDeliveryPackage): string {
  const header = 'package_title,item_title,status,content_type,platform,body';
  const rows = (pkg.items || []).map((item) => [
    pkg.title,
    item.title,
    item.status,
    item.contentType,
    item.platform || '',
    item.body || item.excerpt || '',
  ].map(csvCell).join(','));
  return `${header}\n${rows.join('\n')}\n`;
}

export function exportAgencyDeliveryPackage(
  pkg: AgencyDeliveryPackage,
  format: AgencyDeliveryExportFormat
): { filename: string; contentType: string; body: string } {
  const slug = pkg.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agency-delivery-package';

  if (format === 'csv') {
    return { filename: `${slug}.csv`, contentType: 'text/csv;charset=utf-8', body: packageCsv(pkg) };
  }
  if (format === 'text') {
    return { filename: `${slug}.txt`, contentType: 'text/plain;charset=utf-8', body: packageText(pkg) };
  }
  if (format === 'json') {
    return { filename: `${slug}.json`, contentType: 'application/json;charset=utf-8', body: JSON.stringify(pkg, null, 2) };
  }
  return { filename: `${slug}.md`, contentType: 'text/markdown;charset=utf-8', body: packageMarkdown(pkg) };
}
