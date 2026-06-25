import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  ContentLibraryValidationError,
  decorateContentLibraryScope,
  deleteContentLibrary,
  getContentLibraryInOrganizations,
  shareContentLibraryToOrganization,
} from '@/lib/content-libraries';
import { isDemoUser } from '@/lib/demo-mode';
import { requireStudioAssetContext } from '@/lib/studio-assets';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof ContentLibraryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[CONTENT_LIBRARY_SHARE] Unexpected error:', error);
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

    const library = await getContentLibraryInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedLibrary = library ? decorateContentLibraryScope(library, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedLibrary) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    if (scopedLibrary.scope !== 'private' || !scopedLibrary.canShare) {
      return NextResponse.json({ error: 'You do not have permission to share this library' }, { status: 403 });
    }

    const sharedLibrary = decorateContentLibraryScope(
      await shareContentLibraryToOrganization(
        supabaseAdmin,
        scopedLibrary,
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
      action: 'collection.shared',
      resourceType: 'collection',
      resourceId: sharedLibrary.id,
      metadata: {
        sourceLibraryId: scopedLibrary.id,
        name: sharedLibrary.name,
      },
    });

    return NextResponse.json({ success: true, contentLibrary: sharedLibrary });
  } catch (error) {
    return errorResponse(error, 'Failed to share library');
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

    const library = await getContentLibraryInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedLibrary = library ? decorateContentLibraryScope(library, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedLibrary) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    if (!scopedLibrary.canUnshare) {
      return NextResponse.json({ error: 'You do not have permission to unshare this library' }, { status: 403 });
    }

    const deleted = await deleteContentLibrary(supabaseAdmin, scopedLibrary.organizationId, scopedLibrary.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: context.activeOrganizationId,
      actorUserId: context.user.id,
      action: 'collection.unshared',
      resourceType: 'collection',
      resourceId: scopedLibrary.id,
      metadata: {
        name: scopedLibrary.name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to unshare library');
  }
}
