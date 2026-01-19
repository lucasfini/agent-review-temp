import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { speakerId, newName, speakerData } = await request.json();

    if (!projectId || !speakerId || !newName || !speakerData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Update the speaker data in the database
    const { error } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
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
    console.error('Speaker update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
