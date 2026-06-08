import { NextRequest, NextResponse } from 'next/server';

import {
  getAgencyClientIntegration,
  setAgencyClientIntegration,
} from '@/lib/agency-client-integrations';
import {
  AgencySlackError,
  normalizeSlackSelectedChannels,
} from '@/lib/agency-slack';
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
  if (error instanceof AgencySlackError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_SLACK_CHANNEL_SELECTION] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function clientIdFrom(body: any): string | null {
  if (typeof body?.clientId === 'string') return body.clientId.trim() || null;
  if (typeof body?.client_id === 'string') return body.client_id.trim() || null;
  return null;
}

function requestedOrganizationIdFrom(body: any): string | null {
  if (typeof body?.organizationId === 'string') return body.organizationId;
  if (typeof body?.organization_id === 'string') return body.organization_id;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = clientIdFrom(body);
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required for Slack channel selection' }, { status: 400 });
    }

    const { user, organization, membership } = await requireAgencyClientAccess(request, clientId, {
      requestedOrganizationId: requestedOrganizationIdFrom(body),
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencyClient(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Slack channel selection requires internal agency admin access' },
        { status: 403 }
      );
    }

    const channels = normalizeSlackSelectedChannels(body?.channels);
    const existing = await getAgencyClientIntegration(supabaseAdmin, clientId, 'slack');
    if (!existing || existing.status !== 'connected') {
      throw new AgencySlackError('Slack workspace is not connected for this client', 409);
    }

    const integration = await setAgencyClientIntegration(supabaseAdmin, clientId, {
      provider: 'slack',
      status: existing.status,
      metadata: {
        selectedChannels: channels,
        selectedChannelIds: channels.map((channel) => channel.id),
        selectedChannelNames: channels.map((channel) => channel.name),
        selectedChannelsUpdatedAt: new Date().toISOString(),
        selectedChannelsUpdatedBy: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      integration,
      channels,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to save Slack channel selection');
  }
}
