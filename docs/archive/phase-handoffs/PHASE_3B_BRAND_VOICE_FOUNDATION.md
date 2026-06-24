# Phase 3B: Brand Voice Foundation

## Objective

Add an organization-scoped brand voice foundation for the B2B SaaS product.

This phase creates the schema, APIs, and minimal dashboard UI needed to store reusable company voice, audience, positioning, examples, pillars, banned phrases, and CTA guidance.

## Schema

Migration:

```text
supabase/migrations/20260605130000_phase_3b_brand_voice_foundation.sql
```

Adds:

```text
public.brand_voices
```

Core fields:

- `id`
- `organization_id`
- `client_id` nullable for later agency phases
- `name`
- `description`
- `tone`
- `audience`
- `content_pillars_json`
- `writing_examples_json`
- `banned_phrases_json`
- `cta_preferences`
- `created_by`
- `created_at`
- `updated_at`

The migration also adds:

- organization, client, and creator indexes
- organization/client/name uniqueness
- JSON array checks for structured list fields
- `updated_at` trigger
- RLS policies

## Permissions

Brand voice is treated as organization-level workspace configuration.

- Active organization members can read brand voices.
- Organization owners/admins can create, update, and delete brand voices.
- `agency_admin` can manage brand voices only for `internal_agency` organizations, preserving the existing role model without building agency clients yet.
- Demo users are blocked from write actions.

## API

Added routes:

- `GET /api/brand-voices`
- `POST /api/brand-voices`
- `GET /api/brand-voices/:id`
- `PATCH /api/brand-voices/:id`
- `DELETE /api/brand-voices/:id`

All routes validate active organization membership through the existing organization context helpers.

Write routes validate:

- required brand voice name
- string field length
- list field shape
- duplicate brand voice names per organization/client scope

## Shared Model

Added:

```text
lib/brand-voices.ts
```

This module maps Supabase rows into app-facing objects, normalizes API inputs, validates fields, checks manager permissions, and exposes CRUD helpers.

## UI

Added:

```text
app/dashboard/brand-voice/page.tsx
```

The page lets organization owners/admins:

- create a brand voice profile
- edit tone, audience, positioning notes, content pillars, writing examples, banned phrases, and CTA preferences
- delete a profile

Active members without manager access can view brand voice profiles in read-only mode.

The dashboard nav now includes:

```text
/dashboard/brand-voice
```

## Explicit Non-Goals

This phase did not:

- Build agency clients
- Build campaign CRUD
- Build the content library
- Apply brand voice to AI generation prompts
- Add Slack or Granola workflows
- Add client-scoped brand voice UI
- Change billing, entitlement, transcription, or content-generation behavior

## Follow-Up Considerations

- Phase 3C can attach campaigns/content library records to brand voice profiles.
- Later content-generation phases should pull selected brand voice guidance into prompt construction.
- Agency phases can attach `client_id` once the agency client schema exists.
