import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SpeakerSegment, DetectedSpeaker } from '@/lib/types';

interface SpeakerData {
  segments: SpeakerSegment[];
  speakers: Record<string, DetectedSpeaker>;
  detectionMetadata?: {
    totalSpeakers: number;
    totalSegments: number;
    processedAt: string;
    processingTimeMs: number;
    method: string;
    confidence?: number;
    cost_usd?: number;
  };
}

function sanitizeSpeakerDataForUpdate(speakerData: SpeakerData): SpeakerData {
  if (!speakerData?.detectionMetadata) return speakerData;
  const meta: any = speakerData.detectionMetadata;
  if (!meta.pipelineDiagnostics?.gptRawResponse) return speakerData;

  const raw = String(meta.pipelineDiagnostics.gptRawResponse);
  if (raw.length <= 50_000) return speakerData;

  return {
    ...speakerData,
    detectionMetadata: {
      ...speakerData.detectionMetadata,
      pipelineDiagnostics: {
        ...meta.pipelineDiagnostics,
        gptRawResponse: `${raw.slice(0, 50_000)}…[truncated ${raw.length - 50_000} chars]`
      }
    }
  };
}

/**
 * PATCH /api/projects/[id]/speakers/[speakerId]
 *
 * Update a speaker (rename) or merge into another speaker.
 *
 * Body:
 * - action: 'rename' | 'reassign'
 * - newName?: string (required if action='rename')
 * - reassignToSpeakerId?: string (required if action='reassign')
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  try {
    const { id: projectId, speakerId } = await params;
    const body = await request.json();
    const { action, newName, reassignToSpeakerId } = body;

    if (!action || (action !== 'rename' && action !== 'reassign')) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "rename" or "reassign"' },
        { status: 400 }
      );
    }

    if (action === 'rename' && (!newName || typeof newName !== 'string')) {
      return NextResponse.json(
        { error: 'newName is required when action is "rename"' },
        { status: 400 }
      );
    }

    if (action === 'reassign' && !reassignToSpeakerId) {
      return NextResponse.json(
        { error: 'reassignToSpeakerId is required when action is "reassign"' },
        { status: 400 }
      );
    }

    const { data: project, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('speaker_data')
      .eq('id', projectId)
      .single() as { data: { speaker_data: any } | null; error: any };

    if (fetchError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const rawSpeakerData = project.speaker_data;
    const speakerData = (typeof rawSpeakerData === 'string'
      ? JSON.parse(rawSpeakerData)
      : rawSpeakerData) as SpeakerData;

    if (!speakerData || !speakerData.speakers || !speakerData.segments) {
      return NextResponse.json(
        { error: 'No speaker data found in project' },
        { status: 400 }
      );
    }

    if (!speakerData.speakers[speakerId]) {
      return NextResponse.json(
        { error: `Speaker ${speakerId} not found` },
        { status: 404 }
      );
    }

    if (action === 'reassign' && !speakerData.speakers[reassignToSpeakerId]) {
      return NextResponse.json(
        { error: `Target speaker ${reassignToSpeakerId} not found` },
        { status: 404 }
      );
    }

    if (action === 'rename') {
      speakerData.speakers[speakerId] = {
        ...speakerData.speakers[speakerId],
        finalName: newName,
        customName: newName
      };
    } else {
      const updatedSegments = speakerData.segments.map(segment => {
        if ((segment.finalSpeakerId || segment.speakerId) === speakerId) {
          return {
            ...segment,
            speakerId: reassignToSpeakerId,
            finalSpeakerId: reassignToSpeakerId
          };
        }
        return segment;
      });

      const deletedSpeaker = speakerData.speakers[speakerId];
      if (speakerData.speakers[reassignToSpeakerId]) {
        speakerData.speakers[reassignToSpeakerId].totalDuration += deletedSpeaker.totalDuration;
        speakerData.speakers[reassignToSpeakerId].segments = updatedSegments.filter(
          s => (s.finalSpeakerId || s.speakerId) === reassignToSpeakerId
        );
      }

      const { [speakerId]: removed, ...remainingSpeakers } = speakerData.speakers;
      speakerData.segments = updatedSegments;
      speakerData.speakers = remainingSpeakers;
      speakerData.detectionMetadata = {
        ...speakerData.detectionMetadata,
        totalSpeakers: Object.keys(remainingSpeakers).length,
        totalSegments: updatedSegments.length,
        processedAt: new Date().toISOString(),
        processingTimeMs: speakerData.detectionMetadata?.processingTimeMs || 0,
        method: speakerData.detectionMetadata?.method || 'unknown'
      };
    }

    const sanitizedSpeakerData = sanitizeSpeakerDataForUpdate(speakerData);

    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({
        speaker_data: sanitizedSpeakerData
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('Error updating speaker data:', updateError);
      return NextResponse.json(
        { error: 'Failed to update speaker data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      speakerId,
      reassignToSpeakerId: action === 'reassign' ? reassignToSpeakerId : undefined
    });
  } catch (error) {
    console.error('Speaker update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/speakers/[speakerId]
 *
 * Delete a speaker and handle their segments
 *
 * Body:
 * - action: 'delete' | 'reassign'
 * - reassignToSpeakerId?: string (required if action='reassign')
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; speakerId: string }> }
) {
  try {
    const { id: projectId, speakerId } = await params;
    const body = await request.json();
    const { action, reassignToSpeakerId } = body;

    // Validate input
    if (!action || (action !== 'delete' && action !== 'reassign')) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "delete" or "reassign"' },
        { status: 400 }
      );
    }

    if (action === 'reassign' && !reassignToSpeakerId) {
      return NextResponse.json(
        { error: 'reassignToSpeakerId is required when action is "reassign"' },
        { status: 400 }
      );
    }

    // Fetch current project data
    const { data: project, error: fetchError } = await supabaseAdmin
      .from('projects')
      .select('speaker_data')
      .eq('id', projectId)
      .single() as { data: { speaker_data: any } | null; error: any };

    if (fetchError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const rawSpeakerData = project.speaker_data;
    const speakerData = (typeof rawSpeakerData === 'string'
      ? JSON.parse(rawSpeakerData)
      : rawSpeakerData) as SpeakerData;

    if (!speakerData || !speakerData.speakers || !speakerData.segments) {
      return NextResponse.json(
        { error: 'No speaker data found in project' },
        { status: 400 }
      );
    }

    // Check if speaker exists
    if (!speakerData.speakers[speakerId]) {
      return NextResponse.json(
        { error: `Speaker ${speakerId} not found` },
        { status: 404 }
      );
    }

    // Check if reassignToSpeakerId exists (if action is reassign)
    if (action === 'reassign' && !speakerData.speakers[reassignToSpeakerId]) {
      return NextResponse.json(
        { error: `Target speaker ${reassignToSpeakerId} not found` },
        { status: 404 }
      );
    }

    // Process segments based on action
    let updatedSegments: SpeakerSegment[];

    if (action === 'delete') {
      // Remove all segments belonging to this speaker
      updatedSegments = speakerData.segments.filter(
        segment => (segment.finalSpeakerId || segment.speakerId) !== speakerId
      );
    } else {
      // Reassign all segments to another speaker
      updatedSegments = speakerData.segments.map(segment => {
        if ((segment.finalSpeakerId || segment.speakerId) === speakerId) {
          return {
            ...segment,
            speakerId: reassignToSpeakerId,
            finalSpeakerId: reassignToSpeakerId
          };
        }
        return segment;
      });

      // Update reassignToSpeaker's totalDuration
      const deletedSpeaker = speakerData.speakers[speakerId];
      if (speakerData.speakers[reassignToSpeakerId]) {
        speakerData.speakers[reassignToSpeakerId].totalDuration += deletedSpeaker.totalDuration;
        speakerData.speakers[reassignToSpeakerId].segments = updatedSegments.filter(
          s => (s.finalSpeakerId || s.speakerId) === reassignToSpeakerId
        );
      }
    }

    // Remove the deleted speaker from speakers record
    const { [speakerId]: deletedSpeaker, ...remainingSpeakers } = speakerData.speakers;

    // Update metadata
    const updatedMetadata = {
      ...speakerData.detectionMetadata,
      totalSpeakers: Object.keys(remainingSpeakers).length,
      totalSegments: updatedSegments.length,
      processedAt: new Date().toISOString(),
      processingTimeMs: speakerData.detectionMetadata?.processingTimeMs || 0,
      method: speakerData.detectionMetadata?.method || 'unknown'
    };

    // Build updated speaker data
    const updatedSpeakerData: SpeakerData = {
      segments: updatedSegments,
      speakers: remainingSpeakers,
      detectionMetadata: updatedMetadata
    };

    const sanitizedSpeakerData = sanitizeSpeakerDataForUpdate(updatedSpeakerData);

    // Save to database
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({
        speaker_data: sanitizedSpeakerData
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('Error updating speaker data:', updateError);
      return NextResponse.json(
        { error: 'Failed to delete speaker' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: action === 'delete'
        ? `Speaker ${speakerId} deleted and ${speakerData.segments.filter(s => (s.finalSpeakerId || s.speakerId) === speakerId).length} segments removed`
        : `Speaker ${speakerId} deleted and ${speakerData.segments.filter(s => (s.finalSpeakerId || s.speakerId) === speakerId).length} segments reassigned to ${reassignToSpeakerId}`,
      deletedSpeaker: speakerId,
      action,
      remainingSpeakers: Object.keys(remainingSpeakers).length,
      remainingSegments: updatedSegments.length,
      updatedSpeakerData: sanitizedSpeakerData
    });

  } catch (error) {
    console.error('Speaker deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
