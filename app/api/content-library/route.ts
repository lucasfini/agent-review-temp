import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { can, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  CampaignLibraryValidationError,
  createContentLibraryItem,
  decorateContentLibraryItemAccess,
  listContentLibraryItems,
} from '@/lib/campaigns-content-library';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import { createResourceVersion } from '@/lib/resource-versions';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CampaignLibraryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[CONTENT_LIBRARY] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function buildVersionSnapshot(item: any) {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { user, organization, membership, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const rawLimit = Number(searchParams.get('limit') || '100');
    const contentItems = await listContentLibraryItems(supabaseAdmin, organization.id, {
      campaignId: searchParams.get('campaign_id'),
      libraryId: searchParams.get('library_id'),
      creatorProfileId: searchParams.get('creator_profile_id'),
      status: searchParams.get('status'),
      limit: Number.isFinite(rawLimit) ? rawLimit : 100,
    });

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      membership: {
        role: membership.role,
        status: membership.status,
        canManageCampaignLibrary: can(permissionContext, 'library_item.create', {
          organizationId: organization.id,
          visibility: 'workspace',
        }),
      },
      contentItems: contentItems.map((item) => decorateContentLibraryItemAccess(item, {
        organizationId: organization.id,
        userId: user.id,
        role: membership.role,
        organizationType: organization.type,
      })),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load content library');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user, organization, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    if (!can(permissionContext, 'library_item.create', { organizationId: organization.id, visibility: 'workspace' })) {
      return NextResponse.json({ error: 'You do not have permission to create drafts' }, { status: 403 });
    }

    const contentItem = await createContentLibraryItem(supabaseAdmin, organization.id, user.id, body);

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'library_item.created',
      resourceType: 'library_item',
      resourceId: contentItem.id,
      metadata: {
        title: contentItem.title,
        contentType: contentItem.contentType,
        status: contentItem.status,
        platform: contentItem.platform,
        libraryId: contentItem.libraryId,
        campaignId: contentItem.campaignId,
      },
    });

    try {
      await createResourceVersion({
        supabase: supabaseAdmin,
        organizationId: organization.id,
        resourceType: 'library_item',
        resourceId: contentItem.id,
        changedByUserId: user.id,
        changeSummary: 'Created draft',
        snapshot: buildVersionSnapshot(contentItem),
        previousSnapshot: null,
      });
    } catch (versionError) {
      console.error('[CONTENT_LIBRARY] Failed to create initial version:', versionError);
    }

    return NextResponse.json({
      success: true,
      contentItem,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create content library item');
  }
}
