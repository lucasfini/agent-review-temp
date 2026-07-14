import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  BrandVoiceValidationError,
  decorateBrandVoiceScope,
  deleteBrandVoice,
  getBrandVoiceInOrganizations,
  shareBrandVoiceToOrganization,
  unshareBrandVoiceToPrivateOrganization,
} from '@/lib/brand-voices';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
import { assertShareTargetIsTeamOrganization } from '@/lib/studio-sharing';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  notifyMovedToPrivate,
  notifySharedWithTeam,
} from '@/lib/notifications/notification-events';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BrandVoiceValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[BRAND_VOICE_SHARE] Unexpected error:', error);
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
    assertShareTargetIsTeamOrganization({
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      organizationType: context.organization.type,
    }, 'brand voice');

    const voice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedVoice = voice ? decorateBrandVoiceScope(voice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }
    if (scopedVoice.scope !== 'private' || !scopedVoice.canShare) {
      return NextResponse.json({ error: 'You do not have permission to publish this brand voice' }, { status: 403 });
    }

    const sharedVoice = decorateBrandVoiceScope(
      await shareBrandVoiceToOrganization(
        supabaseAdmin,
        scopedVoice,
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
      action: 'voice.shared',
      resourceType: 'voice',
      resourceId: sharedVoice.id,
      metadata: {
        sourceVoiceId: scopedVoice.id,
        name: sharedVoice.name,
      },
    });

    await notifySharedWithTeam({
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      name: sharedVoice.name,
      href: '/dashboard/studio/voice',
      idempotencyKey: `asset_shared:voice:${sharedVoice.id}`,
      metadata: {
        assetType: 'voice',
        assetId: sharedVoice.id,
        sourceVoiceId: scopedVoice.id,
      },
    });

    return NextResponse.json({ success: true, brandVoice: sharedVoice });
  } catch (error) {
    return errorResponse(error, 'Failed to publish brand voice');
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

    const voice = await getBrandVoiceInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedVoice = voice ? decorateBrandVoiceScope(voice, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedVoice) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
    }
    if (!scopedVoice.canUnshare) {
      return NextResponse.json({ error: 'You do not have permission to move this brand voice to private' }, { status: 403 });
    }

    const privateVoice = scopedVoice.sharedFromVoiceId
      ? null
      : decorateBrandVoiceScope(
        await unshareBrandVoiceToPrivateOrganization(
          supabaseAdmin,
          scopedVoice,
          context.privateOrganizationId,
          context.activeOrganizationId
        ),
        {
          activeOrganizationId: context.activeOrganizationId,
          privateOrganizationId: context.privateOrganizationId,
          userId: context.user.id,
          role: context.membership.role,
          organizationType: context.organization.type,
        }
      );

    if (scopedVoice.sharedFromVoiceId) {
      const deleted = await deleteBrandVoice(supabaseAdmin, scopedVoice.organizationId, scopedVoice.id);
      if (!deleted) {
        return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 });
      }
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'voice.unshared',
      resourceType: 'voice',
      resourceId: scopedVoice.id,
      metadata: {
        name: scopedVoice.name,
      },
    });

    await notifyMovedToPrivate({
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      name: scopedVoice.name,
      href: '/dashboard/studio/voice',
      idempotencyKey: `asset_unshared:voice:${scopedVoice.id}`,
      metadata: {
        assetType: 'voice',
        assetId: scopedVoice.id,
      },
    });

    return NextResponse.json({ success: true, brandVoice: privateVoice });
  } catch (error) {
    return errorResponse(error, 'Failed to move brand voice to private');
  }
}
