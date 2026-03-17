import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { segmentIndices, newSpeakerId, confirmOnly } = await request.json();
    const { user } = await requireProjectOwner(request, projectId, 'speaker_data, user_id');

    if (!projectId || !Array.isArray(segmentIndices)) {
      return NextResponse.json(
        { error: 'Missing required fields: segmentIndices (array)' },
        { status: 400 }
      );
    }

    if (!confirmOnly && !newSpeakerId) {
      return NextResponse.json(
        { error: 'Missing required field: newSpeakerId' },
        { status: 400 }
      );
    }

    if (user.email === process.env.DEMO_EMAIL) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Fetch current project data
    const { data: project, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('speaker_data, user_id')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      console.error('Error fetching project:', fetchError);
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const speakerData = (project as { speaker_data: any; user_id: string }).speaker_data;

    if (!speakerData || !speakerData.segments || !speakerData.speakers) {
      return NextResponse.json(
        { error: 'Invalid speaker data structure' },
        { status: 400 }
      );
    }

    // ─── Confirm-only mode: mark segments as confirmed without changing speaker ───
    if (confirmOnly) {
      const updatedSegments = [...speakerData.segments];
      let confirmedCount = 0;
      for (const index of segmentIndices) {
        if (index >= 0 && index < updatedSegments.length) {
          updatedSegments[index] = {
            ...updatedSegments[index],
            status: 'confirmed' as const,
            confidence: 1.0,
          };
          confirmedCount++;
        }
      }

      const updatedSpeakerData = {
        ...speakerData,
        segments: updatedSegments,
        detectionMetadata: {
          ...speakerData.detectionMetadata,
          lastModified: new Date().toISOString(),
          lastModificationType: 'segment_confirm',
        }
      };

      const { data: savedConfirm, error: updateError } = await supabaseAdmin
        .from('projects')
        // @ts-ignore - Supabase types issue with update
        .update({ speaker_data: updatedSpeakerData })
        .eq('id', projectId)
        .select('speaker_data')
        .single();

      if (updateError || !savedConfirm) {
        console.error('Error saving confirmations (0 rows matched or DB error):', updateError);
        return NextResponse.json({ error: 'Failed to save confirmations' }, { status: 500 });
      }

      return NextResponse.json({ success: true, confirmedCount, updatedSpeakerData: savedConfirm.speaker_data });
    }

    // Verify the target speaker exists
    if (!speakerData.speakers[newSpeakerId]) {
      return NextResponse.json(
        { error: `Speaker ${newSpeakerId} not found` },
        { status: 400 }
      );
    }

    // Update the speakerId for each specified segment
    const updatedSegments = [...speakerData.segments];
    let reassignedCount = 0;

    for (const index of segmentIndices) {
      if (index >= 0 && index < updatedSegments.length) {
        const oldSpeakerId = updatedSegments[index].speakerId;
        if (oldSpeakerId !== newSpeakerId) {
          updatedSegments[index] = {
            ...updatedSegments[index],
            speakerId: newSpeakerId,
            finalSpeakerId: newSpeakerId
          };
          reassignedCount++;
        }
      }
    }

    if (reassignedCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No segments were reassigned (already assigned to target speaker or invalid indices)',
        reassignedCount: 0
      });
    }

    // Clean up speakers that no longer have any segments
    const activeIds = new Set<string>();
    for (const seg of updatedSegments) {
      activeIds.add(seg.finalSpeakerId || seg.speakerId);
    }

    const cleanedSpeakers: Record<string, any> = {};
    for (const id of Object.keys(speakerData.speakers)) {
      if (!activeIds.has(id)) continue; // drop empty speakers
      const ownSegments = updatedSegments.filter(
        s => (s.finalSpeakerId || s.speakerId) === id
      );
      cleanedSpeakers[id] = {
        ...(speakerData.speakers[id] as Record<string, any>),
        segments: ownSegments,
        segmentCount: ownSegments.length,
        totalDuration: ownSegments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0),
      };
    }

    // Update the speaker data with the modified segments
    const updatedSpeakerData = {
      ...speakerData,
      segments: updatedSegments,
      speakers: cleanedSpeakers,
      detectionMetadata: {
        ...speakerData.detectionMetadata,
        totalSpeakers: Object.keys(cleanedSpeakers).length,
        lastModified: new Date().toISOString(),
        lastModificationType: 'segment_reassignment'
      }
    };

    // Save to database
    const { data: saved, error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-ignore - Supabase types issue with update
      .update({ speaker_data: updatedSpeakerData })
      .eq('id', projectId)
      .select('speaker_data')
      .single();

    if (updateError || !saved) {
      console.error('Error saving segment reassignment (0 rows matched or DB error):', updateError);
      return NextResponse.json(
        { error: 'Failed to save segment reassignment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully reassigned ${reassignedCount} segment(s) to ${newSpeakerId}`,
      reassignedCount,
      updatedSpeakerData: saved.speaker_data
    });

  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Segment reassignment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
