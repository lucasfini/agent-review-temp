import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeAudioFingerprint } from '@/lib/audio-fingerprint';
import { getCachedTranscription, applyCachedTranscriptionToProject } from '@/lib/transcription-cache';

// Import the upload sessions map from the chunk route
// In production, you'd want to use Redis or another persistent store
declare global {
  var uploadSessions: Map<string, {
    chunks: Map<number, ArrayBuffer>;
    metadata: {
      fileName: string;
      totalChunks: number;
      uploadId: string;
      projectId?: string;
      fileSize?: number;
    };
    createdAt: number;
  }>;
}

// Use global variable to persist sessions across route calls
if (!global.uploadSessions) {
  global.uploadSessions = new Map();
}

const uploadSessions = global.uploadSessions;

const sanitizeFileName = (name: string) => {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const sanitized = normalized
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'audio_upload';
};

type PerformanceLevel = 'basic' | 'pro' | 'premium';

const legacyToCurrentLevel = (value?: string | null): PerformanceLevel | null => {
  if (!value) return null;
  if (value === 'basic' || value === 'pro' || value === 'premium') return value as PerformanceLevel;
  if (value === 'low') return 'basic';
  if (value === 'medium') return 'pro';
  if (value === 'high') return 'premium';
  return null;
};

const normalizePerformanceLevel = (value: PerformanceLevel | string | undefined): PerformanceLevel => {
  return legacyToCurrentLevel(value) || 'premium';
};

export async function POST(request: NextRequest) {
  try {
    const { uploadId, fileName, totalChunks, fileSize, performanceLevel: requestedLevel } = await request.json();
    const performanceLevel = normalizePerformanceLevel(requestedLevel);

    if (!uploadId || !fileName || !totalChunks) {
      return NextResponse.json(
        { error: 'Missing required finalization parameters' },
        { status: 400 }
      );
    }

    console.log(`Finalizing upload ${uploadId} for ${fileName}`);
    console.log(`[UPLOAD][CHUNKED] Selected performance level: ${performanceLevel}`);

    // Get upload session
    const session = uploadSessions.get(uploadId);
    if (!session) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    // Verify all chunks are received
    if (session.chunks.size !== totalChunks) {
      return NextResponse.json(
        { error: `Missing chunks: expected ${totalChunks}, got ${session.chunks.size}` },
        { status: 400 }
      );
    }

    console.log(`All ${totalChunks} chunks received, assembling file...`);

    // Assemble chunks into final file
    const sortedChunks = Array.from({ length: totalChunks }, (_, i) => session.chunks.get(i))
      .filter(chunk => chunk !== undefined) as ArrayBuffer[];

    if (sortedChunks.length !== totalChunks) {
      return NextResponse.json(
        { error: 'Some chunks are missing or corrupted' },
        { status: 400 }
      );
    }

    // Combine all chunks
    const totalSize = sortedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const finalBuffer = new ArrayBuffer(totalSize);
    const finalView = new Uint8Array(finalBuffer);
    
    let offset = 0;
    for (const chunk of sortedChunks) {
      finalView.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    console.log(`Assembled file: ${totalSize} bytes`);
    const finalNodeBuffer = Buffer.from(new Uint8Array(finalBuffer));
    const audioFingerprint = computeAudioFingerprint(finalNodeBuffer);

    // Get the authenticated user
    const authHeader = request.headers.get('authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    );

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required for file upload' },
        { status: 401 }
      );
    }

    // Create project record
    const projectTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[_\-\+\[\]]/g, ' ').trim();
    const estimatedDuration = Math.round(totalSize / (128000 / 8)); // Rough estimate

    const sanitizedBaseName = sanitizeFileName(fileName);

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        title: projectTitle,
        audio_file_name: sanitizedBaseName,
        audio_file_size: totalSize,
        audio_duration: estimatedDuration,
        audio_fingerprint: audioFingerprint,
        status: 'uploading',
        performance_level: performanceLevel
      } as any)
      .select()
      .single() as { data: any; error: any };

    if (projectError || !project) {
      console.error('Project creation error:', projectError);
      return NextResponse.json(
        { error: `Database error: ${projectError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    console.log('Project created:', project.id);

    // Upload assembled file to Supabase Storage
    const storageFileName = `${project.id}/${sanitizedBaseName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('audio-files')
      .upload(storageFileName, finalNodeBuffer, {
        contentType: 'audio/mpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      
      // Clean up project record
      await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', project.id);

      return NextResponse.json(
        { error: `Storage error: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log('File uploaded to storage:', storageFileName);

    if (!global.uploadedFiles) {
      global.uploadedFiles = new Map();
    }
    const inMemoryFile = {
      buffer: finalBuffer,
      contentType: 'audio/mpeg',
      originalName: fileName,
      size: totalSize
    };
    global.uploadedFiles.set(storageFileName, inMemoryFile);
    if (sanitizedBaseName !== storageFileName) {
      global.uploadedFiles.set(sanitizedBaseName, inMemoryFile);
    }

    // Check for cached transcription (base layer only)
    const cachedTranscription = await getCachedTranscription(audioFingerprint);
    if (cachedTranscription) {
      const hydrated = await applyCachedTranscriptionToProject(
        project.id,
        cachedTranscription,
        estimatedDuration
      );

      if (hydrated) {
        console.log(`[UPLOAD][CHUNKED] ♻️ Found cached transcription for fingerprint ${audioFingerprint}`);
        console.log(`[UPLOAD][CHUNKED] 🎯 Will apply tier-specific features based on performance level`);

        // Increment reference count
        const { incrementReferenceCount } = await import('@/lib/transcription-cache');
        await incrementReferenceCount(audioFingerprint);

        // Continue to transcription endpoint to apply tier-specific features
        // Do NOT return early - let the tier processing happen
      }
    }

    // Update project status
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', project.id);

    if (updateError) {
      console.error('Project update error:', updateError);
    }

    // Clean up upload session
    uploadSessions.delete(uploadId);

    // Start transcription process if OpenAI key is available
    if (process.env.OPENAI_API_KEY) {
      const diarizationProvider = (process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLYAI_ACCESS_KEY) ? 'assemblyai' : 'deepgram';
      console.log(`[UPLOAD][CHUNKED] Starting transcription with provider: ${diarizationProvider}`);

      fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          fileName: storageFileName,
          fingerprint: audioFingerprint,
          performanceLevel,
          diarizationProvider
        })
      }).catch(error => {
        console.error('Failed to start transcription:', error);
      });
    }

    return NextResponse.json({
      success: true,
      projectId: project.id,
      uploadId,
      message: 'Chunked upload completed successfully, transcription starting...',
      fileSize: totalSize,
      chunks: totalChunks
    });

  } catch (error) {
    console.error('Upload finalization error:', error);
    return NextResponse.json(
      { error: 'Failed to finalize upload' },
      { status: 500 }
    );
  }
}
