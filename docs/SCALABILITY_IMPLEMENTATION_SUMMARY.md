# Concurrency & Scalability Implementation Summary

## Status: Implemented & Optimized (Production Ready)
This document summarizes the architectural changes made to enable a 2 vCPU, 4GB RAM DigitalOcean server to handle concurrent users without crashing (OOM) or locking up (CPU exhaustion).

---

## 1. Zero-Disk Transcription Flow
**Problem:** Previously, the server downloaded the entire audio file from storage into RAM/Disk before sending it to transcription providers. Large files or concurrent uploads caused immediate crashes.

**Solution:** Implemented **Presigned URL Handoff**.
- **Action:** `app/api/transcribe/route.ts` now generates a temporary Presigned GET URL from Cloudflare R2.
- **Handoff:** This URL is passed to AssemblyAI/Deepgram. They download the file directly from Cloudflare's high-speed network.
- **Impact:** **100% reduction** in server-side RAM and Disk usage for the transcription phase. The server now processes 0 bytes of audio data.

## 2. Global Concurrency Control (Redis Semaphore)
**Problem:** If multiple users triggered "Content Generation" at once, the server attempted to run all heavy LLM pipelines in parallel, overwhelming the 2 vCPUs.

**Solution:** **Global Semaphore Throttling with Heartbeat**.
- **Mechanism:** Created `lib/concurrency.ts` using Upstash Redis.
- **Limit:** A strict global limit of **2 concurrent heavy jobs** is enforced server-wide.
- **Process:**
    1. A job attempts to acquire a lock in Redis.
    2. If 2 jobs are already running, the job yields, stays in the `queued` state, and the UI continues to show neutral processing copy.
    3. **Heartbeat Logic:** Active jobs now send a heartbeat every 5 minutes to renew their lock. The lock has a 30-minute safety TTL.
    4. Capacity is released automatically when a job completes or fails (or if the heartbeat stops for > 30 mins).
- **Polling:** Created `/api/internal/process-queued-jobs` to allow a cron job to trigger pending tasks as capacity opens up.

## 3. Server-Level Safety Buffers
**Problem:** Docker was allowed to consume all 4GB of RAM, leaving nothing for the host OS, leading to total system lockups.

**Solution:** **Host Resource Reservation**.
- **Docker Change:** Updated `docker-compose.yml` to limit memory to **3.0G**.
- **Impact:** Ensures the host OS always has ~1GB of RAM to stay responsive and manage system tasks (Redis, Nginx, Logging) even if the app hits its limit.

---

## 4. Final Required Manual Actions

### A. Add a Swap File (CRITICAL)
Run these commands on your DigitalOcean droplet. This creates a "safety net" on your disk so that if RAM hits 100%, the server slows down instead of crashing.
```bash
# Create 4GB swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Make it persistent after reboot
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### B. Setup Global Queue Cron (CRITICAL)
Add this to your server's crontab (`crontab -e`) to ensure queued jobs are picked up automatically every minute. Replace `YOUR_CRON_SECRET` with the value from your `.env` file.
```bash
# Every minute, wake up the job processor
* * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/internal/process-queued-jobs >/dev/null
```

### C. Configure R2 CORS (For Uploads)
Ensure your Cloudflare R2 bucket has the following CORS policy to allow the browser to PUT files directly:
```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## Referencing this Plan
If you notice the server becoming slow or "queued" jobs taking too long:
1. Check Redis for active locks (`audiorepurpose:global_concurrency_set`).
2. Consider increasing `MAX_CONCURRENT_JOBS` in `lib/concurrency.ts` ONLY if you upgrade to a 4 vCPU server.
