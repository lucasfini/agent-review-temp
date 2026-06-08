# Phase 8A Production Environment And Secrets Audit

Phase 8A audited production environment configuration for the SaaS app, internal agency console, public agency funnel, billing, email, Slack imports, AI providers, R2 storage, Redis-backed rate limiting, and deployment docs.

No real secrets were added. All new env values are blank or placeholders.

## Files Audited

- `.env.example`
- `.env.production.example`
- `scripts/validate-production-env.js`
- `docs/DEPLOYMENT.md`
- `docs/guides/DIGITALOCEAN_HOSTING_GUIDE.md`
- `docs/guides/CLOUDFLARE_DIGITALOCEAN_LAUNCH.md`
- Runtime env references under `app/`, `lib/`, `scripts/`, and `tests/`
- Production deployment files: `docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/cron/audiorepurpose.cron.example`

## Required Production Env Vars

### App And Deployment

- `APP_DOMAIN`: production domain used by Caddy.
- `NEXT_PUBLIC_APP_URL`: public HTTPS app URL.
- `ACME_EMAIL`: email used by Caddy for certificate management.

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only and must never be exposed to client code or committed.

### Stripe

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Subscription price IDs are not env vars in this codebase. They are stored in `plans.stripe_price_id` and should be verified with `npm run validate:subscription-launch` after the app can reach the target Supabase database.

### Email And Agency Lead Ownership

- `RESEND_API_KEY`
- `AGENCY_LEAD_FROM_EMAIL`
- `AGENCY_LEAD_NOTIFICATION_EMAIL`
- `AGENCY_LEAD_ORGANIZATION_ID`

`AGENCY_LEAD_ORGANIZATION_ID` should be set in production even though the app can auto-resolve a single internal agency organization. Explicit configuration prevents public leads from being assigned to the wrong internal agency org if more than one exists later.

### Slack And Integration Secrets

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`
- `INTEGRATIONS_ENCRYPTION_KEY`

`INTEGRATIONS_ENCRYPTION_KEY` must be 32 bytes as base64 or 64 hex characters. It encrypts stored integration tokens and must not be rotated casually after Slack tokens exist.

`SLACK_SIGNING_SECRET` is documented as optional because the current code does not expose Slack event or interactivity endpoints that verify Slack request signatures.

### AI Providers

- `OPENAI_API_KEY`
- `ASSEMBLYAI_API_KEY` or `ASSEMBLYAI_ACCESS_KEY`

Other provider keys are optional unless those providers are intentionally enabled.

### Storage

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

The app code has a legacy bucket-name fallback, but production should set `R2_BUCKET_NAME` explicitly.

### Durable Rate Limiting

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Some rate limiters fall back to process memory when Redis is absent. That fallback is not suitable as the primary public-launch protection across restarts or multiple instances.

### Internal Operations

- `CRON_SECRET`
- `INTERNAL_JOB_SECRET`
- `UPLOAD_TOKEN_SECRET`

These must be generated as high-entropy values and kept out of the repository.

### Subscriptions

- `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`

The runtime helpers fall back to `dry_run`, but production env should set it explicitly. Do not use `enforce` until a separate manual launch approval.

## Optional Or Conditional Env Vars

- `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`: recommended for contact/support mail fallbacks.
- `ADMIN_EMAILS`: recommended before production admin checks.
- `STRIPE_SUBSCRIPTION_SUCCESS_URL`, `STRIPE_SUBSCRIPTION_CANCEL_URL`, `STRIPE_BILLING_PORTAL_RETURN_URL`: optional redirect overrides.
- `SLACK_OAUTH_STATE_SECRET`: optional explicit Slack state signing secret. Current fallback chain is `INTEGRATIONS_ENCRYPTION_KEY`, `SLACK_CLIENT_SECRET`, then `NEXTAUTH_SECRET`.
- `SLACK_SIGNING_SECRET`: only needed if Slack event/interactivity routes are added.
- `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_API_KEY`, `DEEPGRAM_API_KEY`: optional provider keys if those providers are enabled.
- `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`: required together only if Zoom imports launch.
- `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, `MS_REDIRECT_URI`: required together, except tenant defaults to `common`, only if Microsoft imports launch.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`: required together only if YouTube imports launch.
- `INTERNAL_APP_URL`: optional server-to-server app URL override.
- `STARTER_PROJECT_TEMPLATE_ID`: optional starter project copy source.
- `PIPELINE_DOC_ALLOWED_EMAILS`, `NEXT_PUBLIC_PIPELINE_DOC_ALLOWED_EMAILS`: optional pipeline docs allowlist.
- `COST_MARKUP_PERCENTAGE`: defaults to `35`.
- `PERFORMANCE_LEVEL`: optional model/performance tuning.
- `NEXT_PUBLIC_SAVE_EXPORT_LOCALLY`: defaults to `false` in examples.

## Defaults And Safe Values

- `SUBSCRIPTION_ENFORCEMENT_MODE` must remain `dry_run` for launch prep.
- `MS_TENANT_ID` defaults to `common` when Microsoft imports are used and no tenant is set.
- `COST_MARKUP_PERCENTAGE` defaults to `35`.
- `NEXT_PUBLIC_SAVE_EXPORT_LOCALLY` should stay `false` in production.
- Slack OAuth state can use `INTEGRATIONS_ENCRYPTION_KEY` when `SLACK_OAUTH_STATE_SECRET` is blank.
- Local development can leave provider-specific integration keys blank when those flows are not being tested.

## Values That Must Never Be Committed

Never commit real values for:

- `.env.local`
- `.env.production`
- Supabase service role keys
- Stripe secret keys and webhook secrets
- Resend API keys
- Slack client secrets, OAuth state secrets, and future signing secrets
- `INTEGRATIONS_ENCRYPTION_KEY`
- Cloudflare R2 secret access keys
- Upstash Redis tokens
- AI provider API keys
- `CRON_SECRET`, `INTERNAL_JOB_SECRET`, and `UPLOAD_TOKEN_SECRET`

`.gitignore` keeps `.env*` ignored while explicitly allowing `.env.example` and `.env.production.example`.

## Local, Staging, And Production Differences

Local:

- Start from `.env.example`.
- Use blank placeholders for services not under test.
- Keep `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`.
- Slack, Resend, R2, Upstash, and Stripe can stay blank unless the local test needs them.

Staging:

- Use a separate Supabase project, R2 bucket, Redis database, Slack app, and Stripe test-mode keys.
- Keep `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run` until a manual enforcement test.
- Use staging callback URLs for Supabase auth, Slack, Stripe, Zoom, Microsoft, and YouTube.

Production:

- Use live Supabase, Stripe, Resend, R2, Upstash, Slack, OpenAI, and AssemblyAI credentials.
- Use the real HTTPS app URL in `NEXT_PUBLIC_APP_URL`, Slack redirect URI, Stripe webhook, Supabase auth redirects, and optional OAuth redirects.
- Keep `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run` for launch unless Lucas explicitly approves enforcement.
- Do not launch public traffic with placeholder required env values.

## Validator

The existing validator was updated instead of adding a duplicate script:

```bash
npm run validate:production-env -- --env-file .env.production
```

It is read-only and:

- checks required env presence
- reports placeholders separately from missing values
- validates paired provider config
- validates `INTEGRATIONS_ENCRYPTION_KEY` format
- reports `SUBSCRIPTION_ENFORCEMENT_MODE=enforce` as a warning
- never prints secret values

For local dry-run checks against placeholders:

```bash
npm run validate:production-env -- --env-file .env.production.example
```

That command is expected to fail because the example file intentionally contains placeholders.

## Launch Blockers

- Any required production env var is missing.
- Any required production env var still contains a placeholder.
- `INTEGRATIONS_ENCRYPTION_KEY` is missing or not a valid 32-byte base64 or 64-hex value.
- `AGENCY_LEAD_ORGANIZATION_ID` is not set to the intended internal agency organization.
- `SUBSCRIPTION_ENFORCEMENT_MODE` is not explicitly `dry_run` before launch approval.
- Stripe live products/prices are not reflected in `plans.stripe_price_id`.
- Stripe webhook endpoint is not configured for the production domain.
- Supabase auth/callback URLs do not match the production domain.
- R2 credentials or bucket are missing.
- Upstash Redis is missing for public traffic.
- Required Slack OAuth env is missing before validating Slack imports.
- `.env.production` or any real secret file is committed.

## Follow-Up Phase Dependencies

- Phase 8B must verify Supabase migrations and RLS against staging or production-like data.
- Phase 8C must verify route-level rate limiting coverage beyond env presence.
- Phase 8D must verify Stripe products, prices, webhooks, portal behavior, and rollout.
- Phase 8E must verify email deliverability and copy.
- Phase 8G must run browser/deployment smoke checks after the env is configured.
