import { Buffer } from 'buffer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateProcessingProgress } from '@/lib/progress-tracker';
import { computeAudioFingerprint } from '@/lib/audio-fingerprint';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { scheduleBackgroundTask } from '@/lib/background-task';
import { getProcessingTierForAnalysis, normalizeAnalysisOptions, type AnalysisOptions } from '@/lib/analysis-options';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import {
  notifyImportComplete,
  notifyImportFailed,
} from '@/lib/notifications/notification-events';

type PerformanceLevel = 'transcript' | 'content_kit';

const MAX_FILE_SIZE = 500 * 1024 * 1024;


const sanitizeFileName = (name: string) => {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'audio_import';
};

const normalizePerformanceLevel = (value?: string | null): PerformanceLevel => {
  if (value === 'transcript' || value === 'content_kit') return value;
  if (value === 'basic' || value === 'standard' || value === 'low') return 'transcript';
  if (value === 'pro' || value === 'medium' || value === 'premium' || value === 'high') return 'content_kit';
  return 'content_kit';
};

export async function importRecording(params: {
  userId: string;
  organizationId?: string | null;
  title: string;
  fileName: string;
  contentType: string;
  buffer: ArrayBuffer;
  performanceLevel?: string | null;
  analysisOptions?: AnalysisOptions;
  reservationId?: string;
  reservationHoldAmount?: number;
  reservationEstimatedCost?: number;
  estimatedDurationSeconds?: number;
  speakerCount?: number;
  externalSource?: { provider: string; recordingId: string };
}) {
  const {
    userId,
    organizationId,
    title,
    fileName,
    contentType,
    buffer,
    performanceLevel,
    analysisOptions,
    reservationId,
    reservationHoldAmount,
    reservationEstimatedCost,
    estimatedDurationSeconds,
    speakerCount,
    externalSource
  } = params;
  const normalizedAnalysisOptions = normalizeAnalysisOptions(analysisOptions);
  const level = performanceLevel
    ? normalizePerformanceLevel(performanceLevel)
    : getProcessingTierForAnalysis(normalizedAnalysisOptions);
  const size = buffer.byteLength;

  if (size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 500MB limit');
  }

  const sanitizedBaseName = sanitizeFileName(fileName);
  const estimatedDuration = estimatedDurationSeconds
    ? Math.max(1, Math.round(estimatedDurationSeconds))
    : Math.round(size / (128000 / 8));
  const fingerprint = computeAudioFingerprint(Buffer.from(buffer));
  const resolvedOrganizationId = await resolveOrganizationIdForWrite(userId, organizationId || null);

  let insertData: any = {
    user_id: userId,
    organization_id: resolvedOrganizationId,
    title,
    audio_file_name: sanitizedBaseName,
    audio_file_size: size,
    audio_duration: estimatedDuration,
    audio_expires_at: null,
    audio_fingerprint: fingerprint,
    status: 'uploading',
    processing_stage: 'uploading',
    processing_progress: 0,
    processing_message: 'Importing audio file...',
    stage_started_at: new Date().toISOString(),
    performance_level: level,
    metadata: {
      analysis_options: normalizedAnalysisOptions,
      billing: reservationId ? {
        uploadReservationId: reservationId,
        uploadEstimatedHold: reservationHoldAmount ?? null,
        uploadEstimatedHoldUnit: 'plan_credit',
        uploadEstimatedCost: reservationEstimatedCost ?? null,
      } : undefined,
    }
  };

  let { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .insert(insertData)
    .select()
    .single() as { data: any; error: any };

  if (projectError && projectError.message?.includes(`'audio_expires_at'`)) {
    const legacyInsertData = { ...insertData };
    delete legacyInsertData.audio_expires_at;
    const retry = await supabaseAdmin
      .from('projects')
      .insert(legacyInsertData)
      .select()
      .single() as { data: any; error: any };
    project = retry.data;
    projectError = retry.error;
  }

  if (projectError || !project) {
    throw new Error(projectError?.message || 'Failed to create project');
  }

  const storagePath = `${project.id}/${sanitizedBaseName}`;
  const nodeBuffer = Buffer.from(buffer);

  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storagePath,
      Body: nodeBuffer,
      ContentType: contentType || 'application/octet-stream',
    }));
  } catch (uploadError: any) {
    await supabaseAdmin.from('projects').delete().eq('id', project.id);
    await notifyImportFailed({
      organizationId: resolvedOrganizationId,
      actorUserId: userId,
      sourceName: externalSource?.provider || 'import',
      idempotencyKey: externalSource
        ? `import_failed:${externalSource.provider}:${externalSource.recordingId}`
        : `import_failed:${project.id}`,
      metadata: {
        source: 'integration_importer',
        provider: externalSource?.provider || null,
        recordingId: externalSource?.recordingId || null,
        error: uploadError?.message || 'Failed to upload audio file to R2',
      },
    });
    throw new Error(uploadError?.message || 'Failed to upload audio file to R2');
  }


  await updateProcessingProgress(project.id, {
    stage: 'transcribing',
    progress: 0,
    message: 'Preparing your audio for processing...'
  });

  await supabaseAdmin
    .from('projects')
    .update({ processing_started_at: new Date().toISOString() } as any)
    .eq('id', project.id);

  const baseUrl = getInternalAppBaseUrl();

  const internalJobToken = getInternalJobToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (internalJobToken) {
    headers['x-internal-job-token'] = internalJobToken;
  }

  scheduleBackgroundTask(
    fetch(`${baseUrl}/api/transcribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        fileName: storagePath,
        fingerprint,
        performanceLevel: level,
        analysisOptions: normalizedAnalysisOptions,
        diarizationProvider: (process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY) ? 'assemblyai' : 'deepgram',
        ...(speakerCount ? { speakerCount } : {}),
        ...(externalSource ? { externalSource } : {})
      })
    }).catch((e) => console.error('Background transcription fetch failed:', e))
  );

  await notifyImportComplete({
    organizationId: resolvedOrganizationId,
    actorUserId: userId,
    projectId: project.id,
    projectTitle: project.title || title,
    sourceName: externalSource?.provider || 'import',
    idempotencyKey: externalSource
      ? `import_complete:${externalSource.provider}:${externalSource.recordingId}`
      : `import_complete:${project.id}`,
    metadata: {
      source: 'integration_importer',
      provider: externalSource?.provider || null,
      recordingId: externalSource?.recordingId || null,
    },
  });

  return {
    projectId: project.id,
    organizationId: resolvedOrganizationId,
    fileName: storagePath,
    fingerprint,
    performanceLevel: level
  };
}
