import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { requireActiveOrganizationForUser } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import {
  CampaignLibraryValidationError,
  canManageCampaignLibrary,
  createContentLibraryItem,
  listContentLibraryItems,
} from '@/lib/campaigns-content-library';
import { isDemoUser } from '@/lib/demo-mode';
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

  console.error('[CONTENT_LIBRARY] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const rawLimit = Number(searchParams.get('limit') || '100');
    const contentItems = await listContentLibraryItems(supabaseAdmin, organization.id, {
      campaignId: searchParams.get('campaign_id'),
      status: searchParams.get('status'),
      limit: Number.isFinite(rawLimit) ? rawLimit : 100,
    });

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      membership: {
        role: membership.role,
        status: membership.status,
        canManageCampaignLibrary: canManageCampaignLibrary(membership.role, organization.type),
      },
      contentItems,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load content library');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user, organization, membership } = await requireActiveOrganizationForUser(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageCampaignLibrary(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Campaign and library management requires organization owner or admin access' },
        { status: 403 }
      );
    }

    const contentItem = await createContentLibraryItem(supabaseAdmin, organization.id, user.id, body);

    return NextResponse.json({
      success: true,
      contentItem,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create content library item');
  }
}
