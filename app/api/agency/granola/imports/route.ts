import { NextRequest, NextResponse } from 'next/server';

import {
  getAgencyClientIntegration,
  setAgencyClientIntegration,
} from '@/lib/agency-client-integrations';
import {
  AgencySourceImportValidationError,
  createAgencySourceImport,
  listAgencySourceImports,
  sourceImportClientIdFrom,
} from '@/lib/agency-source-imports';
import { normalizeGranolaManualImport } from '@/lib/agency-granola-parser';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  canManageAgencySourceImport,
  requireAgencyAccess,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencySourceImportValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_GRANOLA_IMPORTS] Unexpected error:', error);
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
    canManageAgencySourceImport: canManageAgencySourceImport(role, organizationType),
    canManageAgencyClient: canManageAgencyClient(role, organizationType),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const rawLimit = Number(searchParams.get('limit') || '100');
    const context = clientId
      ? await requireAgencyClientAccess(request, clientId, {
        requestedOrganizationId: requestedOrganizationIdFrom(request),
      })
      : await requireAgencyAccess(request, {
        requestedOrganizationId: requestedOrganizationIdFrom(request),
      });

    const imports = await listAgencySourceImports(supabaseAdmin, context.organization.id, {
      clientId,
      provider: 'granola',
      limit: Number.isFinite(rawLimit) ? rawLimit : 100,
    });
    const integration = clientId
      ? await getAgencyClientIntegration(supabaseAdmin, clientId, 'granola')
      : null;

    return NextResponse.json({
      success: true,
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        type: context.organization.type,
      },
      membership: membershipPayload(context.membership.role, context.membership.status, context.organization.type),
      integration,
      imports,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load Granola imports');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = requestedOrganizationIdFrom(request, body);
    const clientId = sourceImportClientIdFrom(body);

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required for Granola imports' }, { status: 400 });
    }

    const { user, organization, membership } = await requireAgencyClientAccess(request, clientId, {
      requestedOrganizationId,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencySourceImport(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Granola manual imports require internal agency operator access' },
        { status: 403 }
      );
    }

    const granolaImport = normalizeGranolaManualImport(body, user.id);

    const sourceImport = await createAgencySourceImport(supabaseAdmin, organization.id, user.id, {
      ...body,
      provider: 'granola',
      client_id: clientId,
      sourceTitle: granolaImport.sourceTitle,
      rawText: granolaImport.rawText,
      summary: granolaImport.summary,
      metadata: {
        ...(body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? body.metadata
          : {}),
        ...granolaImport.metadata,
      },
    });

    const importedAt = new Date().toISOString();
    const integration = canManageAgencyClient(membership.role, organization.type)
      ? await setAgencyClientIntegration(supabaseAdmin, clientId, {
        provider: 'granola',
        status: 'connected',
        lastSyncAt: importedAt,
        metadata: {
          mode: 'manual_import',
          lastManualImportId: sourceImport.id,
          lastManualImportTitle: sourceImport.sourceTitle,
          lastManualImportedAt: importedAt,
        },
      })
      : await getAgencyClientIntegration(supabaseAdmin, clientId, 'granola');

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      integration,
      sourceImport,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to import Granola notes');
  }
}
