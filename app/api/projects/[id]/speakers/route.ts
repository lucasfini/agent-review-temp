import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import { isDemoUser } from '@/lib/demo-mode';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { name, role } = await request.json();
    const { user } = await requireProjectOwner(request, projectId, 'speaker_data');

    if (!projectId || !name?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Fetch current speaker data
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

    const speakerId = `manual_${Date.now()}`;
    speakerData.speakers = speakerData.speakers || {};
    speakerData.speakers[speakerId] = {
      finalName: name.trim(),
      customName: name.trim(),
      fallbackName: name.trim(),
      role: role || 'unknown',
      segments: [],
      segmentCount: 0,
      totalDuration: 0,
      source: 'manual',
    };

    const { data: savedAdd, error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-ignore - Supabase types issue with update
      .update({ speaker_data: speakerData })
      .eq('id', projectId)
      .select('speaker_data')
      .single();

    if (updateError || !savedAdd) {
      console.error('Error adding speaker (0 rows matched or DB error):', updateError);
      return NextResponse.json({ error: 'Failed to add speaker' }, { status: 500 });
    }

    return NextResponse.json({ success: true, speakerId, updatedSpeakerData: savedAdd.speaker_data });

  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Add speaker error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { speakerId, newName, speakerData } = await request.json();
    const { user } = await requireProjectOwner(request, projectId);

    if (!projectId || !speakerId || !newName || !speakerData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Update the speaker data in the database
    const { error } = await supabaseAdmin
      .from('projects')
      // @ts-ignore - Supabase types issue with update
      .update({
        speaker_data: speakerData
      })
      .eq('id', projectId);

    if (error) {
      console.error('Error updating speaker data:', error);
      return NextResponse.json(
        { error: 'Failed to update speaker name' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Speaker name updated successfully'
    });

  } catch (error) {
    if (error instanceof RouteAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Speaker update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
