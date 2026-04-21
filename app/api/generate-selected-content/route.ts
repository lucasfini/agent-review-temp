import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isDemoUser } from '@/lib/demo-mode';
import type { ContentBlock } from '@/lib/content-types';
import { initializeGenerationProgress } from '@/lib/generation-progress';
import { aiRatelimit } from '@/lib/rate-limit';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { scheduleBackgroundTask } from '@/lib/background-task';
import { calculateBlocksCost, getContentTypeById } from '@/lib/content-types';
import { requireSufficientCredit } from '@/lib/billing/track-usage';
import { InsufficientCreditError } from '@/lib/billing/credit';

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

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the project with transcription
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription_text, status, user_id')
      .eq('id', projectId)
      .single() as { data: { transcription_text: string; status: string; user_id: string } | null; error: any };

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

    // Ownership check
    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Demo account guard
    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    // Validate all blocks reference known content types
    for (const block of blocks as ContentBlock[]) {
      const contentType = getContentTypeById(block.contentTypeId);
      if (!contentType) {
        return NextResponse.json({ error: `Unknown content type: ${block.contentTypeId}` }, { status: 400 });
      }
    }

    try {
      await requireSufficientCredit(user.id, calculateBlocksCost(blocks));
    } catch (error) {
      if (error instanceof InsufficientCreditError) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            code: 'INSUFFICIENT_CREDITS',
            required: error.required,
            available: error.available,
            shortfall: error.required - error.available,
          },
          { status: 402 }
        );
      }
      throw error;
    }

    const { success } = await aiRatelimit.limit(user.id);
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded for AI operations. Please wait a moment.' }, { status: 429 });
    }

    // Extract unique content type IDs for database tracking
    const selectedContentTypes = Array.from(
      new Set(blocks.map((b: ContentBlock) => b.contentTypeId))
    );

    // Update project with selected content types
    const { error: updateError } = await supabaseAdmin
      .from('projects')
      // @ts-ignore - Supabase types issue with update
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
    const baseUrl = getInternalAppBaseUrl();

    const internalJobToken = getInternalJobToken();
    const generationHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (internalJobToken) {
      generationHeaders['x-internal-job-token'] = internalJobToken;
    }

    scheduleBackgroundTask(
      fetch(`${baseUrl}/api/generate-content`, {
        method: 'POST',
        headers: generationHeaders,
        signal: AbortSignal.timeout(15 * 60 * 1000),
        body: JSON.stringify({
          projectId,
          transcription: project.transcription_text,
          blocks, // Send blocks instead of selectedContentTypes
          segments: [],
          modelId: selectedModelId
        })
      }).catch(error => {
        const timeoutCode = (error as any)?.cause?.code;
        if (timeoutCode === 'UND_ERR_HEADERS_TIMEOUT') {
          console.warn('[GENERATE-SELECTED] Background generation request exceeded header wait timeout, but generation may still be running server-side.');
          return;
        }
        console.error('[GENERATE-SELECTED] Failed to start content generation:', error);
      })
    );

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
