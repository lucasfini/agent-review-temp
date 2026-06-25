import { createHash } from 'crypto';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import type { AgencyLeadInput } from '@/lib/agency-leads';

export type AgencyLeadRateLimitKind = 'ip' | 'email';

export type AgencyLeadRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  backend: 'upstash' | 'memory';
  degraded: boolean;
};

export type AgencyLeadSpamResult = {
  isSpam: boolean;
  reason: string | null;
};

type DurableLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending?: Promise<unknown>;
};

type DurableLimiter = {
  limit: (identifier: string) => Promise<DurableLimitResult>;
};

type LimitConfig = {
  max: number;
  windowMs: number;
  upstashWindow: `${number} ${'s' | 'm' | 'h' | 'd'}`;
};

const LIMIT_CONFIG: Record<AgencyLeadRateLimitKind, LimitConfig> = {
  ip: {
    max: 8,
    windowMs: 10 * 60 * 1000,
    upstashWindow: '10 m',
  },
  email: {
    max: 3,
    windowMs: 60 * 60 * 1000,
    upstashWindow: '1 h',
  },
};

const memoryBuckets = new Map<string, number[]>();
let redisClient: Redis | null | undefined;
let durableLimiters: Partial<Record<AgencyLeadRateLimitKind, DurableLimiter | null>> = {};
let testDurableLimiters: Partial<Record<AgencyLeadRateLimitKind, DurableLimiter | null>> | null = null;

function normalizedValue(value: string): string {
  return value.trim().toLowerCase() || 'unknown';
}

function hashValue(value: string): string {
  return createHash('sha256').update(normalizedValue(value)).digest('hex').slice(0, 32);
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  try {
    redisClient = Redis.fromEnv();
  } catch (error) {
    console.warn('[AGENCY_LEAD_RATE_LIMIT] Failed to initialize Upstash Redis:', error);
    redisClient = null;
  }

  return redisClient;
}

function durableLimiterFor(kind: AgencyLeadRateLimitKind): DurableLimiter | null {
  if (testDurableLimiters) {
    return testDurableLimiters[kind] ?? null;
  }

  if (durableLimiters[kind] !== undefined) {
    return durableLimiters[kind] ?? null;
  }

  const redis = getRedisClient();
  if (!redis) {
    durableLimiters[kind] = null;
    return null;
  }

  const config = LIMIT_CONFIG[kind];
  durableLimiters[kind] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.max, config.upstashWindow),
    analytics: false,
    prefix: `audiorepurpose:agency-leads:${kind}`,
  });

  return durableLimiters[kind] ?? null;
}

function memoryRateLimit(
  key: string,
  config: LimitConfig,
  now: number,
  degraded: boolean
): AgencyLeadRateLimitResult {
  const cutoff = now - config.windowMs;
  const recent = (memoryBuckets.get(key) || []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= config.max) {
    const retryAfterMs = Math.max(0, config.windowMs - (now - recent[0]));
    memoryBuckets.set(key, recent);
    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      backend: 'memory',
      degraded,
    };
  }

  const next = [...recent, now];
  memoryBuckets.set(key, next);
  return {
    allowed: true,
    limit: config.max,
    remaining: Math.max(0, config.max - next.length),
    retryAfterSeconds: 0,
    backend: 'memory',
    degraded,
  };
}

export function buildLeadRateLimitKey(kind: AgencyLeadRateLimitKind, value: string): string {
  return `agency-lead:${kind}:${hashValue(value)}`;
}

export async function checkAgencyLeadRateLimit({
  kind,
  value,
  now = Date.now(),
}: {
  kind: AgencyLeadRateLimitKind;
  value: string;
  now?: number;
}): Promise<AgencyLeadRateLimitResult> {
  const config = LIMIT_CONFIG[kind];
  const key = buildLeadRateLimitKey(kind, value);
  const limiter = durableLimiterFor(kind);

  if (!limiter) {
    return memoryRateLimit(key, config, now, false);
  }

  try {
    const result = await limiter.limit(key);
    const retryAfterMs = Math.max(0, result.reset - now);
    return {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      retryAfterSeconds: result.success ? 0 : Math.ceil(retryAfterMs / 1000),
      backend: 'upstash',
      degraded: false,
    };
  } catch (error) {
    console.warn('[AGENCY_LEAD_RATE_LIMIT] Durable rate limit failed; using memory fallback:', error);
    return memoryRateLimit(key, config, now, true);
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isLikelySpamLead(input: AgencyLeadInput): AgencyLeadSpamResult {
  if (stringField(input.referralCode)) {
    return { isSpam: true, reason: 'honeypot' };
  }

  const fields = [
    input.name,
    input.email,
    input.company,
    input.website,
    input.role,
    input.packageInterest,
    input.package_interest,
    input.budgetRange,
    input.budget_range,
    input.timeline,
    input.message,
  ].map(stringField);
  const combined = fields.join('\n').toLowerCase();
  const linkCount = (combined.match(/https?:\/\/|www\./g) || []).length;

  if (linkCount >= 4) {
    return { isSpam: true, reason: 'too_many_links' };
  }

  if (/<a\s+href|<\/a>|\[url=|\[\/url\]/i.test(combined)) {
    return { isSpam: true, reason: 'markup_link_spam' };
  }

  if (/(.)\1{24,}/.test(combined)) {
    return { isSpam: true, reason: 'repeated_characters' };
  }

  return { isSpam: false, reason: null };
}

export function resetAgencyLeadRateLimitForTests() {
  memoryBuckets.clear();
  durableLimiters = {};
  testDurableLimiters = null;
  redisClient = undefined;
}

export function setAgencyLeadDurableLimiterForTests(
  kind: AgencyLeadRateLimitKind,
  limiter: DurableLimiter | null
) {
  testDurableLimiters = {
    ...(testDurableLimiters || {}),
    [kind]: limiter,
  };
}
