import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyLeadValidationError,
  getAgencyLead,
  updateAgencyLead,
} from '@/lib/agency-leads';
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

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyLeadValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_LEAD_DETAIL] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
      requireClientManagement: true,
    });
    const lead = await getAgencyLead(supabaseAdmin, id);

    if (!lead) {
      return NextResponse.json({ error: 'Agency lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      lead,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load agency lead');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { user, organization, membership } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
      requireClientManagement: true,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const metadata: Record<string, unknown> = {};
    if (typeof body.adminNotes === 'string') {
      metadata.adminNotes = body.adminNotes.trim();
    }

    const lead = await updateAgencyLead(supabaseAdmin, id, {
      status: body.status,
      qualificationScore: body.qualificationScore ?? body.qualification_score,
      qualificationTier: body.qualificationTier ?? body.qualification_tier,
      assignedTo: body.assignedTo ?? body.assigned_to,
      reviewNotes: body.reviewNotes ?? body.review_notes,
      lastContactedAt: body.lastContactedAt ?? body.last_contacted_at,
      nextFollowUpAt: body.nextFollowUpAt ?? body.next_follow_up_at,
      metadata: Object.keys(metadata).length > 0 ? metadata : body.metadata,
    });

    if (!lead) {
      return NextResponse.json({ error: 'Agency lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      lead,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update agency lead');
  }
}
