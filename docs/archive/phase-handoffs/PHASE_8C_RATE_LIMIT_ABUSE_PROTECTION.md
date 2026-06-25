# Phase 8C: Durable Rate Limiting and Abuse Protection

Phase 8C audited public and expensive routes for launch-time abuse protection. The goal was to verify existing protections, add only lightweight missing safeguards, and document production requirements.

No CAPTCHA, paid anti-spam vendor, billing logic change, generation behavior change, CRM sync, or product feature was added.

## Summary

Status: Ready for staging validation after code review.

Primary launch risk reduced:
- Public agency funnel events now use durable Upstash rate limiting when configured.
- Public contact and waitlist forms now have IP and email throttles.
- URL import, Slack import, Granola manual import, strict JSON generation, and agency source draft generation now use existing durable app limiters before expensive work.
- Public lead submission already had durable email/IP rate limits, deterministic spam checks, hashed limiter keys, and safe email failure behavior.

## Production Environment Requirements

Required for production durable rate limiting:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

These values are already listed in:
- `.env.production.example`
- `scripts/validate-production-env.js`
- `PHASE_8A_PRODUCTION_ENV_AUDIT.md`

Do not commit real Redis credentials.

## Routes Audited

### Public Agency Lead Submission

Route:

```text
POST /api/agency-leads
```

Protections in place:
- IP rate limit: 8 submissions per 10 minutes.
- Email rate limit: 3 submissions per hour.
- Uses Upstash durable limiter when configured.
- Falls back to in-memory limiter when Redis is not configured.
- Falls back to in-memory limiter with `degraded: true` if durable limiting fails.
- Hashes email/IP limiter keys before storage.
- Rejects deterministic spam signals:
  - honeypot `referralCode`
  - too many links
  - markup link spam
  - repeated-character spam
- Email notification failures do not lose the saved lead.

Launch notes:
- In-memory fallback is acceptable for local/dev.
- Production should configure Upstash because memory fallback is per process and not durable across deploys or multiple instances.

### Public Agency Funnel Events

Route:

```text
POST /api/agency-funnel-events
GET /api/agency-funnel-events
```

Protections in place:
- POST is rate limited by IP at 120 events per 10 minutes.
- Uses Upstash durable limiter when configured.
- Falls back to in-memory limiter when Redis is not configured.
- Falls back to in-memory limiter with `degraded: true` if durable limiting fails.
- Hashes IP limiter keys before storage.
- Sanitizes metadata to allowlisted non-PII keys.
- Rejects unsupported event names and invalid payload shapes.
- GET returns 405 and does not expose analytics.

Launch notes:
- The event limit is intentionally higher than lead/contact limits because normal browsing can emit several analytics events.
- Upstash is required for durable production protection.

### Contact Form

Route:

```text
POST /api/contact
```

Protections added:
- IP rate limit: 10 submissions per 10 minutes.
- Email rate limit: 3 submissions per hour.
- Uses Upstash durable limiter when configured.
- Falls back to in-memory limiter when Redis is not configured.
- Falls back to in-memory limiter with `degraded: true` if durable limiting fails.
- Hashes email/IP limiter keys before storage.
- Applies throttles before database insert and email delivery.

Launch notes:
- This is support/contact abuse protection only. It does not add marketing automation or CRM sync.

### Waitlist

Route:

```text
POST /api/waitlist
```

Protections added:
- IP rate limit: 20 submissions per 10 minutes.
- Email rate limit: 5 submissions per hour.
- Uses Upstash durable limiter when configured.
- Falls back to in-memory limiter when Redis is not configured.
- Falls back to in-memory limiter with `degraded: true` if durable limiting fails.
- Hashes email/IP limiter keys before storage.
- Applies throttles before Supabase insert.

Launch notes:
- Duplicate email handling still relies on the existing database uniqueness behavior.

### Upload and Transcription

Routes:

```text
POST /api/upload/init
POST /api/upload/url
POST /api/upload/finalize
POST /api/transcribe
```

Protections in place:
- `/api/upload/init` uses `uploadRatelimit` before creating upload projects and R2 signed upload URLs.
- `/api/upload/url` now uses `uploadRatelimit` before URL/YouTube download work.
- `/api/upload/finalize` requires project ownership and a valid upload token before triggering processing.
- `/api/transcribe` uses `aiRatelimit` for user-triggered requests before AI/transcription processing.
- Upload routes still enforce auth, file size, content type, project ownership, entitlement dry-run/enforce checks, and credit reservation behavior.

Launch notes:
- `uploadRatelimit` and `aiRatelimit` fail closed if Redis is missing. This is production-safe but means production must configure Upstash.

### AI Generation

Routes:

```text
POST /api/generate-content
POST /api/generate-selected-content
POST /api/projects/[id]/generate
POST /api/projects/[id]/generate/process
POST /api/projects/[id]/reconcile
POST /api/projects/[id]/run-coverage
POST /api/projects/[id]/segments/touchup
POST /api/insights/[projectId]/refresh
POST /api/strict-json-content
POST /api/agency/source-imports/[id]/generate
```

Protections in place:
- User-triggered generation routes use `aiRatelimit`.
- `/api/strict-json-content` now uses `aiRatelimit` before provider work.
- `/api/agency/source-imports/[id]/generate` now uses `aiRatelimit` before agency draft generation.
- Existing routes keep project ownership, internal job token, demo-mode, entitlement, and credit checks where already implemented.

Launch notes:
- `/api/projects/[id]/generate/process` is primarily an internal/background worker path and uses existing job/concurrency controls. User-triggered initiation is protected by `/api/projects/[id]/generate`.

### Slack Imports

Route:

```text
POST /api/agency/slack/import
```

Protections in place:
- Requires authenticated agency client access.
- Blocks demo users from mutation.
- Requires internal agency operator permissions.
- Requires selected Slack channel unless caller is agency admin.
- Normalizes import limit.
- Now uses `uploadRatelimit` before Slack API fetch and source import creation.

Launch notes:
- Slack OAuth/callback routes were reviewed as auth-sensitive routes. They require agency access and OAuth state handling; this phase did not change OAuth behavior.

### Granola Manual Imports

Route:

```text
GET /api/agency/granola/imports
POST /api/agency/granola/imports
```

Protections in place:
- GET requires agency or agency-client access and only lists scoped imports.
- POST requires authenticated agency client access.
- Blocks demo users from mutation.
- Requires internal agency operator permissions.
- Normalizes manual import payload through existing parser.
- Now uses `uploadRatelimit` before source import creation.

## Fallback Behavior

### Public Lead, Funnel, Contact, and Waitlist Routes

If Upstash is not configured:
- requests use an in-memory limiter
- limiter keys are still hashed
- limits reset on process restart
- limits are not shared across multiple app instances

If Upstash is configured but a limiter call fails:
- requests use an in-memory fallback for that process
- helper result marks `degraded: true`
- warning logs are emitted

Production implication:
- Upstash should be configured before launch.
- Degraded fallback is acceptable as a short outage behavior, not as the normal production configuration.

### Authenticated Upload, Import, and AI Routes

The shared `aiRatelimit` and `uploadRatelimit` helpers fail closed when Upstash is unavailable.

Production implication:
- This protects expensive provider work if Redis is missing.
- It also means missing Redis credentials can block uploads/imports/generation in production.
- Phase 8A production env validation should remain a launch gate.

## Tests Added or Updated

Focused tests:

```text
tests/lib/agency-funnel-events.test.ts
tests/lib/public-form-rate-limit.test.ts
tests/scripts/phase-8c-rate-limit-coverage.test.js
```

Coverage includes:
- durable limiter result handling
- memory fallback behavior
- degraded fallback behavior when durable calls fail
- hashed rate-limit keys
- public route coverage for leads, funnel events, contact, and waitlist
- expensive route coverage for upload URL imports, AI generation, Slack imports, and Granola imports

## Manual Staging QA

Before launch, run these against staging with real Upstash configured:

1. Submit valid agency lead once and confirm 201.
2. Repeat agency lead submissions until IP/email limits return 429.
3. Submit public funnel events until the event limit returns 429.
4. Submit contact form over the email limit and confirm 429 before email delivery.
5. Submit waitlist entries over the IP/email limit and confirm 429.
6. Trigger URL import repeatedly and confirm authenticated limiter returns 429.
7. Trigger Slack import repeatedly and confirm authenticated limiter returns 429 before Slack fetch.
8. Trigger Granola manual import repeatedly and confirm authenticated limiter returns 429 before insert.
9. Trigger strict JSON generation repeatedly and confirm 429 before provider work.
10. Confirm 429 responses never include secret values, raw Redis keys, tokens, or internal provider payloads.

## Review Checklist

- Public lead route is production safer: yes.
- Funnel event spam is bounded durably when Redis is configured: yes.
- Contact and waitlist spam is bounded: yes.
- Expensive AI/upload/import routes are protected: yes.
- Redis/Upstash requirements are documented: yes.
- No unrelated billing behavior changed: yes.
- No CAPTCHA, external anti-spam vendor, CRM sync, or product feature added: yes.
- No secrets committed: yes.

## Launch Blockers

Block launch if any of these are true:

- `UPSTASH_REDIS_REST_URL` is missing in production.
- `UPSTASH_REDIS_REST_TOKEN` is missing in production.
- Staging cannot prove Redis-backed 429 behavior for public lead/funnel/contact/waitlist routes.
- Staging cannot prove Redis-backed 429 behavior for upload URL imports and AI generation routes.
- Any rate-limit response leaks raw email, IP, provider token, Redis key, or request body.

## Remaining Risks

- Public route in-memory fallback is per process, so it is not enough for scaled production by itself.
- Authenticated shared limiters currently have broad buckets (`ai` and `upload`) rather than route-specific import buckets.
- No CAPTCHA was added by design; if spam volume is high after launch, CAPTCHA or another explicitly approved anti-abuse layer may be needed.
