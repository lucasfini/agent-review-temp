import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError } from '@/lib/api/route-auth';
import { assertCan, requirePermissionContext } from '@/lib/authz/permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { listOrganizationAuditLogs } from '@/lib/organizations/audit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get('limit') || '25');
    const { organization, permissionContext } = await requirePermissionContext(request, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    assertCan(
      permissionContext,
      'audit_log.read',
      { organizationId: organization.id },
      'You do not have permission to view audit logs'
    );

    const auditLogs = await listOrganizationAuditLogs({
      supabase: supabaseAdmin,
      organizationId: organization.id,
      limit: Number.isFinite(rawLimit) ? rawLimit : 25,
    });

    return NextResponse.json({
      success: true,
      auditLogs,
    });
  } catch (error) {
    if (error instanceof RouteAccessError || error instanceof OrganizationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[ORGANIZATION_AUDIT_LOGS] Failed to load audit logs:', error);
    return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}
