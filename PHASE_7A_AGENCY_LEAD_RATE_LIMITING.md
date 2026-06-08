# Phase 7A: Durable Lead Rate Limiting and Spam Protection

Status: Implemented and reviewed. Not committed.

## Objective

Improve public agency lead intake spam protection without changing the public form, internal lead review, or lead-to-client conversion workflow.

## Previous Risk

Phase 6 used a bounded in-memory rate limiter inside `lib/agency-leads.ts`.

That was useful for local safety, but not durable across:

- multiple server instances
- server restarts
- edge/runtime scaling
- production traffic bursts

## New Helper

Created:

```text
lib/agency-lead-rate-limit.ts
```

The helper now owns public agency lead rate limiting and deterministic spam checks.

Functions:

- `checkAgencyLeadRateLimit(...)`
- `buildLeadRateLimitKey(...)`
- `isLikelySpamLead(...)`
- test reset/injection helpers

## Durable Backend Behavior

If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured, the helper creates Upstash-backed sliding-window limiters:

- IP: 8 submissions per 10 minutes
- email: 3 submissions per 1 hour

Rate-limit keys are hashed so raw email addresses and IP addresses are not stored in Redis keys.

## Fallback Behavior

If Upstash is not configured, the helper uses a bounded in-memory fallback.

If Upstash exists but the limiter throws, the route logs a safe warning and falls back to memory for that check. This keeps public lead intake graceful while still adding protection.

This fallback is intentionally documented as a production risk: durable Redis/edge rate limiting should be configured before broader traffic.

## Spam Rules

The deterministic spam checks reject:

- honeypot field submissions
- four or more links across submitted fields
- HTML/BBCode link markup
- excessive repeated characters

Rejected spam returns a safe public error:

```text
Lead submission rejected
```

No internal spam reason is returned to the visitor.

## API Changes

Updated:

```text
app/api/agency-leads/route.ts
```

The route now:

- validates normal lead fields first
- checks deterministic spam signals before rate limiting
- rate-limits both IP and email with the new helper
- preserves the Phase 6 safe success response
- still does not auto-create agency clients
- does not send emails or analytics events

## Intentionally Not Built

- CAPTCHA
- third-party spam vendors
- lead emails
- analytics events
- schema changes
- CRM sync
- client auto-creation

## Tests Added or Updated

Added:

```text
tests/lib/agency-lead-rate-limit.test.ts
```

Updated:

```text
tests/lib/agency-leads.test.ts
tests/lib/agency-leads-route.test.ts
```

Coverage includes:

- valid fallback allowance
- repeated email rate limiting
- repeated IP rate limiting
- durable limiter result handling
- durable limiter failure fallback
- hashed rate-limit keys
- honeypot rejection
- link/markup/repeated-character spam rejection
- route rejection before storage

## Review Notes

- Public lead intake behavior is preserved.
- Public users still cannot read lead data.
- User-facing errors are safe.
- No internal lead review or conversion behavior changed.
- No email or analytics work was added.

## Remaining Recommendations

- Configure Upstash env vars in production before meaningful traffic.
- Monitor rejected lead/spam volume once Phase 7D analytics exists.
- Consider CAPTCHA only if deterministic protections and rate limiting are insufficient.
