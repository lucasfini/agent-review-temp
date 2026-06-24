# Phase 3C: Campaigns and Content Library Foundation

## Objective

Add an organization-scoped foundation for campaign planning and reusable content library records.

This phase creates the schema, APIs, and minimal dashboard UI needed to group content work into campaigns and store curated content items for the current workspace.

## Schema

Migration:

```text
supabase/migrations/20260605140000_phase_3c_campaigns_content_library.sql
```

Adds:

```text
public.campaigns
public.content_library_items
```

Campaign fields include:

- `organization_id`
- `client_id` nullable for later agency phases
- `brand_voice_id`
- `name`
- `status`
- `objective`
- `audience`
- `channels_json`
- `start_date`
- `end_date`
- ownership and timestamp fields

Content library fields include:

- `organization_id`
- `client_id` nullable for later agency phases
- `campaign_id`
- `brand_voice_id`
- `project_id`
- `output_id`
- `title`
- `content_type`
- `platform`
- `status`
- `body`
- `excerpt`
- `source_label`
- `tags_json`
- `metadata_json`
- `published_at`
- ownership and timestamp fields

The migration also adds indexes, status checks, JSON shape checks, `updated_at` triggers, optional project/output foreign keys, RLS policies, and grants.

## Permissions

Campaigns and library items are workspace resources.

- Active organization members can read campaigns and content library items.
- Organization owners/admins can create, update, and delete records.
- `agency_admin` can manage records only for `internal_agency` organizations.
- Demo users are blocked from write actions.

## API

Added campaign routes:

- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/:id`
- `PATCH /api/campaigns/:id`
- `DELETE /api/campaigns/:id`

Added content library routes:

- `GET /api/content-library`
- `POST /api/content-library`
- `GET /api/content-library/:id`
- `PATCH /api/content-library/:id`
- `DELETE /api/content-library/:id`

All routes use the existing active organization context and scope records to `organization_id`.

## Shared Model

Added:

```text
lib/campaigns-content-library.ts
```

This module maps Supabase rows into app-facing objects, validates campaign and content library payloads, checks manager permissions, and exposes CRUD helpers.

## UI

Added:

```text
app/dashboard/campaigns/page.tsx
```

The page lets organization owners/admins:

- create and edit campaigns
- track campaign status, dates, audience, objective, and channels
- create and edit content library items
- associate library items with campaigns
- delete campaigns and library items

Active members without manager access can view records in read-only mode.

The dashboard nav now includes:

```text
/dashboard/campaigns
```

## Explicit Non-Goals

This phase did not:

- Build agency clients
- Build agency client-scoped campaign views
- Apply campaigns or library items to AI generation prompts
- Import generated outputs into the library automatically
- Build publishing workflows
- Build approvals, scheduling, assignments, or calendars
- Change billing, transcription, upload, or content-generation behavior

## Follow-Up Considerations

- Later phases can add import actions from generated outputs into `content_library_items`.
- Content generation can optionally accept `campaign_id`, `brand_voice_id`, and library examples as prompt context.
- Agency phases can attach `client_id` once the agency client schema exists.
- A later publishing phase can add scheduled publishing and approval workflow tables.
