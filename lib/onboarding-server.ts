import { randomBytes } from 'crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import {
  getOnboardingStepIndex,
  isOnboardingStatus,
  ONBOARDING_TOTAL_STEPS,
  resolveOnboardingStatus,
  type OnboardingStatus,
} from '@/lib/onboarding';
import { listActiveOrganizationsForUser, setActiveOrganizationForUser } from '@/lib/authz/organization-context';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';

export type OnboardingProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  onboarding_status: string | null;
  onboarding_completed_at: string | null;
  onboarding_metadata_json: Record<string, unknown> | null;
};

export type OnboardingWorkspace = {
  id: string;
  name: string;
  type: string;
  role?: string;
  status?: string;
};

export type OnboardingState = {
  status: OnboardingStatus;
  stepIndex: number;
  totalSteps: number;
  profile: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
  };
  workspace: OnboardingWorkspace | null;
};

const MAX_WORKSPACE_SLUG_LENGTH = 80;

export function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isMissingProfileOnboardingColumn(error: any): boolean {
  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' ');

  return error?.code === '42703'
    || error?.code === 'PGRST204'
    || /column\s+["']?onboarding_(status|completed_at|metadata_json)["']?\s+does not exist/i.test(errorText)
    || /could not find the\s+["']?onboarding_(status|completed_at|metadata_json)["']?\s+column/i.test(errorText);
}

export function isStaleOnboardingStatusConstraint(error: any): boolean {
  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' ');

  return error?.code === '23514'
    && /profiles_onboarding_status_check/i.test(errorText);
}

export function resolveStoredOnboardingStatus(
  ...statuses: Array<string | null | undefined>
): OnboardingStatus | null {
  let resolved: OnboardingStatus | null = null;

  for (const status of statuses) {
    if (!isOnboardingStatus(status)) continue;
    if (status === 'complete') return 'complete';
    if (!resolved || getOnboardingStepIndex(status) > getOnboardingStepIndex(resolved)) {
      resolved = status;
    }
  }

  return resolved;
}

export function resolveProfileNames(user: User, profile?: OnboardingProfileRow | null) {
  const meta = parseObject(user.user_metadata);
  const profileFullName = trimString(profile?.full_name);
  const metaFullName = trimString(meta.full_name);
  const fullName = profileFullName || metaFullName;
  const firstName = trimString(profile?.first_name)
    || trimString(meta.first_name)
    || fullName.split(/\s+/)[0]
    || '';
  const lastName = trimString(profile?.last_name)
    || trimString(meta.last_name)
    || fullName.split(/\s+/).slice(1).join(' ')
    || '';
  const resolvedFullName = [firstName, lastName].filter(Boolean).join(' ').trim() || fullName;

  return {
    firstName,
    lastName,
    fullName: resolvedFullName,
    email: user.email || profile?.email || '',
  };
}

export function hasCompleteOnboardingProfile(user: User, profile?: OnboardingProfileRow | null): boolean {
  const names = resolveProfileNames(user, profile);
  return Boolean(names.firstName && names.lastName);
}

export async function loadOnboardingProfile(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<OnboardingProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,first_name,last_name,full_name,onboarding_status,onboarding_completed_at,onboarding_metadata_json')
    .eq('id', userId)
    .maybeSingle() as { data: OnboardingProfileRow | null; error: any };

  if (error) {
    if (!isMissingProfileOnboardingColumn(error)) {
      throw new Error(error.message || 'Failed to load onboarding profile');
    }

    const fallback = await supabase
      .from('profiles')
      .select('id,email,first_name,last_name,full_name')
      .eq('id', userId)
      .maybeSingle() as {
        data: Pick<OnboardingProfileRow, 'id' | 'email' | 'first_name' | 'last_name' | 'full_name'> | null;
        error: any;
      };

    if (fallback.error) {
      throw new Error(fallback.error.message || 'Failed to load onboarding profile');
    }

    return fallback.data
      ? {
        ...fallback.data,
        onboarding_status: null,
        onboarding_completed_at: null,
        onboarding_metadata_json: null,
      }
      : null;
  }

  return data;
}

export async function listSaasWorkspacesForUser(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<OnboardingWorkspace[]> {
  const contexts = await listActiveOrganizationsForUser(supabase, userId);

  return contexts
    .filter((context) => context.organization.type === 'saas_customer')
    .map((context) => ({
      id: context.organization.id,
      name: context.organization.name,
      type: context.organization.type,
      role: context.membership.role,
      status: context.membership.status,
    }));
}

export async function getOnboardingState(
  supabase: SupabaseClient<any>,
  user: User
): Promise<OnboardingState> {
  const [profile, workspaces] = await Promise.all([
    loadOnboardingProfile(supabase, user.id),
    listSaasWorkspacesForUser(supabase, user.id),
  ]);
  const names = resolveProfileNames(user, profile);
  const meta = parseObject(user.user_metadata);
  const profileMetadata = parseObject(profile?.onboarding_metadata_json);
  const storedStatus = resolveStoredOnboardingStatus(
    profile?.onboarding_status,
    typeof profileMetadata.onboardingStatusOverride === 'string' ? profileMetadata.onboardingStatusOverride : null,
    typeof meta.onboarding_status === 'string' ? meta.onboarding_status : null
  );
  const status = resolveOnboardingStatus({
    storedStatus,
    hasProfile: Boolean(names.firstName && names.lastName),
    hasWorkspace: workspaces.length > 0,
  });

  return {
    status,
    stepIndex: getOnboardingStepIndex(status),
    totalSteps: ONBOARDING_TOTAL_STEPS,
    profile: names,
    workspace: workspaces[0] || null,
  };
}

export async function setUserOnboardingStatus(params: {
  supabase: SupabaseClient<any>;
  user: User;
  status: OnboardingStatus;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const profile = await loadOnboardingProfile(params.supabase, params.user.id);
  const existingMetadata = parseObject(profile?.onboarding_metadata_json);
  const nextMetadata = {
    ...existingMetadata,
    ...(params.metadata || {}),
    statusUpdatedAt: now,
  };
  const payload: Record<string, unknown> = {
    id: params.user.id,
    email: params.user.email || profile?.email || '',
    onboarding_status: params.status,
    onboarding_metadata_json: nextMetadata,
    updated_at: now,
  };

  if (params.status === 'complete') {
    payload.onboarding_completed_at = now;
  }

  const { error } = await params.supabase
    .from('profiles')
    .upsert(payload as any, { onConflict: 'id' });

  if (error) {
    if (isStaleOnboardingStatusConstraint(error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.onboarding_status;
      delete fallbackPayload.onboarding_completed_at;
      fallbackPayload.onboarding_metadata_json = {
        ...nextMetadata,
        onboardingStatusOverride: params.status,
      };
      const { error: fallbackError } = await params.supabase
        .from('profiles')
        .upsert(fallbackPayload as any, { onConflict: 'id' });

      if (fallbackError) {
        throw new Error(fallbackError.message || 'Failed to save onboarding metadata');
      }
    } else if (!isMissingProfileOnboardingColumn(error)) {
      throw new Error(error.message || 'Failed to save onboarding status');
    } else {
      const { error: fallbackError } = await params.supabase
        .from('profiles')
        .upsert({
          id: params.user.id,
          email: params.user.email || profile?.email || '',
          updated_at: now,
        } as any, { onConflict: 'id' });

      if (fallbackError) {
        throw new Error(fallbackError.message || 'Failed to save onboarding status');
      }
    }
  }

  const userMetadata = parseObject(params.user.user_metadata);
  const nextUserMetadata: Record<string, unknown> = {
    ...userMetadata,
    onboarding_status: params.status,
  };
  if (params.status === 'complete') {
    nextUserMetadata.onboarding_completed_at = now;
  }

  const { error: authError } = await params.supabase.auth.admin.updateUserById(params.user.id, {
    user_metadata: nextUserMetadata,
  });

  if (authError) {
    throw new Error(authError.message || 'Failed to save onboarding user metadata');
  }
}

export function buildWorkspaceSlug(value: string, userId: string): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '')
    || 'workspace';
  const suffix = userId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || randomBytes(4).toString('hex');
  return `${base}-${suffix}`.slice(0, MAX_WORKSPACE_SLUG_LENGTH);
}

export async function createOwnedSaasWorkspace(params: {
  supabase: SupabaseClient<any>;
  user: User;
  name: string;
  requestedSlug?: string | null;
  roleTitle?: string | null;
  teamSize?: string | null;
}): Promise<OnboardingWorkspace> {
  const now = new Date().toISOString();
  const slugSource = params.requestedSlug || params.name;
  let slug = buildWorkspaceSlug(slugSource, params.user.id);
  let createdOrganization: { id: string; name: string; type: string } | null = null;
  let createError: any = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await params.supabase
      .from('organizations')
      .insert({
        name: params.name,
        slug,
        type: 'saas_customer',
        owner_user_id: params.user.id,
        onboarding_metadata_json: {
          guidedSetup: {
            createdAt: now,
            roleTitle: params.roleTitle || null,
            teamSize: params.teamSize || null,
          },
        },
      } as any)
      .select('id,name,type')
      .single() as { data: { id: string; name: string; type: string } | null; error: any };

    if (data && !error) {
      createdOrganization = data;
      createError = null;
      break;
    }

    createError = error;
    const conflict = error?.code === '23505'
      || (typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate'));
    if (!conflict) break;
    slug = `${buildWorkspaceSlug(slugSource, params.user.id).slice(0, 68)}-${randomBytes(3).toString('hex')}`;
  }

  if (!createdOrganization) {
    throw new Error(createError?.message || 'Failed to create workspace');
  }

  const { error: membershipError } = await params.supabase
    .from('organization_members')
    .upsert({
      organization_id: createdOrganization.id,
      user_id: params.user.id,
      role: 'owner',
      status: 'active',
      invited_by: params.user.id,
      joined_at: now,
    } as any, { onConflict: 'organization_id,user_id' });

  if (membershipError) {
    await params.supabase.from('organizations').delete().eq('id', createdOrganization.id);
    throw new Error(membershipError.message || 'Failed to create workspace membership');
  }

  const context = await setActiveOrganizationForUser(params.supabase, params.user.id, createdOrganization.id);

  try {
    await recordOrganizationAuditLog({
      supabase: params.supabase,
      organizationId: createdOrganization.id,
      actorUserId: params.user.id,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: createdOrganization.id,
      metadata: {
        source: 'guided_onboarding',
      },
    });
  } catch (error) {
    console.warn('[ONBOARDING] Failed to record workspace creation audit log:', error);
  }

  return {
    id: context.organization.id,
    name: context.organization.name,
    type: context.organization.type,
    role: context.membership.role,
    status: context.membership.status,
  };
}

export async function markWorkspaceOnboardingComplete(params: {
  supabase: SupabaseClient<any>;
  workspaceId: string;
  skipped?: boolean;
}) {
  const now = new Date().toISOString();
  const { data: organization } = await params.supabase
    .from('organizations')
    .select('onboarding_metadata_json')
    .eq('id', params.workspaceId)
    .maybeSingle() as { data: { onboarding_metadata_json: Record<string, unknown> | null } | null; error: any };
  const metadata = parseObject(organization?.onboarding_metadata_json);

  await params.supabase
    .from('organizations')
    .update({
      onboarding_completed_at: now,
      onboarding_skipped_at: params.skipped ? now : null,
      onboarding_metadata_json: {
        ...metadata,
        guidedSetup: {
          ...parseObject(metadata.guidedSetup),
          completedAt: now,
          skippedTutorial: Boolean(params.skipped),
        },
      },
    } as any)
    .eq('id', params.workspaceId);
}
