import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  CampaignLibraryValidationError,
  canManageCampaignLibrary,
  deleteCampaign,
  decorateCampaignScope,
  getCampaignInOrganizations,
  updateCampaign,
} from '@/lib/campaigns-content-library';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
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

  console.error('[CAMPAIGN_DETAIL] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const existingCampaign = await getCampaignInOrganizations(supabaseAdmin, context.organizationIds, id);
    const campaign = existingCampaign ? decorateCampaignScope(existingCampaign, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: {
        role: context.membership.role,
        status: context.membership.status,
        canManageCampaignLibrary: canManageCampaignLibrary(context.membership.role, context.organization.type),
      },
      campaign,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load campaign');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const existingCampaign = await getCampaignInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedCampaign = existingCampaign ? decorateCampaignScope(existingCampaign, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!scopedCampaign.canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this plan' },
        { status: 403 }
      );
    }

    const updatedCampaign = await updateCampaign(supabaseAdmin, scopedCampaign.organizationId, id, body);
    const campaign = updatedCampaign ? decorateCampaignScope(updatedCampaign, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: campaign.organizationId,
      actorUserId: context.user.id,
      action: 'plan.updated',
      resourceType: 'plan',
      resourceId: campaign.id,
      metadata: {
        name: campaign.name,
        scope: campaign.scope,
        status: campaign.status,
      },
    });

    return NextResponse.json({
      success: true,
      campaign,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update campaign');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const existingCampaign = await getCampaignInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedCampaign = existingCampaign ? decorateCampaignScope(existingCampaign, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!scopedCampaign.canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this plan' },
        { status: 403 }
      );
    }

    const deleted = await deleteCampaign(supabaseAdmin, scopedCampaign.organizationId, id);

    if (!deleted) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: scopedCampaign.organizationId,
      actorUserId: context.user.id,
      action: 'plan.deleted',
      resourceType: 'plan',
      resourceId: scopedCampaign.id,
      metadata: {
        name: scopedCampaign.name,
        scope: scopedCampaign.scope,
        status: scopedCampaign.status,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete campaign');
  }
}
