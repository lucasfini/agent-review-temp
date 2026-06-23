import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  CreatorProfileValidationError,
  decorateCreatorProfileScope,
  deleteCreatorProfile,
  getCreatorProfileInOrganizations,
  shareCreatorProfileToOrganization,
} from '@/lib/creator-profiles';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CreatorProfileValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[CREATOR_PROFILE_SHARE] Unexpected error:', error);
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

    const profile = await getCreatorProfileInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedProfile = profile ? decorateCreatorProfileScope(profile, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (scopedProfile.scope !== 'private' || !scopedProfile.canShare) {
      return NextResponse.json({ error: 'You do not have permission to share this profile' }, { status: 403 });
    }

    const sharedProfile = decorateCreatorProfileScope(
      await shareCreatorProfileToOrganization(
        supabaseAdmin,
        scopedProfile,
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
      action: 'profile.shared',
      resourceType: 'profile',
      resourceId: sharedProfile.id,
      metadata: {
        sourceProfileId: scopedProfile.id,
        name: sharedProfile.name,
      },
    });

    return NextResponse.json({ success: true, creatorProfile: sharedProfile });
  } catch (error) {
    return errorResponse(error, 'Failed to share profile');
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

    const profile = await getCreatorProfileInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedProfile = profile ? decorateCreatorProfileScope(profile, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!scopedProfile.canUnshare) {
      return NextResponse.json({ error: 'You do not have permission to unshare this profile' }, { status: 403 });
    }

    const deleted = await deleteCreatorProfile(supabaseAdmin, scopedProfile.organizationId, scopedProfile.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'profile.unshared',
      resourceType: 'profile',
      resourceId: scopedProfile.id,
      metadata: {
        name: scopedProfile.name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to unshare profile');
  }
}
