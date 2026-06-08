import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyDraft,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { CampaignLibraryValidationError } from '@/lib/campaigns-content-library';
import { isDemoUser } from '@/lib/demo-mode';
import {
  AgencySourceGenerationError,
  generateAgencyDraftFromSource,
  normalizeAgencySourceGenerationRequest,
} from '@/lib/agency-source-generation';
import { aiRatelimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencySourceGenerationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof CampaignLibraryValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_SOURCE_GENERATE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function clientIdFromBody(body: any): string | null {
  if (typeof body?.clientId === 'string') return body.clientId.trim() || null;
  if (typeof body?.client_id === 'string') return body.client_id.trim() || null;
  return null;
}

function membershipPayload(role: string, status: string, organizationType: string) {
  return {
    role,
    status,
    canManageAgencyDraft: canManageAgencyDraft(role, organizationType),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const clientId = clientIdFromBody(body);
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const { user, organization, membership } = await requireAgencyClientAccess(
      request,
      clientId,
      { requestedOrganizationId: requestedOrganizationIdFrom(request, body) }
    );

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencyDraft(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Agency source generation requires internal agency draft management access' },
        { status: 403 }
      );
    }

    const { success } = await aiRatelimit.limit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for AI operations. Please wait a moment.' },
        { status: 429 }
      );
    }

    const generationRequest = normalizeAgencySourceGenerationRequest(body, id);
    const draft = await generateAgencyDraftFromSource(
      supabaseAdmin,
      organization.id,
      user.id,
      generationRequest
    );

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      draft,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to generate agency draft');
  }
}
