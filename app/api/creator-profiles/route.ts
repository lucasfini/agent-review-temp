import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { can } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  canManageCreatorProfiles,
  createCreatorProfile,
  CreatorProfileValidationError,
  decorateCreatorProfileScope,
  listCreatorProfilesForOrganizations,
} from '@/lib/creator-profiles';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
import { resolveStudioAssetWriteOrganizationId } from '@/lib/studio-sharing';
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

export async function GET(request: NextRequest) {
  try {
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const creatorProfiles = (await listCreatorProfilesForOrganizations(supabaseAdmin, context.organizationIds))
      .map((profile) => decorateCreatorProfileScope(profile, {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }));

    return NextResponse.json({
      success: true,
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        type: context.organization.type,
      },
      privateOrganization: {
        id: context.privateOrganization.id,
      },
      membership: {
        role: context.membership.role,
        status: context.membership.status,
        canManageCreatorProfiles: canManageCreatorProfiles(context.membership.role, context.organization.type),
      },
      creatorProfiles,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load profiles');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await requireStudioAssetContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (isDemoUser(context.user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    if (!can({
      userId: context.user.id,
      organizationId: context.activeOrganizationId,
      organizationType: context.organization.type,
      role: context.membership.role,
    }, 'profile.create', { organizationId: context.activeOrganizationId })) {
      return NextResponse.json({ error: 'You do not have permission to create profiles' }, { status: 403 });
    }

    const targetOrganizationId = resolveStudioAssetWriteOrganizationId({
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      organizationType: context.organization.type,
    }, body?.visibility);

    const creatorProfile = decorateCreatorProfileScope(
      await createCreatorProfile(supabaseAdmin, targetOrganizationId, context.user.id, body),
      {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }
    );

    return NextResponse.json({
      success: true,
      creatorProfile,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create profile');
  }
}
