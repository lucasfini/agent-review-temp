import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  canManageCreatorProfiles,
  CreatorProfileValidationError,
  deleteCreatorProfile,
  decorateCreatorProfileScope,
  getCreatorProfileInOrganizations,
  updateCreatorProfile,
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

  console.error('[CREATOR_PROFILES] Unexpected error:', error);
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
    const profile = await getCreatorProfileInOrganizations(supabaseAdmin, context.organizationIds, id);
    const creatorProfile = profile ? decorateCreatorProfileScope(profile, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;
    if (!creatorProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: {
        role: context.membership.role,
        status: context.membership.status,
        canManageCreatorProfiles: canManageCreatorProfiles(context.membership.role, context.organization.type),
      },
      creatorProfile,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load profile');
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

    const existingProfile = await getCreatorProfileInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedProfile = existingProfile ? decorateCreatorProfileScope(existingProfile, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!scopedProfile.canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this profile' },
        { status: 403 }
      );
    }

    const updatedProfile = await updateCreatorProfile(supabaseAdmin, scopedProfile.organizationId, id, body);
    const creatorProfile = updatedProfile ? decorateCreatorProfileScope(updatedProfile, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;
    if (!creatorProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: creatorProfile.organizationId,
      actorUserId: context.user.id,
      action: 'profile.updated',
      resourceType: 'profile',
      resourceId: creatorProfile.id,
      metadata: {
        name: creatorProfile.name,
        scope: creatorProfile.scope,
      },
    });

    return NextResponse.json({
      success: true,
      creatorProfile,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update profile');
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

    const existingProfile = await getCreatorProfileInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedProfile = existingProfile ? decorateCreatorProfileScope(existingProfile, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!scopedProfile.canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this profile' },
        { status: 403 }
      );
    }

    const deleted = await deleteCreatorProfile(supabaseAdmin, scopedProfile.organizationId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: scopedProfile.organizationId,
      actorUserId: context.user.id,
      action: 'profile.deleted',
      resourceType: 'profile',
      resourceId: scopedProfile.id,
      metadata: {
        name: scopedProfile.name,
        scope: scopedProfile.scope,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete profile');
  }
}
