import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase/server';

export type OrganizationNotificationType =
  | 'upload_started'
  | 'upload_completed'
  | 'upload_failed'
  | 'transcription_completed'
  | 'transcription_failed'
  | 'content_generation_started'
  | 'content_generated'
  | 'content_generation_failed'
  | 'integration_import_completed'
  | 'integration_import_failed'
  | 'top_up_purchased'
  | 'plan_changed'
  | 'payment_failed'
  | 'payment_method_updated'
  | 'credits_low'
  | 'credits_depleted'
  | 'credits_reset'
  | 'workspace_updated'
  | 'team_member_invited'
  | 'team_member_joined'
  | 'team_member_role_changed'
  | 'team_member_removed'
  | 'ownership_transferred'
  | 'asset_shared'
  | 'asset_unshared'
  | 'library_item_added'
  | 'library_item_removed'
  | (string & {});

export type OrganizationNotification = {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  type: OrganizationNotificationType;
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  metadata_json: unknown;
  read_at: string | null;
  created_at: string;
};

type SyntheticGenerationJobRow = {
  id: string;
  kind: string;
  project_id: string;
  user_id: string | null;
  target_key: string;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type ProjectNotificationContextRow = {
  id: string;
  title: string | null;
  user_id?: string | null;
  audio_file_name?: string | null;
  status?: string | null;
  processing_stage?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
};

export type CreateOrganizationNotificationInput = {
  organizationId: string;
  actorUserId?: string | null;
  type: OrganizationNotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

export type ListOrganizationNotificationsOptions = {
  includeRead?: boolean;
  limit?: number;
  before?: string | null;
  userId?: string | null;
};

const NOTIFICATION_TABLE_MISSING_CODES = new Set(['42P01', 'PGRST205']);

function isMissingNotificationTable(error: any): boolean {
  return Boolean(error && NOTIFICATION_TABLE_MISSING_CODES.has(error.code));
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapNotificationRow(row: NotificationRow): OrganizationNotification {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    metadata: normalizeMetadata(row.metadata_json),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
}

function projectNotificationHref(projectId?: string | null): string {
  return projectId ? `/dashboard/projects?id=${encodeURIComponent(projectId)}` : '/dashboard/projects';
}

function syntheticGenerationNotification(
  job: SyntheticGenerationJobRow,
  project: ProjectNotificationContextRow | undefined
): OrganizationNotification {
  const projectTitle = cleanLabel(project?.title, 'this project');
  const isFailed = job.status === 'failed';
  const isCompleted = job.status === 'completed';
  const title = isFailed
    ? 'Content failed'
    : isCompleted
      ? 'Content generated'
      : 'Content generating';
  const body = isFailed
    ? `We couldn't create content for ${projectTitle}. Try again.`
    : isCompleted
      ? `1 item is ready in ${projectTitle}.`
      : `We're creating 1 item for ${projectTitle}.`;

  return {
    id: `synthetic:content_generation:${job.id}:${job.status}`,
    organizationId: '',
    actorUserId: job.user_id || null,
    type: isFailed
      ? 'content_generation_failed'
      : isCompleted
        ? 'content_generated'
        : 'content_generation_started',
    title,
    body,
    href: projectNotificationHref(job.project_id),
    metadata: {
      synthetic: true,
      source: 'project_generation_jobs',
      jobId: job.id,
      kind: job.kind,
      targetKey: job.target_key,
      status: job.status,
      error: job.error_message || null,
      projectId: job.project_id,
    },
    readAt: null,
    createdAt: job.completed_at || job.updated_at || job.created_at,
  };
}

function syntheticUploadNotification(project: ProjectNotificationContextRow): OrganizationNotification | null {
  if (!project.audio_file_name) return null;

  const status = (project.status || '').toLowerCase();
  const stage = (project.processing_stage || '').toLowerCase();
  const projectTitle = cleanLabel(project.title || project.audio_file_name, 'Your project');
  let type: OrganizationNotificationType;
  let title: string;
  let body: string;
  let statusKey: string;

  if (status === 'failed' || stage === 'failed') {
    type = 'transcription_failed';
    title = 'Transcript failed';
    body = `We couldn't transcribe ${projectTitle}. Try again.`;
    statusKey = 'failed';
  } else if (status === 'completed') {
    type = 'transcription_completed';
    title = 'Transcript ready';
    body = `${projectTitle} is ready to review.`;
    statusKey = 'completed';
  } else if (status === 'processing' || stage === 'transcribing' || stage === 'processing') {
    type = 'upload_completed';
    title = 'Upload received';
    body = `${projectTitle} is ready for transcription.`;
    statusKey = 'received';
  } else if (status === 'uploading' || stage === 'uploading' || stage === 'finalizing') {
    type = 'upload_started';
    title = 'Upload started';
    body = `${projectTitle} is uploading.`;
    statusKey = 'started';
  } else {
    return null;
  }

  return {
    id: `synthetic:upload:${project.id}:${statusKey}`,
    organizationId: '',
    actorUserId: project.user_id || null,
    type,
    title,
    body,
    href: projectNotificationHref(project.id),
    metadata: {
      synthetic: true,
      source: 'projects',
      projectId: project.id,
      status: project.status || null,
      processingStage: project.processing_stage || null,
    },
    readAt: null,
    createdAt: project.processing_completed_at
      || project.processing_started_at
      || project.updated_at
      || project.created_at
      || new Date().toISOString(),
  };
}

async function listSyntheticFallbackNotifications(
  organizationId: string,
  limit: number,
  userId: string | null | undefined,
  supabase: SupabaseClient<any>
): Promise<{ notifications: OrganizationNotification[]; unreadCount: number; nextCursor: string | null }> {
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const projectSelect = [
    'id',
    'title',
    'user_id',
    'audio_file_name',
    'status',
    'processing_stage',
    'created_at',
    'updated_at',
    'processing_started_at',
    'processing_completed_at',
  ].join(', ');
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(projectSelect)
    .eq('organization_id', organizationId)
    .gte('updated_at', recentCutoff)
    .order('updated_at', { ascending: false })
    .limit(250) as { data: ProjectNotificationContextRow[] | null; error: any };

  if (projectsError || !projects?.length) {
    if (projectsError) {
      console.warn('[NOTIFICATIONS] Failed to load fallback project contexts:', projectsError);
    }
  }

  let fallbackProjects = projects || [];
  if (userId) {
    const { data: userProjects, error: userProjectsError } = await supabase
      .from('projects')
      .select(projectSelect)
      .eq('user_id', userId)
      .gte('updated_at', recentCutoff)
      .order('updated_at', { ascending: false })
      .limit(250) as { data: ProjectNotificationContextRow[] | null; error: any };

    if (userProjectsError) {
      console.warn('[NOTIFICATIONS] Failed to load fallback user projects:', userProjectsError);
    } else if (userProjects?.length) {
      const seenProjectIds = new Set(fallbackProjects.map((project) => project.id));
      fallbackProjects = [
        ...fallbackProjects,
        ...userProjects.filter((project) => {
          if (seenProjectIds.has(project.id)) return false;
          seenProjectIds.add(project.id);
          return true;
        }),
      ];
    }
  }

  const projectById = new Map((projects || []).map((project) => [project.id, project]));
  fallbackProjects.forEach((project) => projectById.set(project.id, project));
  let jobsQuery = supabase
    .from('project_generation_jobs')
    .select('id, kind, project_id, user_id, target_key, status, error_message, created_at, updated_at, completed_at')
    .eq('kind', 'content')
    .gte('updated_at', recentCutoff)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (projectById.size > 0) {
    jobsQuery = jobsQuery.in('project_id', Array.from(projectById.keys()));
  } else if (userId) {
    jobsQuery = jobsQuery.eq('user_id', userId);
  } else {
    return { notifications: [], unreadCount: 0, nextCursor: null };
  }

  const { data: jobs, error: jobsError } = await jobsQuery as { data: SyntheticGenerationJobRow[] | null; error: any };

  if (jobsError) {
    console.warn('[NOTIFICATIONS] Failed to load fallback generation notifications:', jobsError);
    return { notifications: [], unreadCount: 0, nextCursor: null };
  }

  const missingProjectIds = Array.from(new Set(
    (jobs || [])
      .map((job) => job.project_id)
      .filter((projectId) => !projectById.has(projectId))
  ));
  if (missingProjectIds.length > 0) {
    const { data: jobProjects, error: jobProjectsError } = await supabase
      .from('projects')
      .select('id, title')
      .in('id', missingProjectIds) as { data: ProjectNotificationContextRow[] | null; error: any };

    if (!jobProjectsError) {
      (jobProjects || []).forEach((project) => projectById.set(project.id, project));
    }
  }

  const notifications = [
    ...fallbackProjects
      .map((project) => syntheticUploadNotification(project))
      .filter((notification): notification is OrganizationNotification => Boolean(notification)),
    ...(jobs || []).map((job) => syntheticGenerationNotification(job, projectById.get(job.project_id))),
  ]
    .map((notification) => ({
      ...notification,
      organizationId,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

  return {
    notifications,
    unreadCount: notifications.length,
    nextCursor: null,
  };
}

export async function createOrganizationNotification(
  input: CreateOrganizationNotificationInput,
  supabase: SupabaseClient<any> = supabaseAdmin
): Promise<OrganizationNotification | null> {
  const title = input.title.trim();
  if (!input.organizationId || !title) return null;

  const row = {
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId || null,
    type: input.type,
    title: title.slice(0, 160),
    body: input.body ? input.body.trim().slice(0, 500) : null,
    href: input.href || null,
    metadata_json: input.metadata || {},
    idempotency_key: input.idempotencyKey || null,
  };

  const query = input.idempotencyKey
    ? supabase
      .from('organization_notifications')
      .upsert(row as any, {
        onConflict: 'organization_id,idempotency_key',
        ignoreDuplicates: true,
      })
    : supabase
      .from('organization_notifications')
      .insert(row as any);

  const { data, error } = await query
    .select('*')
    .maybeSingle() as { data: NotificationRow | null; error: any };

  if (error) {
    if (isMissingNotificationTable(error)) {
      console.warn('[NOTIFICATIONS] organization_notifications table missing; skipped notification');
      return null;
    }
    throw new Error(error.message || 'Failed to create notification');
  }

  return data ? mapNotificationRow(data) : null;
}

export async function listOrganizationNotifications(
  organizationId: string,
  options: ListOrganizationNotificationsOptions = {},
  supabase: SupabaseClient<any> = supabaseAdmin
): Promise<{ notifications: OrganizationNotification[]; unreadCount: number; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, Number(options.limit || 12)));
  const before = typeof options.before === 'string' && Number.isFinite(Date.parse(options.before))
    ? options.before
    : null;
  let query = supabase
    .from('organization_notifications')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt('created_at', before);
  }

  if (!options.includeRead) {
    query = query.is('read_at', null);
  }

  const [{ data, error }, unreadResult] = await Promise.all([
    query as any,
    supabase
      .from('organization_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('read_at', null) as any,
  ]);

  if (error) {
    if (isMissingNotificationTable(error)) {
      return listSyntheticFallbackNotifications(organizationId, limit, options.userId, supabase);
    }
    throw new Error(error.message || 'Failed to load notifications');
  }

  if (unreadResult.error && isMissingNotificationTable(unreadResult.error)) {
    return listSyntheticFallbackNotifications(organizationId, limit, options.userId, supabase);
  }

  if (unreadResult.error) {
    throw new Error(unreadResult.error.message || 'Failed to count notifications');
  }

  const rows = ((data || []) as NotificationRow[]);
  const visibleRows = rows.slice(0, limit);
  const nextCursor = rows.length > limit
    ? visibleRows[visibleRows.length - 1]?.created_at || null
    : null;

  return {
    notifications: visibleRows.map(mapNotificationRow),
    unreadCount: Number(unreadResult.count || 0),
    nextCursor,
  };
}

export async function markOrganizationNotificationRead(
  organizationId: string,
  notificationId: string,
  supabase: SupabaseClient<any> = supabaseAdmin
): Promise<void> {
  const { error } = await supabase
    .from('organization_notifications')
    .update({ read_at: new Date().toISOString() } as any)
    .eq('organization_id', organizationId)
    .eq('id', notificationId)
    .is('read_at', null) as { error: any };

  if (error && !isMissingNotificationTable(error)) {
    throw new Error(error.message || 'Failed to mark notification read');
  }
}

export async function markAllOrganizationNotificationsRead(
  organizationId: string,
  supabase: SupabaseClient<any> = supabaseAdmin
): Promise<void> {
  const { error } = await supabase
    .from('organization_notifications')
    .update({ read_at: new Date().toISOString() } as any)
    .eq('organization_id', organizationId)
    .is('read_at', null) as { error: any };

  if (error && !isMissingNotificationTable(error)) {
    throw new Error(error.message || 'Failed to mark notifications read');
  }
}
