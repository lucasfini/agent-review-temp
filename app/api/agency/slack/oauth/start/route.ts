import { NextRequest, NextResponse } from 'next/server';

import {
  buildSlackAuthorizeUrl,
  createSlackOAuthState,
  getSlackOAuthConfig,
  SlackOAuthConfigError,
} from '@/lib/agency-slack-oauth';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requestedOrganizationIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('organization_id');
}

function clientIdFrom(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get('client_id')?.trim() || null;
}

function errorResponse(error: unknown) {
  if (error instanceof SlackOAuthConfigError) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_SLACK_OAUTH_START] Unexpected error:', error);
  return NextResponse.json({ error: 'Failed to start Slack OAuth' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const clientId = clientIdFrom(request);
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required for Slack OAuth' }, { status: 400 });
    }

    const { user, organization, membership } = await requireAgencyClientAccess(request, clientId, {
      requestedOrganizationId: requestedOrganizationIdFrom(request),
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencyClient(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Slack OAuth requires internal agency admin access' },
        { status: 403 }
      );
    }

    const config = getSlackOAuthConfig();
    const state = createSlackOAuthState({
      clientId,
      organizationId: organization.id,
      userId: user.id,
    }, {
      secret: config.stateSecret,
    });
    const slackUrl = buildSlackAuthorizeUrl(config, state);

    if (new URL(request.url).searchParams.get('mode') === 'json') {
      return NextResponse.json({
        success: true,
        url: slackUrl.toString(),
        scopes: config.scopes,
      });
    }

    return NextResponse.redirect(slackUrl.toString());
  } catch (error) {
    return errorResponse(error);
  }
}
