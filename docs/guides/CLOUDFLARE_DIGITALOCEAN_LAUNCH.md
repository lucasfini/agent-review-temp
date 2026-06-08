# Cloudflare + DigitalOcean Launch

This is the day-one launch flow for `audiorepurpose.com` when Cloudflare proxies traffic in front of the DigitalOcean Droplet.

## Day-One Target

- Cloudflare orange-cloud proxy enabled for `audiorepurpose.com`
- Cloudflare SSL/TLS mode set to `Full (strict)`
- Caddy remains the origin reverse proxy and TLS terminator on the Droplet
- No aggressive Cloudflare caching or page rules

## 1. Build The Production Env File

On the Droplet:

```bash
cp .env.production.example .env.production
```

Set these values at minimum:

- `APP_DOMAIN=audiorepurpose.com`
- `NEXT_PUBLIC_APP_URL=https://audiorepurpose.com`
- `ACME_EMAIL=<your real email>`
- Supabase URL, anon key, and service role key
- Stripe secret, publishable key, and webhook secret
- Resend API key plus agency lead from and notification emails
- `AGENCY_LEAD_ORGANIZATION_ID`
- Slack OAuth client ID, client secret, redirect URI, and `INTEGRATIONS_ENCRYPTION_KEY`
- R2 account, key pair, and bucket name
- Upstash Redis REST URL and token for durable public rate limiting
- `CRON_SECRET`
- `INTERNAL_JOB_SECRET`
- `UPLOAD_TOKEN_SECRET`
- `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`
- `OPENAI_API_KEY`
- `ASSEMBLYAI_API_KEY` or `ASSEMBLYAI_ACCESS_KEY`

`ANTHROPIC_API_KEY` is optional and can be left blank if the app is OpenAI-only.

Leave Zoom/Microsoft/YouTube envs blank if those integrations are not launching today.
Stripe subscription price IDs live in `plans.stripe_price_id`; verify those after the app can reach Supabase.

## 2. Validate The Env File

Run the read-only validator against the file. It reports variable names only and does not print secret values:

```bash
npm run validate:production-env -- --env-file .env.production
```

## 3. Configure Cloudflare

In Cloudflare:

- Point the apex record for `audiorepurpose.com` to the Droplet IP
- Enable the orange-cloud proxy
- Set SSL/TLS mode to `Full (strict)`
- Leave caching behavior at the default level
- Do not enable `Cache Everything`
- Do not cache `/api/*`

## 4. Configure External Services

Before starting traffic:

- Add `https://audiorepurpose.com` to Supabase site/auth settings
- Add the auth callback URLs for the production domain
- Create the Stripe webhook endpoint at `https://audiorepurpose.com/api/stripe/webhook`
- Confirm the R2 bucket is reachable from the Droplet

## 5. Bring Up The Stack

On the Droplet:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Then verify the health endpoint:

```bash
curl -I https://audiorepurpose.com/api/health
```

## 6. Install The Cleanup Cron Jobs

Use `deploy/cron/audiorepurpose.cron.example` as the template.
Replace `YOUR_DOMAIN` with `audiorepurpose.com` and replace `YOUR_CRON_SECRET` with the production `CRON_SECRET`.

## 7. Smoke Test Before Treating The Site As Live

- Home page loads over HTTPS
- Signup, login, logout, and password reset work
- Upload works
- Transcription completes
- Content generation completes
- Stripe checkout succeeds
- Stripe webhook credits the account correctly
- Admin routes stay restricted
- Cron cleanup routes succeed with bearer auth

## Notes

- Caddy still needs inbound `80` and `443` on the Droplet
- Cloudflare is not a substitute for origin health checks
- Keep the first launch simple; add WAF tuning, caching, and performance rules after the app is stable
