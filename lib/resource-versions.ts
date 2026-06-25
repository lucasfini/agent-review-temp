import type { SupabaseClient } from '@supabase/supabase-js';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

type ProfileRow = {
  id: string;
  email: string | null;
  username?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ResourceVersionRow = {
  id: string;
  organization_id: string;
  resource_type: string;
  resource_id: string;
  version_number: number;
  changed_by_user_id: string | null;
  change_summary: string;
  snapshot: Record<string, JsonValue> | null;
  previous_snapshot: Record<string, JsonValue> | null;
  created_at: string;
};

export interface ResourceVersion {
  id: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  versionNumber: number;
  changedByUserId: string | null;
  changedByEmail: string | null;
  changedByName: string | null;
  changeSummary: string;
  snapshot: Record<string, JsonValue>;
  previousSnapshot: Record<string, JsonValue> | null;
  createdAt: string;
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
    throw new Error(error.message || 'Failed to load resource version actors');
  }

  return new Map((data || []).map((profile) => [profile.id, profile]));
}

function mapResourceVersionRow(row: ResourceVersionRow, actors: Map<string, ProfileRow>): ResourceVersion {
  const actor = row.changed_by_user_id ? actors.get(row.changed_by_user_id) : null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    versionNumber: row.version_number,
    changedByUserId: row.changed_by_user_id,
    changedByEmail: actor?.email || null,
    changedByName: profileName(actor),
    changeSummary: row.change_summary,
    snapshot: (row.snapshot || {}) as Record<string, JsonValue>,
    previousSnapshot: row.previous_snapshot || null,
    createdAt: row.created_at,
  };
}

export async function createResourceVersion(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  changedByUserId?: string | null;
  changeSummary: string;
  snapshot: Record<string, JsonValue>;
  previousSnapshot?: Record<string, JsonValue> | null;
}): Promise<ResourceVersion | null> {
  const {
    supabase,
    organizationId,
    resourceType,
    resourceId,
    changedByUserId = null,
    changeSummary,
    snapshot,
    previousSnapshot = null,
  } = params;

  const { data: latest, error: latestError } = await supabase
    .from('resource_versions')
    .select('version_number')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { version_number: number } | null; error: any };

  if (latestError) {
    throw new Error(latestError.message || 'Failed to calculate next resource version');
  }

  const { data, error } = await supabase
    .from('resource_versions')
    .insert({
      organization_id: organizationId,
      resource_type: resourceType,
      resource_id: resourceId,
      version_number: (latest?.version_number || 0) + 1,
      changed_by_user_id: changedByUserId,
      change_summary: changeSummary,
      snapshot,
      previous_snapshot: previousSnapshot,
    } as never)
    .select('id,organization_id,resource_type,resource_id,version_number,changed_by_user_id,change_summary,snapshot,previous_snapshot,created_at')
    .maybeSingle() as { data: ResourceVersionRow | null; error: any };

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create resource version');
  }

  const actors = await loadProfiles(supabase, data.changed_by_user_id ? [data.changed_by_user_id] : []);
  return mapResourceVersionRow(data, actors);
}

export async function listResourceVersions(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  limit?: number;
}): Promise<ResourceVersion[]> {
  const limit = Math.max(1, Math.min(100, params.limit || 25));
  const { data, error } = await params.supabase
    .from('resource_versions')
    .select('id,organization_id,resource_type,resource_id,version_number,changed_by_user_id,change_summary,snapshot,previous_snapshot,created_at')
    .eq('organization_id', params.organizationId)
    .eq('resource_type', params.resourceType)
    .eq('resource_id', params.resourceId)
    .order('version_number', { ascending: false })
    .limit(limit) as { data: ResourceVersionRow[] | null; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to load resource versions');
  }

  const actors = await loadProfiles(
    params.supabase,
    (data || []).map((row) => row.changed_by_user_id || '').filter(Boolean)
  );

  return (data || []).map((row) => mapResourceVersionRow(row, actors));
}
