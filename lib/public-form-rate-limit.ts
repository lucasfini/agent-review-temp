import { createHash } from 'crypto';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type PublicFormRateLimitRoute = 'contact' | 'waitlist';
export type PublicFormRateLimitKind = 'ip' | 'email';

export type PublicFormRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  backend: 'upstash' | 'memory';
  degraded: boolean;
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

const LIMIT_CONFIG: Record<PublicFormRateLimitRoute, Record<PublicFormRateLimitKind, LimitConfig>> = {
  contact: {
    ip: {
      max: 10,
      windowMs: 10 * 60 * 1000,
      upstashWindow: '10 m',
    },
    email: {
      max: 3,
      windowMs: 60 * 60 * 1000,
      upstashWindow: '1 h',
    },
  },
  waitlist: {
    ip: {
      max: 20,
      windowMs: 10 * 60 * 1000,
      upstashWindow: '10 m',
    },
    email: {
      max: 5,
      windowMs: 60 * 60 * 1000,
      upstashWindow: '1 h',
    },
  },
};

const memoryBuckets = new Map<string, number[]>();
let redisClient: Redis | null | undefined;
let durableLimiters: Partial<Record<string, DurableLimiter | null>> = {};
let testDurableLimiters: Partial<Record<string, DurableLimiter | null>> | null = null;

function normalizedValue(value: string): string {
  return value.trim().toLowerCase() || 'unknown';
}

function hashValue(value: string): string {
  return createHash('sha256').update(normalizedValue(value)).digest('hex').slice(0, 32);
}

function limiterId(route: PublicFormRateLimitRoute, kind: PublicFormRateLimitKind): string {
  return `${route}:${kind}`;
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
    console.warn('[PUBLIC_FORM_RATE_LIMIT] Failed to initialize Upstash Redis:', error);
    redisClient = null;
  }

  return redisClient;
}

function durableLimiterFor(
  route: PublicFormRateLimitRoute,
  kind: PublicFormRateLimitKind
): DurableLimiter | null {
  const id = limiterId(route, kind);
  if (testDurableLimiters) {
    return testDurableLimiters[id] ?? null;
  }

  if (durableLimiters[id] !== undefined) {
    return durableLimiters[id] ?? null;
  }

  const redis = getRedisClient();
  if (!redis) {
    durableLimiters[id] = null;
    return null;
  }

  const config = LIMIT_CONFIG[route][kind];
  durableLimiters[id] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.max, config.upstashWindow),
    analytics: false,
    prefix: `audiorepurpose:public-form:${route}:${kind}`,
  });

  return durableLimiters[id] ?? null;
}

function memoryRateLimit(
  key: string,
  config: LimitConfig,
  now: number,
  degraded: boolean
): PublicFormRateLimitResult {
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

export function buildPublicFormRateLimitKey(
  route: PublicFormRateLimitRoute,
  kind: PublicFormRateLimitKind,
  value: string
): string {
  return `public-form:${route}:${kind}:${hashValue(value)}`;
}

export async function checkPublicFormRateLimit({
  route,
  kind,
  value,
  now = Date.now(),
}: {
  route: PublicFormRateLimitRoute;
  kind: PublicFormRateLimitKind;
  value: string;
  now?: number;
}): Promise<PublicFormRateLimitResult> {
  const config = LIMIT_CONFIG[route][kind];
  const key = buildPublicFormRateLimitKey(route, kind, value);
  const limiter = durableLimiterFor(route, kind);

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
    console.warn('[PUBLIC_FORM_RATE_LIMIT] Durable rate limit failed; using memory fallback:', error);
    return memoryRateLimit(key, config, now, true);
  }
}

export function resetPublicFormRateLimitForTests() {
  memoryBuckets.clear();
  durableLimiters = {};
  testDurableLimiters = null;
  redisClient = undefined;
}

export function setPublicFormDurableLimiterForTests(
  route: PublicFormRateLimitRoute,
  kind: PublicFormRateLimitKind,
  limiter: DurableLimiter | null
) {
  testDurableLimiters = {
    ...(testDurableLimiters || {}),
    [limiterId(route, kind)]: limiter,
  };
}
