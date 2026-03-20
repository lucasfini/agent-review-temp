import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { supabaseAdmin } from '@/lib/supabase/server';
import { BUCKET_NAME, r2Client } from '@/lib/r2';

const PROFILE_IMAGES_BUCKET = 'profile-images';

type DeleteSummary = {
  deletedCount: number;
  failedCount: number;
  scannedCount: number;
  deletedKeys: string[];
  errors: Array<{ key: string; error: string }>;
};

async function deleteR2Keys(keys: string[]): Promise<DeleteSummary> {
  if (keys.length === 0) {
    return {
      deletedCount: 0,
      failedCount: 0,
      scannedCount: 0,
      deletedKeys: [],
      errors: [],
    };
  }

  const summary: DeleteSummary = {
    deletedCount: 0,
    failedCount: 0,
    scannedCount: keys.length,
    deletedKeys: [],
    errors: [],
  };

  const chunkSize = 1000;
  for (let index = 0; index < keys.length; index += chunkSize) {
    const chunk = keys.slice(index, index + chunkSize);
    try {
      const response = await r2Client.send(new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: true,
        },
      }));

      const deleted = response.Deleted || [];
      summary.deletedCount += deleted.length;
      summary.deletedKeys.push(...deleted.map((item) => item.Key || '').filter(Boolean));

      const errors = response.Errors || [];
      summary.failedCount += errors.length;
      summary.errors.push(
        ...errors.map((item) => ({
          key: item.Key || 'unknown',
          error: item.Message || 'Delete failed',
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      summary.failedCount += chunk.length;
      summary.errors.push(...chunk.map((key) => ({ key, error: message })));
    }
  }

  return summary;
}

export async function listR2KeysForPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await r2Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    keys.push(...(response.Contents || []).map((item) => item.Key || '').filter(Boolean));
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

export async function deleteProjectStoragePrefix(projectId: string): Promise<DeleteSummary> {
  const keys = await listR2KeysForPrefix(`${projectId}/`);
  return deleteR2Keys(keys);
}

export async function deleteProjectStoragePrefixes(projectIds: string[]): Promise<DeleteSummary> {
  const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)));
  const allKeys = await Promise.all(uniqueIds.map((projectId) => listR2KeysForPrefix(`${projectId}/`)));
  return deleteR2Keys(allKeys.flat());
}

export async function clearUserAvatarFiles(userId: string): Promise<DeleteSummary> {
  const files = await supabaseAdmin.storage.from(PROFILE_IMAGES_BUCKET).list(userId, {
    limit: 100,
    offset: 0,
  });

  const names = (files.data || []).map((file) => file.name).filter(Boolean);
  const paths = names.map((name) => `${userId}/${name}`);

  if (paths.length === 0) {
    return {
      deletedCount: 0,
      failedCount: 0,
      scannedCount: 0,
      deletedKeys: [],
      errors: [],
    };
  }

  const { data, error } = await supabaseAdmin.storage.from(PROFILE_IMAGES_BUCKET).remove(paths);
  const deletedKeys = (data || []).map((item) => item.name || '').filter(Boolean);

  return {
    deletedCount: deletedKeys.length,
    failedCount: error ? paths.length : 0,
    scannedCount: paths.length,
    deletedKeys,
    errors: error ? paths.map((key) => ({ key, error: error.message || 'Avatar delete failed' })) : [],
  };
}

export async function reconcileOrphanedStorage(options?: {
  limit?: number;
}): Promise<{
  scannedProjectPrefixes: number;
  deletedProjectPrefixes: number;
  deletedProjectKeys: number;
  scannedAvatarPrefixes: number;
  deletedAvatarPrefixes: number;
  deletedAvatarKeys: number;
  errors: Array<{ scope: 'r2' | 'avatar'; key: string; error: string }>;
}> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const errors: Array<{ scope: 'r2' | 'avatar'; key: string; error: string }> = [];

  const r2Response = await r2Client.send(new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Delimiter: '/',
    MaxKeys: limit,
  }));

  const projectPrefixes = (r2Response.CommonPrefixes || [])
    .map((item) => item.Prefix || '')
    .filter(Boolean)
    .map((prefix) => prefix.replace(/\/$/, ''));

  let deletedProjectPrefixes = 0;
  let deletedProjectKeys = 0;

  if (projectPrefixes.length > 0) {
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id')
      .in('id', projectPrefixes) as { data: Array<{ id: string }> | null; error: any };

    const liveIds = new Set((projects || []).map((row) => row.id));
    const orphanedProjectIds = projectPrefixes.filter((projectId) => !liveIds.has(projectId));

    for (const projectId of orphanedProjectIds) {
      const result = await deleteProjectStoragePrefix(projectId);
      if (result.failedCount === 0) {
        deletedProjectPrefixes += 1;
      }
      deletedProjectKeys += result.deletedCount;
      errors.push(...result.errors.map((item) => ({ scope: 'r2' as const, ...item })));
    }
  }

  const avatarList = await supabaseAdmin.storage.from(PROFILE_IMAGES_BUCKET).list('', {
    limit,
    offset: 0,
  });

  const avatarPrefixes = (avatarList.data || [])
    .map((item) => item.name)
    .filter((name): name is string => Boolean(name));

  let deletedAvatarPrefixes = 0;
  let deletedAvatarKeys = 0;

  if (avatarPrefixes.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('id', avatarPrefixes) as { data: Array<{ id: string }> | null; error: any };

    const liveProfileIds = new Set((profiles || []).map((row) => row.id));
    const orphanedAvatarIds = avatarPrefixes.filter((userId) => !liveProfileIds.has(userId));

    for (const userId of orphanedAvatarIds) {
      const result = await clearUserAvatarFiles(userId);
      if (result.failedCount === 0) {
        deletedAvatarPrefixes += 1;
      }
      deletedAvatarKeys += result.deletedCount;
      errors.push(...result.errors.map((item) => ({ scope: 'avatar' as const, ...item })));
    }
  }

  return {
    scannedProjectPrefixes: projectPrefixes.length,
    deletedProjectPrefixes,
    deletedProjectKeys,
    scannedAvatarPrefixes: avatarPrefixes.length,
    deletedAvatarPrefixes,
    deletedAvatarKeys,
    errors,
  };
}
