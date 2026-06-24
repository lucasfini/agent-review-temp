# Phase 2F: Hard Subscription Enforcement Behind Feature Flag

## Summary

Phase 2F turns the Phase 2D/2E entitlement guardrails into optional hard enforcement.

Default behavior is unchanged:

- `SUBSCRIPTION_ENFORCEMENT_MODE` defaults to `dry_run`.
- Invalid values fall back to `dry_run` and log a warning.
- Requests continue through existing credit/pay-as-you-go checks in `dry_run`.
- Usage counters are recorded only after successful completion points from Phase 2E.

Hard enforcement is active only when:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=enforce
```

Only the exact value `enforce` enables blocking.

## Helper Changes

Updated:

- `lib/billing/entitlement-guards.ts`

Added/updated helpers:

- `getSubscriptionEnforcementMode(...)`
- `shouldEnforceSubscriptionEntitlements(...)`
- `buildEntitlementErrorBody(...)`
- `buildEntitlementErrorResponse(...)`
- `runEntitlementGuard(...)`

Behavior:

- In `dry_run`, `runEntitlementGuard(...)` logs decisions and never returns a blocking response.
- In `enforce`, `runEntitlementGuard(...)` returns a blocking `NextResponse` when the entitlement decision is not allowed.
- Guard computation failures fail open and log a warning, leaving the route governed by existing credit/pay-as-you-go checks.
- Existing owner-only legacy projects with `organization_id = null` use the project owner's default organization for hard-enforcement checks when a route can safely resolve it.

## Error Response Shape

Blocked requests return stable JSON:

```json
{
  "error": "subscription_limit_exceeded",
  "message": "Your current plan limit has been reached.",
  "reasonCode": "limit_exceeded",
  "action": "content_generation",
  "limit": 100,
  "currentUsage": 100,
  "requestedAmount": 1,
  "projectedUsage": 101,
  "upgradeRequired": true,
  "enforcementMode": "enforce",
  "dryRun": false,
  "periodStart": "2026-06-01T00:00:00.000Z",
  "periodEnd": "2026-07-01T00:00:00.000Z",
  "checkedAt": "2026-06-05T00:00:00.000Z"
}
```

Stable `error` values:

- `subscription_required`
- `subscription_inactive`
- `subscription_plan_missing`
- `subscription_limit_exceeded`
- `subscription_entitlement_blocked`

Status codes:

- `402 Payment Required` for missing subscription, inactive subscription, or plan lookup problems.
- `429 Too Many Requests` for plan usage limit exceeded.

## Enforced Routes

When `SUBSCRIPTION_ENFORCEMENT_MODE=enforce`, these user-triggered routes can block before expensive work:

- `app/api/upload/init/route.ts`
  - `audio_upload`
  - Blocks before creating the project, credit reservation, or signed upload URL.

- `app/api/upload/url/route.ts`
  - `audio_upload`
  - Blocks before URL validation/download/import and before usage counter recording.

- `app/api/transcribe/route.ts`
  - `transcription`
  - Blocks only for real user-triggered calls.
  - Verified internal worker calls remain non-blocking and dry-run only.

- `app/api/generate-content/route.ts`
  - `content_generation`
  - Blocks before credit hold/reservation and provider generation.
  - Maintenance calls remain non-blocking and dry-run only.

- `app/api/generate-selected-content/route.ts`
  - `content_generation`
  - Blocks before credit checks, progress initialization, and background dispatch.

- `app/api/projects/[id]/generate/route.ts`
  - `content_generation`
  - Blocks at queue admission before cost reservation and job enqueue.

- `app/api/projects/[id]/generate/process/route.ts`
  - `content_generation`
  - Blocks only for direct user calls before claiming queued jobs.
  - Maintenance/internal processing remains non-blocking and relies on queue admission.

- `app/api/integrations/zoom/import/route.ts`
- `app/api/integrations/microsoft/import/route.ts`
- `app/api/integrations/youtube/import/route.ts`
  - `integration_import`
  - Block before external provider API/download/import work and before usage counter recording.

## Intentionally Not Enforced

- `app/api/upload/finalize/route.ts`
  - This records completed direct uploads, but admission happens in `/api/upload/init`.
  - Blocking finalize could strand already-uploaded objects.

- Phase 2E counter writes
  - `recordSubscriptionUsage(...)` remains non-blocking and only runs after successful completion points.

- Stripe checkout/webhook routes
  - Subscription checkout, portal, and webhook behavior are unchanged.

- Public marketing/pricing pages
  - No public pricing or marketing page changes were made.

## Credit/Pay-As-You-Go Compatibility

Existing credit checks remain in place.

Order:

1. Validate/authenticate enough request context to know the organization and requested action.
2. Run subscription entitlement guard.
3. If enforcement blocks, return the stable subscription error and do not create reservations or counters.
4. If enforcement allows, continue through existing credit/pay-as-you-go checks.
5. Existing credit errors can still block otherwise subscription-allowed requests.

This creates temporary double-gating in `enforce` mode:

- Subscription limits must pass.
- Existing credit balance checks must still pass.

This is intentional until a separate phase migrates or retires credit/pay-as-you-go behavior.

## Entitlements API

Updated:

- `GET /api/subscriptions/entitlements`

Now includes:

- `enforcementMode`
- `enforcementActive`
- `dryRun`
- `usageCounters`
- per-action decisions using the active mode

The route remains read-only and does not mutate counters, subscriptions, Stripe, or credits.

## Safe Staging Test

1. Deploy with:

   ```text
   SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
   ```

2. Exercise upload, URL import, transcription, content generation, queued generation, and integration imports.
3. Review logs for `[ENTITLEMENT_DRY_RUN]`.
4. Verify `GET /api/subscriptions/entitlements` shows expected limits, counters, and decisions.
5. Switch staging to:

   ```text
   SUBSCRIPTION_ENFORCEMENT_MODE=enforce
   ```

6. Test:
   - missing subscription returns `402 subscription_required`
   - inactive subscription returns `402 subscription_inactive`
   - limit exceeded returns `429 subscription_limit_exceeded`
   - within-limit requests continue to existing credit checks and normal work
   - blocked requests do not create reservations or usage counters

## Rollback

Set:

```text
SUBSCRIPTION_ENFORCEMENT_MODE=dry_run
```

or remove the variable. The app returns to Phase 2D/2E behavior without code changes.

## Validation

Phase 2F validation should include:

- `npx tsc --noEmit`
- `npm run -s lint`
- `npx jest --runInBand tests/lib/entitlement-guards.test.ts`
- `npx jest --runInBand tests/lib/subscription-usage-counters.test.ts`
- relevant existing billing/subscription tests
- `git diff --check`
