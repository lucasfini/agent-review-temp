import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyClientValidationError,
  getAgencyClient,
  hasAgencyClientInput,
  updateAgencyClient,
} from '@/lib/agency-clients';
import {
  AgencyClientProfileValidationError,
  getAgencyClientProfile,
  normalizeAgencyClientProfileInput,
  upsertAgencyClientProfile,
  type AgencyClientProfileInput,
} from '@/lib/agency-client-profiles';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyClientValidationError || error instanceof AgencyClientProfileValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_CLIENT_DETAIL] Unexpected error:', error);
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

function profileInputFrom(body: any): AgencyClientProfileInput | null {
  if (body?.profile === undefined) return null;
  if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) {
    throw new AgencyClientProfileValidationError('profile must be an object');
  }
  return body.profile as AgencyClientProfileInput;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organization, membership } = await requireAgencyClientAccess(request, id, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });
    const client = await getAgencyClient(supabaseAdmin, organization.id, id);

    if (!client) {
      return NextResponse.json({ error: 'Agency client not found' }, { status: 404 });
    }

    const profile = await getAgencyClientProfile(supabaseAdmin, id);

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      client,
      profile,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load agency client');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { user, organization, membership } = await requireAgencyClientAccess(request, id, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
      requireClientManagement: true,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    const profileInput = profileInputFrom(body);
    const shouldUpdateClient = hasAgencyClientInput(body);

    if (!shouldUpdateClient && !profileInput) {
      throw new AgencyClientValidationError('No agency client fields provided');
    }

    if (profileInput) {
      normalizeAgencyClientProfileInput(profileInput);
    }

    const client = shouldUpdateClient
      ? await updateAgencyClient(supabaseAdmin, organization.id, id, body)
      : await getAgencyClient(supabaseAdmin, organization.id, id);

    if (!client) {
      return NextResponse.json({ error: 'Agency client not found' }, { status: 404 });
    }

    const profile = profileInput
      ? await upsertAgencyClientProfile(supabaseAdmin, id, profileInput)
      : await getAgencyClientProfile(supabaseAdmin, id);

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      client,
      profile,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update agency client');
  }
}
