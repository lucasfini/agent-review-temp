# Production Readiness Plan

This document reflects the current state of the repo and the work still worth doing before public launch.

## Current Deployment Direction

- DigitalOcean Droplet
- Docker Compose
- Caddy
- Supabase for auth and database
- Cloudflare R2 for object storage
- Stripe for billing

## Current Runtime Assumptions

- OpenAI-backed runtime features resolve through `OPENAI_API_KEY`
- AssemblyAI is the main transcription provider
- Expensive app flows run through API routes and need abuse protection
- Internal cleanup and maintenance flows rely on shared secrets and cron

## High-Priority Launch Work

### 1. Environment correctness

- Ensure production env vars match the names actually used by the app
- Keep `.env.production` aligned with `.env.production.example`
- Verify Supabase auth redirect URLs and OAuth callback URLs against the real domain

### 2. Abuse protection

- Add or tighten rate limiting on expensive API routes
- Prioritize:
  - `/api/transcribe`
  - `/api/generate-content`
  - upload routes
  - auth-sensitive routes

### 3. Monitoring and alerting

- Add centralized error reporting
- Alert on:
  - Stripe webhook failures
  - transcription failures
  - generation failures
  - cleanup route failures
  - repeated auth failures

### 4. Billing verification

- Run full Stripe test-mode verification
- Verify:
  - checkout creation
  - webhook receipt
  - credit application
  - duplicate-event safety
  - error handling on failed payments

### 5. Production smoke tests

- Signup
- Login
- Google auth if enabled
- Upload
- Transcription
- Content generation
- Delete / cancel flow
- Admin access restrictions
- Scheduled cleanup routes

## Recommended Order

1. Finish docs and env cleanup
2. Deploy to a production-like Droplet
3. Validate auth, uploads, and billing
4. Add monitoring and rate limiting
5. Remove any stale or misleading UI
6. Cut over to live traffic

## Notable Cleanup Already Needed

- Older docs still referenced Vercel-era assumptions
- Some docs still referenced `OPENAI_API_KEY` as the primary runtime key
- Some docs still described PyAnnote-heavy or older local transcription paths

Treat the DigitalOcean hosting guide and production env example as the launch source of truth.
