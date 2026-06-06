# Phase 3G: SaaS MVP QA Pass

## Summary

Phase 3G validates the B2B SaaS MVP surface before moving to agency-specific work.

This pass focused on automated coverage, launch-readiness checks, documentation, and one small test drift fix. No major features, agency console work, Slack work, Granola work, or UI redesign was added.

## Fixes

- Updated the insights refresh API regression test mock to use `estimateAnalysisJobCostAsync`, matching the current route implementation.

## Flow Review

| Flow | Status | Evidence |
| --- | --- | --- |
| Signup/login | Covered by auth helper tests | `tests/auth-validation.test.ts`, `tests/lib/route-auth.test.ts` |
| Organization creation/default org | Covered by org helper and route tests | `tests/lib/current-organization.test.ts`, `tests/lib/current-organization-route.test.ts` |
| Subscription plan display | Covered by subscription UI and current subscription route tests | `tests/lib/subscription-ui.test.ts`, `tests/lib/current-subscription-route.test.ts` |
| Stripe subscription checkout | Covered by route and Stripe sync tests | `tests/lib/subscription-checkout-portal-route.test.ts`, `tests/lib/subscription-stripe-sync.test.ts`, `tests/lib/stripe-webhook-subscription.test.ts` |
| Billing portal | Covered by portal route tests | `tests/lib/subscription-checkout-portal-route.test.ts` |
| Brand voice creation | Covered by helper and route tests | `tests/lib/brand-voices.test.ts`, `tests/lib/brand-voices-route.test.ts` |
| Campaign creation | Covered by campaign route/helper tests | `tests/lib/campaigns-content-library.test.ts`, `tests/lib/campaigns-content-library-route.test.ts` |
| Content generation with brand voice/campaign | Covered by generation context and generation route tests | `tests/lib/generation-context.test.ts`, `tests/api/generate-content.test.js`, `tests/api/project-generate.test.js`, `tests/api/project-generate-process.test.js` |
| Content library save/read | Covered by content library route/helper tests | `tests/lib/campaigns-content-library.test.ts`, `tests/lib/campaigns-content-library-route.test.ts` |
| Dashboard list APIs | Covered by dashboard organization context tests | `tests/lib/dashboard-org-context.test.ts`, `tests/lib/billing-org-context.test.ts` |
| Entitlement dry-run/enforce behavior | Covered by entitlement and launch-readiness tests | `tests/lib/entitlement-guards.test.ts`, `tests/lib/subscription-entitlements.test.ts`, `tests/lib/subscription-launch-readiness.test.js` |
| Legacy user fallback | Covered by legacy owner and legacy billing/dashboard fallback tests | `tests/lib/route-auth.test.ts`, `tests/lib/dashboard-org-context.test.ts`, `tests/lib/billing-org-context.test.ts` |

## Validation

Checks run:

- `npm test -- tests/lib/route-auth.test.ts tests/lib/current-organization.test.ts tests/lib/current-organization-route.test.ts tests/lib/dashboard-org-context.test.ts --runInBand`
- `npm test -- tests/lib/brand-voices-route.test.ts tests/lib/brand-voices.test.ts tests/lib/campaigns-content-library-route.test.ts tests/lib/campaigns-content-library.test.ts tests/lib/generation-context.test.ts --runInBand`
- `npm test -- tests/lib/current-subscription-route.test.ts tests/lib/subscription-checkout-portal-route.test.ts tests/lib/subscription-entitlements.test.ts tests/lib/entitlement-guards.test.ts tests/lib/billing-permissions.test.ts tests/lib/billing-org-context.test.ts tests/lib/subscription-ui.test.ts --runInBand`
- `npm test -- tests/lib/stripe-webhook-subscription.test.ts tests/lib/subscription-stripe-sync.test.ts tests/lib/subscription-usage-counters.test.ts tests/lib/subscription-launch-readiness.test.js tests/billing/credit-operations.test.ts tests/billing/usage-tracking.test.ts --runInBand`
- `RUN_FULL_TEST_SUITE=1 npm test -- tests/api/generate-content.test.js tests/api/project-generate.test.js tests/api/project-generate-process.test.js tests/api/insights-refresh.test.js --runInBand`
- `npm test -- tests/lib/project-generate-process-auth.test.ts tests/lib/transcribe-auth-context.test.ts tests/api/insights-refresh.test.js --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run validate:subscription-launch -- --skip-db`
- `npm test -- --runInBand`

Results:

- TypeScript passes.
- Lint passes with existing warnings.
- Default Jest suite passes: 40 suites, 441 tests.
- Full-suite API generation group passes: 4 suites, 50 tests.
- Subscription launch readiness passes in `--skip-db` mode.

## Residual Launch Checks

These checks still require live service credentials or a launch-like environment:

- Browser signup/login against the configured auth provider.
- Real Stripe checkout redirect and return URL behavior.
- Real Stripe billing portal redirect and return URL behavior.
- Database-backed subscription readiness without `--skip-db`.
- Production environment validation with final production secrets.

`validate:subscription-launch -- --skip-db` reported enforcement mode as `dry_run`, skipped database checks by request, and warned that the recommended Stripe subscription success, cancel, and billing portal return URL environment variables are not set locally.

## Scope Boundaries

This phase did not:

- add major product features
- build agency console behavior
- add Slack or Granola work
- redesign the dashboard
