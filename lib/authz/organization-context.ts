import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase/server';
import type {
  ActiveOrganizationContext,
  OrganizationMemberRecord,
  OrganizationRecord,
  OrganizationType,
} from '@/lib/authz/types';
import { OrganizationAccessError } from '@/lib/authz/types';
import { normalizeOrganizationMemberRole } from '@/lib/authz/types';

function deterministicPersonalSlug(userId: string): string {
  return `personal-${createHash('md5').update(userId).digest('hex').slice(0, 20)}`;
}

function defaultOrganizationName(userId: string): string {
  return `User ${userId.slice(0, 8)} Workspace`;
}

async function getActiveMembership(
  supabase: SupabaseClient<any>,
  userId: string,
  organizationId: string
): Promise<OrganizationMemberRecord | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .maybeSingle() as { data: OrganizationMemberRecord | null; error: any };

  if (error) {
    throw new OrganizationAccessError(500, error.message || 'Failed to resolve organization membership');
  }

  return data ? { ...data, role: normalizeOrganizationMemberRole(data.role) } : null;
}

async function getOrganizationById(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<OrganizationRecord | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle() as { data: OrganizationRecord | null; error: any };

  if (error) {
    throw new OrganizationAccessError(500, error.message || 'Failed to resolve organization');
  }

  return data;
}

async function getActiveOrganizationContextById(
  supabase: SupabaseClient<any>,
  userId: string,
  organizationId: string
): Promise<ActiveOrganizationContext | null> {
  const membership = await getActiveMembership(supabase, userId, organizationId);
  if (!membership) return null;

  const organization = await getOrganizationById(supabase, organizationId);
  if (!organization) {
    throw new OrganizationAccessError(404, 'Organization not found');
  }

  return { organization, membership };
}

async function getPreferredActiveOrganizationId(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_workspace_preferences')
    .select('active_organization_id')
    .eq('user_id', userId)
    .maybeSingle() as {
      data: { active_organization_id: string | null } | null;
      error: any;
    };

  if (error) {
    throw new OrganizationAccessError(500, error.message || 'Failed to resolve active workspace preference');
  }

  return data?.active_organization_id || null;
}

async function getFirstActiveOrganizationContextByTypeOrNull(
  supabase: SupabaseClient<any>,
  userId: string,
  organizationType: OrganizationType
): Promise<ActiveOrganizationContext | null> {
  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_members')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true }) as {
      data: OrganizationMemberRecord[] | null;
      error: any;
    };

  if (membershipsError) {
    throw new OrganizationAccessError(500, membershipsError.message || 'Failed to resolve organization memberships');
  }

  const organizationIds = (memberships || [])
    .map((membership) => membership.organization_id)
    .filter(Boolean);

  if (organizationIds.length === 0) return null;

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('*')
    .in('id', organizationIds)
    .eq('type', organizationType)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: OrganizationRecord | null; error: any };

  if (organizationError) {
    throw new OrganizationAccessError(500, organizationError.message || 'Failed to resolve organization');
  }

  if (!organization) return null;

  const membership = (memberships || []).find((record) => record.organization_id === organization.id);
  if (!membership) {
    throw new OrganizationAccessError(500, 'Organization membership is missing or inactive');
  }

  return {
    organization,
    membership: {
      ...membership,
      role: normalizeOrganizationMemberRole(membership.role),
    },
  };
}

export async function getDefaultOrganizationForUser(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<OrganizationRecord | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('owner_user_id', userId)
    .eq('type', 'personal_legacy')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: OrganizationRecord | null; error: any };

  if (error) {
    throw new OrganizationAccessError(500, error.message || 'Failed to resolve default organization');
  }

  return data;
}

export async function ensureDefaultOrganizationForUser(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<OrganizationRecord> {
  const existing = await getDefaultOrganizationForUser(supabase, userId);
  if (existing) {
    return existing;
  }

  const slug = deterministicPersonalSlug(userId);
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: defaultOrganizationName(userId),
      slug,
      type: 'personal_legacy',
      owner_user_id: userId,
    } as any)
    .select('*')
    .single() as { data: OrganizationRecord | null; error: any };

  let organization = data;

  if (error || !organization) {
    const conflict = error?.code === '23505'
      || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));

    if (!conflict) {
      throw new OrganizationAccessError(500, error?.message || 'Failed to create default organization');
    }

    const retry = await getDefaultOrganizationForUser(supabase, userId);
    if (!retry) {
      throw new OrganizationAccessError(500, 'Default organization creation conflicted but could not be recovered');
    }
    organization = retry;
  }

  const membershipPayload = {
    organization_id: organization.id,
    user_id: userId,
    role: 'owner',
    status: 'active',
    invited_by: userId,
    joined_at: new Date().toISOString(),
  };

  const { error: membershipError } = await supabase
    .from('organization_members')
    .upsert(membershipPayload as any, { onConflict: 'organization_id,user_id' });

  if (membershipError) {
    throw new OrganizationAccessError(500, membershipError.message || 'Failed to ensure default organization membership');
  }

  return organization;
}

export async function getActiveOrganizationForUser(
  supabase: SupabaseClient<any>,
  userId: string,
  requestedOrganizationId?: string | null
): Promise<ActiveOrganizationContext> {
  if (requestedOrganizationId) {
    const context = await getActiveOrganizationContextById(supabase, userId, requestedOrganizationId);
    if (!context) {
      throw new OrganizationAccessError(403, 'Forbidden');
    }

    return context;
  }

  const preferredOrganizationId = await getPreferredActiveOrganizationId(supabase, userId);
  if (preferredOrganizationId) {
    const preferredContext = await getActiveOrganizationContextById(supabase, userId, preferredOrganizationId);
    if (preferredContext) {
      return preferredContext;
    }
  }

  const firstSaasContext = await getFirstActiveOrganizationContextByTypeOrNull(
    supabase,
    userId,
    'saas_customer'
  );
  if (firstSaasContext) {
    return firstSaasContext;
  }

  const organization = await ensureDefaultOrganizationForUser(supabase, userId);
  const membership = await getActiveMembership(supabase, userId, organization.id);

  if (!membership) {
    throw new OrganizationAccessError(500, 'Default organization membership is missing or inactive');
  }

  return { organization, membership };
}

export async function setActiveOrganizationForUser(
  supabase: SupabaseClient<any>,
  userId: string,
  organizationId: string
): Promise<ActiveOrganizationContext> {
  const context = await getActiveOrganizationContextById(supabase, userId, organizationId);
  if (!context) {
    throw new OrganizationAccessError(403, 'Forbidden');
  }

  const { error } = await supabase
    .from('user_workspace_preferences')
    .upsert({
      user_id: userId,
      active_organization_id: organizationId,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'user_id' });

  if (error) {
    throw new OrganizationAccessError(500, error.message || 'Failed to save active workspace preference');
  }

  return context;
}

export async function getFirstActiveOrganizationForUserByType(
  supabase: SupabaseClient<any>,
  userId: string,
  organizationType: OrganizationType
): Promise<ActiveOrganizationContext> {
  const context = await getFirstActiveOrganizationContextByTypeOrNull(supabase, userId, organizationType);
  if (!context) {
    throw new OrganizationAccessError(403, 'Forbidden');
  }
  return context;
}

export async function resolveOrganizationIdForWrite(
  userId: string,
  requestedOrganizationId?: string | null,
  supabase: SupabaseClient<any> = supabaseAdmin
): Promise<string> {
  const { organization } = await getActiveOrganizationForUser(supabase, userId, requestedOrganizationId);
  return organization.id;
}

export async function resolveOrganizationIdFromProjectForWrite(
  supabase: SupabaseClient<any>,
  projectId: string,
  fallbackUserId?: string | null
): Promise<{ organizationId: string | null; userId: string | null }> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('user_id, organization_id')
    .eq('id', projectId)
    .maybeSingle() as {
      data: { user_id: string | null; organization_id: string | null } | null;
      error: any;
    };

  if (error) {
    throw new OrganizationAccessError(500, error.message || 'Failed to resolve project organization');
  }

  const effectiveUserId = project?.user_id || fallbackUserId || null;
  if (project?.organization_id) {
    return { organizationId: project.organization_id, userId: effectiveUserId };
  }

  if (!effectiveUserId) {
    return { organizationId: null, userId: null };
  }

  const organizationId = await resolveOrganizationIdForWrite(effectiveUserId, null, supabase);
  return { organizationId, userId: effectiveUserId };
}
