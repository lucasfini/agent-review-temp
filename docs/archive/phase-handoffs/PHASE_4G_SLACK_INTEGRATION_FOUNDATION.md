# Phase 4G: Slack Integration Foundation

## Summary

Phase 4G adds the private internal agency Slack foundation.

The implementation stores per-client Slack readiness and workspace/channel metadata in `client_integrations` with provider `slack`. It does not build a Slack app install flow, OAuth, bot-token storage, channel sync, or message import.

## Implemented Behavior

- Added `GET /api/agency/slack/status`.
- Added `PATCH /api/agency/slack/status`.
- Added `/dashboard/agency/slack` for Slack readiness tracking.
- Added a private Agency nav item for Slack Foundation.
- Supports selecting an agency client and recording:
  - Slack status
  - workspace name
  - workspace URL
  - priority channel names
  - internal notes
- Stores metadata with `externalConnection: false` and `mode: foundation_only`.
- Validates the selected client belongs to the active internal agency organization.
- Keeps demo users read-only.

## Private/Internal Boundary

Slack foundation data remains internal because:

- Slack status APIs use `requireAgencyAccess` and `requireAgencyClientAccess`
- Slack status is stored against a validated agency client
- SaaS customer organizations are denied by the existing agency authorization helpers
- the Slack Foundation nav item is only shown when an internal agency organization can be resolved

Slack status writes are restricted to `owner`, `admin`, and `agency_admin`, matching the existing `client_integrations` RLS boundary. Other internal agency members can read status but cannot update it.

## Foundation-Only Slack Model

This phase records planning/configuration metadata only. It does not create a live Slack connection.

The stored `client_integrations` row is intended to support a later phase that can add:

- Slack OAuth/app install
- bot token storage
- channel selection
- manual selected-message imports
- automated source import sync

## Intentionally Not Built

This phase does not include:

- Slack OAuth
- Slack API calls
- bot token storage
- channel sync
- message import
- generated-content changes
- billing changes
- public SaaS Slack surfaces

## Validation Notes

The implementation should be validated with:

- TypeScript
- lint
- Slack status route tests
- client integration helper tests
- agency permission tests
- agency client route tests
- browser or HTTP smoke for `/dashboard/agency/slack`

The happy-path UI needs a live internal agency organization and at least one agency client.

## Start Of Phase 5

Phase 4 is now complete after this phase is committed.

Phase 5 should start from actual integration workflows, not more schema or private-console foundation work.
