# DigitalOcean Hosting Guide

This is the current launch guide for running AudioRepurpose on a DigitalOcean Droplet.
If Cloudflare is enabled in front of the Droplet, use it only as a proxied DNS/TLS edge on day one.

## Target Architecture

- DigitalOcean Droplet for the app
- Docker Compose for the runtime stack
- Caddy for reverse proxy and TLS
- Supabase kept external for auth and Postgres
- Cloudflare R2 kept external for audio storage
- Stripe kept external for billing

## Repo Assets Used For Production

- [docker-compose.prod.yml](/Users/lucas/Desktop/audiorepurpose/docker-compose.prod.yml)
- [deploy/Caddyfile](/Users/lucas/Desktop/audiorepurpose/deploy/Caddyfile)
- [.env.production.example](/Users/lucas/Desktop/audiorepurpose/.env.production.example)
- [deploy/cron/audiorepurpose.cron.example](/Users/lucas/Desktop/audiorepurpose/deploy/cron/audiorepurpose.cron.example)

## 1. Provision The Droplet

Recommended baseline:

- Ubuntu LTS
- SSH keys only
- Backups enabled
- Monitoring enabled
- Enough RAM for Next.js build + runtime workload

Minimum network posture:

- Allow `22` only from your admin IP
- Allow `80` and `443` publicly

## 2. Prepare The Server

Install:

- Docker
- Docker Compose plugin

Clone the repo and move into it:

```bash
git clone <your-repo-url>
cd audiorepurpose
```

## 3. Create The Production Env File

Copy the example:

```bash
cp .env.production.example .env.production
```

Fill in real values for:

- `APP_DOMAIN`
- `NEXT_PUBLIC_APP_URL`
- `ACME_EMAIL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `CRON_SECRET`
- `INTERNAL_JOB_SECRET`
- `UPLOAD_TOKEN_SECRET`

Optional but recommended:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ADMIN_EMAILS`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`
- Stripe checkout/portal return URL overrides
- Zoom / Microsoft / YouTube OAuth credentials if those imports will be live

Notes:

- Runtime OpenAI-backed features use `OPENAI_API_KEY`.
- `OPENAI_API_KEY_OPTIN` is still accepted only for backward compatibility.
- `ANTHROPIC_API_KEY` is optional if Anthropic-backed features are not in use.

## 4. DNS And App URL Alignment

Before launch, make sure these match:

- DNS points `APP_DOMAIN` to the Droplet
- If Cloudflare is enabled, the DNS record stays proxied and Cloudflare SSL/TLS mode is `Full (strict)`
- `NEXT_PUBLIC_APP_URL` matches the public HTTPS URL
- Supabase auth redirect URLs include the production domain
- Google auth redirect URLs include the production domain
- Zoom / Microsoft redirect URIs match the production domain if integrations are enabled
- Stripe webhook endpoint points to the production domain
- Avoid Cloudflare cache rules for HTML and `/api/*` on day one

## 5. Start The Stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The stack includes:

- `app`
- `caddy`

Health check endpoint:

- `GET /api/health`

## 6. Install Cleanup Cron Jobs

Use the cron entries in:

- [deploy/cron/audiorepurpose.cron.example](/Users/lucas/Desktop/audiorepurpose/deploy/cron/audiorepurpose.cron.example)

This app relies on scheduled internal cleanup routes for maintenance tasks. Set `CRON_SECRET` first, then install the cron entries.

## 7. Launch Verification

Run these checks before treating production as live:

- Home page loads over HTTPS
- `GET https://APP_DOMAIN/api/health` succeeds through Cloudflare
- Signup, login, logout, and password reset work on the production domain
- Google auth works if enabled
- Local file upload works
- External import flows work if enabled
- Transcription completes successfully
- Content generation completes successfully
- Credits can be purchased successfully in Stripe
- Stripe webhook credits the account correctly
- Delete / cancel flows work
- Cleanup routes run successfully
- Admin routes are restricted to allowed emails

## 8. First Follow-Up Work After The Docs Cleanup

These are still important for the live transition:

- Add or tighten rate limiting on expensive API routes
- Add centralized error monitoring
- Run a full production-like smoke test on staging or the Droplet before public launch
- Remove stale static UI sections that imply unsupported controls
