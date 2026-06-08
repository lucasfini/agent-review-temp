import { NextRequest, NextResponse } from 'next/server';

import {
  AGENCY_LEAD_STATUSES,
  AgencyLeadValidationError,
  listAgencyLeads,
  type AgencyLeadStatus,
} from '@/lib/agency-leads';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  requireAgencyAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

function membershipPayload(role: string, status: string, organizationType: string) {
  return {
    role,
    status,
    canManageAgencyClient: canManageAgencyClient(role, organizationType),
  };
}

function normalizeStatusParam(value: string | null): AgencyLeadStatus | null {
  if (!value) return null;
  if (!AGENCY_LEAD_STATUSES.includes(value as AgencyLeadStatus)) {
    throw new AgencyLeadValidationError(`status must be one of: ${AGENCY_LEAD_STATUSES.join(', ')}`);
  }
  return value as AgencyLeadStatus;
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyLeadValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_LEADS] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const { organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
      requireClientManagement: true,
    });
    const limitParam = Number(searchParams.get('limit') || 50);
    const status = normalizeStatusParam(searchParams.get('status'));
    const leads = await listAgencyLeads(supabaseAdmin, {
      status,
      limit: Number.isFinite(limitParam) ? limitParam : 50,
    });

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        type: organization.type,
      },
      membership: membershipPayload(membership.role, membership.status, organization.type),
      leads,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load agency leads');
  }
}
