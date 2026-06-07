import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyClientValidationError,
  createAgencyClient,
  listAgencyClients,
} from '@/lib/agency-clients';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  requireAgencyAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyClientValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_CLIENTS] Unexpected error:', error);
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
    canManageAgencyClient: canManageAgencyClient(role, organizationType),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const clients = await listAgencyClients(supabaseAdmin, organization.id);

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      membership: membershipPayload(membership.role, membership.status, organization.type),
      clients,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load agency clients');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user, organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
      requireClientManagement: true,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const client = await createAgencyClient(supabaseAdmin, organization.id, user.id, body);

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      client,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create agency client');
  }
}
