import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = Redis.fromEnv();
    } else {
        console.warn('Upstash Redis credentials missing. Rate limiting bypassed.');
    }
} catch (e) {
    console.warn('Failed to initialize Upstash Redis. Rate limiting will be bypassed.', e);
}

// A silent fallback for environments without Redis configured
const fallbackLimiter = {
    limit: async (identifier: string) => {
        return { success: true, limit: 100, remaining: 99, reset: Date.now() + 60000, pending: Promise.resolve() };
    }
};

/**
 * Stricter rate limit for costly AI tasks like transcription and content generation
 */
export const aiRatelimit = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 m'),
        analytics: true,
        prefix: 'audiorepurpose:ai:ratelimit',
    })
    : fallbackLimiter;

/**
 * Standard rate limit for general operations like upload init
 */
export const uploadRatelimit = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        analytics: true,
        prefix: 'audiorepurpose:upload:ratelimit',
    })
    : fallbackLimiter;
