import { Buffer } from 'buffer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, BUCKET_NAME } from '@/lib/r2';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateProcessingProgress } from '@/lib/progress-tracker';
import { computeAudioFingerprint } from '@/lib/audio-fingerprint';

type PerformanceLevel = 'basic' | 'pro' | 'premium';

const MAX_FILE_SIZE = 500 * 1024 * 1024;

declare global {
  var uploadedFiles: Map<string, {
    buffer: ArrayBuffer;
    contentType: string;
    originalName: string;
    size: number;
  }>;
}

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
  if (value === 'basic' || value === 'pro' || value === 'premium') return value;
  if (value === 'low') return 'basic';
  if (value === 'medium') return 'pro';
  if (value === 'high') return 'premium';
  return 'premium';
};

export async function importRecording(params: {
  userId: string;
  title: string;
  fileName: string;
  contentType: string;
  buffer: ArrayBuffer;
  performanceLevel?: string | null;
  speakerCount?: number;
  externalSource?: { provider: string; recordingId: string };
}) {
  const { userId, title, fileName, contentType, buffer, performanceLevel, speakerCount, externalSource } = params;
  const level = normalizePerformanceLevel(performanceLevel);
  const size = buffer.byteLength;

  if (size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 500MB limit');
  }

  const sanitizedBaseName = sanitizeFileName(fileName);
  const estimatedDuration = Math.round(size / (128000 / 8));
  const fingerprint = computeAudioFingerprint(Buffer.from(buffer));

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: userId,
      title,
      audio_file_name: sanitizedBaseName,
      audio_file_size: size,
      audio_duration: estimatedDuration,
      audio_fingerprint: fingerprint,
      status: 'uploading',
      processing_stage: 'uploading',
      processing_progress: 0,
      processing_message: 'Importing audio file...',
      stage_started_at: new Date().toISOString(),
      performance_level: level
    } as any)
    .select()
    .single() as { data: any; error: any };

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
    throw new Error(uploadError?.message || 'Failed to upload audio file to R2');
  }

  if (!global.uploadedFiles) {
    global.uploadedFiles = new Map();
  }
  const inMemoryFile = {
    buffer,
    contentType,
    originalName: fileName,
    size
  };
  global.uploadedFiles.set(storagePath, inMemoryFile);
  if (sanitizedBaseName !== storagePath) {
    global.uploadedFiles.set(sanitizedBaseName, inMemoryFile);
  }

  await updateProcessingProgress(project.id, {
    stage: 'transcribing',
    progress: 0,
    message: 'Import complete. Starting transcription...'
  });

  await supabaseAdmin
    .from('projects')
    .update({ processing_started_at: new Date().toISOString() } as any)
    .eq('id', project.id);

  let baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  fetch(`${baseUrl}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.id,
      fileName: storagePath,
      fingerprint,
      performanceLevel: level,
      diarizationProvider: (process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY) ? 'assemblyai' : 'deepgram',
      ...(speakerCount ? { speakerCount } : {}),
      ...(externalSource ? { externalSource } : {})
    })
  }).catch(() => undefined);

  return {
    projectId: project.id,
    fileName: storagePath,
    fingerprint,
    performanceLevel: level
  };
}
