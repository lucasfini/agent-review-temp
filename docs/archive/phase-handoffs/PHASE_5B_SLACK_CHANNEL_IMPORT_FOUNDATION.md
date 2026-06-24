# Phase 5B: Slack Channel Selection + Message Import Foundation

## Summary

Phase 5B adds controlled Slack channel listing, channel selection, and bounded manual message import for private internal agency clients.

Slack imports remain internal-only. Imported Slack messages are stored as `source_imports` records with provider `slack`; no drafts are generated automatically and nothing is posted back to Slack.

## Token Storage

Phase 5B adds encrypted token columns to `client_integrations`:

- `access_token_enc`
- `refresh_token_enc`
- `token_type`
- `token_scopes`
- `token_expires_at`

Migration:

```text
supabase/migrations/20260608120000_phase_5b_slack_encrypted_tokens.sql
```

Slack OAuth callback now encrypts tokens with `INTEGRATIONS_ENCRYPTION_KEY` before persistence. API payloads expose only safe token metadata such as `tokenStored`, `tokenScopes`, and `tokenExpiresAt`; raw encrypted columns are not returned by `mapAgencyClientIntegrationRow`.

## Routes Added

- `GET /api/agency/slack/channels?client_id=<clientId>`
- `POST /api/agency/slack/channels/selection`
- `POST /api/agency/slack/import`

## Slack Scopes

Phase 5B requires scopes beyond Phase 5A:

- `team:read` for workspace metadata
- `channels:read` for public channel listing
- `groups:read` for private channel listing, if private channels should be visible
- `channels:history` for importing public channel messages
- `groups:history` for importing private channel messages

The shared Slack OAuth helper now requests this fixed documented scope set. It still does not accept arbitrary runtime scope overrides.

Slack documentation reviewed:

- https://docs.slack.dev/reference/methods/conversations.list/
- https://docs.slack.dev/reference/methods/conversations.history/
- https://docs.slack.dev/messaging/retrieving-messages/

## Channel Listing

Channel listing:

- requires internal agency access
- validates the selected agency client belongs to the active internal agency organization
- requires an OAuth-connected Slack integration with an encrypted token
- returns minimal channel data only:
  - id
  - name
  - private flag
  - archived flag
  - member count when Slack returns it

Tokens are decrypted only server-side after agency/client authorization.

## Channel Selection

Channel selection:

- is restricted to owner, admin, or `agency_admin`
- blocks demo users
- stores selected channel IDs/names in `client_integrations.metadata_json`
- preserves existing integration metadata
- does not store tokens in metadata

## Manual Message Import

Slack import:

- requires internal agency source-import operator access
- blocks demo users
- validates client/org scope before token lookup
- defaults to 50 messages
- caps imports at 200 messages
- imports only on explicit user action
- stores content in `source_imports` with `provider = 'slack'`
- records channel id/name, applied limit, message count, time range, and importing user in metadata

Internal agency members can import selected channels. Agency admins can import an explicitly requested channel even if it has not been saved in the selected-channel list.

## UI Updated

`/dashboard/agency/slack` now shows:

- connected workspace status
- encrypted-token readiness
- channel list when Slack is connected
- admin channel selection controls
- manual import buttons for selected channels
- bounded import success/error state

Demo users remain read-only. Non-admin users do not see write-enabled controls in the current UI.

## Intentionally Not Built

- automatic Slack sync
- scheduled imports
- event subscriptions
- Slack bot posting
- workspace-wide history import
- draft generation from Slack
- Slack-to-client delivery
- SaaS customer Slack surfaces
- billing or generation changes
- Granola API behavior

## Tests Added Or Updated

- `tests/lib/agency-slack.test.ts`
- `tests/lib/agency-slack-channel-import-route.test.ts`
- `tests/lib/agency-slack-oauth-route.test.ts`
- `tests/lib/agency-client-integrations.test.ts`
- `tests/lib/agency-schema.test.ts`

Coverage includes:

- encrypted token field normalization
- no token exposure in mapped integration payloads
- Slack channel listing auth and disconnected handling
- SaaS org denial
- non-admin channel selection denial
- demo write denial
- bounded import limit capping
- Slack provider/client/org source-import creation
- selected-channel enforcement for non-admin imports

## Validation

Passed:

```bash
npx tsc --noEmit
npm run -s lint
npm test -- tests/lib/agency-slack.test.ts tests/lib/agency-slack-channel-import-route.test.ts tests/lib/agency-slack-oauth.test.ts tests/lib/agency-slack-oauth-route.test.ts tests/lib/agency-slack-status-route.test.ts tests/lib/agency-client-integrations.test.ts tests/lib/agency-permissions.test.ts tests/lib/agency-schema.test.ts --runInBand
git diff --check
```

Focused test result:

- 8 test suites passed
- 57 tests passed

Lint result:

- passed with the existing repo warnings
- no new errors were reported from Phase 5B files

Review fix:

- Expanded the Slack OAuth helper scopes from workspace metadata only to the documented channel listing/history scopes required by this phase.
- Updated the Slack dashboard boundary copy to reflect encrypted token storage and manual bounded imports.

## Next Phase

Phase 5C can expand the manual Granola workflow. Slack should remain manual until a later phase explicitly approves scheduled sync or event-based automation.
