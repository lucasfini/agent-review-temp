# Phase 2D: Entitlement Enforcement Dry-Run Guardrails

Date: 2026-06-04

## Scope

This phase adds centralized entitlement decisions and logs what subscription enforcement would do.

In scope:
- Dry-run entitlement helper
- Current-period usage summaries for existing billing data
- Non-blocking instrumentation on expensive action entry points
- Authenticated entitlement summary API
- Environment flag defaulting to dry-run
- Focused helper tests

Out of scope:
- Hard subscription enforcement
- Blocking uploads, transcription, generation, or imports
- Removing credit/pay-as-you-go behavior
- Stripe checkout or webhook changes
- Public pricing/marketing changes
- Agency, Slack, or Granola features
- Broad RLS rewrites

## Helper Added

New file:
- `lib/billing/entitlement-guards.ts`

Key exports:
- `EntitlementAction`
- `EntitlementDecision`
- `getSubscriptionEnforcementMode(...)`
- `getEntitlementUsagePeriod(...)`
- `getCurrentPeriodUsage(...)`
- `getActionUsageCost(...)`
- `buildDryRunEntitlementDecision(...)`
- `checkOrganizationEntitlement(...)`
- `runEntitlementDryRunCheck(...)`

Supported actions:
- `audio_upload`
- `transcription`
- `content_generation`
- `integration_import`
- `storage`
- `seat`

## Decision Shape

Each decision includes:
- `allowed`
- `dryRun`
- `action`
- `organizationId`
- `planSlug`
- `subscriptionStatus`
- `reasonCode`
- `reasonMessage`
- `limit`
- `currentUsage`
- `requestedAmount`
- `projectedUsage`
- `periodStart`
- `periodEnd`
- `checkedAt`

Reason codes:
- `subscription_missing`
- `subscription_inactive`
- `plan_missing`
- `limit_missing`
- `limit_exceeded`
- `within_limit`
- `legacy_credit_mode`
- `unsupported_action`

Current no-subscription behavior reports `legacy_credit_mode` because credit/pay-as-you-go remains intentionally active during this phase.

## Usage Calculation

Usage uses the current subscription period when `organization_subscriptions.current_period_start` and `current_period_end` are valid.

If no valid subscription period exists, usage falls back to the current UTC calendar month.

Org scoping uses the Phase 1F billing fallback:
- `organization_id = resolved organization`
- OR `organization_id IS NULL AND user_id = authenticated/legacy user`

Mappings:
- `transcription`: sums `usage_events.units` for `assemblyai_transcription`, converted to minutes.
- `content_generation`: sums `billing_reservations` for `content_generation` and `analysis_job`, using `metadata.blockCount`, `metadata.blockIds.length`, or `1`.
- `audio_upload`: counts `billing_reservations.workflow_type = upload_processing`.
- `integration_import`: counts `upload_processing` reservations with metadata source `zoom_import`, `microsoft_import`, or `youtube_import`.
- `storage`: sums `projects.audio_file_size` into MB.
- `seat`: counts active `organization_members`.

Important limitation:
- Existing `usage_events` are provider-level records, not canonical subscription counters.
- Phase 2D reports useful approximations only.
- Phase 2E should define canonical counters or dedicated aggregation before enforcement is enabled.

## Routes Instrumented

The following routes now call `runEntitlementDryRunCheck(...)` and log structured dry-run decisions:
- `app/api/upload/init/route.ts`
- `app/api/upload/url/route.ts`
- `app/api/transcribe/route.ts`
- `app/api/generate-content/route.ts`
- `app/api/generate-selected-content/route.ts`
- `app/api/projects/[id]/generate/route.ts`
- `app/api/integrations/zoom/import/route.ts`
- `app/api/integrations/microsoft/import/route.ts`
- `app/api/integrations/youtube/import/route.ts`

These calls are non-blocking by design:
- Helper errors are caught and logged.
- Decisions with `allowed: false` are logged only.
- Existing credit checks and reservations still decide whether current product flows continue.
- No response shapes were intentionally changed.

## Internal/Background Behavior

`app/api/transcribe/route.ts` uses the existing Phase 1C internal/user auth separation.

Dry-run checks:
- Do not weaken internal auth.
- Do not require end-user cookies for verified internal workers.
- Use the project owner as the legacy fallback user for old null-org rows.
- Prefer the project `organization_id` when present.

## Entitlement Summary API

New route:
- `GET /api/subscriptions/entitlements`

Behavior:
- Requires authenticated user.
- Accepts optional `organization_id`.
- Validates active organization membership before returning data.
- Returns organization, membership, subscription, plan, enforcement mode, and dry-run decisions for all supported actions.
- Does not mutate usage, plans, subscriptions, Stripe, or credits.

## Environment Flag

Added to:
- `.env.example`
- `.env.production.example`

Flag:
- `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`

Supported values:
- `dry_run`
- `enforce`

Current route behavior:
- Always calls dry-run checks.
- Does not hard-block even if the environment value is set to `enforce`.
- Phase 2E must explicitly wire blocking behavior after reviewing dry-run logs.

## How To Review Logs

Search server logs for:
- `[ENTITLEMENT_DRY_RUN]`

Key fields to review:
- `route`
- `action`
- `organizationId`
- `allowed`
- `reasonCode`
- `limit`
- `currentUsage`
- `requestedAmount`
- `projectedUsage`
- `periodStart`
- `periodEnd`

Recommended review before Phase 2E:
1. Confirm no high-value orgs incorrectly report `subscription_inactive`.
2. Confirm no legacy users would be blocked unintentionally.
3. Compare plan limits against actual monthly usage.
4. Validate import and content-generation count approximations.
5. Decide whether `usage_counters` or a dedicated subscription counter table is needed before hard enforcement.

## Tests Added

New test:
- `tests/lib/entitlement-guards.test.ts`

Coverage:
- dry-run mode parsing
- action unit calculation
- subscription period fallback
- within-limit decision
- missing subscription legacy credit fallback
- inactive subscription would-block decision
- limit exceeded would-block decision
- transcription usage summing from `usage_events`

## Next Steps for Phase 2E

Recommended next phase:
1. Review dry-run logs in development/staging.
2. Decide canonical subscription counters.
3. Add owner/admin billing-management permission checks if checkout/portal management should be restricted.
4. Add enforcement wrapper that can convert dry-run `allowed: false` into HTTP 402/403 only when explicitly enabled.
5. Roll out hard enforcement route by route, starting with the least destructive action.
6. Keep credit/pay-as-you-go migration separate unless deliberately retired.
