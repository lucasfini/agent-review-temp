import { NextRequest, NextResponse } from 'next/server';

import {
  AgencySlackError,
  getAgencySlackTokenContext,
  listSlackChannels,
} from '@/lib/agency-slack';
import { RouteAccessError } from '@/lib/api/route-auth';
import { requireAgencyClientAccess } from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
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

  console.error('[AGENCY_SLACK_CHANNELS] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id')?.trim();
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required for Slack channels' }, { status: 400 });
    }

    const context = await requireAgencyClientAccess(request, clientId, {
      requestedOrganizationId: searchParams.get('organization_id'),
    });
    const { integration, token } = await getAgencySlackTokenContext(supabaseAdmin, clientId);
    const channels = await listSlackChannels(token);

    return NextResponse.json({
      success: true,
      organization: {
        id: context.organization.id,
        name: context.organization.name,
        type: context.organization.type,
      },
      integration,
      channels,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load Slack channels');
  }
}
