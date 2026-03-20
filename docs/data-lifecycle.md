# Data Lifecycle

## Live ownership model
- `projects` owns transcript data, generated artifacts, queue/progress rows, and R2 audio prefixes.
- `auth.users` owns profile settings, integrations, OpenAI settings, and avatar storage.
- Billing audit data is retained after account deletion in anonymized form:
  - `usage_events`
  - `billing_reservations`
  - `credit_transactions`
  - `contact_requests`

## Storage surfaces
- Cloudflare R2 bucket `audiorepurpose`
  - project audio stored at `<project_id>/<filename>`
  - normal retention is driven by `projects.audio_expires_at`
  - account deletion purges immediately
- Supabase storage bucket `profile-images`
  - avatar files stored at `<user_id>/<filename>`
  - account deletion purges immediately

## Cleanup and reconciliation
- `GET/POST /api/internal/cleanup-expired-audio`
  - removes expired audio objects for retained projects
- `GET/POST /api/internal/cleanup-stale-uploads`
  - removes abandoned uploads and their audio
- `GET/POST /api/internal/reconcile-billing-reservations`
  - settles or releases stale billing holds
- `GET/POST /api/internal/reconcile-orphaned-storage`
  - removes R2 project prefixes or avatar folders with no matching DB owner

## Account deletion contract
- Deletes user-owned product data immediately:
  - projects
  - outputs
  - insights
  - goals
  - integrations
  - OpenAI settings
  - avatar files
  - R2 audio
- Retains minimal audit/support history in anonymized form:
  - usage events
  - billing reservations
  - credit transactions
  - contact requests

## Legacy review candidates
- `generation_progress`
  - still present and used by older progress UI
  - review before dropping
- old tier-era schema docs (`database-tier-content.sql`, `database-performance-level.sql`)
  - documentation candidates, not authoritative runtime schema
