import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { ContentBlock } from '@/lib/content-types';
import { initializeGenerationProgress } from '@/lib/generation-progress';

export async function POST(request: NextRequest) {
  try {
    const { projectId, blocks, estimatedCost, selectedModelId } = await request.json();

    if (!projectId || !blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json(
        { error: 'Project ID and content blocks are required' },
        { status: 400 }
      );
    }

    console.log(`[GENERATE-SELECTED] Starting for project ${projectId} with ${blocks.length} blocks`);

    // Get the project with transcription
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription_text, status')
      .eq('id', projectId)
      .single() as { data: { transcription_text: string; status: string } | null; error: any };

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

    // Extract unique content type IDs for database tracking
    const selectedContentTypes = Array.from(
      new Set(blocks.map((b: ContentBlock) => b.contentTypeId))
    );

    // Update project with selected content types
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-expect-error - Supabase types issue with update
      .update({
        selected_content_types: selectedContentTypes
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('[GENERATE-SELECTED] Failed to update project:', updateError);
    }

    // Pre-create the progress row so the client polling loop doesn't falsely
    // conclude "completed" before /api/generate-content has booted and inserted its own row.
    await initializeGenerationProgress(projectId, blocks.length);

    // Start content generation process (async)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    fetch(`${baseUrl}/api/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        transcription: project.transcription_text,
        blocks, // Send blocks instead of selectedContentTypes
        segments: [],
        modelId: selectedModelId
      })
    }).catch(error => {
      console.error('[GENERATE-SELECTED] Failed to start content generation:', error);
    });

    return NextResponse.json({
      success: true,
      projectId,
      blocksCount: blocks.length,
      contentTypes: selectedContentTypes,
      estimatedCost,
      message: 'Content generation started'
    });

  } catch (error) {
    console.error('[GENERATE-SELECTED] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start content generation' },
      { status: 500 }
    );
  }
}
