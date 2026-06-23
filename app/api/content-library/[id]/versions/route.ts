import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { can, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { getContentLibraryItem } from '@/lib/campaigns-content-library';
import { listResourceVersions } from '@/lib/resource-versions';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get('limit') || '25');
    const { organization, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    const contentItem = await getContentLibraryItem(supabaseAdmin, organization.id, id);
    if (!contentItem) {
      return NextResponse.json({ error: 'Content library item not found' }, { status: 404 });
    }

    const resource = {
      organizationId: contentItem.organizationId,
      ownerUserId: contentItem.ownerUserId || contentItem.createdBy,
      createdByUserId: contentItem.createdBy,
      visibility: 'workspace' as const,
      locked: contentItem.locked,
      nextStatus: contentItem.status,
    };
    const canViewVersions = can(permissionContext, 'library_item.publish', resource)
      || can(permissionContext, 'library_item.update', resource);

    if (!canViewVersions) {
      return NextResponse.json({ error: 'You do not have permission to view version history' }, { status: 403 });
    }

    const versions = await listResourceVersions({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      resourceType: 'library_item',
      resourceId: id,
      limit: Number.isFinite(rawLimit) ? rawLimit : 25,
    });

    return NextResponse.json({
      success: true,
      versions,
    });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[CONTENT_LIBRARY_VERSIONS] Failed to load versions:', error);
    return NextResponse.json({ error: 'Failed to load version history' }, { status: 500 });
  }
}
