import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

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

export async function POST(request: NextRequest) {
  try {
    const { uploadId, fileName, totalChunks, fileSize } = await request.json();

    if (!uploadId || !fileName || !totalChunks) {
      return NextResponse.json(
        { error: 'Missing required finalization parameters' },
        { status: 400 }
      );
    }

    console.log(`Finalizing upload ${uploadId} for ${fileName}`);

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

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        title: projectTitle,
        audio_file_name: fileName,
        audio_file_size: totalSize,
        audio_duration: estimatedDuration,
        status: 'uploading'
      })
      .select()
      .single();

    if (projectError) {
      console.error('Project creation error:', projectError);
      return NextResponse.json(
        { error: `Database error: ${projectError.message}` },
        { status: 500 }
      );
    }

    console.log('Project created:', project.id);

    // Upload assembled file to Supabase Storage
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_');
    
    const storageFileName = `${project.id}/${sanitizedFileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('audio-files')
      .upload(storageFileName, finalBuffer, {
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

    // Update project status
    const { error: updateError } = await supabaseAdmin
      .from('projects')
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
      fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          fileName: storageFileName
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