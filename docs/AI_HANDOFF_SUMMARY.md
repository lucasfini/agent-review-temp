# Technical Summary: Server Scalability & Speaker Pipeline Enhancements

## 1. Infrastructure & Concurrency Control
To stabilize the 2 vCPU, 4GB RAM DigitalOcean environment, we implemented the following:
- **Redis Global Semaphore:** Enforced a server-wide limit of **2 concurrent generation jobs** using Upstash Redis. This prevents CPU exhaustion when multiple users trigger AI processing simultaneously.
- **Heartbeat Mechanism:** Added a 5-minute heartbeat to active job locks (with a 30-minute safety TTL) to ensure long-running analysis tasks don't time out or lose their execution slot.
- **Docker Resource Capping:** Restricted the application container to **3.0GB RAM**, reserving 1GB for the host OS and supporting services (Redis/Nginx).
- **Internal Job Polling:** Created an authorized `/api/internal/process-queued-jobs` endpoint to allow a 1-minute cron job to wake up and process yielding tasks.

## 2. Zero-Disk Transcription Handoff
- **Presigned URL Handoff:** Refactored `app/api/transcribe/route.ts` to generate temporary **Cloudflare R2 Presigned GET URLs**.
- **Impact:** AssemblyAI and Deepgram now download audio directly from R2. This eliminates server-side audio downloads/buffering, reducing RAM and Disk usage by **100%** during the transcription phase.

## 3. Speaker Pipeline & Roster Logic
Refined the speaker identification logic to balance user-provided rosters with AI name extraction:
- **Non-Destructive Roster Enforcement:** The pipeline now prioritizes user-provided names for exact or phonetic matches and generic placeholders (e.g., "Speaker 1"), but **no longer overwrites** human names successfully extracted by the AI.
- **Partial Roster Support:** If a user provides 2 names for a 4-speaker file, the system correctly identifies the 2 roster names and continues to use AI extraction for the remaining 2 identities.
- **Early Sanitization (Pass 1):** Integrated the "Force-Merge" algorithm into the initial GPT intelligence pass. This strictly enforces the user-defined `speakerCount` by merging the most similar identities while protecting roster-provided names.
- **UI Decoupling:** Removed automatic speaker count syncing in the uploader to allow "Auto-detect" to function normally alongside partial rosters.

## 4. Operational Requirements
- **Swap Space:** 4GB swap file required on the host to handle unexpected memory spikes.
- **Cron Setup:** `* * * * *` curl trigger required for the internal job processor.
- **CORS:** R2 bucket requires `PUT/GET` permission for the application domain for direct browser uploads.
