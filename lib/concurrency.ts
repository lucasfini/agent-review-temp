import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = Redis.fromEnv();
    }
} catch (e) {
    console.warn('Failed to initialize Redis for concurrency control.', e);
}

const GLOBAL_CONCURRENCY_KEY = 'audiorepurpose:global_concurrency_set';
const MAX_CONCURRENT_JOBS = 2; // Strict limit for 2 vCPU server
const JOB_LOCK_TTL_SECONDS = 1800; // 30 minutes safety timeout

/**
 * Renews the TTL for an active job lock.
 */
export async function heartbeatGlobalJobLock(jobId: string): Promise<void> {
    if (!redis) return;
    try {
        await redis.set(`audiorepurpose:job_lock:${jobId}`, '1', { ex: JOB_LOCK_TTL_SECONDS });
    } catch (error) {
        console.error('[CONCURRENCY] Error renewing heartbeat:', error);
    }
}

/**
 * Attempts to acquire a global lock for a generation job.
 * Returns true if the lock was acquired, false otherwise.
 */
export async function acquireGlobalJobLock(jobId: string): Promise<boolean> {
    if (!redis) return true; // Bypassed if Redis is not configured

    try {
        // Cleanup expired jobs from the set before checking
        // We use a separate key per job to handle TTLs effectively
        const activeJobIds = await redis.smembers(GLOBAL_CONCURRENCY_KEY);
        
        // Verify which jobs are actually still alive in Redis
        const aliveJobIds: string[] = [];
        if (activeJobIds.length > 0) {
            const pipeline = redis.pipeline();
            activeJobIds.forEach(id => pipeline.exists(`audiorepurpose:job_lock:${id}`));
            const results = await pipeline.exec();
            
            for (let i = 0; i < activeJobIds.length; i++) {
                if (results[i] === 1) {
                    aliveJobIds.push(activeJobIds[i]);
                }
            }
            
            // Sync the set if we found dead jobs
            if (aliveJobIds.length !== activeJobIds.length) {
                if (aliveJobIds.length === 0) {
                    await redis.del(GLOBAL_CONCURRENCY_KEY);
                } else {
                    // This is slightly inefficient but safe for low concurrency numbers
                    await redis.del(GLOBAL_CONCURRENCY_KEY);
                    // Explicitly pass the first element to satisfy TypeScript rest parameter requirements
                    await redis.sadd(GLOBAL_CONCURRENCY_KEY, aliveJobIds[0], ...aliveJobIds.slice(1));
                }
            }
        }

        if (aliveJobIds.length < MAX_CONCURRENT_JOBS) {
            // Check if we are already in the set (idempotency)
            if (aliveJobIds.includes(jobId)) return true;

            // Acquire lock
            await redis.sadd(GLOBAL_CONCURRENCY_KEY, jobId);
            await redis.set(`audiorepurpose:job_lock:${jobId}`, '1', { ex: JOB_LOCK_TTL_SECONDS });
            console.log(`[CONCURRENCY] 🔒 Acquired global lock for job ${jobId}. Active jobs: ${aliveJobIds.length + 1}/${MAX_CONCURRENT_JOBS}`);
            return true;
        }

        console.log(`[CONCURRENCY] ⏳ Global concurrency limit reached (${aliveJobIds.length}/${MAX_CONCURRENT_JOBS}). Job ${jobId} must wait.`);
        return false;
    } catch (error) {
        console.error('[CONCURRENCY] Error acquiring global lock:', error);
        return true; // Fail open to avoid blocking everything
    }
}

/**
 * Releases a global lock for a generation job.
 */
export async function releaseGlobalJobLock(jobId: string): Promise<void> {
    if (!redis) return;

    try {
        await redis.srem(GLOBAL_CONCURRENCY_KEY, jobId);
        await redis.del(`audiorepurpose:job_lock:${jobId}`);
        console.log(`[CONCURRENCY] 🔓 Released global lock for job ${jobId}`);
    } catch (error) {
        console.error('[CONCURRENCY] Error releasing global lock:', error);
    }
}
