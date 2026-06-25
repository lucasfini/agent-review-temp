import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyDeliveryPackageValidationError,
  getAgencyDeliveryPackage,
  updateAgencyDeliveryPackage,
} from '@/lib/agency-delivery-packages';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyDraft,
  requireAgencyAccess,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyDeliveryPackageValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('[AGENCY_DELIVERY_PACKAGE_DETAIL] Unexpected error:', error);
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
    canManageAgencyDelivery: canManageAgencyDraft(role, organizationType),
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
    const deliveryPackage = await getAgencyDeliveryPackage(supabaseAdmin, organization.id, id);

    if (!deliveryPackage) {
      return NextResponse.json({ error: 'Delivery package not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      package: deliveryPackage,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load delivery package');
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
    });

    if (body?.client_id || body?.clientId) {
      await requireAgencyClientAccess(request, String(body.client_id || body.clientId), {
        requestedOrganizationId: organization.id,
      });
    }

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }
    if (!canManageAgencyDraft(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Agency delivery package management requires internal agency admin access' },
        { status: 403 }
      );
    }

    const existing = await getAgencyDeliveryPackage(supabaseAdmin, organization.id, id);
    if (!existing) {
      return NextResponse.json({ error: 'Delivery package not found' }, { status: 404 });
    }

    const nextBody = {
      ...body,
      deliveredAt: body?.status === 'delivered' && !body?.deliveredAt && !body?.delivered_at
        ? new Date().toISOString()
        : body?.deliveredAt || body?.delivered_at,
    };
    const deliveryPackage = await updateAgencyDeliveryPackage(supabaseAdmin, organization.id, id, nextBody);

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      package: deliveryPackage,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update delivery package');
  }
}
