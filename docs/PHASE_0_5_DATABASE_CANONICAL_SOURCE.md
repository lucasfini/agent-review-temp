# Phase 0.5 Canonical Database Source

## Canonical Source of Truth

Treat `supabase/migrations/` as the canonical, ordered source of truth for schema evolution and deployable database changes.

Rationale:
- Supabase applies migrations in this directory in sequence.
- New production-impacting changes in this repo are already being added there.
- `database/schemas/` contains useful reference SQL, but it is not a guaranteed ordered migration history.

## Current Drift (High-Level)

Current drift between `supabase/migrations/` and `database/schemas/` includes:
- Objects present in `supabase/migrations/` but not mirrored in `database/schemas/`:
  - `admin_audit_logs`
  - `billing_price_overrides`
  - `user_openai_settings`
  - `contact_requests`
  - profile contact fields and signup bonus function updates
  - `generation_progress` table/policies
- Policy/function differences where both trees touch the same domains (billing, cache, insights) but definitions diverge.
- `database/schemas/` includes broad “desired state” files (for example, outputs, billing, insights) that are not a strict replayable migration log.

## Phase 1 Safety Rule

For all upcoming Phase 1 schema work:
- Add new changes only via forward migrations in `supabase/migrations/`.
- Do not treat `database/schemas/` as migration input.
- Update or reconcile documentation/state files after migrations land, but never in place of migrations.
