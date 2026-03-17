# DigitalOcean Hosting Guide

This is the launch guide for hosting AudioRepurpose on DigitalOcean.

Assumptions:
- The app server runs on a DigitalOcean Droplet.
- Supabase remains the database/auth provider.
- Cloudflare R2 remains the audio object store.
- Stripe remains external.
- The Next.js app is deployed with Docker on the Droplet.

This guide is a launch checklist, not a full infrastructure-as-code spec.

## Recommended Shape

Use this setup first:
- 1 DigitalOcean Droplet for the app
- Docker + Docker Compose on the Droplet
- DigitalOcean Cloud Firewall
- Domain managed in DigitalOcean DNS or your current DNS provider
- HTTPS via reverse proxy
- Server cron for internal cleanup routes
- Supabase for Postgres/Auth
- Cloudflare R2 for source audio storage

Do not move everything at once unless you have to.
For launch, the lowest-risk setup is:
- app on DigitalOcean
- database on Supabase
- storage on R2

## Pre-Launch Decisions

Decide these before provisioning:
- Region: keep the Droplet close to your main users and close enough to Supabase/R2 to avoid unnecessary latency.
- Deployment method: use Docker on a Droplet unless you have a strong reason to use App Platform.
- Reverse proxy: choose `nginx` or `caddy`.
- TLS strategy: choose reverse-proxy TLS on the Droplet, or use a DigitalOcean Load Balancer later if needed.
- Process strategy: single app container first, separate worker only if background load grows.

## Infrastructure Checklist

### 1. Create the Droplet

Recommended baseline for launch:
- Ubuntu LTS
- Basic Droplet
- enough RAM for Next.js build/runtime plus transcription-related API orchestration
- SSH keys only
- automatic backups enabled
- monitoring enabled

Reference:
- Droplet quickstart: https://docs.digitalocean.com/products/droplets/getting-started/quickstart/
- Create a Droplet: https://docs.digitalocean.com/products/droplets/how-to/create/
- Monitoring quickstart: https://docs.digitalocean.com/products/monitoring/getting-started/quickstart/

### 2. Lock Down Network Access

Create a DigitalOcean Cloud Firewall and apply it to the Droplet.

Allow inbound:
- `22` from your admin IP only
- `80` from anywhere
- `443` from anywhere

Allow outbound:
- default outbound internet access unless you have a stricter egress plan

Reference:
- Cloud Firewalls: https://docs.digitalocean.com/products/networking/firewalls/
- Create Firewalls: https://docs.digitalocean.com/products/networking/firewalls/how-to/create/

### 3. Domain and TLS

Point your domain to the Droplet.

Recommended first launch:
- terminate TLS at the reverse proxy on the Droplet
- use Let's Encrypt via `caddy`

If you later put a DigitalOcean Load Balancer in front:
- you can use DO-managed Let's Encrypt there
- SSL termination is simpler than passthrough for most single-app setups

Reference:
- Load Balancer features: https://docs.digitalocean.com/products/networking/load-balancers/details/features/
- SSL termination: https://docs.digitalocean.com/products/networking/load-balancers/how-to/ssl-termination/

## App Architecture Notes

### What Should Stay External

Keep these external for launch:
- Supabase database + auth
- Cloudflare R2 storage
- Stripe

This reduces launch risk and avoids moving too many stateful systems at once.

### Database Recommendation

Do not move Postgres onto the Droplet for the first launch.
Keep Supabase unless you have a clear cost or compliance reason to migrate.

If you later move to a DigitalOcean managed database:
- use trusted sources
- use SSL
- prefer private networking/VPC-aware access when possible

Reference:
- Managed databases overview: https://docs.digitalocean.com/products/databases/
- PostgreSQL docs: https://docs.digitalocean.com/products/databases/postgresql/
- Connect to PostgreSQL: https://docs.digitalocean.com/products/databases/postgresql/how-to/connect/
- Secure PostgreSQL: https://docs.digitalocean.com/products/databases/postgresql/how-to/secure/
- PostgreSQL best practices: https://docs.digitalocean.com/products/databases/postgresql/concepts/best-practices/

## Server Setup Checklist

On the Droplet:
- create a non-root deploy user
- disable password SSH login
- install Docker and Docker Compose plugin
- install your reverse proxy
- configure automatic security updates
- configure log rotation
- configure swap if the Droplet size is tight

Keep these secrets only in server environment files or a secret manager:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `PERPLEXITY_API_KEY` if used
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `CLOUDFLARE_R2_*`
- `CRON_SECRET`
- any internal job secrets

## Included Deployment Assets

This repo now includes a production baseline:
- [docker-compose.prod.yml](/Users/lucas/Desktop/audiorepurpose/docker-compose.prod.yml)
- [deploy/Caddyfile](/Users/lucas/Desktop/audiorepurpose/deploy/Caddyfile)
- [.env.production.example](/Users/lucas/Desktop/audiorepurpose/.env.production.example)
- [deploy/cron/audiorepurpose.cron.example](/Users/lucas/Desktop/audiorepurpose/deploy/cron/audiorepurpose.cron.example)

Recommended server setup flow:
1. copy `.env.production.example` to `.env.production`
2. fill in real values
3. point DNS for `APP_DOMAIN` to the Droplet
4. run `docker compose -f docker-compose.prod.yml up -d --build`
5. install the cron entries from `deploy/cron/audiorepurpose.cron.example`

## App Deployment Checklist

Before first production deploy:
- ensure production env vars exist
- ensure build works without local-only assumptions
- ensure R2 bucket and credentials are production-scoped
- ensure Supabase redirect URLs include your production domain
- ensure Stripe webhook endpoint points to production domain
- ensure CORS/origin settings match your production domain

Recommended deployment flow:
1. Build Docker image
2. Start app container behind reverse proxy
3. Verify `/auth`, `/dashboard`, upload flow, transcription flow, delete flow
4. Verify background cleanup routes manually
5. Switch DNS fully

## Required Launch Verification

Run these checks before calling launch done:
- home page loads over HTTPS
- auth login works on production domain
- upload local file works
- YouTube/direct URL import works
- `/api/transcribe` can load audio from R2
- project deletion works
- cancelled uploads disappear correctly
- recent projects nav updates on delete/cancel
- expired audio cleanup route runs successfully
- stale upload cleanup route runs successfully
- Stripe checkout and webhook flow work

## Cleanup Cron Note

This app now has internal cleanup routes that should be scheduled on the Droplet:
- `/api/internal/cleanup-stale-uploads`
- `/api/internal/cleanup-expired-audio`

Use a shared `CRON_SECRET` and call them from system cron with:

```cron
0 4 * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/internal/cleanup-stale-uploads >/dev/null
30 4 * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/internal/cleanup-expired-audio >/dev/null
```

Important:
- do not forget to set `CRON_SECRET` in production
- verify the routes manually once before relying on cron

## Backups and Recovery

Minimum production posture:
- enable Droplet backups
- back up your env file securely outside the server
- ensure Supabase backup/recovery posture is understood
- ensure R2 bucket retention/lifecycle policy is understood
- document how to redeploy to a fresh Droplet

You should be able to answer:
- if the Droplet dies, how fast can I recreate the app?
- if env vars are lost, where is the authoritative copy?
- if a bad deploy ships, how do I roll back?

## Monitoring and Alerts

At minimum:
- enable DigitalOcean monitoring
- set CPU, memory, and disk alerts
- monitor app logs
- monitor failed uploads and failed transcription starts
- monitor storage cleanup job success/failure

Reference:
- Monitoring how-tos: https://docs.digitalocean.com/products/monitoring/how-to/

## Future Improvements

Do these later, not before launch unless necessary:
- add a DigitalOcean Load Balancer
- add a second app node for redundancy
- move to managed Postgres only if it clearly improves reliability/cost
- move from host cron to a more formal job runner
- add structured centralized logging
- add infrastructure-as-code

## Final Launch Checklist

Must be true before public launch:
- production DNS is correct
- HTTPS is valid
- Supabase production keys are correct
- R2 production bucket is correct
- Stripe production keys and webhook are correct
- cleanup cron jobs are installed
- firewall rules are correct
- monitoring alerts are enabled
- one full test upload has completed successfully on production
- one delete/cancel flow has been tested on production

## Note To Future Self

When launching on DigitalOcean:
- remove any Vercel-only deployment assumptions
- keep cleanup routes scheduled from server cron
- keep Supabase and R2 external unless there is a strong reason to migrate them
