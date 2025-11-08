import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { calculateCostEstimate } from '@/lib/cost-estimation';

export async function POST(request: NextRequest) {
  try {
    const { projectId, selectedContentTypes, estimatedCost } = await request.json();

    if (!projectId || !selectedContentTypes || selectedContentTypes.length === 0) {
      return NextResponse.json(
        { error: 'Project ID and selected content types are required' },
        { status: 400 }
      );
    }

    console.log(`Starting selected content generation for project ${projectId}`);
    console.log(`Selected types:`, selectedContentTypes);

    // Get the project with transcription
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription_text, status')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (!project.transcription_text) {
      return NextResponse.json(
        { error: 'Project transcription not available' },
        { status: 400 }
      );
    }

    // Update project with selected content types and start generation
    // Note: content_generation_started_at column may not exist yet
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      .update({
        selected_content_types: selectedContentTypes
        // Note: estimated_cost column removed to prevent database errors
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('Failed to update project:', updateError);
    }

    // Start content generation process (async)
    fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        transcription: project.transcription_text,
        selectedContentTypes,
        segments: []
      })
    }).catch(error => {
      console.error('Failed to start content generation:', error);
    });

    return NextResponse.json({
      success: true,
      projectId,
      selectedTypes: selectedContentTypes,
      estimatedCost,
      message: 'Content generation started with selected types'
    });

  } catch (error) {
    console.error('Selected content generation error:', error);
    return NextResponse.json(
      { error: 'Failed to start content generation' },
      { status: 500 }
    );
  }
}