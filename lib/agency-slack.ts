import type { SupabaseClient } from '@supabase/supabase-js';

import { getAgencyClientIntegration, type AgencyClientIntegration } from '@/lib/agency-client-integrations';
import { decryptToken } from '@/lib/integrations/crypto';

export const SLACK_CHANNELS_URL = 'https://slack.com/api/conversations.list';
export const SLACK_HISTORY_URL = 'https://slack.com/api/conversations.history';
export const SLACK_IMPORT_DEFAULT_LIMIT = 50;
export const SLACK_IMPORT_MAX_LIMIT = 200;

export type AgencySlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount: number | null;
};

export type AgencySlackMessage = {
  type?: string;
  user?: string;
  username?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  subtype?: string;
};

export type AgencySlackTokenContext = {
  integration: AgencyClientIntegration;
  token: string;
};

export class AgencySlackError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'AgencySlackError';
  }
}

function selectedChannelsFromMetadata(metadata: Record<string, unknown>): AgencySlackChannel[] {
  const value = metadata.selectedChannels;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id) return [];
    return [{
      id,
      name: name || id,
      isPrivate: record.isPrivate === true || record.is_private === true,
      isArchived: record.isArchived === true || record.is_archived === true,
      memberCount: typeof record.memberCount === 'number'
        ? record.memberCount
        : typeof record.num_members === 'number'
          ? record.num_members
          : null,
    }];
  });
}

export function normalizeSlackSelectedChannels(value: unknown): AgencySlackChannel[] {
  if (!Array.isArray(value)) {
    throw new AgencySlackError('channels must be an array');
  }

  const channels = value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new AgencySlackError('channels must contain channel objects');
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id) {
      throw new AgencySlackError('channel id is required');
    }
    return {
      id,
      name: name || id,
      isPrivate: record.isPrivate === true || record.is_private === true,
      isArchived: record.isArchived === true || record.is_archived === true,
      memberCount: typeof record.memberCount === 'number'
        ? record.memberCount
        : typeof record.num_members === 'number'
          ? record.num_members
          : null,
    };
  });

  const byId = new Map<string, AgencySlackChannel>();
  for (const channel of channels) {
    byId.set(channel.id, channel);
  }
  return Array.from(byId.values()).slice(0, 50);
}

export function slackChannelIsSelected(
  integration: AgencyClientIntegration,
  channelId: string
): boolean {
  const selectedIds = new Set([
    ...selectedChannelsFromMetadata(integration.metadata).map((channel) => channel.id),
    ...(Array.isArray(integration.metadata.selectedChannelIds)
      ? integration.metadata.selectedChannelIds.filter((id): id is string => typeof id === 'string')
      : []),
  ]);
  return selectedIds.has(channelId);
}

export function selectedSlackChannelName(
  integration: AgencyClientIntegration,
  channelId: string
): string | null {
  const channel = selectedChannelsFromMetadata(integration.metadata)
    .find((candidate) => candidate.id === channelId);
  return channel?.name || null;
}

export function normalizeSlackImportLimit(value: unknown): number {
  const parsed = Number(value || SLACK_IMPORT_DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return SLACK_IMPORT_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), SLACK_IMPORT_MAX_LIMIT);
}

export async function getAgencySlackTokenContext(
  supabase: SupabaseClient<any>,
  clientId: string
): Promise<AgencySlackTokenContext> {
  const integration = await getAgencyClientIntegration(supabase, clientId, 'slack');
  if (!integration || integration.status !== 'connected') {
    throw new AgencySlackError('Slack workspace is not connected for this client', 409);
  }

  const { data, error } = await supabase
    .from('client_integrations')
    .select('access_token_enc')
    .eq('id', integration.id)
    .maybeSingle() as { data: { access_token_enc: string | null } | null; error: any };

  if (error) {
    throw new AgencySlackError(error.message || 'Failed to load Slack token', 500);
  }

  if (!data?.access_token_enc) {
    throw new AgencySlackError('Slack token storage is not available for this client', 409);
  }

  try {
    return {
      integration,
      token: decryptToken(data.access_token_enc),
    };
  } catch {
    throw new AgencySlackError('Slack token could not be decrypted', 500);
  }
}

async function slackApiGet<T>(
  url: string,
  token: string,
  params: Record<string, string | number | boolean | null | undefined>,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const requestUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      requestUrl.searchParams.set(key, String(value));
    }
  }

  const response = await fetchImpl(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new AgencySlackError('Slack returned an invalid response', 502);
  }

  if (!response.ok || payload.ok === false) {
    throw new AgencySlackError(payload.error || 'Slack API request failed', response.ok ? 502 : response.status || 502);
  }

  return payload as T;
}

export async function listSlackChannels(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<AgencySlackChannel[]> {
  const payload = await slackApiGet<{ channels?: any[] }>(SLACK_CHANNELS_URL, token, {
    exclude_archived: false,
    limit: 200,
    types: 'public_channel,private_channel',
  }, fetchImpl);

  return (payload.channels || []).map((channel) => ({
    id: String(channel.id || ''),
    name: String(channel.name || channel.id || ''),
    isPrivate: channel.is_private === true,
    isArchived: channel.is_archived === true,
    memberCount: typeof channel.num_members === 'number' ? channel.num_members : null,
  })).filter((channel) => channel.id);
}

export async function fetchSlackMessages(
  token: string,
  input: {
    channelId: string;
    limit?: number;
    oldest?: string | null;
    latest?: string | null;
  },
  fetchImpl: typeof fetch = fetch
): Promise<AgencySlackMessage[]> {
  const limit = normalizeSlackImportLimit(input.limit);
  const payload = await slackApiGet<{ messages?: AgencySlackMessage[] }>(SLACK_HISTORY_URL, token, {
    channel: input.channelId,
    limit,
    oldest: input.oldest || undefined,
    latest: input.latest || undefined,
  }, fetchImpl);

  return (payload.messages || [])
    .filter((message) => message.type === 'message' && typeof message.text === 'string' && message.text.trim())
    .slice(0, limit);
}

export function slackMessagesToRawText(messages: AgencySlackMessage[]): string {
  return messages.map((message) => {
    const author = message.user || message.username || message.bot_id || 'unknown';
    const ts = message.ts || 'unknown_time';
    const threadSuffix = message.thread_ts && message.thread_ts !== message.ts
      ? ` thread:${message.thread_ts}`
      : '';
    return `[${ts}${threadSuffix}] ${author}: ${message.text || ''}`;
  }).join('\n');
}
