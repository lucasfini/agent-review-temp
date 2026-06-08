import type { SupabaseClient } from '@supabase/supabase-js';

export const AGENCY_FUNNEL_EVENT_NAMES = [
  'agency_page_view',
  'agency_cta_click',
  'agency_intake_view',
  'agency_intake_started',
  'agency_intake_submitted',
  'agency_intake_validation_error',
  'agency_thank_you_view',
] as const;

export type AgencyFunnelEventName = typeof AGENCY_FUNNEL_EVENT_NAMES[number];

export type AgencyFunnelEventInput = {
  eventName?: unknown;
  event_name?: unknown;
  anonymousId?: unknown;
  anonymous_id?: unknown;
  leadId?: unknown;
  lead_id?: unknown;
  path?: unknown;
  referrer?: unknown;
  utmSource?: unknown;
  utm_source?: unknown;
  utmMedium?: unknown;
  utm_medium?: unknown;
  utmCampaign?: unknown;
  utm_campaign?: unknown;
  utmContent?: unknown;
  utm_content?: unknown;
  utmTerm?: unknown;
  utm_term?: unknown;
  metadata?: unknown;
  metadata_json?: unknown;
};

export class AgencyFunnelEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgencyFunnelEventValidationError';
  }
}

const MAX_SHORT_TEXT_LENGTH = 240;
const MAX_PATH_LENGTH = 800;
const MAX_REFERRER_LENGTH = 1000;
const MAX_METADATA_STRING_LENGTH = 500;
const MAX_METADATA_KEYS = 20;
const EVENT_SET = new Set<string>(AGENCY_FUNNEL_EVENT_NAMES);
const PII_KEY_PATTERN = /(email|name|message|phone|company|website|url|token|secret|password|cookie|authorization)/i;
const ALLOWED_METADATA_KEYS = new Set([
  'ctaHref',
  'ctaLabel',
  'error',
  'errorType',
  'field',
  'formId',
  'source',
  'selectedOfferTitle',
]);

const eventBuckets = new Map<string, number[]>();
const EVENT_LIMIT = 120;
const EVENT_WINDOW_MS = 10 * 60 * 1000;

function coalesce(input: AgencyFunnelEventInput, ...keys: Array<keyof AgencyFunnelEventInput>): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function optionalString(value: unknown, maxLength: number, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AgencyFunnelEventValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function optionalUuid(value: unknown, field: string): string | null {
  const uuid = optionalString(value, 36, field);
  if (!uuid) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new AgencyFunnelEventValidationError(`${field} must be a valid UUID`);
  }
  return uuid;
}

function validateEventName(value: unknown): AgencyFunnelEventName {
  if (typeof value !== 'string' || !EVENT_SET.has(value)) {
    throw new AgencyFunnelEventValidationError('Unsupported agency funnel event');
  }
  return value as AgencyFunnelEventName;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgencyFunnelEventValidationError('metadata must be an object');
  }
  return value as Record<string, unknown>;
}

export function sanitizeAgencyFunnelMetadata(value: unknown): Record<string, string | number | boolean | null> {
  const metadata = metadataObject(value);
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, rawValue] of Object.entries(metadata)) {
    if (Object.keys(sanitized).length >= MAX_METADATA_KEYS) break;
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (PII_KEY_PATTERN.test(key)) continue;

    if (
      typeof rawValue === 'string'
      || typeof rawValue === 'number'
      || typeof rawValue === 'boolean'
      || rawValue === null
    ) {
      sanitized[key] = typeof rawValue === 'string'
        ? rawValue.trim().slice(0, MAX_METADATA_STRING_LENGTH)
        : rawValue;
    }
  }

  return sanitized;
}

export function normalizeAgencyFunnelEvent(input: AgencyFunnelEventInput): Record<string, unknown> {
  const eventName = validateEventName(coalesce(input, 'eventName', 'event_name'));

  return {
    event_name: eventName,
    anonymous_id: optionalString(coalesce(input, 'anonymousId', 'anonymous_id'), MAX_SHORT_TEXT_LENGTH, 'anonymousId'),
    lead_id: optionalUuid(coalesce(input, 'leadId', 'lead_id'), 'leadId'),
    path: optionalString(input.path, MAX_PATH_LENGTH, 'path'),
    referrer: optionalString(input.referrer, MAX_REFERRER_LENGTH, 'referrer'),
    utm_source: optionalString(coalesce(input, 'utmSource', 'utm_source'), MAX_SHORT_TEXT_LENGTH, 'utmSource'),
    utm_medium: optionalString(coalesce(input, 'utmMedium', 'utm_medium'), MAX_SHORT_TEXT_LENGTH, 'utmMedium'),
    utm_campaign: optionalString(coalesce(input, 'utmCampaign', 'utm_campaign'), MAX_SHORT_TEXT_LENGTH, 'utmCampaign'),
    utm_content: optionalString(coalesce(input, 'utmContent', 'utm_content'), MAX_SHORT_TEXT_LENGTH, 'utmContent'),
    utm_term: optionalString(coalesce(input, 'utmTerm', 'utm_term'), MAX_SHORT_TEXT_LENGTH, 'utmTerm'),
    metadata_json: sanitizeAgencyFunnelMetadata(coalesce(input, 'metadata', 'metadata_json')),
  };
}

export function checkAgencyFunnelEventRateLimit(identifier: string, now = Date.now()) {
  const key = identifier.trim() || 'unknown';
  const cutoff = now - EVENT_WINDOW_MS;
  const recent = (eventBuckets.get(key) || []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= EVENT_LIMIT) {
    const retryAfterMs = Math.max(0, EVENT_WINDOW_MS - (now - recent[0]));
    eventBuckets.set(key, recent);
    return {
      allowed: false,
      limit: EVENT_LIMIT,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  const next = [...recent, now];
  eventBuckets.set(key, next);
  return {
    allowed: true,
    limit: EVENT_LIMIT,
    remaining: Math.max(0, EVENT_LIMIT - next.length),
    retryAfterSeconds: 0,
  };
}

export function resetAgencyFunnelEventRateLimitForTests() {
  eventBuckets.clear();
}

export async function createAgencyFunnelEvent(
  supabase: SupabaseClient<any>,
  input: AgencyFunnelEventInput
) {
  const payload = normalizeAgencyFunnelEvent(input);
  const { error } = await supabase
    .from('agency_funnel_events')
    .insert(payload as any) as { error: any };

  if (error) {
    throw new Error(error.message || 'Failed to record agency funnel event');
  }

  return payload;
}
