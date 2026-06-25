import { NextRequest, NextResponse } from 'next/server';

import {
  createAgencySourceImport,
  AgencySourceImportValidationError,
} from '@/lib/agency-source-imports';
import {
  AgencySlackError,
  fetchSlackMessages,
  getAgencySlackTokenContext,
  normalizeSlackImportLimit,
  selectedSlackChannelName,
  slackChannelIsSelected,
  slackMessagesToRawText,
} from '@/lib/agency-slack';
import { RouteAccessError } from '@/lib/api/route-auth';
import {
  canManageAgencyClient,
  canManageAgencySourceImport,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { OrganizationAccessError } from '@/lib/authz/types';
import { isDemoUser } from '@/lib/demo-mode';
import { uploadRatelimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AgencySlackError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof AgencySourceImportValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OrganizationAccessError || error instanceof RouteAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error('[AGENCY_SLACK_IMPORT] Unexpected error:', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function stringFrom(body: any, camel: string, snake: string): string | null {
  if (typeof body?.[camel] === 'string') return body[camel].trim() || null;
  if (typeof body?.[snake] === 'string') return body[snake].trim() || null;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = stringFrom(body, 'clientId', 'client_id');
    const channelId = stringFrom(body, 'channelId', 'channel_id');
    const requestedOrganizationId = stringFrom(body, 'organizationId', 'organization_id');

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required for Slack imports' }, { status: 400 });
    }
    if (!channelId) {
      return NextResponse.json({ error: 'channel_id is required for Slack imports' }, { status: 400 });
    }

    const { user, organization, membership } = await requireAgencyClientAccess(request, clientId, {
      requestedOrganizationId,
    });

    if (isDemoUser(user)) {
      return NextResponse.json({ error: 'Demo account is read-only' }, { status: 403 });
    }

    if (!canManageAgencySourceImport(membership.role, organization.type)) {
      return NextResponse.json(
        { error: 'Slack imports require internal agency operator access' },
        { status: 403 }
      );
    }

    const { success } = await uploadRatelimit.limit(user.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Too many import requests.' },
        { status: 429 }
      );
    }

    const { integration, token } = await getAgencySlackTokenContext(supabaseAdmin, clientId);
    const isSelected = slackChannelIsSelected(integration, channelId);
    const isAdmin = canManageAgencyClient(membership.role, organization.type);
    if (!isSelected && !isAdmin) {
      return NextResponse.json(
        { error: 'Slack channel must be selected before import' },
        { status: 403 }
      );
    }

    const limit = normalizeSlackImportLimit(body?.limit);
    const oldest = stringFrom(body, 'oldest', 'oldest');
    const latest = stringFrom(body, 'latest', 'latest');
    const messages = await fetchSlackMessages(token, {
      channelId,
      limit,
      oldest,
      latest,
    });
    const rawText = slackMessagesToRawText(messages);
    const channelName = selectedSlackChannelName(integration, channelId) || channelId;
    const importedAt = new Date().toISOString();
    const sourceImport = await createAgencySourceImport(supabaseAdmin, organization.id, user.id, {
      client_id: clientId,
      provider: 'slack',
      sourceTitle: `Slack import: ${channelName}`,
      rawText: rawText || `No text messages returned for Slack channel ${channelName}.`,
      summary: messages.length
        ? `Imported ${messages.length} Slack message${messages.length === 1 ? '' : 's'} from ${channelName}.`
        : null,
      metadata: {
        importedVia: 'agency_slack_manual_import',
        channelId,
        channelName,
        requestedLimit: body?.limit ?? null,
        appliedLimit: limit,
        messageCount: messages.length,
        oldest,
        latest,
        importedBy: user.id,
        importedAt,
        selectedChannel: isSelected,
      },
    });

    return NextResponse.json({
      success: true,
      sourceImport,
      messageCount: messages.length,
      limit,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'Failed to import Slack messages');
  }
}
