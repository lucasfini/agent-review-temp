# Phase 8F: Monitoring, Logging, and Error Visibility

Status: Implemented for launch hardening.

Phase 8F audited launch-time visibility for the SaaS product, internal agency console, public agency funnel, billing/subscriptions, Slack/Granola workflows, upload/transcription, and generation paths.

This phase did not add a paid observability vendor, a new product surface, or new request-wide logging. Production visibility remains based on the existing Docker/Caddy deployment logs, `/api/health`, admin monitoring, provider dashboards, and tagged application logs.

## Critical Flows

| Flow | Primary routes/files | Expected visibility |
| --- | --- | --- |
| Agency lead submission | `app/api/agency-leads/route.ts` | `[AGENCY_LEADS_PUBLIC]` logs unexpected lead failures, spam rejection, skipped funnel events, and email notification/confirmation failures. |
| Lead notification email | `app/api/agency-leads/route.ts`, `lib/agency-lead-notifications.ts` | Notification skips/failures are logged after the lead is already saved. |
| Lead confirmation email | `app/api/agency-leads/route.ts`, `lib/agency-lead-notifications.ts` | Confirmation skips/failures are logged after the lead is already saved. |
| Stripe webhook | `app/api/stripe/webhook/route.ts` | Signature failures, unhandled events, subscription sync issues, and processing failures are visible through Stripe webhook logs and `[STRIPE]` application logs. |
| Subscription checkout/portal | `app/api/subscriptions/checkout/route.ts`, `app/api/subscriptions/portal/route.ts` | Checkout and portal session creation failures use `[SUBSCRIPTION CHECKOUT]` and `[SUBSCRIPTION PORTAL]` tags. |
| Slack OAuth/callback/import | `app/api/agency/slack/oauth/start/route.ts`, `app/api/agency/slack/oauth/callback/route.ts`, `app/api/agency/slack/import/route.ts` | OAuth config/callback issues and import failures use `[AGENCY_SLACK_OAUTH_START]`, `[AGENCY_SLACK_OAUTH_CALLBACK]`, and `[AGENCY_SLACK_IMPORT]`. OAuth code, state, and tokens are not logged. |
| Granola import | `app/api/agency/granola/imports/route.ts` | Unexpected load/import failures use `[AGENCY_GRANOLA_IMPORTS]`. |
| Source-to-draft generation | `app/api/agency/source-imports/[id]/generate/route.ts` | Unexpected generation failures use `[AGENCY_SOURCE_GENERATE]`; AI rate limiting is enforced before generation. |
| Upload/finalize/transcription | `app/api/upload/init/route.ts`, `app/api/upload/finalize/route.ts`, `app/api/transcribe/route.ts` | Upload init, storage verification, transcription start, billing cleanup, background task, and terminal transcription failures are logged. |
| Content generation | `app/api/projects/[id]/generate/route.ts`, `app/api/generate-content/route.ts`, `app/api/strict-json-content/route.ts` | Job queue failures, processor start failures, generation failures, strict JSON failures, and progress failure updates are logged. Raw AI response bodies are not printed by the main generation route when response shape validation fails. |

## Expected Logs

Operators should be able to search production logs for these stable tags during launch:

```text
[AGENCY_LEADS_PUBLIC]
[AGENCY_FUNNEL_EVENTS]
[STRIPE]
[SUBSCRIPTION CHECKOUT]
[SUBSCRIPTION PORTAL]
[AGENCY_SLACK_OAUTH_START]
[AGENCY_SLACK_OAUTH_CALLBACK]
[AGENCY_SLACK_IMPORT]
[AGENCY_GRANOLA_IMPORTS]
[AGENCY_SOURCE_GENERATE]
[PROJECT-GENERATE]
[GENERATION ERROR]
[STRICT-JSON-API]
[TRANSCRIPTION]
```

Also monitor exact Stripe webhook failure text:

```text
Webhook signature verification failed
Error processing webhook
```

For uploads, watch:

```text
Init upload error
R2 verification failed
Finalize error
Transcription start failed
Failed to start transcription
```

## What Not To Log

Production logs must not include:

- Environment variables or complete `process.env`.
- Supabase service role keys, anon keys, JWTs, or session tokens.
- Stripe secret keys, webhook secrets, payment method details, or customer portal URLs.
- Slack OAuth `code`, raw `state`, access tokens, refresh tokens, signing secrets, or client secrets.
- OpenAI or other provider API keys.
- Upload tokens, signed R2 URLs, raw transcripts, raw AI responses, or large generated content payloads.
- Full public lead payloads, internal notes, or email message bodies.

Phase 8F changed Slack OAuth logs to record only sanitized reason/context and changed main content generation shape failures to log metadata such as response length and JSON-like shape instead of raw AI output.

## Existing Operational Surfaces

- `/api/health` returns process health for Docker health checks and external uptime checks.
- `docker-compose.prod.yml` uses Docker `json-file` log rotation for app and Caddy containers.
- `/admin/monitoring` and `/dashboard/admin/monitoring` show recent and failed projects for admin users.
- `/api/admin/monitoring` is admin protected and returns recent/failed project rows for the monitoring UI.
- Stripe dashboard webhook delivery logs remain the source of truth for Stripe delivery status.
- Resend dashboard delivery/bounce logs remain the source of truth for email provider delivery status.
- Supabase logs remain the source of truth for database and auth provider errors.

## Production Monitoring Recommendations

- Configure an external uptime monitor for `GET /api/health` at the production domain.
- Tail app logs during launch with searches for the critical tags above.
- Alert manually during the first launch window on repeated Stripe webhook failures, lead email failures, Slack OAuth failures, transcription failures, or generation failures.
- Keep Docker log rotation enabled and confirm production operators can access rotated app and Caddy logs.
- Check Stripe webhook delivery attempts after every checkout, failed payment, cancellation, and portal test.
- Check Resend delivery logs after every public agency lead test.
- Check Supabase auth/database logs after login, lead submission, import, and generation tests.

## Launch Triage Checklist

1. Confirm `GET /api/health` returns `status: healthy`.
2. Confirm Docker app and Caddy containers are healthy.
3. Submit a staging agency lead and verify the lead saves before email checks.
4. Search logs for `[AGENCY_LEADS_PUBLIC]` after lead submission.
5. Verify Resend delivery for internal notification and public confirmation.
6. Run Stripe test checkout and verify Stripe dashboard webhook delivery plus `[STRIPE]` app logs.
7. Open billing portal and verify no `[SUBSCRIPTION PORTAL]` failure.
8. Start Slack OAuth in staging and verify callback success or a sanitized `[AGENCY_SLACK_OAUTH_CALLBACK]` reason.
9. Run one Slack import and one Granola import against staging test data.
10. Upload one small audio file and confirm upload finalize starts transcription.
11. Generate one content item and verify failed AI-response shape logs do not include raw response text.
12. Open `/admin/monitoring` as an admin and confirm failed projects are visible.

## Known Limitations

- There is no centralized tracing, metrics pipeline, or paid observability vendor in this phase.
- Logs are application/Docker/provider logs, not a complete distributed trace across Stripe, Resend, Supabase, Slack, R2, and AI providers.
- Admin monitoring currently focuses on project processing status; it does not show lead/email/Stripe/Slack event timelines.
- Some legacy transcription internals remain verbose and should be revisited after launch if production logs contain sensitive transcript-derived details.
- Staging must still exercise the real provider flows because static tests cannot prove provider dashboard delivery or webhook reachability.

## Launch Blockers

- `/api/health` is not reachable or returns unhealthy in production.
- Production operators cannot access app logs.
- Repeated `Webhook signature verification failed` or `Error processing webhook` appears during Stripe test-mode launch checks.
- Lead submissions save but notification or confirmation failures repeat because Resend/domain configuration is incomplete.
- Slack OAuth fails with configuration errors after production env vars are set.
- Upload finalization cannot verify R2 objects or cannot start transcription.
- Admin monitoring is inaccessible to the configured admin account.

## Validation

Required validation for Phase 8F:

```text
npx jest tests/scripts/phase-8f-monitoring-logging-visibility.test.js --runInBand
npx tsc --noEmit
npm run -s lint
git diff --check
```

Use provider dashboards and staging smoke tests to verify live behavior after deployment.
