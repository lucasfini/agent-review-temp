import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { ContentBlock } from '@/lib/content-types';
import { initializeGenerationProgress } from '@/lib/generation-progress';
import { aiRatelimit } from '@/lib/rate-limit';
import { getInternalJobToken } from '@/lib/internal-job-auth';
import { getInternalAppBaseUrl } from '@/lib/app-url';
import { scheduleBackgroundTask } from '@/lib/background-task';
import { calculateBlocksCost, getContentTypeById } from '@/lib/content-types';
import { requireSufficientCredit } from '@/lib/billing/track-usage';
import { InsufficientCreditError } from '@/lib/billing/credit';
import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import {
  runEntitlementGuard,
  shouldEnforceSubscriptionEntitlements,
} from '@/lib/billing/entitlement-guards';
import { resolveOrganizationIdForWrite } from '@/lib/authz/organization-context';
import {
  GenerationContextValidationError,
  hasGenerationContextIds,
  readGenerationContextIds,
  resolveGenerationContext,
} from '@/lib/generation-context';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { projectId, blocks, estimatedCost, selectedModelId } = payload;
    const generationContextIds = readGenerationContextIds(payload);

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
    let user: { id: string; email?: string | null };
    let project: {
      id: string;
      user_id: string;
      transcription_text: string;
      status: string;
      organization_id: string | null;
    };
    try {
      const ownership = await requireProjectOwner<{
        transcription_text: string;
        status: string;
        organization_id: string | null;
      }>(request, projectId, 'id, user_id, transcription_text, status, organization_id');
      user = ownership.user;
      project = ownership.project;
    } catch (error) {
      if (error instanceof RouteAccessError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }

    if (!project.transcription_text) {
      return NextResponse.json(
        { error: 'Project transcription not available' },
        { status: 400 }
      );
    }

    // Validate all blocks reference known content types
    for (const block of blocks as ContentBlock[]) {
      const contentType = getContentTypeById(block.contentTypeId);
      if (!contentType) {
        return NextResponse.json({ error: `Unknown content type: ${block.contentTypeId}` }, { status: 400 });
      }
    }

    if (hasGenerationContextIds(generationContextIds)) {
      const generationOrganizationId = project.organization_id || await resolveOrganizationIdForWrite(project.user_id);
      try {
        await resolveGenerationContext(supabaseAdmin, generationOrganizationId, generationContextIds);
      } catch (error) {
        if (error instanceof GenerationContextValidationError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    const entitlementOrganizationId = project.organization_id
      || (shouldEnforceSubscriptionEntitlements()
        ? await resolveOrganizationIdForWrite(project.user_id)
        : null);
    const entitlementGuard = await runEntitlementGuard({
      organizationId: entitlementOrganizationId,
      legacyUserId: project.user_id,
      action: 'content_generation',
      requestedAmount: blocks.filter((block: ContentBlock) => block.enabled !== false).length || blocks.length,
      logContext: {
        route: 'app/api/generate-selected-content',
        userId: user.id,
        projectId,
        metadata: {
          blockCount: blocks.length,
        },
      },
    });
    if (entitlementGuard.response) {
      return entitlementGuard.response;
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
          modelId: selectedModelId,
          brand_voice_id: generationContextIds.brandVoiceId || undefined,
          campaign_id: generationContextIds.campaignId || undefined,
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
    if (error instanceof GenerationContextValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[GENERATE-SELECTED] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start content generation' },
      { status: 500 }
    );
  }
}
