# Phase 5F: Agency Workflow QA and Integration Safety Pass

Status: Implemented and reviewed. Not committed.

## Objective

Phase 5F reviewed and hardened the Phase 5 internal agency integration and workflow surface before Phase 6 planning.

Reviewed areas:

- Slack OAuth/app install foundation
- Slack channel selection and bounded manual message import
- manual Granola import expansion
- source-to-draft generation from internal agency sources
- manual client delivery packages and exports
- shared agency permission helpers
- Phase 5 migrations and RLS alignment
- agency route tests and helper tests

No public SaaS dashboard, billing, Stripe, public marketing, Slack posting, scheduled sync, or Granola API work was added.

## QA Areas

### Access Control

Reviewed agency integration routes to confirm they require active internal agency organization access before data access:

- `GET /api/agency/slack/oauth/start`
- `GET /api/agency/slack/oauth/callback`
- `GET /api/agency/slack/channels`
- `POST /api/agency/slack/channels/selection`
- `POST /api/agency/slack/import`
- `GET /api/agency/granola/imports`
- `POST /api/agency/granola/imports`
- `POST /api/agency/source-imports/:id/generate`
- delivery package list/create/detail/update/export routes

Confirmed route tests cover:

- SaaS organization denial
- client/org scoping
- demo-user write denial
- admin-only writes where required
- read-only or non-admin behavior where applicable
- no generation/import/delivery helper calls after denied auth

### Slack

Reviewed Slack OAuth, token handling, channel listing, channel selection, and import behavior.

Confirmed:

- OAuth state is HMAC signed with an expiration.
- Callback validates the signed state and user identity before writing integration metadata.
- Slack provider errors redirect safely without writes.
- Raw Slack tokens are not stored in metadata.
- Tokens are encrypted into dedicated `client_integrations` columns when configured.
- API payloads expose only safe token status metadata.
- Channel listing requires a connected Slack integration with decryptable encrypted token storage.
- Manual message import is bounded with a default of 50 and max of 200 messages.
- Imported Slack content is stored as internal `source_imports.provider = 'slack'`.
- No Slack posting, event subscription, bot workflow, scheduled sync, or automatic draft generation was added.

### Granola

Reviewed the expanded manual Granola import workflow.

Confirmed:

- Workflow remains manual paste/import.
- No Granola OAuth or API sync was added.
- Provider remains `granola`.
- Structured fields are stored in `source_imports.metadata_json`.
- Parser is deterministic and best-effort.
- Parser warnings do not block import.
- Agency members can import according to existing source-import permissions, while demo users are blocked from writes.

### Source-to-Draft

Reviewed source-to-draft generation route and helper behavior.

Confirmed:

- Source imports are loaded within the active internal agency organization.
- Source client must match the selected agency client.
- Campaign and brand voice references are validated through existing agency draft reference checks.
- Source campaign context is inherited when request campaign is omitted.
- Generated drafts are saved through the agency draft/content library model.
- Draft metadata links back to `generatedFromSourceImportId`.
- Public SaaS generation routes were not changed.
- No external delivery or Slack posting occurs during generation.

### Delivery

Reviewed delivery package schema, helpers, APIs, UI, and exports.

Confirmed:

- Delivery packages are internal agency scoped.
- Package clients must belong to the package organization.
- Package items must belong to the same organization and client.
- RLS allows internal agency members to read and internal agency admins/owners to manage.
- Demo users are blocked from package writes.
- Markdown, CSV, text, and JSON exports are local/manual only.
- Marking a package delivered updates delivery tracking without publishing or sending content externally.

### Data Integrity and RLS

Reviewed Phase 5 migrations:

- `supabase/migrations/20260608120000_phase_5b_slack_encrypted_tokens.sql`
- `supabase/migrations/20260608130000_phase_5e_agency_delivery_packages.sql`

Confirmed:

- Slack token fields are dedicated encrypted storage columns, not metadata fields.
- Delivery package tables have RLS enabled.
- Delivery package RLS is limited to active internal agency organization members.
- Delivery package mutation policy is limited to owner/admin/agency_admin roles.
- Delivery package item triggers enforce package/content item org and client alignment.
- Service-role policy remains explicit for trusted server-side API code.

## Bugs Found and Fixed

### Slack Channel Selection Could Create False Connected Records

Issue:

`POST /api/agency/slack/channels/selection` could create a Slack integration with `status = connected` when no connected Slack workspace existed yet.

Risk:

An internal admin could create metadata that looked connected even though no encrypted token/workspace connection existed.

Fix:

The route now requires an existing Slack integration with `status = connected` before saving selected channels.

Test added:

- `requires a connected Slack workspace before saving channel selections`

### Source Generation Performed Full Body Validation Before Agency Authorization

Issue:

`POST /api/agency/source-imports/:id/generate` normalized the full generation body before completing agency client access checks.

Risk:

Unauthorized callers could receive generation validation errors before agency access was checked.

Fix:

The route now extracts only `client_id`, checks client-scoped agency access first, then validates the full generation request.

Test added:

- `checks agency access before validating generation content settings`

## Tests Added or Updated

Added/updated focused tests for:

- Slack channel selection requiring a connected workspace
- source-to-draft route authorization before generation content validation
- full Phase 5 route/helper behavior across Slack, Granola, generation, delivery, permissions, and schema tests

## Validation

Passed:

```bash
npm test -- tests/lib/agency-slack.test.ts tests/lib/agency-slack-channel-import-route.test.ts tests/lib/agency-slack-oauth.test.ts tests/lib/agency-slack-oauth-route.test.ts tests/lib/agency-slack-status-route.test.ts tests/lib/agency-client-integrations.test.ts tests/lib/agency-granola-parser.test.ts tests/lib/agency-granola-imports-route.test.ts tests/lib/agency-source-generation.test.ts tests/lib/agency-source-generation-route.test.ts tests/lib/agency-source-imports.test.ts tests/lib/agency-source-imports-route.test.ts tests/lib/agency-drafts.test.ts tests/lib/agency-drafts-route.test.ts tests/lib/agency-delivery-packages.test.ts tests/lib/agency-delivery-packages-route.test.ts tests/lib/agency-permissions.test.ts tests/lib/agency-schema.test.ts --runInBand
```

Result:

- 18 test suites passed
- 117 tests passed

Passed:

```bash
npx tsc --noEmit
```

Result:

- TypeScript passed with no output.

Passed:

```bash
npm run -s lint
```

Result:

- lint exited 0
- 141 existing warnings remain in unrelated areas of the app
- no lint errors

Passed:

```bash
git diff --check
```

Result:

- no whitespace errors

Final validation commands run for this phase:

- focused Phase 5 Jest suites
- `npx tsc --noEmit`
- `npm run -s lint`
- `git diff --check`

## Remaining Risks

- Slack OAuth uses documented minimal import scopes for the Phase 5B manual import workflow, including history scopes. A later production setup should verify the app's exact Slack workspace permission review requirements before install.
- Slack imports store bounded raw message text in internal `source_imports`. This is intentional for the agency workflow, but retention/redaction policy should be revisited before broader client volume.
- Delivery exports are API-returned content bundles, not audited downloadable files. That is acceptable for the manual MVP workflow, but Phase 6+ may want delivery audit logs or package export history.
- Route smoke tests were covered through Jest route handler tests, not a browser/server smoke run.
- Live Supabase RLS policies were inspected through migration tests and SQL review; no live Supabase policy execution was run in this phase.

## Phase 6 Readiness

Phase 5 is ready for review before Phase 6 planning after final TypeScript, lint, and whitespace validation pass.

Recommended before Phase 6:

- commit Phase 5 with the intended commit boundaries or as one consolidated Phase 5 commit
- verify Slack app settings in a real Slack development workspace
- decide whether Phase 6 should prioritize public agency website, client portal, or advanced automation
- define retention/redaction expectations for imported Slack and meeting source material
