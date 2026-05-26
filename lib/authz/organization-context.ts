import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase/server';
import type {
  ActiveOrganizationContext,
  OrganizationMemberRecord,
  OrganizationRecord,
} from '@/lib/authz/types';
import { OrganizationAccessError } from '@/lib/authz/types';

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

  return data;
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
    const membership = await getActiveMembership(supabase, userId, requestedOrganizationId);
    if (!membership) {
      throw new OrganizationAccessError(403, 'Forbidden');
    }

    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', requestedOrganizationId)
      .maybeSingle() as { data: OrganizationRecord | null; error: any };

    if (error) {
      throw new OrganizationAccessError(500, error.message || 'Failed to resolve organization');
    }

    if (!organization) {
      throw new OrganizationAccessError(404, 'Organization not found');
    }

    return { organization, membership };
  }

  const organization = await ensureDefaultOrganizationForUser(supabase, userId);
  const membership = await getActiveMembership(supabase, userId, organization.id);

  if (!membership) {
    throw new OrganizationAccessError(500, 'Default organization membership is missing or inactive');
  }

  return { organization, membership };
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
