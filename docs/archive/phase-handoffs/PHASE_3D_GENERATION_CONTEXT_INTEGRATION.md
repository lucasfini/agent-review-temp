# Phase 3D: Generation Context Integration

## Summary

Phase 3D connects organization-scoped brand voice and campaign context to the existing content generation flow without replacing the current AI provider or output pipeline.

Generation requests may now include either snake_case or camelCase context IDs:

- `brand_voice_id` or `brandVoiceId`
- `campaign_id` or `campaignId`

When present, those IDs are resolved through organization-scoped helpers before generation starts. Invalid or cross-organization IDs fail before any generation jobs are queued or executed.

## Behavior Added

- Direct `/api/generate-content` requests resolve brand voice and campaign context after project ownership/org context is established.
- `/api/generate-selected-content` validates and forwards optional generation context to `/api/generate-content`.
- `/api/projects/[id]/generate` validates optional context before queue insertion and stores it on content jobs.
- `/api/projects/[id]/generate/process` forwards stored job context to `/api/generate-content`.
- Prompt-based generators receive brand voice, campaign, selected content type, and channel through the existing output style modifier prompt section.
- Generated content metadata now includes the resolved generation context when context is used.
- Generated outputs continue to be saved to legacy `outputs` records.
- Generated outputs are also saved as draft organization-scoped `content_library_items`.

## Access Control

Brand voice and campaign validation uses the existing Phase 3B/3C helpers:

- `getBrandVoice(supabase, organizationId, id)`
- `getCampaign(supabase, organizationId, id)`

Both helpers filter by `organization_id` and `.is('client_id', null)`, so cross-organization records and future client-scoped records are not accepted by the SaaS generation flow.

If a campaign has an associated `brand_voice_id` and the request does not include a separate brand voice ID, generation uses that campaign brand voice after validating it in the same organization scope.

## Persistence

The existing legacy `outputs` write remains intact so current UI behavior continues to work.

After each legacy output insert, the same generated item is saved to `content_library_items` with:

- `organization_id`
- optional `campaign_id`
- optional `brand_voice_id`
- `project_id`
- `output_id`
- draft status
- generated body/excerpt
- metadata linking back to the legacy output and generation context

If content library insertion fails, any legacy outputs inserted for that block are removed and generation fails instead of silently losing the organization-scoped library record.

## Schema

Migration added:

```text
supabase/migrations/20260605150000_phase_3d_generation_context.sql
```

It adds optional `brand_voice_id` and `campaign_id` columns to `project_generation_jobs`, plus foreign keys and indexes when the referenced Phase 3B/3C tables are present.

## Compatibility Notes

- Requests without brand voice or campaign IDs continue through the existing generation behavior.
- Existing generation endpoints keep their current request shape and accept the new fields as optional additions.
- Analysis jobs can still be queued alongside content jobs; context is stored only for content jobs.
- No agency client, Slack, Granola, provider, or dashboard redesign work was added.
