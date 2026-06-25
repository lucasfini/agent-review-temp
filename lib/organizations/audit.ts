import type { SupabaseClient } from '@supabase/supabase-js';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export interface OrganizationAuditLog {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, JsonValue>;
  createdAt: string;
}

type OrganizationAuditLogRow = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, JsonValue> | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  username?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function truncateString(value: string, maxLength = 500): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function sanitizeMetadataValue(value: unknown, keyHint?: string): JsonValue {
  const normalizedKey = keyHint?.toLowerCase() || '';
  if (
    normalizedKey.includes('token')
    || normalizedKey.includes('secret')
    || normalizedKey.includes('password')
    || normalizedKey.includes('body')
    || normalizedKey.includes('transcript')
  ) {
    return '[redacted]';
  }

  if (
    value === null
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeMetadataValue(entry));
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, JsonValue> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[nestedKey] = sanitizeMetadataValue(nestedValue, nestedKey);
    }
    return sanitized;
  }

  return String(value);
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, JsonValue> {
  if (!metadata) return {};
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    sanitized[key] = sanitizeMetadataValue(value, key);
  }
  return sanitized;
}

function profileName(profile?: ProfileRow | null): string | null {
  if (!profile) return null;
  const fullName = profile.full_name?.trim();
  if (fullName) return fullName;

  const composed = [profile.first_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  if (composed) return composed;

  return profile.username?.trim() || null;
}

async function loadProfiles(
  supabase: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, ProfileRow>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,username,full_name,first_name,last_name')
    .in('id', ids) as { data: ProfileRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load audit log actors');
  }

  return new Map((data || []).map((profile) => [profile.id, profile]));
}

function mapAuditLogRow(row: OrganizationAuditLogRow, actors: Map<string, ProfileRow>): OrganizationAuditLog {
  const actor = row.actor_user_id ? actors.get(row.actor_user_id) : null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    actorEmail: actor?.email || null,
    actorName: profileName(actor),
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: (row.metadata || {}) as Record<string, JsonValue>,
    createdAt: row.created_at,
  };
}

export async function recordOrganizationAuditLog(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    supabase,
    organizationId,
    actorUserId = null,
    action,
    resourceType,
    resourceId = null,
    metadata,
  } = params;

  try {
    const { error } = await supabase
      .from('organization_audit_logs')
      .insert({
        organization_id: organizationId,
        actor_user_id: actorUserId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata: sanitizeMetadata(metadata),
      } as never);

    if (error) {
      console.error('[ORG AUDIT] Failed to write audit event:', error);
    }
  } catch (error) {
    console.error('[ORG AUDIT] Failed to write audit event:', error);
  }
}

export async function listOrganizationAuditLogs(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  limit?: number;
}): Promise<OrganizationAuditLog[]> {
  const limit = Math.max(1, Math.min(100, params.limit || 25));
  const { data, error } = await params.supabase
    .from('organization_audit_logs')
    .select('id,organization_id,actor_user_id,action,resource_type,resource_id,metadata,created_at')
    .eq('organization_id', params.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit) as { data: OrganizationAuditLogRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load organization audit logs');
  }

  const actors = await loadProfiles(
    params.supabase,
    (data || []).map((row) => row.actor_user_id || '').filter(Boolean)
  );

  return (data || []).map((row) => mapAuditLogRow(row, actors));
}
