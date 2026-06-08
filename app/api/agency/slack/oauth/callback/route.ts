import { NextRequest, NextResponse } from 'next/server';

import { setAgencyClientIntegration } from '@/lib/agency-client-integrations';
import {
  exchangeSlackOAuthCode,
  getSlackOAuthConfig,
  parseSlackOAuthState,
  safeSlackOAuthReason,
  slackConnectedMetadataFromOAuthResponse,
  SlackOAuthConfigError,
  SlackOAuthExchangeError,
  SlackOAuthStateError,
  type SlackOAuthStatePayload,
} from '@/lib/agency-slack-oauth';
import {
  canManageAgencyClient,
  requireAgencyClientAccess,
} from '@/lib/authz/agency-permissions';
import { isDemoUser } from '@/lib/demo-mode';
import { encryptToken } from '@/lib/integrations/crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function slackPageRedirect(
  request: NextRequest,
  status: 'success' | 'error',
  reason: string,
  statePayload?: Pick<SlackOAuthStatePayload, 'organizationId' | 'clientId'> | null
) {
  const url = new URL('/dashboard/agency/slack', request.url);
  url.searchParams.set('slack_oauth', status);
  url.searchParams.set('reason', safeSlackOAuthReason(reason));
  if (statePayload?.organizationId) {
    url.searchParams.set('organization_id', statePayload.organizationId);
  }
  if (statePayload?.clientId) {
    url.searchParams.set('client_id', statePayload.clientId);
  }
  return NextResponse.redirect(url);
}

function tryParseState(state: string | null, stateSecret: string): SlackOAuthStatePayload | null {
  try {
    return parseSlackOAuthState(state, { secret: stateSecret });
  } catch {
    return null;
  }
}

function redirectForError(request: NextRequest, reason: string, payload?: SlackOAuthStatePayload | null) {
  return slackPageRedirect(request, 'error', reason, payload);
}

function scopeList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
}

function encryptedSlackTokenFields(slackResponse: { access_token?: string; refresh_token?: string; token_type?: string; scope?: string; expires_in?: number }) {
  if (!slackResponse.access_token) {
    return {};
  }

  try {
    return {
      accessTokenEncrypted: encryptToken(slackResponse.access_token),
      refreshTokenEncrypted: slackResponse.refresh_token ? encryptToken(slackResponse.refresh_token) : null,
      tokenType: slackResponse.token_type || null,
      tokenScopes: scopeList(slackResponse.scope),
      tokenExpiresAt: typeof slackResponse.expires_in === 'number'
        ? new Date(Date.now() + slackResponse.expires_in * 1000).toISOString()
        : null,
    };
  } catch {
    throw new SlackOAuthExchangeError('slack_token_storage_not_configured');
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const slackError = searchParams.get('error');

  let config;
  try {
    config = getSlackOAuthConfig();
  } catch (error) {
    if (error instanceof SlackOAuthConfigError) {
      return redirectForError(request, 'slack_oauth_not_configured');
    }
    throw error;
  }

  const parsedState = tryParseState(state, config.stateSecret);

  if (slackError) {
    return redirectForError(request, slackError, parsedState);
  }

  if (!code) {
    return redirectForError(request, 'missing_code', parsedState);
  }

  if (!parsedState) {
    return redirectForError(request, 'invalid_state');
  }

  try {
    const { user, organization, membership } = await requireAgencyClientAccess(
      request,
      parsedState.clientId,
      { requestedOrganizationId: parsedState.organizationId }
    );

    if (user.id !== parsedState.userId) {
      return redirectForError(request, 'invalid_state_user', parsedState);
    }

    if (isDemoUser(user)) {
      return redirectForError(request, 'demo_read_only', parsedState);
    }

    if (!canManageAgencyClient(membership.role, organization.type)) {
      return redirectForError(request, 'agency_admin_required', parsedState);
    }

    const slackResponse = await exchangeSlackOAuthCode(code, config);
    const connectedAt = new Date().toISOString();
    const tokenFields = encryptedSlackTokenFields(slackResponse);
    const tokenStored = Boolean(tokenFields.accessTokenEncrypted);
    const metadata = {
      ...slackConnectedMetadataFromOAuthResponse(slackResponse, user.id, connectedAt),
      tokenStorage: tokenStored ? 'client_integrations_encrypted_columns' : 'unavailable',
      tokenStored,
    };

    await setAgencyClientIntegration(supabaseAdmin, parsedState.clientId, {
      provider: 'slack',
      status: 'connected',
      connectedAt,
      metadata,
      ...tokenFields,
    });

    return slackPageRedirect(request, 'success', 'connected', parsedState);
  } catch (error) {
    if (error instanceof SlackOAuthStateError) {
      return redirectForError(request, error.message, parsedState);
    }

    if (error instanceof SlackOAuthConfigError) {
      return redirectForError(request, 'slack_oauth_not_configured', parsedState);
    }

    if (error instanceof SlackOAuthExchangeError) {
      return redirectForError(request, error.message, parsedState);
    }

    console.error('[AGENCY_SLACK_OAUTH_CALLBACK] Unexpected error:', error);
    return redirectForError(request, 'oauth_callback_failed', parsedState);
  }
}
