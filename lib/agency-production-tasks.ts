import type { SupabaseClient } from '@supabase/supabase-js';

export const AGENCY_PRODUCTION_TASK_STATUSES = [
  'todo',
  'in_progress',
  'needs_review',
  'ready_to_deliver',
  'delivered',
  'blocked',
  'archived',
] as const;

export const AGENCY_PRODUCTION_TASK_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export type AgencyProductionTaskStatus = typeof AGENCY_PRODUCTION_TASK_STATUSES[number];
export type AgencyProductionTaskPriority = typeof AGENCY_PRODUCTION_TASK_PRIORITIES[number];

export interface AgencyProductionTask {
  id: string;
  organizationId: string;
  clientId: string | null;
  campaignId: string | null;
  contentItemId: string | null;
  title: string;
  description: string | null;
  status: AgencyProductionTaskStatus;
  priority: AgencyProductionTaskPriority;
  assignedTo: string | null;
  createdBy: string | null;
  dueDate: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyProductionTaskRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  campaign_id: string | null;
  content_item_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string | null;
  due_date: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type AgencyProductionTaskInput = {
  clientId?: unknown;
  client_id?: unknown;
  campaignId?: unknown;
  campaign_id?: unknown;
  contentItemId?: unknown;
  content_item_id?: unknown;
  title?: unknown;
  description?: unknown;
  status?: unknown;
  priority?: unknown;
  assignedTo?: unknown;
  assigned_to?: unknown;
  dueDate?: unknown;
  due_date?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
};

export class AgencyProductionTaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyProductionTaskValidationError';
  }
}

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 5000;
const MAX_ID_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 240;

function optionalString(value: unknown, maxLength: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyProductionTaskValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AgencyProductionTaskValidationError(`${field} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function requiredTitle(value: unknown): string {
  const normalized = optionalString(value, MAX_TITLE_LENGTH, 'title');
  if (!normalized) {
    throw new AgencyProductionTaskValidationError('title is required');
  }
  return normalized;
}

function optionalId(value: unknown, field: string): string | null | undefined {
  return optionalString(value, MAX_ID_LENGTH, field);
}

function optionalTimestamp(value: unknown, field: string): string | null | undefined {
  const normalized = optionalString(value, MAX_SHORT_TEXT_LENGTH, field);
  if (normalized === undefined || normalized === null) return normalized;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new AgencyProductionTaskValidationError(`${field} must be a valid timestamp`);
  }

  return date.toISOString();
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencyProductionTaskValidationError('metadata must be an object');
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
    throw new AgencyProductionTaskValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return normalized as T[number];
}

function coalesceField(input: AgencyProductionTaskInput, ...keys: Array<keyof AgencyProductionTaskInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function normalizeTaskStatus(value: string): AgencyProductionTaskStatus {
  return AGENCY_PRODUCTION_TASK_STATUSES.includes(value as AgencyProductionTaskStatus)
    ? value as AgencyProductionTaskStatus
    : 'todo';
}

function normalizeTaskPriority(value: string): AgencyProductionTaskPriority {
  return AGENCY_PRODUCTION_TASK_PRIORITIES.includes(value as AgencyProductionTaskPriority)
    ? value as AgencyProductionTaskPriority
    : 'normal';
}

export function productionTaskClientIdFrom(input: AgencyProductionTaskInput): string | null | undefined {
  return optionalId(coalesceField(input, 'clientId', 'client_id'), 'clientId');
}

export function productionTaskReferenceIdsFrom(input: AgencyProductionTaskInput): {
  campaignId: string | null | undefined;
  contentItemId: string | null | undefined;
} {
  return {
    campaignId: optionalId(coalesceField(input, 'campaignId', 'campaign_id'), 'campaignId'),
    contentItemId: optionalId(coalesceField(input, 'contentItemId', 'content_item_id'), 'contentItemId'),
  };
}

export function mapAgencyProductionTaskRow(row: AgencyProductionTaskRow): AgencyProductionTask {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    campaignId: row.campaign_id,
    contentItemId: row.content_item_id,
    title: row.title,
    description: row.description,
    status: normalizeTaskStatus(row.status),
    priority: normalizeTaskPriority(row.priority),
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    dueDate: row.due_date,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAgencyProductionTaskInput(
  input: AgencyProductionTaskInput,
  options: { partial?: boolean } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const rawTitle = coalesceField(input, 'title');
  if (!options.partial || rawTitle !== undefined) {
    payload.title = requiredTitle(rawTitle);
  }

  const clientId = productionTaskClientIdFrom(input);
  if (clientId !== undefined) payload.client_id = clientId;

  const campaignId = optionalId(coalesceField(input, 'campaignId', 'campaign_id'), 'campaignId');
  if (campaignId !== undefined) payload.campaign_id = campaignId;

  const contentItemId = optionalId(coalesceField(input, 'contentItemId', 'content_item_id'), 'contentItemId');
  if (contentItemId !== undefined) payload.content_item_id = contentItemId;

  const description = optionalString(input.description, MAX_TEXT_LENGTH, 'description');
  if (description !== undefined) payload.description = description;

  const status = optionalEnum(input.status, AGENCY_PRODUCTION_TASK_STATUSES, 'status');
  if (status !== undefined) payload.status = status;

  const priority = optionalEnum(input.priority, AGENCY_PRODUCTION_TASK_PRIORITIES, 'priority');
  if (priority !== undefined) payload.priority = priority;

  const assignedTo = optionalId(coalesceField(input, 'assignedTo', 'assigned_to'), 'assignedTo');
  if (assignedTo !== undefined) payload.assigned_to = assignedTo;

  const dueDate = optionalTimestamp(coalesceField(input, 'dueDate', 'due_date'), 'dueDate');
  if (dueDate !== undefined) payload.due_date = dueDate;

  const metadata = optionalObject(coalesceField(input, 'metadata', 'metadata_json'));
  if (metadata !== undefined) payload.metadata_json = metadata;

  return payload;
}

export async function validateAgencyProductionTaskReferences(
  supabase: SupabaseClient<any>,
  organizationId: string,
  input: AgencyProductionTaskInput,
  options: { clientId?: string | null } = {}
): Promise<void> {
  const { campaignId, contentItemId } = productionTaskReferenceIdsFrom(input);

  if (campaignId) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, client_id')
      .eq('organization_id', organizationId)
      .eq('id', campaignId)
      .maybeSingle() as { data: { id: string; client_id: string | null } | null; error: any };

    if (error) {
      throw new Error(error.message || 'Failed to validate production task campaign');
    }
    if (!data) {
      throw new AgencyProductionTaskValidationError('campaignId must reference a campaign in this agency organization');
    }
    if (options.clientId && data.client_id && data.client_id !== options.clientId) {
      throw new AgencyProductionTaskValidationError('campaignId must belong to the selected agency client');
    }
  }

  if (contentItemId) {
    const { data, error } = await supabase
      .from('content_library_items')
      .select('id, client_id')
      .eq('organization_id', organizationId)
      .eq('id', contentItemId)
      .maybeSingle() as { data: { id: string; client_id: string | null } | null; error: any };

    if (error) {
      throw new Error(error.message || 'Failed to validate production task content item');
    }
    if (!data) {
      throw new AgencyProductionTaskValidationError('contentItemId must reference a content item in this agency organization');
    }
    if (options.clientId && data.client_id && data.client_id !== options.clientId) {
      throw new AgencyProductionTaskValidationError('contentItemId must belong to the selected agency client');
    }
  }
}

export async function listAgencyProductionTasks(
  supabase: SupabaseClient<any>,
  organizationId: string,
  filters: {
    clientId?: string | null;
    status?: string | null;
    priority?: string | null;
    limit?: number;
  } = {}
): Promise<AgencyProductionTask[]> {
  const limit = Math.min(Math.max(filters.limit || 100, 1), 250);
  if (filters.status && !AGENCY_PRODUCTION_TASK_STATUSES.includes(filters.status as AgencyProductionTaskStatus)) {
    throw new AgencyProductionTaskValidationError(`status must be one of: ${AGENCY_PRODUCTION_TASK_STATUSES.join(', ')}`);
  }
  if (filters.priority && !AGENCY_PRODUCTION_TASK_PRIORITIES.includes(filters.priority as AgencyProductionTaskPriority)) {
    throw new AgencyProductionTaskValidationError(`priority must be one of: ${AGENCY_PRODUCTION_TASK_PRIORITIES.join(', ')}`);
  }

  let query = supabase
    .from('production_tasks')
    .select('*')
    .eq('organization_id', organizationId) as any;

  if (filters.clientId) {
    query = query.eq('client_id', filters.clientId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }

  const { data, error } = await query
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(limit) as {
      data: AgencyProductionTaskRow[] | null;
      error: any;
    };

  if (error) {
    throw new Error(error.message || 'Failed to load production tasks');
  }

  return (data || []).map(mapAgencyProductionTaskRow);
}

export async function getAgencyProductionTask(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string
): Promise<AgencyProductionTask | null> {
  const { data, error } = await supabase
    .from('production_tasks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle() as { data: AgencyProductionTaskRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load production task');
  }

  return data ? mapAgencyProductionTaskRow(data) : null;
}

export async function createAgencyProductionTask(
  supabase: SupabaseClient<any>,
  organizationId: string,
  createdBy: string,
  input: AgencyProductionTaskInput
): Promise<AgencyProductionTask> {
  const payload = {
    ...normalizeAgencyProductionTaskInput(input),
    organization_id: organizationId,
    created_by: createdBy,
  };

  const { data, error } = await supabase
    .from('production_tasks')
    .insert(payload as any)
    .select('*')
    .single() as { data: AgencyProductionTaskRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create production task');
  }

  return mapAgencyProductionTaskRow(data);
}

export async function updateAgencyProductionTask(
  supabase: SupabaseClient<any>,
  organizationId: string,
  id: string,
  input: AgencyProductionTaskInput
): Promise<AgencyProductionTask | null> {
  const payload = normalizeAgencyProductionTaskInput(input, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new AgencyProductionTaskValidationError('No production task fields provided');
  }

  const { data, error } = await supabase
    .from('production_tasks')
    .update(payload as any)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('*')
    .maybeSingle() as { data: AgencyProductionTaskRow | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update production task');
  }

  return data ? mapAgencyProductionTaskRow(data) : null;
}
