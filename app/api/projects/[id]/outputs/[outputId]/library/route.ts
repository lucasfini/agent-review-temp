import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireProjectOwner } from '@/lib/api/route-auth';
import { can } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  CampaignLibraryValidationError,
  createContentLibraryItem,
  decorateContentLibraryItemAccess,
  mapContentLibraryItemRow,
  updateContentLibraryItem,
  type ContentLibraryItem,
  type ContentLibraryItemInput,
  type ContentLibraryItemRow,
} from '@/lib/campaigns-content-library';
import { isDemoUser } from '@/lib/demo-mode';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import { createResourceVersion } from '@/lib/resource-versions';
import { requireStudioAssetContext } from '@/lib/studio-assets';
import { supabaseAdmin } from '@/lib/supabase/server';
import { notifyAddedToLibrary } from '@/lib/notifications/notification-events';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ProjectForSave = {
  title?: string | null;
};

type OutputForSave = {
  id: string;
  type: string | null;
  platform: string | null;
  title: string | null;
  content: unknown;
  status: string | null;
  created_at: string | null;
  metadata?: unknown;
};

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CampaignLibraryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[PROJECT_OUTPUT_LIBRARY_SAVE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function normalizeRequiredId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMetadataObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function truncateText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function uniqueTags(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    tags.push(normalized);
  }

  return tags.slice(0, 16);
}

function buildLibraryPayload(params: {
  projectId: string;
  project: ProjectForSave;
  output: OutputForSave;
  libraryId: string;
}): ContentLibraryItemInput {
  const metadata = normalizeMetadataObject(params.output.metadata);
  const generationContext = normalizeMetadataObject(metadata.generationContext || metadata.generation_context);
  const contentType = truncateText(
    metadata.originalOutputType || metadata.original_output_type || params.output.type,
    240
  ) || 'generated_content';
  const platform = truncateText(params.output.platform || metadata.platform || null, 240);
  const body = stringifyContent(params.output.content);
  const title = truncateText(params.output.title || `${platform || contentType} output`, 160) || 'Generated content';

  return {
    title,
    contentType,
    platform,
    status: 'draft',
    body,
    excerpt: truncateText(body, 500),
    sourceLabel: params.project.title ? `Project: ${params.project.title}` : 'Project output',
    tags: uniqueTags([
      contentType,
      platform,
      metadata.platform,
      metadata.theme,
      generationContext.creatorProfileName,
      generationContext.campaignName,
      generationContext.brandVoiceName,
      generationContext.libraryName,
    ]),
    metadata: {
      source: 'project_output_save',
      legacy_output_id: params.output.id,
      legacy_output_type: params.output.type,
      original_output_type: metadata.originalOutputType || metadata.original_output_type || params.output.type,
      generation_context: generationContext,
      output_metadata: metadata,
    },
    generationContextSnapshot: Object.keys(generationContext).length > 0 ? generationContext : {},
    campaignId: typeof generationContext.campaignId === 'string' ? generationContext.campaignId : null,
    brandVoiceId: typeof generationContext.brandVoiceId === 'string' ? generationContext.brandVoiceId : null,
    creatorProfileId: typeof generationContext.creatorProfileId === 'string' ? generationContext.creatorProfileId : null,
    libraryId: params.libraryId,
    projectId: params.projectId,
    outputId: params.output.id,
    locked: false,
  };
}

function buildVersionSnapshot(item: ContentLibraryItem) {
  return {
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    platform: item.platform,
    status: item.status,
    excerpt: item.excerpt,
    body: item.body,
    sourceLabel: item.sourceLabel,
    tags: item.tags,
    libraryId: item.libraryId,
    campaignId: item.campaignId,
    creatorProfileId: item.creatorProfileId,
    brandVoiceId: item.brandVoiceId,
    projectId: item.projectId,
    outputId: item.outputId,
    publishedAt: item.publishedAt,
    scheduledFor: item.scheduledFor || null,
    approvedByUserId: item.approvedByUserId || null,
    approvedAt: item.approvedAt || null,
    generationContextSnapshot: item.generationContextSnapshot || {},
    ownerUserId: item.ownerUserId || null,
    locked: Boolean(item.locked),
    metadata: item.metadata || {},
    updatedAt: item.updatedAt,
  };
}

async function recordSaveHistory(params: {
  item: ContentLibraryItem;
  previousItem?: ContentLibraryItem | null;
  userId: string;
  organizationId: string;
}) {
  await recordOrganizationAuditLog({
    supabase: supabaseAdmin,
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: params.previousItem ? 'library_item.updated' : 'library_item.created',
    resourceType: 'library_item',
    resourceId: params.item.id,
    metadata: {
      source: 'project_output_save',
      title: params.item.title,
      contentType: params.item.contentType,
      status: params.item.status,
      platform: params.item.platform,
      libraryId: params.item.libraryId,
      projectId: params.item.projectId,
      outputId: params.item.outputId,
    },
  });

  if (!params.previousItem) {
    await notifyAddedToLibrary({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      name: params.item.title,
      projectId: params.item.projectId,
      idempotencyKey: `library_item_added:${params.item.id}`,
      metadata: {
        itemId: params.item.id,
        contentType: params.item.contentType,
        status: params.item.status,
        platform: params.item.platform,
        libraryId: params.item.libraryId,
        projectId: params.item.projectId,
        outputId: params.item.outputId,
      },
    });
  }

  try {
    await createResourceVersion({
      supabase: supabaseAdmin,
      organizationId: params.organizationId,
      resourceType: 'library_item',
      resourceId: params.item.id,
      changedByUserId: params.userId,
      changeSummary: params.previousItem ? 'Saved output to collection' : 'Created from project output',
      snapshot: buildVersionSnapshot(params.item) as any,
      previousSnapshot: params.previousItem ? buildVersionSnapshot(params.previousItem) as any : null,
    });
  } catch (versionError) {
    console.error('[PROJECT_OUTPUT_LIBRARY_SAVE] Failed to create resource version:', versionError);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; outputId: string }> }
) {
  try {
    const { id: projectId, outputId } = await params;
    const body = await request.json().catch(() => ({}));
    const libraryId = normalizeRequiredId(body.libraryId ?? body.library_id);

    if (!projectId || !outputId) {
      return NextResponse.json({ error: 'Project ID and output ID are required' }, { status: 400 });
    }
    if (!libraryId) {
      return NextResponse.json({ error: 'Choose a library collection' }, { status: 400 });
    }

    const [{ user, project }, context] = await Promise.all([
      requireProjectOwner<ProjectForSave>(request, projectId, 'id, user_id, organization_id, title'),
      requireStudioAssetContext(request, {
        requestedOrganizationId: requestedOrganizationIdFrom(request, body),
      }),
    ]);

    if (context.user.id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (project.organization_id && project.organization_id !== context.activeOrganizationId) {
      return NextResponse.json({ error: 'Project belongs to a different workspace' }, { status: 403 });
    }

    const permissionContext = {
      userId: user.id,
      organizationId: context.activeOrganizationId,
      organizationType: context.organization.type,
      role: context.membership.role,
      isDemo: isDemoUser(user),
    };

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const { data: output, error: outputError } = await supabaseAdmin
      .from('outputs')
      .select('id,type,platform,title,content,status,created_at,metadata')
      .eq('id', outputId)
      .eq('project_id', projectId)
      .maybeSingle() as { data: OutputForSave | null; error: any };

    if (outputError) {
      throw new Error(outputError.message || 'Failed to load output');
    }
    if (!output) {
      return NextResponse.json({ error: 'Output not found' }, { status: 404 });
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('content_library_items')
      .select('*')
      .eq('organization_id', context.activeOrganizationId)
      .eq('output_id', outputId)
      .is('client_id', null)
      .order('created_at', { ascending: true })
      .limit(1) as { data: ContentLibraryItemRow[] | null; error: any };

    if (existingError) {
      throw new Error(existingError.message || 'Failed to load saved library item');
    }

    const existingItem = existingRows?.[0] ? mapContentLibraryItemRow(existingRows[0]) : null;

    if (existingItem) {
      const decorated = decorateContentLibraryItemAccess(existingItem, {
        organizationId: context.activeOrganizationId,
        userId: user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      });

      if (!decorated.canEdit) {
        return NextResponse.json({ error: 'You do not have permission to update this draft' }, { status: 403 });
      }

      const contentItem = await updateContentLibraryItem(
        supabaseAdmin,
        context.activeOrganizationId,
        existingItem.id,
        { libraryId },
        { referenceOrganizationIds: context.organizationIds }
      );

      if (!contentItem) {
        return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
      }

      await recordSaveHistory({
        item: contentItem,
        previousItem: existingItem,
        userId: user.id,
        organizationId: context.activeOrganizationId,
      });

      return NextResponse.json({ success: true, contentItem });
    }

    if (!can(permissionContext, 'library_item.create', { organizationId: context.activeOrganizationId, visibility: 'workspace' })) {
      return NextResponse.json({ error: 'You do not have permission to create drafts' }, { status: 403 });
    }

    const contentItem = await createContentLibraryItem(
      supabaseAdmin,
      context.activeOrganizationId,
      user.id,
      buildLibraryPayload({
        projectId,
        project,
        output,
        libraryId,
      }),
      { referenceOrganizationIds: context.organizationIds }
    );

    await recordSaveHistory({
      item: contentItem,
      previousItem: null,
      userId: user.id,
      organizationId: context.activeOrganizationId,
    });

    return NextResponse.json({ success: true, contentItem }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to save output to library');
  }
}
