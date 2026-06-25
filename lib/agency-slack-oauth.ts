import crypto from 'crypto';

export const SLACK_OAUTH_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
export const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
export const DEFAULT_SLACK_OAUTH_SCOPES = [
  'team:read',
  'channels:read',
  'groups:read',
  'channels:history',
  'groups:history',
] as const;

const STATE_TTL_MS = 10 * 60 * 1000;

export type SlackOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  stateSecret: string;
};

export type SlackOAuthStatePayload = {
  clientId: string;
  organizationId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export type SlackOAuthAccessResponse = {
  ok?: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    id?: string;
    name?: string;
  } | null;
  enterprise?: {
    id?: string;
    name?: string;
  } | null;
  authed_user?: {
    id?: string;
    scope?: string;
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
  } | null;
  is_enterprise_install?: boolean;
  expires_in?: number;
};

export class SlackOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackOAuthConfigError';
  }
}

export class SlackOAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackOAuthStateError';
  }
}

export class SlackOAuthExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackOAuthExchangeError';
  }
}

function base64UrlEncode(value: string | Buffer): string {
  const encoded = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value, 'utf8').toString('base64');
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payloadPart: string, secret: string): string {
  return base64UrlEncode(crypto.createHmac('sha256', secret).update(payloadPart).digest());
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getSlackOAuthConfig(env: NodeJS.ProcessEnv = process.env): SlackOAuthConfig {
  const clientId = env.SLACK_CLIENT_ID?.trim();
  const clientSecret = env.SLACK_CLIENT_SECRET?.trim();
  const redirectUri = env.SLACK_REDIRECT_URI?.trim();
  const stateSecret = (
    env.SLACK_OAUTH_STATE_SECRET
    || env.INTEGRATIONS_ENCRYPTION_KEY
    || env.SLACK_CLIENT_SECRET
    || env.NEXTAUTH_SECRET
    || ''
  ).trim();

  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    throw new SlackOAuthConfigError('Slack OAuth is not configured');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: [...DEFAULT_SLACK_OAUTH_SCOPES],
    stateSecret,
  };
}

export function createSlackOAuthState(
  input: Pick<SlackOAuthStatePayload, 'clientId' | 'organizationId' | 'userId'>,
  options: {
    now?: number;
    nonce?: string;
    secret?: string;
    ttlMs?: number;
  } = {}
): string {
  const now = options.now ?? Date.now();
  const secret = options.secret ?? getSlackOAuthConfig().stateSecret;
  const payload: SlackOAuthStatePayload = {
    clientId: input.clientId,
    organizationId: input.organizationId,
    userId: input.userId,
    nonce: options.nonce || crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + (options.ttlMs ?? STATE_TTL_MS),
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadPart, secret);
  return `${payloadPart}.${signature}`;
}

export function parseSlackOAuthState(
  state: string | null | undefined,
  options: {
    now?: number;
    secret?: string;
  } = {}
): SlackOAuthStatePayload {
  if (!state) {
    throw new SlackOAuthStateError('Missing OAuth state');
  }

  const [payloadPart, signature, extra] = state.split('.');
  if (!payloadPart || !signature || extra !== undefined) {
    throw new SlackOAuthStateError('Invalid OAuth state');
  }

  const secret = options.secret ?? getSlackOAuthConfig().stateSecret;
  const expectedSignature = signPayload(payloadPart, secret);
  if (!timingSafeEqualString(signature, expectedSignature)) {
    throw new SlackOAuthStateError('Invalid OAuth state');
  }

  let payload: SlackOAuthStatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    throw new SlackOAuthStateError('Invalid OAuth state');
  }

  if (
    typeof payload.clientId !== 'string'
    || typeof payload.organizationId !== 'string'
    || typeof payload.userId !== 'string'
    || typeof payload.nonce !== 'string'
    || typeof payload.issuedAt !== 'number'
    || typeof payload.expiresAt !== 'number'
  ) {
    throw new SlackOAuthStateError('Invalid OAuth state');
  }

  if ((options.now ?? Date.now()) > payload.expiresAt) {
    throw new SlackOAuthStateError('OAuth state expired');
  }

  return payload;
}

export function buildSlackAuthorizeUrl(config: SlackOAuthConfig, state: string): URL {
  const url = new URL(SLACK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('scope', config.scopes.join(','));
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  return url;
}

export async function exchangeSlackOAuthCode(
  code: string,
  config: SlackOAuthConfig,
  fetchImpl: typeof fetch = fetch
): Promise<SlackOAuthAccessResponse> {
  const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetchImpl(SLACK_OAUTH_ACCESS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  const text = await response.text();
  let payload: SlackOAuthAccessResponse;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new SlackOAuthExchangeError('Slack OAuth returned an invalid response');
  }

  if (!response.ok || payload.ok === false) {
    throw new SlackOAuthExchangeError(payload.error || 'Slack OAuth exchange failed');
  }

  return payload;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function splitScopeString(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function slackConnectedMetadataFromOAuthResponse(
  response: SlackOAuthAccessResponse,
  connectedBy: string,
  connectedAt: string
): Record<string, unknown> {
  const teamId = optionalString(response.team?.id);
  const teamName = optionalString(response.team?.name);

  if (!teamId) {
    throw new SlackOAuthExchangeError('Slack OAuth response missing workspace id');
  }

  return {
    mode: 'oauth_connected',
    externalConnection: true,
    workspaceId: teamId,
    workspaceName: teamName,
    teamId,
    teamName,
    enterpriseId: optionalString(response.enterprise?.id),
    enterpriseName: optionalString(response.enterprise?.name),
    appId: optionalString(response.app_id),
    botUserId: optionalString(response.bot_user_id),
    authedUserId: optionalString(response.authed_user?.id),
    scopes: splitScopeString(response.scope),
    authedUserScopes: splitScopeString(response.authed_user?.scope),
    tokenType: optionalString(response.token_type),
    isEnterpriseInstall: response.is_enterprise_install === true,
    connectedBy,
    connectedAt,
    tokenStorage: 'deferred',
    tokenStored: false,
  };
}

export function safeSlackOAuthReason(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'oauth_failed';
  return value.trim().replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) || 'oauth_failed';
}
