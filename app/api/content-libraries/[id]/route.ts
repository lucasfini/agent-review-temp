import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { OrganizationAccessError } from '@/lib/authz/types';
import { recordOrganizationAuditLog } from '@/lib/organizations/audit';
import {
  canManageContentLibraries,
  ContentLibraryValidationError,
  decorateContentLibraryScope,
  deleteContentLibrary,
  getContentLibraryInOrganizations,
  updateContentLibrary,
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

  console.error('[CONTENT_LIBRARIES] Unexpected error:', error);
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
    const contentLibrary = await getContentLibraryInOrganizations(supabaseAdmin, context.organizationIds, id);
    if (!contentLibrary) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: {
        role: context.membership.role,
        status: context.membership.status,
        canManageContentLibraries: canManageContentLibraries(context.membership.role, context.organization.type),
      },
      contentLibrary: decorateContentLibraryScope(contentLibrary, {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load library');
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

    const existing = await getContentLibraryInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedLibrary = existing ? decorateContentLibraryScope(existing, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedLibrary) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    if (!scopedLibrary.canEdit) {
      return NextResponse.json({ error: 'You do not have permission to edit this library' }, { status: 403 });
    }

    const contentLibrary = await updateContentLibrary(supabaseAdmin, scopedLibrary.organizationId, id, body);
    if (!contentLibrary) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: contentLibrary.organizationId,
      actorUserId: context.user.id,
      action: 'collection.updated',
      resourceType: 'collection',
      resourceId: contentLibrary.id,
      metadata: {
        name: contentLibrary.name,
        scope: scopedLibrary.scope,
      },
    });

    return NextResponse.json({
      success: true,
      contentLibrary: decorateContentLibraryScope(contentLibrary, {
        activeOrganizationId: context.activeOrganizationId,
        privateOrganizationId: context.privateOrganizationId,
        userId: context.user.id,
        role: context.membership.role,
        organizationType: context.organization.type,
      }),
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update library');
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

    const existing = await getContentLibraryInOrganizations(supabaseAdmin, context.organizationIds, id);
    const scopedLibrary = existing ? decorateContentLibraryScope(existing, {
      activeOrganizationId: context.activeOrganizationId,
      privateOrganizationId: context.privateOrganizationId,
      userId: context.user.id,
      role: context.membership.role,
      organizationType: context.organization.type,
    }) : null;

    if (!scopedLibrary) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    if (!scopedLibrary.canEdit) {
      return NextResponse.json({ error: 'You do not have permission to delete this library' }, { status: 403 });
    }

    const deleted = await deleteContentLibrary(supabaseAdmin, scopedLibrary.organizationId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    await recordOrganizationAuditLog({
      supabase: supabaseAdmin,
      organizationId: scopedLibrary.organizationId,
      actorUserId: context.user.id,
      action: 'collection.deleted',
      resourceType: 'collection',
      resourceId: scopedLibrary.id,
      metadata: {
        name: scopedLibrary.name,
        scope: scopedLibrary.scope,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete library');
  }
}
