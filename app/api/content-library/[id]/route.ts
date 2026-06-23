import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { can, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  CampaignLibraryValidationError,
  decorateContentLibraryItemAccess,
  getCampaign,
  deleteContentLibraryItem,
  getContentLibraryItem,
  updateContentLibraryItem,
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

  console.error('[CONTENT_LIBRARY_DETAIL] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

const CONTENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['draft', 'in_review', 'archived'],
  in_review: ['draft', 'in_review', 'approved', 'archived'],
  approved: ['approved', 'scheduled', 'published', 'archived'],
  scheduled: ['scheduled', 'published', 'archived'],
  published: ['published'],
  archived: ['archived', 'draft'],
  needs_revision: ['needs_revision', 'draft', 'in_review', 'archived'],
};

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

function getChangedFields(previousSnapshot: Record<string, unknown>, nextSnapshot: Record<string, unknown>): string[] {
  const changed = new Set<string>();
  for (const key of new Set([...Object.keys(previousSnapshot), ...Object.keys(nextSnapshot)])) {
    if (JSON.stringify(previousSnapshot[key]) !== JSON.stringify(nextSnapshot[key])) {
      changed.add(key);
    }
  }
  return Array.from(changed);
}

function getAuditAction(previousStatus: string, nextStatus: string): string {
  if (previousStatus !== nextStatus) {
    if (nextStatus === 'in_review') return 'library_item.submitted_for_review';
    if (nextStatus === 'approved') return 'library_item.approved';
    if (nextStatus === 'scheduled') return 'library_item.scheduled';
    if (nextStatus === 'published') return 'library_item.published';
    if (nextStatus === 'archived') return 'library_item.archived';
  }
  return 'library_item.updated';
}

function getChangeSummary(previousStatus: string, nextStatus: string, changedFields: string[]): string {
  if (previousStatus !== nextStatus) {
    return `Status changed from ${previousStatus} to ${nextStatus}`;
  }
  if (changedFields.length === 0) {
    return 'Updated draft';
  }
  return `Updated ${changedFields.slice(0, 4).join(', ')}`;
}

async function getApprovalRequiredForItem(
  organizationId: string,
  existingItem: any,
  body: Record<string, unknown>
): Promise<boolean> {
  const nextCampaignId = typeof body.campaignId === 'string'
    ? body.campaignId
    : typeof body.campaign_id === 'string'
      ? body.campaign_id
      : existingItem.campaignId;

  if (!nextCampaignId) return false;
  const campaign = await getCampaign(supabaseAdmin, organizationId, nextCampaignId);
  return Boolean(campaign?.approvalRequired);
}

function applyStatusWorkflow(params: {
  body: Record<string, unknown>;
  existingItem: any;
  role: string;
  userId: string;
  approvalRequired: boolean;
}) {
  const now = new Date().toISOString();
  const nextBody: Record<string, unknown> = { ...params.body };
  const nextStatus = typeof nextBody.status === 'string' ? nextBody.status : params.existingItem.status;
  const currentStatus = params.existingItem.status;
  const allowedStatuses = CONTENT_STATUS_TRANSITIONS[currentStatus] || [currentStatus];

  if (!allowedStatuses.includes(nextStatus)) {
    throw new CampaignLibraryValidationError(`Cannot move draft from ${currentStatus} to ${nextStatus}`);
  }

  if (
    params.role === 'editor'
    && (nextStatus === 'approved' || nextStatus === 'scheduled' || nextStatus === 'published')
  ) {
    throw new CampaignLibraryValidationError(
      params.approvalRequired
        ? 'This draft requires owner or admin approval before it can be approved or published'
        : 'Editors cannot approve or publish drafts'
    );
  }

  if (nextStatus === 'scheduled') {
    const scheduledFor = nextBody.scheduledFor ?? nextBody.scheduled_for ?? params.existingItem.scheduledFor;
    if (!scheduledFor) {
      throw new CampaignLibraryValidationError('scheduledFor is required when status is scheduled');
    }
  }

  if (nextStatus === 'draft' || nextStatus === 'in_review' || nextStatus === 'needs_revision') {
    nextBody.approvedByUserId = null;
    nextBody.approved_by_user_id = null;
    nextBody.approvedAt = null;
    nextBody.approved_at = null;
    nextBody.publishedAt = null;
    nextBody.published_at = null;
    nextBody.scheduledFor = null;
    nextBody.scheduled_for = null;
    nextBody.locked = false;
  }

  if (nextStatus === 'approved') {
    nextBody.approvedByUserId = params.userId;
    nextBody.approved_by_user_id = params.userId;
    nextBody.approvedAt = now;
    nextBody.approved_at = now;
    nextBody.publishedAt = null;
    nextBody.published_at = null;
    nextBody.scheduledFor = null;
    nextBody.scheduled_for = null;
  }

  if (nextStatus === 'scheduled') {
    if (!params.existingItem.approvedAt) {
      nextBody.approvedByUserId = params.userId;
      nextBody.approved_by_user_id = params.userId;
      nextBody.approvedAt = now;
      nextBody.approved_at = now;
    }
    nextBody.publishedAt = null;
    nextBody.published_at = null;
  }

  if (nextStatus === 'published') {
    if (!params.existingItem.approvedAt) {
      nextBody.approvedByUserId = params.userId;
      nextBody.approved_by_user_id = params.userId;
      nextBody.approvedAt = now;
      nextBody.approved_at = now;
    }
    if (nextBody.publishedAt === undefined && nextBody.published_at === undefined) {
      nextBody.publishedAt = now;
      nextBody.published_at = now;
    }
    nextBody.scheduledFor = null;
    nextBody.scheduled_for = null;
    nextBody.locked = true;
  }

  if (nextStatus === 'archived') {
    nextBody.scheduledFor = null;
    nextBody.scheduled_for = null;
  }

  return nextBody;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organization, membership } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const contentItem = await getContentLibraryItem(supabaseAdmin, organization.id, id);

    if (!contentItem) {
      return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: {
        role: membership.role,
        status: membership.status,
        canManageCampaignLibrary: can({
          userId: user.id,
          organizationId: organization.id,
          organizationType: organization.type,
          role: membership.role,
        }, 'library_item.create', { organizationId: organization.id, visibility: 'workspace' }),
      },
      contentItem: decorateContentLibraryItemAccess(contentItem, {
        organizationId: organization.id,
        userId: user.id,
        role: membership.role,
        organizationType: organization.type,
      }),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load content library item');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { user, organization, membership, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    const existingItem = await getContentLibraryItem(supabaseAdmin, organization.id, id);
    if (!existingItem) {
      return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
    }
    const decorated = decorateContentLibraryItemAccess(
      { ...existingItem, status: body.status || existingItem.status },
      {
        organizationId: organization.id,
        userId: user.id,
        role: membership.role,
        organizationType: organization.type,
      }
    );
    if (!decorated.canEdit) {
      return NextResponse.json({ error: 'You do not have permission to update this draft' }, { status: 403 });
    }

    const approvalRequired = await getApprovalRequiredForItem(organization.id, existingItem, body);
    const nextBody = applyStatusWorkflow({
      body,
      existingItem,
      role: membership.role,
      userId: user.id,
      approvalRequired,
    });
    const contentItem = await updateContentLibraryItem(supabaseAdmin, organization.id, id, nextBody);

    if (!contentItem) {
      return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
    }

    const previousSnapshot = buildVersionSnapshot(existingItem);
    const nextSnapshot = buildVersionSnapshot(contentItem);
    const changedFields = getChangedFields(previousSnapshot, nextSnapshot);
    const changeSummary = getChangeSummary(existingItem.status, contentItem.status, changedFields);

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: user.id,
      action: getAuditAction(existingItem.status, contentItem.status),
      resourceType: 'library_item',
      resourceId: contentItem.id,
      metadata: {
        title: contentItem.title,
        previousStatus: existingItem.status,
        nextStatus: contentItem.status,
        changedFields,
        campaignId: contentItem.campaignId,
        libraryId: contentItem.libraryId,
      },
    });

    if (changedFields.length > 0) {
      try {
        await createResourceVersion({
          supabase: supabaseAdmin,
          organizationId: organization.id,
          resourceType: 'library_item',
          resourceId: contentItem.id,
          changedByUserId: user.id,
          changeSummary,
          snapshot: nextSnapshot,
          previousSnapshot,
        });
      } catch (versionError) {
        console.error('[CONTENT_LIBRARY_DETAIL] Failed to create version:', versionError);
      }
    }

    return NextResponse.json({
      success: true,
      contentItem,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update content library item');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organization, membership, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (permissionContext.isDemo) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    const existingItem = await getContentLibraryItem(supabaseAdmin, organization.id, id);
    if (!existingItem) {
      return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
    }
    const decorated = decorateContentLibraryItemAccess(existingItem, {
      organizationId: organization.id,
      userId: user.id,
      role: membership.role,
      organizationType: organization.type,
    });
    if (!decorated.canDelete) {
      return NextResponse.json({ error: 'You do not have permission to delete this draft' }, { status: 403 });
    }

    const deleted = await deleteContentLibraryItem(supabaseAdmin, organization.id, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'library_item.deleted',
      resourceType: 'library_item',
      resourceId: id,
      metadata: {
        title: existingItem.title,
        status: existingItem.status,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete content library item');
  }
}
