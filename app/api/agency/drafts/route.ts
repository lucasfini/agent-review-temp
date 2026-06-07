import { NextRequest, NextResponse } from 'next/server';

import {
  agencyDraftClientIdFrom,
  createAgencyDraft,
  listAgencyDrafts,
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

  console.error('[AGENCY_DRAFTS] Unexpected error:', error);
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

async function requireDraftAccess(request: NextRequest, params: {
  requestedOrganizationId?: string | null;
  clientId?: string | null;
}) {
  if (params.clientId) {
    return requireAgencyClientAccess(request, params.clientId, {
      requestedOrganizationId: params.requestedOrganizationId,
    });
  }

  return requireAgencyAccess(request, {
    requestedOrganizationId: params.requestedOrganizationId,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const rawLimit = Number(searchParams.get('limit') || '100');
    const { organization, membership } = await requireDraftAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
      clientId,
    });
    const drafts = await listAgencyDrafts(supabaseAdmin, organization.id, {
      clientId,
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
      membership: membershipPayload(membership.role, membership.status, organization.type),
      drafts,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load agency drafts');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = requestedOrganizationIdFrom(request, body);
    const clientId = agencyDraftClientIdFrom(body);
    const { user, organization, membership } = await requireDraftAccess(request, {
      requestedOrganizationId,
      clientId,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencyDraft(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Agency draft management requires internal agency admin access' },
        { status: 403 }
      );
    }

    await validateAgencyDraftReferences(supabaseAdmin, organization.id, body, {
      clientId: clientId || null,
    });

    const draft = await createAgencyDraft(supabaseAdmin, organization.id, user.id, body);

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      draft,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to create agency draft');
  }
}
