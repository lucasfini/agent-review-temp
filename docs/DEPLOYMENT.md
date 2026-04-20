# Deployment

This repo is currently set up to deploy on a DigitalOcean Droplet with Docker Compose and Caddy.
Cloudflare can sit in front of the Droplet as the proxied DNS/TLS edge.

## Canonical Production Files

- [docs/guides/DIGITALOCEAN_HOSTING_GUIDE.md](./guides/DIGITALOCEAN_HOSTING_GUIDE.md)
- [docs/guides/CLOUDFLARE_DIGITALOCEAN_LAUNCH.md](./guides/CLOUDFLARE_DIGITALOCEAN_LAUNCH.md)
- [../docker-compose.prod.yml](../docker-compose.prod.yml)
- [../deploy/Caddyfile](../deploy/Caddyfile)
- [../deploy/cron/audiorepurpose.cron.example](../deploy/cron/audiorepurpose.cron.example)
- [../.env.production.example](../.env.production.example)

## Recommended Path

1. Provision a DigitalOcean Droplet.
2. Install Docker and the Docker Compose plugin.
3. Copy `.env.production.example` to `.env.production` on the server.
4. Fill in real production secrets and domain values.
5. Start the stack with:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

6. Install the cron entries from `deploy/cron/audiorepurpose.cron.example`.
7. Run the verification checklist in the DigitalOcean hosting guide before switching traffic.

## Important Notes

- If Cloudflare is enabled, use the orange-cloud proxy with SSL/TLS mode set to `Full (strict)`.
- Do not add aggressive Cloudflare caching for HTML or `/api/*` routes on day one.
- Supabase remains the database and auth provider.
- Cloudflare R2 remains the object store.
- Stripe remains external.
- Runtime OpenAI-backed features use `OPENAI_API_KEY`.
- `OPENAI_API_KEY_OPTIN` remains a backward-compatible fallback.
- Some legacy scripts still reference `OPENAI_API_KEY`; that is not the main production runtime path.

Do not treat older Vercel-oriented or PyAnnote-heavy docs as the production source of truth for launch.
