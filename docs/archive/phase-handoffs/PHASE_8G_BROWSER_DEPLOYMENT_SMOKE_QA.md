# Phase 8G: Browser QA and Deployment Smoke Checklist

Status: Implemented for launch hardening.

Phase 8G adds browser-like smoke coverage and a deployment QA checklist for the launch surfaces. This phase does not redesign pages, add product features, or change backend behavior.

## Routes Tested

Public routes:

```text
/
```

Auth routes:

```text
/auth/login
/auth/signup
```

Dashboard routes, unauthenticated:

```text
/dashboard
/dashboard/billing
/dashboard/studio/profile
/dashboard/studio/voice
/dashboard/studio/plans
/dashboard/content
/dashboard/agency
/dashboard/agency/leads
```

API smoke checks:

```text
POST /api/agency-leads with invalid email returns 400
GET /api/agency/leads unauthenticated returns 401
GET /api/agency-funnel-events returns 405
```

## Browser And Mobile Checks

Automated browser smoke is implemented in:

```text
tests/e2e/phase-8g-browser-deployment-smoke.spec.ts
```

The smoke spec verifies:

- Public pages return successful HTTP status codes.
- Public pages render visible body content.
- Public pages do not render the Next.js missing-page or runtime-error screen.
- Public pages do not horizontally overflow at mobile or desktop viewport widths.
- Auth pages render without server errors and expose email inputs.
- Dashboard routes redirect unauthenticated visitors to `/auth/login`.
- Required API smoke checks return the expected launch-safe status codes.

Viewport coverage:

```text
Mobile: 390x900
Desktop: 1440x1000
```

## Issues Found

The runbook-required `/dashboard/content` route did not have a concrete page in this worktree. Phase 8G added a compatibility redirect to `/dashboard/hub`, the existing content/project workspace, so the launch smoke surface is protected and does not 404.

No remaining launch-blocking browser smoke issues are documented by this phase.

If the Playwright smoke test fails in a local or staging environment, treat the failing route/status as a launch blocker until reviewed.

## Deployment Smoke Checklist

Before production launch:

1. Deploy the app with the production environment from Phase 8A.
2. Confirm `GET /api/health` returns `200` and `status: healthy`.
3. Open the public routes listed above at mobile and desktop viewport widths.
4. Confirm public pages do not show internal dashboard links or API/debug links.
5. Submit an invalid agency lead API request and confirm a `400` response.
6. Confirm `GET /api/agency/leads` without auth returns `401`.
7. Confirm `GET /api/agency-funnel-events` returns `405`.
8. Open `/auth/login` and `/auth/signup` and verify email/password form controls render.
9. Open every dashboard route listed above while signed out and verify redirect to `/auth/login`.
10. Sign in with a staging user and run a manual dashboard pass for billing, Studio profile, Voice, Plans, content, agency, and agency leads.
11. Run the Playwright smoke spec against the deployed staging URL if the environment supports it.
12. Review production logs for Phase 8F tags after the smoke pass.

## Remaining Launch Blockers

Manual staging/production checks still required:

- Signed-in dashboard smoke requires real staging auth credentials.
- Lead submission with a valid email requires configured Supabase, Resend, and `AGENCY_LEAD_ORGANIZATION_ID`.
- Stripe checkout, portal, and webhook behavior remain covered by Phase 8D staging checks, not this browser smoke alone.
- Slack OAuth and imports remain covered by Phase 8F logging visibility and require staging provider credentials.

## Validation

Required validation for Phase 8G:

```text
npx playwright test tests/e2e/phase-8g-browser-deployment-smoke.spec.ts --project=chromium
npx jest tests/scripts/phase-8g-browser-deployment-smoke-qa.test.js --runInBand
npx tsc --noEmit
npm run -s lint
git diff --check
```

Local validation results:

```text
npx playwright test tests/e2e/phase-8g-browser-deployment-smoke.spec.ts --project=chromium
Result: Passed, 13 tests.

npx jest tests/scripts/phase-8g-browser-deployment-smoke-qa.test.js --runInBand
Result: Passed, 2 tests.

npx tsc --noEmit
Result: Passed.

npm run -s lint
Result: Passed with 0 errors and the existing warning backlog.

git diff --check
Result: Passed.
```
