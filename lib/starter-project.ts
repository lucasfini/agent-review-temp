import { User } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabase/server';

const STARTER_TEMPLATE_ENV = 'STARTER_PROJECT_TEMPLATE_ID';

type StarterProjectMetadata = {
  sourceProjectId?: string;
  sourceAudioFileName?: string | null;
  clonedAt?: string;
  removable?: boolean;
};

type EnsureStarterProjectResult = {
  configured: boolean;
  created: boolean;
  skipped: boolean;
  projectId?: string;
  reason?: string;
};

function getTemplateProjectId(): string | null {
  const value = process.env[STARTER_TEMPLATE_ENV]?.trim();
  return value || null;
}

function getStarterMetadata(projectMetadata: unknown): StarterProjectMetadata | null {
  if (!projectMetadata || typeof projectMetadata !== 'object') return null;
  const starterProject = (projectMetadata as Record<string, unknown>).starterProject;
  if (!starterProject || typeof starterProject !== 'object') return null;
  return starterProject as StarterProjectMetadata;
}

export function getStarterAudioObjectKey(project: {
  id: string;
  audio_file_name: string | null;
  metadata?: unknown;
}): string | null {
  const starter = getStarterMetadata(project.metadata);
  const sourceProjectId = typeof starter?.sourceProjectId === 'string' ? starter.sourceProjectId : null;
  const sourceAudioFileName = typeof starter?.sourceAudioFileName === 'string' ? starter.sourceAudioFileName : null;

  if (sourceProjectId && sourceAudioFileName) {
    return `${sourceProjectId}/${sourceAudioFileName}`;
  }

  if (!project.audio_file_name) return null;
  return `${project.id}/${project.audio_file_name}`;
}

function omitCloneManagedFields(row: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...row };
  delete clone.id;
  delete clone.created_at;
  delete clone.updated_at;
  return clone;
}

async function markStarterGranted(userId: string, payload: {
  sourceProjectId: string;
  projectId: string;
  createdAt: string;
}) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const existingMeta = (data.user?.user_metadata || {}) as Record<string, unknown>;

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMeta,
      starter_project: payload,
    },
  });

  if (error) {
    console.warn('[STARTER PROJECT] Failed to mark starter project granted:', error);
  }
}

async function findExistingStarterCopy(userId: string, sourceProjectId: string): Promise<{ id: string } | null> {
  const { data: fallbackProjects, error } = await supabaseAdmin
    .from('projects')
    .select('id, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(500) as { data: Array<{ id: string; metadata: unknown }> | null; error: any };

  if (error) {
    console.warn('[STARTER PROJECT] Could not check existing starter copies:', error);
    return null;
  }

  return (fallbackProjects || []).find((project) => (
    getStarterMetadata(project.metadata)?.sourceProjectId === sourceProjectId
  )) || null;
}

function isUniqueStarterCopyViolation(error: any): boolean {
  return error?.code === '23505'
    && typeof error?.message === 'string'
    && error.message.includes('projects_one_starter_copy_per_user_idx');
}

async function copyProjectRows(params: {
  table: string;
  sourceProjectId: string;
  targetProjectId: string;
  targetUserId?: string;
  projectTitle?: string | null;
  required?: boolean;
}) {
  const { table, sourceProjectId, targetProjectId, targetUserId, projectTitle, required = false } = params;
  const { data: rows, error: readError } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('project_id', sourceProjectId);

  if (readError) {
    if (required) throw readError;
    console.warn(`[STARTER PROJECT] Could not read ${table}:`, readError);
    return;
  }

  if (!rows || rows.length === 0) return;

  const now = new Date().toISOString();
  const inserts = rows.map((row: Record<string, unknown>) => {
    const clone = omitCloneManagedFields(row);
    clone.project_id = targetProjectId;
    clone.created_at = now;
    clone.updated_at = now;
    if (targetUserId && 'user_id' in clone) clone.user_id = targetUserId;
    if (projectTitle && 'project_title' in clone) clone.project_title = projectTitle;
    return clone;
  });

  const { error: insertError } = await supabaseAdmin
    .from(table)
    .insert(inserts as never);

  if (insertError) {
    if (required) throw insertError;
    console.warn(`[STARTER PROJECT] Could not copy ${table}:`, insertError);
  }
}

export async function ensureStarterProjectForUser(user: User): Promise<EnsureStarterProjectResult> {
  const sourceProjectId = getTemplateProjectId();
  if (!sourceProjectId) {
    return { configured: false, created: false, skipped: true, reason: 'not_configured' };
  }

  const userMeta = (user.user_metadata || {}) as Record<string, any>;
  if (userMeta.starter_project?.sourceProjectId === sourceProjectId) {
    return {
      configured: true,
      created: false,
      skipped: true,
      projectId: userMeta.starter_project.projectId,
      reason: 'already_granted',
    };
  }

  const { data: sourceProject, error: sourceError } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', sourceProjectId)
    .single() as { data: Record<string, any> | null; error: any };

  if (sourceError || !sourceProject) {
    console.warn('[STARTER PROJECT] Template project not found:', sourceError);
    return { configured: true, created: false, skipped: true, reason: 'template_not_found' };
  }

  if (sourceProject.user_id === user.id) {
    const markedAt = new Date().toISOString();
    await markStarterGranted(user.id, {
      sourceProjectId,
      projectId: sourceProjectId,
      createdAt: markedAt,
    });
    return { configured: true, created: false, skipped: true, projectId: sourceProjectId, reason: 'template_owner' };
  }

  const existingStarter = await findExistingStarterCopy(user.id, sourceProjectId);
  if (existingStarter) {
    await markStarterGranted(user.id, {
      sourceProjectId,
      projectId: existingStarter.id,
      createdAt: new Date().toISOString(),
    });
    return {
      configured: true,
      created: false,
      skipped: true,
      projectId: existingStarter.id,
      reason: 'existing_copy',
    };
  }

  const now = new Date().toISOString();
  const projectInsert = omitCloneManagedFields(sourceProject);
  projectInsert.user_id = user.id;
  projectInsert.audio_expires_at = null;
  projectInsert.audio_deleted_at = null;
  projectInsert.created_at = now;
  projectInsert.updated_at = now;
  projectInsert.processing_completed_at = sourceProject.processing_completed_at || now;
  projectInsert.metadata = {
    ...(sourceProject.metadata && typeof sourceProject.metadata === 'object' ? sourceProject.metadata : {}),
    starterProject: {
      sourceProjectId,
      sourceAudioFileName: sourceProject.audio_file_name || null,
      clonedAt: now,
      removable: true,
    },
  };

  const { data: createdProject, error: createError } = await supabaseAdmin
    .from('projects')
    .insert(projectInsert as never)
    .select('id, title')
    .single() as { data: { id: string; title: string | null } | null; error: any };

  if (createError || !createdProject) {
    if (isUniqueStarterCopyViolation(createError)) {
      const existingCopy = await findExistingStarterCopy(user.id, sourceProjectId);
      if (existingCopy) {
        await markStarterGranted(user.id, {
          sourceProjectId,
          projectId: existingCopy.id,
          createdAt: new Date().toISOString(),
        });
        return {
          configured: true,
          created: false,
          skipped: true,
          projectId: existingCopy.id,
          reason: 'existing_copy',
        };
      }
    }

    console.error('[STARTER PROJECT] Failed to create starter copy:', createError);
    throw createError || new Error('Failed to create starter project copy');
  }

  try {
    await copyProjectRows({
      table: 'outputs',
      sourceProjectId,
      targetProjectId: createdProject.id,
      required: true,
    });

    await copyProjectRows({
      table: 'insights',
      sourceProjectId,
      targetProjectId: createdProject.id,
      required: false,
    });

    await copyProjectRows({
      table: 'narrative_coverage_snapshots',
      sourceProjectId,
      targetProjectId: createdProject.id,
      targetUserId: user.id,
      projectTitle: createdProject.title,
      required: false,
    });
  } catch (error) {
    await supabaseAdmin.from('projects').delete().eq('id', createdProject.id);
    console.error('[STARTER PROJECT] Failed to copy starter project children:', error);
    throw error;
  }

  await markStarterGranted(user.id, {
    sourceProjectId,
    projectId: createdProject.id,
    createdAt: now,
  });

  return {
    configured: true,
    created: true,
    skipped: false,
    projectId: createdProject.id,
  };
}
