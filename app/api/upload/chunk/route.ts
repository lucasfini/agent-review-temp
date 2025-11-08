import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Store for tracking upload progress
const uploadSessions = new Map<string, {
  chunks: Map<number, ArrayBuffer>;
  metadata: {
    fileName: string;
    totalChunks: number;
    uploadId: string;
    projectId?: string;
    fileSize?: number;
  };
  createdAt: number;
}>();

// Clean up old upload sessions (older than 1 hour)
function cleanupOldSessions() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [uploadId, session] of uploadSessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      uploadSessions.delete(uploadId);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    cleanupOldSessions();

    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string);
    const totalChunks = parseInt(formData.get('totalChunks') as string);
    const uploadId = formData.get('uploadId') as string;
    const fileName = formData.get('fileName') as string;

    if (!chunk || isNaN(chunkIndex) || isNaN(totalChunks) || !uploadId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required chunk upload parameters' },
        { status: 400 }
      );
    }

    console.log(`Receiving chunk ${chunkIndex + 1}/${totalChunks} for upload ${uploadId}`);

    // Get or create upload session
    let session = uploadSessions.get(uploadId);
    if (!session) {
      session = {
        chunks: new Map(),
        metadata: {
          fileName,
          totalChunks,
          uploadId
        },
        createdAt: Date.now()
      };
      uploadSessions.set(uploadId, session);
    }

    // Store chunk data
    const chunkBuffer = await chunk.arrayBuffer();
    session.chunks.set(chunkIndex, chunkBuffer);

    console.log(`Stored chunk ${chunkIndex + 1}/${totalChunks}, session has ${session.chunks.size} chunks`);

    return NextResponse.json({
      success: true,
      uploadId,
      chunkIndex,
      totalChunks,
      receivedChunks: session.chunks.size,
      message: `Chunk ${chunkIndex + 1}/${totalChunks} received`
    });

  } catch (error) {
    console.error('Chunk upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process chunk upload' },
      { status: 500 }
    );
  }
}