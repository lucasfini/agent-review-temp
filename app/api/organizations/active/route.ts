import { NextRequest, NextResponse } from 'next/server';

import { RouteAccessError, requireAuthenticatedUser } from '@/lib/api/route-auth';
import {
  getActiveOrganizationForUser,
  listActiveOrganizationsForUser,
  setActiveOrganizationForUser,
} from '@/lib/authz/organization-context';
import { OrganizationAccessError } from '@/lib/authz/types';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function organizationPayload(context: Awaited<ReturnType<typeof getActiveOrganizationForUser>>, currentOrganizationId: string) {
  return {
    id: context.organization.id,
    name: context.organization.name,
    type: context.organization.type,
    role: context.membership.role,
    status: context.membership.status,
    isCurrent: context.organization.id === currentOrganizationId,
  };
}

function organizationIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const payload = body as Record<string, unknown>;
  if (typeof payload.organization_id === 'string') return payload.organization_id.trim() || null;
  if (typeof payload.organizationId === 'string') return payload.organizationId.trim() || null;
  return null;
}

function routeErrorResponse(error: unknown, fallback: string) {
  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[ORGANIZATIONS_ACTIVE] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const currentContext = await getActiveOrganizationForUser(supabaseAdmin, user.id, null);
    const organizationContexts = await listActiveOrganizationsForUser(supabaseAdmin, user.id);
    const currentOrganizationId = currentContext.organization.id;

    return NextResponse.json({
      currentOrganizationId,
      organizations: organizationContexts.map((context) => organizationPayload(context, currentOrganizationId)),
    });
  } catch (error) {
    return routeErrorResponse(error, 'Failed to load workspaces');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const organizationId = organizationIdFromBody(body);

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    const context = await setActiveOrganizationForUser(supabaseAdmin, user.id, organizationId);

    return NextResponse.json({
      currentOrganizationId: context.organization.id,
      organization: organizationPayload(context, context.organization.id),
    });
  } catch (error) {
    return routeErrorResponse(error, 'Failed to switch workspace');
  }
}
