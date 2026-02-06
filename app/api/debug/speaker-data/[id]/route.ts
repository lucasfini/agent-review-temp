import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function countBy<T extends string>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return counts;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase().trim();

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('speaker_data, status, title, project_type')
      .eq('id', projectId)
      .single() as { data: any; error: any };

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const speakerData = project.speaker_data;
    if (!speakerData || !speakerData.segments) {
      return NextResponse.json({
        projectId,
        status: project.status,
        title: project.title,
        projectType: project.project_type,
        error: 'No speaker_data or segments found'
      });
    }

    const segments = Array.isArray(speakerData.segments) ? speakerData.segments : [];
    const initialIds = segments.map((s: any) => s.initialSpeakerId || s.speakerId || 'unknown');
    const finalIds = segments.map((s: any) => s.finalSpeakerId || s.speakerId || 'unknown');

    const missingFinal = segments.filter((s: any) => !s.finalSpeakerId).length;

    const speakerKeys = speakerData.speakers ? Object.keys(speakerData.speakers) : [];
    const finalCounts = countBy(finalIds);
    const speakersSummary = speakerKeys.map((id) => {
      const entry = speakerData.speakers?.[id] || {};
      return {
        id,
        finalName: entry.finalName || entry.customName || entry.extractedName?.name || entry.fallbackName,
        role: entry.role,
        source: entry.source,
        segmentCount: finalCounts[id] || 0,
        seededOnly: entry.seededOnly || false,
      };
    }).sort((a, b) => b.segmentCount - a.segmentCount);
    let matchingSegments: Array<any> | undefined;
    if (query) {
      matchingSegments = segments
        .filter((s: any) => (s.text || '').toLowerCase().includes(query))
        .slice(0, 10)
        .map((s: any) => {
          const finalId = s.finalSpeakerId || s.speakerId;
          const speaker = speakerData.speakers?.[finalId] || {};
          const name =
            speaker.finalName ||
            speaker.customName ||
            speaker.extractedName?.name ||
            speaker.fallbackName ||
            speaker.name ||
            finalId;
          return {
            text: s.text,
            speakerId: s.speakerId,
            finalSpeakerId: s.finalSpeakerId,
            name,
            startTime: s.startTime,
            endTime: s.endTime,
            status: s.status,
            confidence: s.confidence
          };
        });
    }

    return NextResponse.json({
      projectId,
      status: project.status,
      title: project.title,
      projectType: project.project_type,
      segmentCount: segments.length,
      speakerCount: speakerKeys.length,
      speakerKeys,
      speakersSummary,
      counts: {
        initial: countBy(initialIds),
        final: finalCounts,
        missingFinalSpeakerId: missingFinal,
      },
      detectionMetadata: speakerData.detectionMetadata,
      sampleSegments: segments.slice(0, 3),
      ...(query ? { query, matchingSegments } : {})
    });
  } catch (error) {
    console.error('[DEBUG] speaker-data failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
