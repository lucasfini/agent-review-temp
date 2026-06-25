import { NextRequest, NextResponse } from 'next/server';
import { getProjectFingerprint, decrementReferenceCount } from '@/lib/transcription-cache';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

/**
 * API endpoint to cleanup transcription cache reference when project is deleted
 * POST /api/projects/[id]/cleanup-cache
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    try {
      await requireProjectOwner(request, projectId, 'id');
    } catch (authError) {
      if (authError instanceof RouteAccessError) {
        return NextResponse.json({ error: authError.message }, { status: authError.status });
      }
      throw authError;
    }

    // Get the audio fingerprint for this project
    const fingerprint = await getProjectFingerprint(projectId);

    if (fingerprint) {
      // Decrement the cache reference count (and delete if count reaches 0)
      await decrementReferenceCount(fingerprint);
      console.log(`[CACHE CLEANUP] Decremented reference count for project ${projectId}, fingerprint ${fingerprint}`);

      return NextResponse.json({
        success: true,
        message: 'Cache reference count decremented',
        fingerprint
      });
    } else {
      console.log(`[CACHE CLEANUP] No fingerprint found for project ${projectId}`);
      return NextResponse.json({
        success: true,
        message: 'No cache fingerprint found for this project'
      });
    }
  } catch (error: any) {
    console.error('[CACHE CLEANUP] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup cache' },
      { status: 500 }
    );
  }
}
