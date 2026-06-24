# Phase 5D: Source-to-Draft Generation Workflow

## Summary

Phase 5D connects private internal agency source imports to agency draft creation.

Internal agency draft managers can generate review drafts from source imports, including manual notes, Slack imports, and Granola imports, while using existing source/client/profile/campaign/brand voice context.

No public SaaS generation behavior was changed.

## API Added

Added:

```text
POST /api/agency/source-imports/:id/generate
```

Request fields:

- `client_id`
- `content_type` or `content_type_id`
- optional `campaign_id`
- optional `brand_voice_id`
- optional `channel`
- optional `instructions`
- optional `quantity`

The route:

- requires internal agency client access
- requires the selected source to belong to the selected client
- blocks demo users
- follows current agency draft permissions, so draft generation is admin-only through `canManageAgencyDraft`
- validates campaign and brand voice references against the same internal agency organization and selected client
- calls the existing content generator abstraction
- saves the generated result as an agency draft backed by `content_library_items`

## Helper Added

Added:

```text
lib/agency-source-generation.ts
```

The helper:

- normalizes source generation requests
- caps requested quantity
- loads the source import
- loads the agency client profile
- resolves client-scoped campaign and brand voice context
- builds the source/context prompt
- calls `generateContent`
- creates a draft/content library item with internal agency metadata

## Prompt Context

The generated prompt includes:

- source title/provider
- source summary
- source raw text
- source structured metadata
- agency client profile
- brand voice context when provided or inferred from campaign
- campaign context when provided or inherited from the source
- requested content type/channel
- additional user instructions
- agency quality instructions against unsupported claims

## Output Storage

Generated drafts are saved as `content_library_items` through the existing agency draft helper.

Draft metadata includes:

- `agencyGenerated: true`
- `generatedFromSourceImportId`
- source provider/title/created date
- client profile id
- requested quantity/channel/instructions
- generation context metadata
- model, word count, character count, cost, and token usage when returned by the generator

Drafts are created with status `review`.

## UI Updated

Updated:

```text
/dashboard/agency/sources
```

The selected source panel now has a Generate Draft section with:

- content type selection
- channel input
- quantity input
- instructions field
- generate action

Successful generation routes the user to `/dashboard/agency/drafts`.

## Permission Model

- SaaS and personal organizations are denied by agency authorization helpers.
- Demo users cannot generate drafts.
- Source/client scope is validated before generation.
- Draft generation follows existing draft write rules: owner, admin, and `agency_admin`.
- `agency_member` remains unable to create generated drafts because current draft rules are admin-only.

## Intentionally Not Built

- scheduled generation
- automatic generation from new Slack/Granola imports
- external delivery
- Slack posting
- SaaS generation changes
- AI provider rewrite
- billing/subscription changes

## Tests Added Or Updated

- `tests/lib/agency-source-generation.test.ts`
- `tests/lib/agency-source-generation-route.test.ts`
- `tests/lib/agency-source-imports-route.test.ts`

Coverage includes:

- request normalization and quantity capping
- source route/body mismatch rejection
- prompt composition
- generated draft metadata
- route SaaS denial
- demo write blocking
- current draft admin boundary
- mocked AI generation helper
- source import membership payload including draft generation capability

## Validation

Passed:

```bash
npm test -- tests/lib/agency-source-generation.test.ts tests/lib/agency-source-generation-route.test.ts tests/lib/agency-drafts.test.ts tests/lib/agency-drafts-route.test.ts tests/lib/agency-source-imports.test.ts tests/lib/agency-source-imports-route.test.ts tests/lib/agency-permissions.test.ts tests/lib/generation-context.test.ts --runInBand
npx tsc --noEmit
npm run -s lint
git diff --check
```

Focused test result:

- 8 test suites passed
- 48 tests passed

Lint result:

- passed with existing repo warnings
- no new errors were reported from Phase 5D files

## Next Phase

Phase 5E can add manual client delivery packaging and exports for reviewed agency drafts. No automatic send/publish behavior should be added unless a later phase explicitly approves it.
