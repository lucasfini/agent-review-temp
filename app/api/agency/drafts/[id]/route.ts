import { NextRequest, NextResponse } from 'next/server';

import {
  agencyDraftClientIdFrom,
  getAgencyDraft,
  updateAgencyDraft,
  validateAgencyDraftReferences,
} from '@/lib/agency-drafts';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyDraft,
  requireAgencyAccess,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { CampaignLibraryValidationError } from '@/lib/campaigns-content-library';
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

  console.error('[AGENCY_DRAFT_DETAIL] Unexpected error:', error);
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
    canManageAgencyDraft: canManageAgencyDraft(role, organizationType),
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
    const draft = await getAgencyDraft(supabaseAdmin, organization.id, id);

    if (!draft) {
      return NextResponse.json({ error: 'Agency draft not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      draft,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load agency draft');
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
    const nextClientId = agencyDraftClientIdFrom(body);
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

    if (!canManageAgencyDraft(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Agency draft management requires internal agency admin access' },
        { status: 403 }
      );
    }

    const existingDraft = await getAgencyDraft(supabaseAdmin, organization.id, id);
    if (!existingDraft) {
      return NextResponse.json({ error: 'Agency draft not found' }, { status: 404 });
    }

    await validateAgencyDraftReferences(supabaseAdmin, organization.id, body, {
      clientId: nextClientId === undefined ? existingDraft.clientId : nextClientId,
    });

    const draft = await updateAgencyDraft(supabaseAdmin, organization.id, id, body);

    if (!draft) {
      return NextResponse.json({ error: 'Agency draft not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      draft,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update agency draft');
  }
}
