import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  CampaignLibraryValidationError,
  decorateCampaignScope,
  deleteCampaign,
  getCampaignInOrganizations,
  shareCampaignToOrganization,
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

  console.error('[CAMPAIGN_SHARE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

export async function POST(
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

    const campaign = await getCampaignInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedCampaign = campaign ? decorateCampaignScope(campaign, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (scopedCampaign.scope !== 'private' || !scopedCampaign.canShare) {
      return NextResponse.json({ error: 'You do not have permission to share this plan' }, { status: 403 });
    }

    const sharedCampaign = decorateCampaignScope(
      await shareCampaignToOrganization(
        supabaseAdmin,
        scopedCampaign,
        context.activeOrganizationId,
        context.user.id
      ),
      {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }
    );

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'plan.shared',
      resourceType: 'plan',
      resourceId: sharedCampaign.id,
      metadata: {
        sourcePlanId: scopedCampaign.id,
        name: sharedCampaign.name,
        status: sharedCampaign.status,
      },
    });

    return NextResponse.json({ success: true, campaign: sharedCampaign });
  } catch (error) {
    return errorResponse(error, 'Failed to share plan');
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

    const campaign = await getCampaignInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedCampaign = campaign ? decorateCampaignScope(campaign, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (!scopedCampaign.canUnshare) {
      return NextResponse.json({ error: 'You do not have permission to unshare this plan' }, { status: 403 });
    }

    const deleted = await deleteCampaign(supabaseAdmin, scopedCampaign.organizationId, scopedCampaign.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'plan.unshared',
      resourceType: 'plan',
      resourceId: scopedCampaign.id,
      metadata: {
        name: scopedCampaign.name,
        status: scopedCampaign.status,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to unshare plan');
  }
}
