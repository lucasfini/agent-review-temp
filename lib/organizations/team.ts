import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isValidEmail } from '@/lib/auth/validation';
import { can } from '@/lib/authz/permissions';
import {
  type OrganizationType,
  normalizeOrganizationMemberRole,
  type WorkspaceAssignableRole,
  type WorkspaceRole,
  type OrganizationRecord,
} from '@/lib/authz/types';
import { getAppBaseUrl } from '@/lib/app-url';
import {
  getOrganizationSubscription,
  getSubscriptionSeatLimit,
  isSubscriptionUsable,
} from '@/lib/billing/subscriptions';

export type WorkspaceMemberRole = WorkspaceRole;
export type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'canceled' | 'expired';

export interface WorkspaceMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: WorkspaceMemberRole;
  status: 'active' | 'removed' | 'invited';
  joinedAt: string | null;
  createdAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: WorkspaceAssignableRole;
  status: WorkspaceInvitationStatus;
  invitedBy: string | null;
  acceptedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSeatSummary {
  active: number;
  pending: number;
  limit: number;
  available: number;
  isFull: boolean;
}

export interface WorkspaceTeamSnapshot {
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  seats: WorkspaceSeatSummary;
}

export type InvitationOrganizationContext = {
  organization: OrganizationRecord;
  isNewTeam: boolean;
};

type TeamWorkspaceByIdRow = {
  id: string;
  name: string;
  slug: string | null;
  type: OrganizationType;
  owner_user_id: string | null;
  onboarding_completed_at: string | null;
  onboarding_skipped_at: string | null;
  onboarding_metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function deriveTeamWorkspaceName(baseName: string): string {
  const trimmed = baseName.trim();
  const name = trimmed || 'Team';
  return name.endsWith(' Team') ? name : `${name} Team`;
}

function workspaceSlugForOwner(ownerUserId: string): string {
  return `team-${ownerUserId}`;
}

async function getExistingTeamWorkspaceForOwner(
  supabase: SupabaseClient<any>,
  ownerUserId: string
): Promise<OrganizationRecord | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id,name,slug,type,owner_user_id,created_at,updated_at,onboarding_completed_at,onboarding_skipped_at,onboarding_metadata_json')
    .eq('owner_user_id', ownerUserId)
    .eq('type', 'saas_customer')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: TeamWorkspaceByIdRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load existing team workspace');
  }

  return data
    ? {
      id: data.id,
      name: data.name,
      slug: data.slug,
      type: data.type,
      owner_user_id: data.owner_user_id,
      onboarding_completed_at: data.onboarding_completed_at ?? null,
      onboarding_skipped_at: data.onboarding_skipped_at ?? null,
      onboarding_metadata_json: data.onboarding_metadata_json ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
    : null;
}

export async function resolveInviteOrganization(
  params: {
    supabase: SupabaseClient<any>;
    ownerUserId: string;
    fallbackWorkspaceName: string;
  }
): Promise<InvitationOrganizationContext> {
  const ownerTeamOrganizationIds = await getActiveTeamOrganizationIdsForUser(
    params.supabase,
    params.ownerUserId
  );

  const existing = await getExistingTeamWorkspaceForOwner(
    params.supabase,
    params.ownerUserId
  );

  if (existing) {
    if (ownerTeamOrganizationIds.size === 0) {
      ownerTeamOrganizationIds.add(existing.id);
    }

    return {
      organization: existing,
      isNewTeam: false,
    };
  }

  if (ownerTeamOrganizationIds.size > 0) {
    throw new WorkspaceTeamError(409, 'You are already a member of a team workspace');
  }

  const now = new Date().toISOString();
  const slug = workspaceSlugForOwner(params.ownerUserId);
  const { data, error } = await params.supabase
    .from('organizations')
    .insert({
      name: deriveTeamWorkspaceName(params.fallbackWorkspaceName),
      slug,
      type: 'saas_customer',
      owner_user_id: params.ownerUserId,
    } as any)
    .select('*')
    .single() as { data: TeamWorkspaceByIdRow | null; error: any };

  if (error || !data) {
    if (error?.code === '23505' && (/organization.*slug/i.test(error.message || '') || error.message?.includes('organizations_slug_unique'))) {
      const recovered = await getExistingTeamWorkspaceForOwner(
        params.supabase,
        params.ownerUserId
      );
      if (!recovered) {
        throw new WorkspaceTeamError(500, error.message || 'Failed to create team workspace');
      }
      return { organization: recovered, isNewTeam: false };
    }

    throw new WorkspaceTeamError(500, error?.message || 'Failed to create team workspace');
  }

  const organization: OrganizationRecord = {
    id: data.id,
    name: data.name,
    slug: data.slug,
    type: data.type,
    owner_user_id: data.owner_user_id,
    onboarding_completed_at: data.onboarding_completed_at ?? null,
    onboarding_skipped_at: data.onboarding_skipped_at ?? null,
    onboarding_metadata_json: data.onboarding_metadata_json ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  const membershipPayload = {
    organization_id: data.id,
    user_id: params.ownerUserId,
    role: 'owner',
    status: 'active',
    invited_by: params.ownerUserId,
    joined_at: now,
  };

  const { error: membershipError } = await params.supabase
    .from('organization_members')
    .upsert(membershipPayload as any, { onConflict: 'organization_id,user_id' });

  if (membershipError) {
    throw new WorkspaceTeamError(500, membershipError.message || 'Failed to create team workspace membership');
  }

  return {
    organization,
    isNewTeam: true,
  };
}

type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: 'active' | 'removed' | 'invited';
  invited_by: string | null;
  created_at: string;
  joined_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  username?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  token_hash: string;
  status: WorkspaceInvitationStatus;
  invited_by: string | null;
  accepted_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export class WorkspaceTeamError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'WorkspaceTeamError';
  }
}

const INVITATION_TOKEN_BYTES = 32;
const INVITATION_EXPIRES_DAYS = 14;

export function canManageWorkspaceTeam(role?: string | null): boolean {
  const normalized = normalizeOrganizationMemberRole(role);
  return normalized === 'owner' || normalized === 'admin';
}

export function normalizeInvitationEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new WorkspaceTeamError(400, 'Invite email is required');
  }

  const email = value.trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new WorkspaceTeamError(400, 'Enter a valid invite email address');
  }

  return email;
}

export function normalizeAssignableWorkspaceRole(value: unknown): WorkspaceAssignableRole {
  if (value === 'member') {
    return 'editor';
  }

  if (value === 'admin' || value === 'editor' || value === 'reader') {
    return value;
  }

  throw new WorkspaceTeamError(400, 'Role must be admin, editor, or reader');
}

function normalizeWorkspaceMemberRole(
  value: unknown,
  allowOwner: boolean
): WorkspaceMemberRole {
  if (value === 'owner') {
    if (!allowOwner) {
      throw new WorkspaceTeamError(403, 'Only workspace owner can assign another owner');
    }
    return value;
  }

  return normalizeAssignableWorkspaceRole(value);
}

function roleToStorageValue(role: WorkspaceMemberRole): string {
  return role;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
}

export function buildWorkspaceInvitationAcceptUrl(token: string): string {
  const url = new URL('/invite', getAppBaseUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

function serializeInvitation(row: InvitationRow, now = new Date()): WorkspaceInvitation {
  const status = row.status === 'pending' && isExpired(row.expires_at, now)
    ? 'expired'
    : row.status;

  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: normalizeAssignableWorkspaceRole(row.role),
    status,
    invitedBy: row.invited_by,
    acceptedBy: row.accepted_by,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

  const username = profile.username?.trim();
  return username || null;
}

function serializeMember(row: OrganizationMemberRow, profile?: ProfileRow | null): WorkspaceMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    email: profile?.email || null,
    name: profileName(profile),
    role: normalizeOrganizationMemberRole(row.role) as WorkspaceMemberRole,
    status: row.status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
  };
}

async function expireStaleInvitations(
  supabase: SupabaseClient<any>,
  organizationId?: string | null,
  now = new Date()
) {
  let query = supabase
    .from('organization_invitations')
    .update({ status: 'expired' } as any)
    .eq('status', 'pending')
    .lte('expires_at', now.toISOString());

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { error } = await query as { error: any };
  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to expire workspace invitations');
  }
}

async function getSeatLimit(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<number> {
  const subscription = await getOrganizationSubscription(supabase, organizationId);
  const seatLimit = subscription && isSubscriptionUsable(subscription.status)
    ? getSubscriptionSeatLimit(subscription)
    : null;

  return typeof seatLimit === 'number' && seatLimit > 0 ? seatLimit : 1;
}

async function countActiveMembers(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'active') as { data: Array<{ id: string }> | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to count active workspace members');
  }

  return data?.length || 0;
}

async function countPendingInvitations(
  supabase: SupabaseClient<any>,
  organizationId: string,
  options: { excludeInvitationId?: string | null; now?: Date } = {}
): Promise<number> {
  const now = options.now || new Date();
  let query = supabase
    .from('organization_invitations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString());

  if (options.excludeInvitationId) {
    query = query.neq('id', options.excludeInvitationId);
  }

  const { data, error } = await query as { data: Array<{ id: string }> | null; error: any };
  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to count pending workspace invitations');
  }

  return data?.length || 0;
}

async function getOrganizationType(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<OrganizationType | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('type')
    .eq('id', organizationId)
    .maybeSingle() as { data: { type: OrganizationType } | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to resolve organization type');
  }

  return data?.type || null;
}

async function getActiveTeamOrganizationIdsForUser(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<Set<string>> {
  const { data: activeMemberships, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active') as { data: Array<{ organization_id: string }> | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load workspace memberships');
  }

  const organizationIds = Array.from(new Set((activeMemberships || []).map((membership) => membership.organization_id)));
  if (organizationIds.length === 0) return new Set();

  const { data: teamOrganizations, error: teamOrganizationsError } = await supabase
    .from('organizations')
    .select('id')
    .in('id', organizationIds)
    .eq('type', 'saas_customer') as { data: Array<{ id: string }> | null; error: any };

  if (teamOrganizationsError) {
    throw new WorkspaceTeamError(500, teamOrganizationsError.message || 'Failed to load team workspace memberships');
  }

  return new Set((teamOrganizations || []).map((teamOrganization) => teamOrganization.id));
}

export async function getWorkspaceSeatSummary(
  supabase: SupabaseClient<any>,
  organizationId: string,
  options: { excludeInvitationId?: string | null; now?: Date } = {}
): Promise<WorkspaceSeatSummary> {
  const [active, pending, limit] = await Promise.all([
    countActiveMembers(supabase, organizationId),
    countPendingInvitations(supabase, organizationId, options),
    getSeatLimit(supabase, organizationId),
  ]);
  const occupied = active + pending;

  return {
    active,
    pending,
    limit,
    available: Math.max(0, limit - occupied),
    isFull: occupied >= limit,
  };
}

async function loadProfiles(
  supabase: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, ProfileRow>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,username,full_name,first_name,last_name')
    .in('id', userIds) as { data: ProfileRow[] | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load workspace member profiles');
  }

  return new Map((data || []).map((profile) => [profile.id, profile]));
}

export async function getWorkspaceTeamSnapshot(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<WorkspaceTeamSnapshot> {
  await expireStaleInvitations(supabase, organizationId);

  const [membersResult, invitationsResult, seats] = await Promise.all([
    supabase
      .from('organization_members')
      .select('id,organization_id,user_id,role,status,invited_by,created_at,joined_at')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true }),
    supabase
      .from('organization_invitations')
      .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    getWorkspaceSeatSummary(supabase, organizationId),
  ]) as [
    { data: OrganizationMemberRow[] | null; error: any },
    { data: InvitationRow[] | null; error: any },
    WorkspaceSeatSummary,
  ];

  if (membersResult.error) {
    throw new WorkspaceTeamError(500, membersResult.error.message || 'Failed to load workspace members');
  }

  if (invitationsResult.error) {
    throw new WorkspaceTeamError(500, invitationsResult.error.message || 'Failed to load workspace invitations');
  }

  const profiles = await loadProfiles(
    supabase,
    (membersResult.data || []).map((member) => member.user_id)
  );

  return {
    members: (membersResult.data || []).map((member) => serializeMember(member, profiles.get(member.user_id))),
    invitations: (invitationsResult.data || []).map((invitation) => serializeInvitation(invitation)),
    seats,
  };
}

async function findProfileByEmail(
  supabase: SupabaseClient<any>,
  email: string
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,username,full_name,first_name,last_name')
    .eq('email', email)
    .maybeSingle() as { data: ProfileRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to check invitee profile');
  }

  return data;
}

async function ensureEmailIsNotActiveMember(
  supabase: SupabaseClient<any>,
  organizationId: string,
  email: string
) {
  const profile = await findProfileByEmail(supabase, email);
  if (!profile?.id) return;

  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .maybeSingle() as { data: { id: string } | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to check existing workspace member');
  }

  if (data?.id) {
    throw new WorkspaceTeamError(409, 'That email is already an active workspace member');
  }
}

async function findPendingInvitationByEmail(
  supabase: SupabaseClient<any>,
  organizationId: string,
  email: string
): Promise<InvitationRow | null> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle() as { data: InvitationRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to check existing invitation');
  }

  return data;
}

async function enforceSeatAvailability(
  supabase: SupabaseClient<any>,
  organizationId: string,
  options: { excludeInvitationId?: string | null } = {}
) {
  const seats = await getWorkspaceSeatSummary(supabase, organizationId, options);
  if (seats.isFull) {
    throw new WorkspaceTeamError(409, 'Workspace seat limit reached');
  }
  return seats;
}

export async function createWorkspaceInvitation(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  email: unknown;
  role: unknown;
  invitedBy: string;
  now?: Date;
}): Promise<{ invitation: WorkspaceInvitation; token: string; acceptUrl: string; seats: WorkspaceSeatSummary }> {
  const now = params.now || new Date();
  const email = normalizeInvitationEmail(params.email);
  const role = normalizeAssignableWorkspaceRole(params.role ?? 'editor');

  await expireStaleInvitations(params.supabase, params.organizationId, now);
  await ensureEmailIsNotActiveMember(params.supabase, params.organizationId, email);

  const existing = await findPendingInvitationByEmail(params.supabase, params.organizationId, email);
  if (existing && !isExpired(existing.expires_at, now)) {
    throw new WorkspaceTeamError(409, 'A pending invite already exists for that email');
  }

  const seats = await enforceSeatAvailability(params.supabase, params.organizationId, {
    excludeInvitationId: existing?.id || null,
  });
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = addDays(now, INVITATION_EXPIRES_DAYS).toISOString();

  const payload = {
    organization_id: params.organizationId,
    email,
    role,
    token_hash: tokenHash,
    status: 'pending',
    invited_by: params.invitedBy,
    accepted_by: null,
    accepted_at: null,
    expires_at: expiresAt,
  };

  const query = existing
    ? params.supabase
      .from('organization_invitations')
      .update(payload as any)
      .eq('id', existing.id)
    : params.supabase
      .from('organization_invitations')
      .insert(payload as any);

  const { data, error } = await query
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .single() as { data: InvitationRow | null; error: any };

  if (error || !data) {
    const message = typeof error?.message === 'string' && error.message.toLowerCase().includes('duplicate')
      ? 'A pending invite already exists for that email'
      : error?.message || 'Failed to create workspace invitation';
    throw new WorkspaceTeamError(error?.code === '23505' ? 409 : 500, message);
  }

  return {
    invitation: serializeInvitation(data, now),
    token,
    acceptUrl: buildWorkspaceInvitationAcceptUrl(token),
    seats,
  };
}

async function loadInvitationForManagement(
  supabase: SupabaseClient<any>,
  organizationId: string,
  invitationId: string
): Promise<InvitationRow> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .eq('id', invitationId)
    .eq('organization_id', organizationId)
    .maybeSingle() as { data: InvitationRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load workspace invitation');
  }

  if (!data) {
    throw new WorkspaceTeamError(404, 'Workspace invitation not found');
  }

  return data;
}

async function getActiveOwnerForOrganization(
  supabase: SupabaseClient<any>,
  organizationId: string
): Promise<OrganizationMemberRow | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id,organization_id,user_id,role,status,invited_by,created_at,joined_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('role', 'owner')
    .maybeSingle() as { data: OrganizationMemberRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load workspace owner');
  }

  return data || null;
}

export async function resendWorkspaceInvitation(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  invitationId: string;
  now?: Date;
}): Promise<{ invitation: WorkspaceInvitation; token: string; acceptUrl: string; seats: WorkspaceSeatSummary }> {
  const now = params.now || new Date();
  await expireStaleInvitations(params.supabase, params.organizationId, now);

  const existing = await loadInvitationForManagement(
    params.supabase,
    params.organizationId,
    params.invitationId
  );
  if (existing.status !== 'pending' && existing.status !== 'expired') {
    throw new WorkspaceTeamError(409, 'Only pending invitations can be resent');
  }

  const seats = await enforceSeatAvailability(params.supabase, params.organizationId, {
    excludeInvitationId: existing.id,
  });
  const token = generateInvitationToken();
  const expiresAt = addDays(now, INVITATION_EXPIRES_DAYS).toISOString();

  const { data, error } = await params.supabase
    .from('organization_invitations')
    .update({
      status: 'pending',
      token_hash: hashInvitationToken(token),
      expires_at: expiresAt,
      accepted_by: null,
      accepted_at: null,
    } as any)
    .eq('id', existing.id)
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .single() as { data: InvitationRow | null; error: any };

  if (error || !data) {
    throw new WorkspaceTeamError(500, error?.message || 'Failed to resend workspace invitation');
  }

  return {
    invitation: serializeInvitation(data, now),
    token,
    acceptUrl: buildWorkspaceInvitationAcceptUrl(token),
    seats,
  };
}

export async function cancelWorkspaceInvitation(
  supabase: SupabaseClient<any>,
  organizationId: string,
  invitationId: string
): Promise<WorkspaceInvitation> {
  const existing = await loadInvitationForManagement(supabase, organizationId, invitationId);
  if (existing.status !== 'pending') {
    throw new WorkspaceTeamError(409, 'Only pending invitations can be canceled');
  }

  const { data, error } = await supabase
    .from('organization_invitations')
    .update({ status: 'canceled' } as any)
    .eq('id', existing.id)
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .single() as { data: InvitationRow | null; error: any };

  if (error || !data) {
    throw new WorkspaceTeamError(500, error?.message || 'Failed to cancel workspace invitation');
  }

  return serializeInvitation(data);
}

export async function acceptWorkspaceInvitation(params: {
  supabase: SupabaseClient<any>;
  token: unknown;
  userId: string;
  userEmail?: string | null;
  now?: Date;
}): Promise<{ invitation: WorkspaceInvitation; membership: OrganizationMemberRow }> {
  if (typeof params.token !== 'string' || !params.token.trim()) {
    throw new WorkspaceTeamError(400, 'Invite token is required');
  }

  const now = params.now || new Date();
  await expireStaleInvitations(params.supabase, null, now);

  const tokenHash = hashInvitationToken(params.token.trim());
  const { data: invitation, error } = await params.supabase
    .from('organization_invitations')
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .eq('token_hash', tokenHash)
    .maybeSingle() as { data: InvitationRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load workspace invitation');
  }

  if (!invitation || invitation.status !== 'pending') {
    throw new WorkspaceTeamError(404, 'Workspace invitation is invalid or expired');
  }

  if (isExpired(invitation.expires_at, now)) {
    await params.supabase
      .from('organization_invitations')
      .update({ status: 'expired' } as any)
      .eq('id', invitation.id);
    throw new WorkspaceTeamError(410, 'Workspace invitation has expired');
  }

  const signedInEmail = params.userEmail?.trim().toLowerCase();
  if (!signedInEmail || signedInEmail !== invitation.email) {
    throw new WorkspaceTeamError(403, 'Sign in with the invited email address to accept this workspace invite');
  }

  const activeMembers = await countActiveMembers(params.supabase, invitation.organization_id);
  const seatLimit = await getSeatLimit(params.supabase, invitation.organization_id);

  const invitationOrganizationType = await getOrganizationType(params.supabase, invitation.organization_id);
  if (!invitationOrganizationType) {
    throw new WorkspaceTeamError(404, 'Workspace invitation is invalid or expired');
  }

  if (invitationOrganizationType === 'saas_customer') {
    const teamOrganizationIds = await getActiveTeamOrganizationIdsForUser(params.supabase, params.userId);
    const hasOtherTeamMembership = Array.from(teamOrganizationIds).some(
      (teamOrganizationId) => teamOrganizationId !== invitation.organization_id
    );

    if (hasOtherTeamMembership) {
      throw new WorkspaceTeamError(
        409,
        'You can only be a member of one team workspace at a time'
      );
    }
  }

  if (activeMembers >= seatLimit) {
    throw new WorkspaceTeamError(409, 'Workspace seat limit reached');
  }

  const membershipPayload = {
    organization_id: invitation.organization_id,
    user_id: params.userId,
    role: normalizeAssignableWorkspaceRole(invitation.role),
    status: 'active',
    invited_by: invitation.invited_by,
    joined_at: now.toISOString(),
  };

  const { data: membership, error: membershipError } = await params.supabase
    .from('organization_members')
    .upsert(membershipPayload as any, { onConflict: 'organization_id,user_id' })
    .select('id,organization_id,user_id,role,status,invited_by,created_at,joined_at')
    .single() as { data: OrganizationMemberRow | null; error: any };

  if (membershipError || !membership) {
    throw new WorkspaceTeamError(500, membershipError?.message || 'Failed to activate workspace membership');
  }

  const { data: acceptedInvitation, error: inviteError } = await params.supabase
    .from('organization_invitations')
    .update({
      status: 'accepted',
      accepted_by: params.userId,
      accepted_at: now.toISOString(),
    } as any)
    .eq('id', invitation.id)
    .select('id,organization_id,email,role,token_hash,status,invited_by,accepted_by,expires_at,accepted_at,created_at,updated_at')
    .single() as { data: InvitationRow | null; error: any };

  if (inviteError || !acceptedInvitation) {
    throw new WorkspaceTeamError(500, inviteError?.message || 'Failed to mark workspace invitation accepted');
  }

  return {
    invitation: serializeInvitation(acceptedInvitation, now),
    membership,
  };
}

async function loadMemberForManagement(
  supabase: SupabaseClient<any>,
  organizationId: string,
  memberId: string
): Promise<OrganizationMemberRow> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id,organization_id,user_id,role,status,invited_by,created_at,joined_at')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .maybeSingle() as { data: OrganizationMemberRow | null; error: any };

  if (error) {
    throw new WorkspaceTeamError(500, error.message || 'Failed to load workspace member');
  }

  if (!data) {
    throw new WorkspaceTeamError(404, 'Workspace member not found');
  }

  return data;
}

async function reassignWorkspaceOwnedResources(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  previousOwnerUserId: string;
  nextOwnerUserId: string;
}) {
  const { supabase, organizationId, previousOwnerUserId, nextOwnerUserId } = params;
  if (!previousOwnerUserId || previousOwnerUserId === nextOwnerUserId) {
    return;
  }

  const sharedResourceTables = [
    'creator_profiles',
    'brand_voices',
    'campaigns',
    'content_libraries',
    'content_library_items',
  ];

  for (const table of sharedResourceTables) {
    const { error } = await supabase
      .from(table)
      .update({ owner_user_id: nextOwnerUserId } as any)
      .eq('organization_id', organizationId)
      .eq('owner_user_id', previousOwnerUserId)
      .is('client_id', null);

    if (error) {
      throw new WorkspaceTeamError(500, error.message || `Failed to transfer ${table} ownership`);
    }
  }
}

export async function getWorkspaceMember(
  supabase: SupabaseClient<any>,
  organizationId: string,
  memberId: string
): Promise<WorkspaceMember | null> {
  const member = await loadMemberForManagement(supabase, organizationId, memberId).catch((error) => {
    if (error instanceof WorkspaceTeamError && error.status === 404) {
      return null;
    }
    throw error;
  });

  if (!member) return null;

  const profiles = await loadProfiles(supabase, [member.user_id]);
  return serializeMember(member, profiles.get(member.user_id));
}

export async function updateWorkspaceMember(params: {
  supabase: SupabaseClient<any>;
  organizationId: string;
  memberId: string;
  actorUserId: string;
  actorRole?: string | null;
  role?: unknown;
  remove?: boolean;
}): Promise<WorkspaceMember> {
  const target = await loadMemberForManagement(params.supabase, params.organizationId, params.memberId);
  const actorRole = normalizeOrganizationMemberRole(params.actorRole);
  const targetRole = normalizeOrganizationMemberRole(target.role) as WorkspaceRole;
  const actorIsOwner = actorRole === 'owner';
  const requestedRole = params.role === undefined ? undefined : normalizeWorkspaceMemberRole(params.role, actorIsOwner);

  if (targetRole === 'owner') {
    throw new WorkspaceTeamError(403, 'Workspace owners cannot be removed or demoted from settings');
  }

  if (target.user_id === params.actorUserId && params.remove) {
    throw new WorkspaceTeamError(403, 'You cannot remove your own workspace membership');
  }

  if (params.remove && !can(
    {
      userId: params.actorUserId,
      organizationId: params.organizationId,
      role: actorRole,
    },
    'members.remove',
    {
      organizationId: params.organizationId,
      targetCurrentRole: targetRole,
      targetUserId: target.user_id,
    }
  )) {
    throw new WorkspaceTeamError(403, 'You do not have permission to remove this teammate');
  }

  const payload: Record<string, unknown> = {};
  if (params.remove) {
    payload.status = 'removed';
  }

  if (requestedRole !== undefined) {
    if (!can(
      {
        userId: params.actorUserId,
        organizationId: params.organizationId,
        role: actorRole,
      },
      requestedRole === 'owner' ? 'workspace.transfer_owner' : 'members.update_role',
      {
        organizationId: params.organizationId,
        targetCurrentRole: targetRole,
        targetRole: requestedRole,
        targetUserId: target.user_id,
      }
    )) {
      throw new WorkspaceTeamError(
        403,
        requestedRole === 'owner'
          ? 'Only the workspace owner can transfer ownership'
          : 'You do not have permission to change this teammate role'
      );
    }

    if (requestedRole === 'owner') {
      const existingOwner = await getActiveOwnerForOrganization(
        params.supabase,
        params.organizationId
      );
      if (!existingOwner) {
        throw new WorkspaceTeamError(500, 'Workspace has no active owner');
      }

      if (existingOwner.id !== target.id) {
        const { error: demoteError } = await params.supabase
          .from('organization_members')
          .update({ role: 'admin' } as any)
          .eq('id', existingOwner.id) as { error: any };

        if (demoteError) {
          throw new WorkspaceTeamError(500, demoteError.message || 'Failed to transfer workspace ownership');
        }
      }
    }

    payload.role = roleToStorageValue(requestedRole);
  }

  if (params.remove) {
    const owner = await getActiveOwnerForOrganization(params.supabase, params.organizationId);
    if (!owner) {
      throw new WorkspaceTeamError(500, 'Workspace has no active owner');
    }

    await reassignWorkspaceOwnedResources({
      supabase: params.supabase,
      organizationId: params.organizationId,
      previousOwnerUserId: target.user_id,
      nextOwnerUserId: owner.user_id,
    });
  }

  if (Object.keys(payload).length === 0) {
    const profiles = await loadProfiles(params.supabase, [target.user_id]);
    return serializeMember(target, profiles.get(target.user_id));
  }

  const { data, error } = await params.supabase
    .from('organization_members')
    .update(payload as any)
    .eq('id', target.id)
    .select('id,organization_id,user_id,role,status,invited_by,created_at,joined_at')
    .single() as { data: OrganizationMemberRow | null; error: any };

  if (error || !data) {
    throw new WorkspaceTeamError(500, error?.message || 'Failed to update workspace member');
  }

  const profiles = await loadProfiles(params.supabase, [data.user_id]);
  return serializeMember(data, profiles.get(data.user_id));
}
