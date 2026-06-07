import { NextRequest, NextResponse } from 'next/server';

import {
  AgencyClientIntegrationValidationError,
  getAgencyClientIntegration,
  setAgencyClientIntegration,
} from '@/lib/agency-client-integrations';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  requireAgencyAccess,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencyClientIntegrationValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_SLACK_STATUS] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function requestedOrganizationIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return new URL(request.url).searchParams.get('organization_id');
}

function clientIdFrom(request: NextRequest, body?: any): string | null {
  if (typeof body?.clientId === 'string') return body.clientId.trim() || null;
  if (typeof body?.client_id === 'string') return body.client_id.trim() || null;
  return new URL(request.url).searchParams.get('client_id');
}

function membershipPayload(role: string, status: string, organizationType: string) {
  return {
    role,
    status,
    canManageAgencyClient: canManageAgencyClient(role, organizationType),
  };
}

function slackMetadataFrom(body: any): Record<string, unknown> {
  return {
    mode: 'foundation_only',
    workspaceName: typeof body?.workspaceName === 'string' ? body.workspaceName.trim() || null : null,
    workspaceUrl: typeof body?.workspaceUrl === 'string' ? body.workspaceUrl.trim() || null : null,
    channelNames: typeof body?.channelNames === 'string' ? body.channelNames.trim() || null : null,
    notes: typeof body?.notes === 'string' ? body.notes.trim() || null : null,
    externalConnection: false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const clientId = clientIdFrom(request);
    const context = clientId
      ? await requireAgencyClientAccess(request, clientId, {
        requestedOrganizationId: requestedOrganizationIdFrom(request),
      })
      : await requireAgencyAccess(request, {
        requestedOrganizationId: requestedOrganizationIdFrom(request),
      });
    const integration = clientId
      ? await getAgencyClientIntegration(supabaseAdmin, clientId, 'slack')
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
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load Slack status');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = requestedOrganizationIdFrom(request, body);
    const clientId = clientIdFrom(request, body);

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required for Slack status' }, { status: 400 });
    }

    const { user, organization, membership } = await requireAgencyClientAccess(request, clientId, {
      requestedOrganizationId,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencyClient(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Slack status management requires internal agency admin access' },
        { status: 403 }
      );
    }

    const integration = await setAgencyClientIntegration(supabaseAdmin, clientId, {
      provider: 'slack',
      status: body?.status || 'not_connected',
      metadata: slackMetadataFrom(body),
    });

    return NextResponse.json({
      success: true,
      membership: membershipPayload(membership.role, membership.status, organization.type),
      integration,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update Slack status');
  }
}
