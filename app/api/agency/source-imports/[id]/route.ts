import { NextRequest, NextResponse } from 'next/server';

import {
  AgencySourceImportValidationError,
  getAgencySourceImport,
  sourceImportClientIdFrom,
  updateAgencySourceImport,
} from '@/lib/agency-source-imports';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencySourceImport,
  requireAgencyAccess,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencySourceImportValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_SOURCE_IMPORT_DETAIL] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function membershipPayload(role: string, status: string, organizationType: string) {
  return {
    role,
    status,
    canManageAgencySourceImport: canManageAgencySourceImport(role, organizationType),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const sourceImport = await getAgencySourceImport(supabaseAdmin, organization.id, id);

    if (!sourceImport) {
      return NextResponse.json({ error: 'Source import not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      sourceImport,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load source import');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = requestedOrganizationIdFrom(request, body);
    const nextClientId = sourceImportClientIdFrom(body);
    const { user, organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId,
    });

    if (nextClientId) {
      await requireAgencyClientAccess(request, nextClientId, {
        requestedOrganizationId: organization.id,
      });
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencySourceImport(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Agency source import management requires internal agency operator access' },
        { status: 403 }
      );
    }

    const sourceImport = await updateAgencySourceImport(supabaseAdmin, organization.id, id, body);

    if (!sourceImport) {
      return NextResponse.json({ error: 'Source import not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      sourceImport,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update source import');
  }
}
