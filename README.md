# AudioRepurpose

AudioRepurpose turns long-form audio into transcripts, structured speaker data, analytics, and publish-ready content inside a single workflow.

## Current Stack

- Next.js 16 App Router
- React 19 + TypeScript + Tailwind
- Supabase for auth, Postgres, and app data
- Cloudflare R2 for audio object storage
- Stripe for billing and credits
- AssemblyAI for transcription
- OpenAI, Anthropic, Perplexity, and Google-backed AI features where supported
- Docker + Caddy for the current production deployment target

## What The App Does Now

- Upload local audio or import supported external recordings
- Transcribe audio and organize speaker segments
- Review projects in the dashboard
- Generate summaries, quotes, chapters, takeaways, and social content
- Track usage and billing inside the product
- Support admin, maintenance, and cleanup flows through internal routes

## Project Structure

```text
audiorepurpose/
├── app/                    # Next.js routes, pages, and API handlers
├── components/             # Shared UI and dashboard components
├── lib/                    # Business logic, billing, auth, integrations, AI helpers
├── public/                 # Static assets
├── scripts/                # Seed scripts and local tooling
├── supabase/               # Migrations
├── tests/                  # Unit, integration, API, and e2e tests
├── deploy/                 # Caddy + cron deployment assets
└── docs/                   # Setup, deployment, and reference docs
```

## Local Development

### Prerequisites

- Node.js 20+
- npm
- Supabase project
- AssemblyAI key
- Anthropic key
- OpenAI opt-in key for OpenAI-backed features
- Stripe keys if testing billing
- R2 credentials if testing real storage flows

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env.local
```

3. Fill in the values you actually need for your local workflow.

Minimum useful local envs:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_APP_URL=http://localhost:3000

ASSEMBLYAI_API_KEY=
OPENAI_API_KEY=

STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
CONTACT_FROM_EMAIL=support@audiorepurpose.com
CONTACT_TO_EMAIL=support@audiorepurpose.com

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

4. Start the app:

```bash
npm run dev
```

## Testing

```bash
npm test
npm run lint
```

The repo also includes Playwright tests and fuller API/auth/database suites when you want broader verification.

## Production Direction

The current production target is:

- app on a DigitalOcean Droplet
- Docker Compose for app + reverse proxy
- Caddy for TLS and reverse proxying
- Supabase kept external
- Cloudflare R2 kept external
- Stripe kept external

Primary production docs:

- [docs/guides/DIGITALOCEAN_HOSTING_GUIDE.md](docs/guides/DIGITALOCEAN_HOSTING_GUIDE.md)
- [docs/guides/CLOUDFLARE_DIGITALOCEAN_LAUNCH.md](docs/guides/CLOUDFLARE_DIGITALOCEAN_LAUNCH.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [.env.production.example](.env.production.example)
- [deploy/Caddyfile](deploy/Caddyfile)
- [docker-compose.prod.yml](docker-compose.prod.yml)
- [deploy/cron/audiorepurpose.cron.example](deploy/cron/audiorepurpose.cron.example)

## Notes On OpenAI Keys

Runtime OpenAI-backed features now resolve through `OPENAI_API_KEY`.

Older references may still read `OPENAI_API_KEY_OPTIN`, but the runtime falls back to that name for backward compatibility.
