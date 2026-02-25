import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  try {
    const { id: projectId, speakerId } = await params;
    const { action, newName, newRole, reassignToSpeakerId } = await request.json();

    if (!projectId || !speakerId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: project, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('speaker_data')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const speakerData = typeof project.speaker_data === 'string'
      ? JSON.parse(project.speaker_data)
      : (project.speaker_data || { speakers: {}, segments: [] });

    if (!speakerData.speakers?.[speakerId]) {
      return NextResponse.json({ error: 'Speaker not found' }, { status: 404 });
    }

    const speaker = speakerData.speakers[speakerId];

    if (action === 'rename') {
      if (!newName?.trim()) {
        return NextResponse.json({ error: 'newName is required' }, { status: 400 });
      }
      speakerData.speakers[speakerId] = {
        ...speaker,
        finalName: newName.trim(),
        customName: newName.trim(),
        fallbackName: newName.trim(),
      };
    } else if (action === 'set_role') {
      if (!newRole) {
        return NextResponse.json({ error: 'newRole is required' }, { status: 400 });
      }
      speakerData.speakers[speakerId] = {
        ...speaker,
        role: newRole,
      };
    } else if (action === 'reassign') {
      if (!reassignToSpeakerId) {
        return NextResponse.json({ error: 'reassignToSpeakerId is required' }, { status: 400 });
      }
      if (!speakerData.speakers[reassignToSpeakerId]) {
        return NextResponse.json({ error: 'Target speaker not found' }, { status: 404 });
      }
      const updatedSegments = (speakerData.segments || []).map((seg: any) => {
        const segSpeakerId = seg.finalSpeakerId || seg.speakerId;
        if (segSpeakerId === speakerId) {
          return { ...seg, speakerId: reassignToSpeakerId, finalSpeakerId: reassignToSpeakerId };
        }
        return seg;
      });
      const updatedSpeakers: Record<string, any> = {};
      for (const [id, spk] of Object.entries(speakerData.speakers as Record<string, any>)) {
        if (id === speakerId) continue;
        const ownSegments = updatedSegments.filter(
          (s: any) => (s.finalSpeakerId || s.speakerId) === id
        );
        updatedSpeakers[id] = {
          ...spk,
          segmentCount: ownSegments.length,
          totalDuration: ownSegments.reduce(
            (sum: number, s: any) => sum + Math.max(0, (s.endTime || 0) - (s.startTime || 0)),
            0
          ),
        };
      }
      speakerData.segments = updatedSegments;
      speakerData.speakers = updatedSpeakers;
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    speakerData.detectionMetadata = {
      ...speakerData.detectionMetadata,
      lastModified: new Date().toISOString(),
      lastModificationType: `speaker_${action}`,
    };

    const { data: saved, error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({ speaker_data: speakerData })
      .eq('id', projectId)
      .select('speaker_data')
      .single();

    if (updateError || !saved) {
      console.error('Error updating speaker:', updateError);
      return NextResponse.json({ error: 'Failed to update speaker' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updatedSpeakerData: saved.speaker_data });

  } catch (error) {
    console.error('PATCH speaker error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  try {
    const { id: projectId, speakerId } = await params;
    const { action, reassignToSpeakerId } = await request.json();

    if (!projectId || !speakerId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (action === 'reassign' && !reassignToSpeakerId) {
      return NextResponse.json({ error: 'Missing reassignToSpeakerId' }, { status: 400 });
    }

    const { data: project, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('speaker_data')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const speakerData = typeof project.speaker_data === 'string'
      ? JSON.parse(project.speaker_data)
      : (project.speaker_data || { speakers: {}, segments: [] });

    if (!speakerData.speakers?.[speakerId]) {
      return NextResponse.json({ error: 'Speaker not found' }, { status: 404 });
    }
    if (action === 'reassign' && !speakerData.speakers[reassignToSpeakerId]) {
      return NextResponse.json({ error: 'Target speaker not found' }, { status: 404 });
    }

    let updatedSegments: any[] = [...(speakerData.segments || [])];

    if (action === 'reassign') {
      updatedSegments = updatedSegments.map((seg: any) => {
        const segSpeakerId = seg.finalSpeakerId || seg.speakerId;
        if (segSpeakerId === speakerId) {
          return { ...seg, speakerId: reassignToSpeakerId, finalSpeakerId: reassignToSpeakerId };
        }
        return seg;
      });
    } else {
      updatedSegments = updatedSegments.filter(
        (seg: any) => (seg.finalSpeakerId || seg.speakerId) !== speakerId
      );
    }

    // Rebuild speakers map without the deleted speaker, with updated counts
    const updatedSpeakers: Record<string, any> = {};
    for (const [id, spk] of Object.entries(speakerData.speakers as Record<string, any>)) {
      if (id === speakerId) continue;
      const ownSegments = updatedSegments.filter(
        (s: any) => (s.finalSpeakerId || s.speakerId) === id
      );
      updatedSpeakers[id] = {
        ...spk,
        segmentCount: ownSegments.length,
        totalDuration: ownSegments.reduce(
          (sum: number, s: any) => sum + Math.max(0, (s.endTime || 0) - (s.startTime || 0)),
          0
        ),
      };
    }

    const updatedSpeakerData = {
      ...speakerData,
      segments: updatedSegments,
      speakers: updatedSpeakers,
      detectionMetadata: {
        ...speakerData.detectionMetadata,
        totalSpeakers: Object.keys(updatedSpeakers).length,
        lastModified: new Date().toISOString(),
        lastModificationType: 'speaker_delete',
      },
    };

    const { data: savedDelete, error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({ speaker_data: updatedSpeakerData })
      .eq('id', projectId)
      .select('speaker_data')
      .single();

    if (updateError || !savedDelete) {
      console.error('Error deleting speaker (0 rows matched or DB error):', updateError);
      return NextResponse.json({ error: 'Failed to delete speaker' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updatedSpeakerData: savedDelete.speaker_data });

  } catch (error) {
    console.error('Delete speaker error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
