import { type User } from '@supabase/supabase-js';

import { failReservation } from '@/lib/billing/credit';
import { supabaseAdmin } from '@/lib/supabase/server';
import { clearUserAvatarFiles, deleteProjectStoragePrefixes } from '@/lib/storage-lifecycle';

export class AccountDeletionError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccountDeletionError';
    this.status = status;
  }
}

type AccountDeletionResult = {
  deletedProjects: number;
  deletedProjectStorageObjects: number;
  deletedAvatarObjects: number;
  failedReservations: number;
  anonymizedUsageEvents: number;
  anonymizedReservations: number;
  anonymizedTransactions: number;
  anonymizedContactRequests: number;
  deletedRows: Record<string, number>;
  warnings: string[];
};

function getActiveMembersByOrganization(
  rows: Array<{ organization_id: string }>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.organization_id] = (map[row.organization_id] || 0) + 1;
  }
  return map;
}

export async function assertOwnerDeletionAllowed(userId: string): Promise<void> {
  const { data: ownedRows, error } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'owner') as { data: Array<{ organization_id: string }> | null; error: any };

  if (error) {
    throw new AccountDeletionError(error.message || 'Failed to verify workspace ownership', 500);
  }

  if (!ownedRows || ownedRows.length === 0) {
    return;
  }

  const organizationIds = Array.from(new Set(ownedRows.map((row) => row.organization_id)));
  const { data: activeMembers, error: membersError } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .in('organization_id', organizationIds)
    .eq('status', 'active') as { data: Array<{ organization_id: string }> | null; error: any };

  if (membersError) {
    throw new AccountDeletionError(membersError.message || 'Failed to verify active workspace members', 500);
  }

  const activeMemberCounts = getActiveMembersByOrganization(activeMembers || []);
  const blockedOrg = organizationIds.find((organizationId) => (activeMemberCounts[organizationId] || 0) > 1);
  if (blockedOrg) {
    throw new AccountDeletionError(
      'Transfer workspace ownership before deleting this account',
      409
    );
  }
}

async function deleteRows(
  table: string,
  filter: { column: string; value: string | string[] }
): Promise<number> {
  if (Array.isArray(filter.value) && filter.value.length === 0) {
    return 0;
  }

  let query = supabaseAdmin.from(table).delete({ count: 'exact' });
  query = Array.isArray(filter.value)
    ? query.in(filter.column, filter.value)
    : query.eq(filter.column, filter.value);

  const { count, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return count || 0;
}

async function updateRows(
  table: string,
  values: Record<string, unknown>,
  filter: { column: string; value: string | string[] }
): Promise<number> {
  if (Array.isArray(filter.value) && filter.value.length === 0) {
    return 0;
  }

  let query = supabaseAdmin.from(table).update(values, { count: 'exact' });
  query = Array.isArray(filter.value)
    ? query.in(filter.column, filter.value)
    : query.eq(filter.column, filter.value);

  const { count, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return count || 0;
}

export async function deleteUserAccountData(user: User): Promise<AccountDeletionResult> {
  const result: AccountDeletionResult = {
    deletedProjects: 0,
    deletedProjectStorageObjects: 0,
    deletedAvatarObjects: 0,
    failedReservations: 0,
    anonymizedUsageEvents: 0,
    anonymizedReservations: 0,
    anonymizedTransactions: 0,
    anonymizedContactRequests: 0,
    deletedRows: {},
    warnings: [],
  };

  const { data: projects, error: projectsError } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('user_id', user.id) as { data: Array<{ id: string }> | null; error: any };

  if (projectsError) {
    throw new Error(`projects: ${projectsError.message}`);
  }

  const projectIds = (projects || []).map((project) => project.id);

  const storageDelete = await deleteProjectStoragePrefixes(projectIds);
  result.deletedProjectStorageObjects = storageDelete.deletedCount;
  result.warnings.push(...storageDelete.errors.map((item) => `R2 ${item.key}: ${item.error}`));

  const avatarDelete = await clearUserAvatarFiles(user.id);
  result.deletedAvatarObjects = avatarDelete.deletedCount;
  result.warnings.push(...avatarDelete.errors.map((item) => `avatar ${item.key}: ${item.error}`));

  const { data: activeReservations } = await supabaseAdmin
    .from('billing_reservations')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['pending', 'active', 'settling']) as { data: Array<{ id: string }> | null; error: any };

  for (const reservation of activeReservations || []) {
    try {
      await failReservation(reservation.id, 'Account deleted');
      result.failedReservations += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to release reservation';
      result.warnings.push(`reservation ${reservation.id}: ${message}`);
    }
  }

  result.anonymizedContactRequests = await updateRows('contact_requests', {
    user_id: null,
    email: 'deleted-user@deleted.local',
    affected_page: null,
    service_area: null,
    project_title: null,
    subject: '[deleted account] Contact request',
    message: 'Removed during account deletion.',
    screenshot_url: null,
  }, { column: 'user_id', value: user.id });

  result.anonymizedUsageEvents = await updateRows('usage_events', {
    user_id: null,
    project_id: null,
    project_title: null,
    metadata: {
      anonymized: true,
      reason: 'account_deleted',
    },
  }, { column: 'user_id', value: user.id });

  result.anonymizedReservations = await updateRows('billing_reservations', {
    user_id: null,
    project_id: null,
    metadata: {
      anonymized: true,
      reason: 'account_deleted',
    },
  }, { column: 'user_id', value: user.id });

  result.anonymizedTransactions = await updateRows('credit_transactions', {
    user_id: null,
    metadata: {
      anonymized: true,
      reason: 'account_deleted',
    },
  }, { column: 'user_id', value: user.id });

  const projectBoundTables = [
    'project_generation_jobs',
    'generation_progress',
    'insights',
    'narrative_coverage_snapshots',
    'outputs',
  ] as const;

  for (const table of projectBoundTables) {
    try {
      result.deletedRows[table] = await deleteRows(table, {
        column: 'project_id',
        value: projectIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      result.warnings.push(`${table}: ${message}`);
    }
  }

  const userBoundDeletes = [
    ['integration_imports', 'user_id'],
    ['integration_connections', 'user_id'],
    ['narrative_goals', 'user_id'],
    ['user_openai_settings', 'user_id'],
    ['account_credits', 'user_id'],
    ['profiles', 'id'],
  ] as const;

  for (const [table, column] of userBoundDeletes) {
    try {
      result.deletedRows[table] = await deleteRows(table, {
        column,
        value: user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      result.warnings.push(`${table}: ${message}`);
    }
  }

  result.deletedProjects = await deleteRows('projects', {
    column: 'user_id',
    value: user.id,
  });

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    throw new Error(`auth.users: ${deleteUserError.message}`);
  }

  return result;
}
