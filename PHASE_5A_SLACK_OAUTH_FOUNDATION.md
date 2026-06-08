# Phase 5A: Slack OAuth/App Install Foundation

## Summary

Phase 5A adds the private internal agency Slack OAuth foundation.

Internal agency admins can start a Slack OAuth install for a selected agency client, complete the OAuth callback, and store connected workspace metadata in `client_integrations` with provider `slack`.

This phase does not import Slack messages, list channels, store Slack message content, post to Slack, or expose Slack functionality to SaaS customers.

## Routes Added

- `GET /api/agency/slack/oauth/start`
- `GET /api/agency/slack/oauth/callback`

The start route supports the default redirect response and `mode=json` for dashboard-triggered installs that need to include the current bearer token.

## Environment Variables

Required:

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`

Optional:

- `SLACK_OAUTH_STATE_SECRET`
- `SLACK_SIGNING_SECRET` for later event/webhook work
- `INTEGRATIONS_ENCRYPTION_KEY` for encrypted token persistence added in Phase 5B

No real secrets are committed.

## Slack App Setup

Configure the Slack app redirect URL to match `SLACK_REDIRECT_URI`, usually:

```text
https://<app-host>/api/agency/slack/oauth/callback
```

The implementation follows Slack's OAuth V2 install flow:

- Authorize URL: `https://slack.com/oauth/v2/authorize`
- Code exchange: `https://slack.com/api/oauth.v2.access`

Slack documentation reviewed:

- https://docs.slack.dev/authentication/installing-with-oauth/
- https://docs.slack.dev/reference/methods/oauth.v2.access/
- https://docs.slack.dev/reference/scopes/team.read/

## Scopes Requested

Phase 5A originally used workspace metadata only:

```text
team:read
```

That scope is enough to view workspace metadata such as the workspace name.

Phase 5B deliberately expanded the shared Slack OAuth helper to request the documented channel listing and bounded import scopes required by the manual import workflow. The implementation still does not expose a free-form scope override.

## State And CSRF Handling

OAuth state is signed server-side using HMAC-SHA256.

The signed state includes:

- `organizationId`
- `clientId`
- `userId`
- `nonce`
- `issuedAt`
- `expiresAt`

The callback validates:

- state signature
- state expiration
- agency client scope
- current user matches the signed state user
- user is not demo/read-only
- user has internal agency admin/client-management access

The client and organization query params are not trusted on callback; they come from signed state and are revalidated against the active internal agency organization.

## Token Storage Decision

Token persistence was deferred in Phase 5A and implemented in Phase 5B.

The Phase 5A route exchanged the Slack OAuth code to verify the install and read the Slack response, then stored only non-secret workspace metadata in `client_integrations.metadata_json`.

Stored metadata includes:

- `mode: "oauth_connected"`
- `externalConnection: true`
- `workspaceId`
- `workspaceName`
- `teamId`
- `teamName`
- `connectedBy`
- `connectedAt`
- `appId`
- `botUserId`
- granted scope names
- `tokenStorage: "deferred"` in the original 5A pass; Phase 5B updates connected installs to `client_integrations_encrypted_columns`
- `tokenStored: false` in the original 5A pass; Phase 5B stores encrypted tokens when configured

Raw `access_token`, `refresh_token`, and nested user token values are not stored or returned.

Phase 5B added a deliberate encrypted token storage model before any real Slack API reads such as channel listing or message import.

## UI Updated

`/dashboard/agency/slack` now shows:

- OAuth connected/not-connected state
- connected workspace metadata
- Connect/Reconnect Slack action for internal agency admins
- read-only status for non-admin agency members
- demo-user write blocking

No message import UI was added.

## Security Model

- SaaS and personal organizations are denied by `requireAgencyClientAccess`.
- The selected client must belong to the active internal agency organization.
- Start and callback writes require owner, admin, or `agency_admin`.
- Demo users cannot start OAuth or write integration metadata.
- Service-role `client_integrations` writes happen only after route-level authorization.
- Platform admin email access is not used as an agency bypass.
- Tokens are never exposed to the client or persisted in metadata.

## Intentionally Not Built

- Slack channel listing
- Slack message import
- Slack message storage
- Slack bot workflows
- Slack event subscriptions
- Slack posting
- automatic sync
- Granola API integration
- SaaS customer Slack surface
- billing or generation changes

## Tests Added Or Updated

- `tests/lib/agency-slack-oauth.test.ts`
- `tests/lib/agency-slack-oauth-route.test.ts`
- `tests/lib/agency-slack-status-route.test.ts`

Coverage includes:

- signed state creation and validation
- tampered/expired state rejection
- documented Slack authorize URL scopes
- raw token metadata sanitization
- start route admin gating
- SaaS org denial
- demo user denial
- client org mismatch denial
- callback invalid state handling
- callback Slack error handling
- connected metadata write
- preservation of OAuth metadata during manual Slack status saves

## Validation

Passed:

```bash
npx tsc --noEmit
npm run -s lint
npm test -- tests/lib/agency-slack-oauth.test.ts tests/lib/agency-slack-oauth-route.test.ts tests/lib/agency-slack-status-route.test.ts tests/lib/agency-client-integrations.test.ts tests/lib/agency-permissions.test.ts --runInBand
git diff --check
```

Focused test result:

- 5 test suites passed
- 37 tests passed

Lint result:

- passed with the existing repo warnings
- no new warnings were reported from Phase 5A files

## Next Phase

Phase 5B adds encrypted client-scoped Slack token storage before channel listing or message import. It continues to avoid broad workspace imports and keeps all Slack data internal to agency routes.
