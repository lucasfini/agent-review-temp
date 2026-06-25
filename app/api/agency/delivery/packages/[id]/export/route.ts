import { NextRequest, NextResponse } from 'next/server';

import {
  exportAgencyDeliveryPackage,
  getAgencyDeliveryPackage,
  type AgencyDeliveryExportFormat,
} from '@/lib/agency-delivery-packages';
import { RouteAccessError } from '@/lib/api/route-auth';
import { requireAgencyAccess } from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('[AGENCY_DELIVERY_PACKAGE_EXPORT] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function formatFrom(value: unknown): AgencyDeliveryExportFormat {
  return value === 'csv' || value === 'text' || value === 'json' ? value : 'markdown';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { organization } = await requireAgencyAccess(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request, body),
    });
    const deliveryPackage = await getAgencyDeliveryPackage(supabaseAdmin, organization.id, id);

    if (!deliveryPackage) {
      return NextResponse.json({ error: 'Delivery package not found' }, { status: 404 });
    }

    const exported = exportAgencyDeliveryPackage(deliveryPackage, formatFrom(body?.format));
    return NextResponse.json({
      success: true,
      export: exported,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to export delivery package');
  }
}
