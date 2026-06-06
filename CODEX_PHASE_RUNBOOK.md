# CODEX_PHASE_RUNBOOK.md

# Codex Phase Runbook: B2B SaaS + Internal Agency Platform

## Purpose

This file is the operating runbook for Codex. It exists so Lucas does not need to keep pasting huge prompts phase by phase like some kind of medieval scribe with Stripe keys.

Codex must use this file to:
1. Identify the next approved phase.
2. Implement only that phase.
3. Review its own work.
4. Fix any issues found in review.
5. Run validation.
6. Produce a final report.
7. Stop before moving to the next phase unless Lucas explicitly asks to continue.

This runbook does **not** replace:
- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- the phase documentation files already created
- existing repo conventions
- tests and validation

It is the control process for executing the remaining phases safely.

---

## Current Completed Foundation

The following phases are already completed or assumed complete before using this runbook:

- Phase 0.5: Security and migration cleanup
- Phase 1A: Multi-tenant schema foundation
- Phase 1B: Organization context and dual-write
- Phase 1C-1: Project auth helper cutover
- Phase 1C-2: Ad-hoc project route cutover
- Phase 1C-3: Transcribe/internal auth separation
- Phase 1C-4: Remaining single-project auth audit
- Phase 1D: Dashboard/list organization context
- Phase 1E: Frontend org context propagation
- Phase 1F: Billing and usage org context
- Phase 2A: Subscription schema and entitlement foundation
- Phase 2B: Stripe subscription checkout and customer portal
- Phase 2C: Subscription billing UI surface
- Phase 2D: Entitlement enforcement dry-run guardrails
- Phase 2E: Canonical subscription usage counters

Before starting any phase, verify:
- `git status` is clean
- the current branch is correct
- the previous phase is committed
- TypeScript and lint were passing at the end of the previous phase

---

## Universal Codex Command

Lucas can paste this short command into Codex instead of pasting the full phase prompt:

```text
Read CODEX_PHASE_RUNBOOK.md.

Run the next unchecked phase only.

For that phase:
1. Implement the phase.
2. Perform the review checklist included in the same phase.
3. Fix any bugs found during review.
4. Re-run validation.
5. Produce a final report with:
   - files changed
   - bugs found
   - fixes made
   - validation results
   - remaining risks
   - whether the phase is safe to commit

Do not commit unless I explicitly ask you to commit.
Do not start the next phase unless I explicitly ask you to continue.
```

Optional one-liner after a successful phase:

```text
Read CODEX_PHASE_RUNBOOK.md and run the next unchecked phase only.
```

---

## Universal Rules for Every Phase

Codex must follow these rules for every phase.

### Hard Scope Rules

Unless the specific phase says otherwise:

- Do not remove `user_id` columns.
- Do not make `organization_id` `NOT NULL`.
- Do not broadly rewrite RLS.
- Do not remove credit/pay-as-you-go behavior.
- Do not break existing one-time Stripe credit checkout.
- Do not change Stripe webhook behavior unless the phase explicitly requires it.
- Do not implement agency clients unless the phase explicitly says so.
- Do not implement Slack or Granola unless the phase explicitly says so.
- Do not redesign the whole UI.
- Do not change public marketing/pricing pages unless the phase explicitly says so.
- Preserve response shapes unless the phase explicitly allows additive metadata.
- Keep legacy rows with `organization_id IS NULL` working through safe `user_id` fallback.
- Prefer small, scoped changes over broad rewrites.

### Review Must Happen in the Same Codex Run

Every phase must include:

1. Implementation
2. Review
3. Fixes
4. Final validation
5. Final report

Do not stop after implementation only.

### Validation Baseline

Run at minimum:

```bash
npx tsc --noEmit
npm run -s lint
git diff --check
```

Also run phase-specific tests and relevant existing tests.

If test infrastructure prevents a test from running, document the exact reason. Do not silently skip it, because apparently software does not debug itself despite decades of wishful thinking.

---

# Phase Queue

Use the first unchecked phase below.

---

## [x] Phase 2F: Hard Subscription Enforcement Behind Feature Flag

Completed commit: 7a7d58b

### Objective

Turn entitlement guardrails into optional hard enforcement behind `SUBSCRIPTION_ENFORCEMENT_MODE=enforce`.

Default behavior must remain `dry_run`.

### Read First

- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- `PHASE_2A_SUBSCRIPTION_SCHEMA_ENTITLEMENTS.md`
- `PHASE_2B_STRIPE_SUBSCRIPTION_CHECKOUT.md`
- `PHASE_2C_SUBSCRIPTION_BILLING_UI.md`
- `PHASE_2D_ENTITLEMENT_DRY_RUN_GUARDRAILS.md`
- `PHASE_2E_SUBSCRIPTION_USAGE_COUNTERS.md`
- `PHASE_1F_BILLING_USAGE_ORG_CONTEXT.md`

### Implementation Scope

Implement hard enforcement only behind the feature flag.

When `SUBSCRIPTION_ENFORCEMENT_MODE=dry_run`:
- no requests are blocked
- behavior remains like Phase 2D/2E
- decisions are logged/reported

When `SUBSCRIPTION_ENFORCEMENT_MODE=enforce`:
- block disallowed expensive user-triggered actions
- block before expensive provider/API work
- do not record counters for blocked actions
- keep internal/background worker paths safe

### Routes to Enforce

Only routes already instrumented in Phase 2D/2E:

- `app/api/upload/init/route.ts`
- `app/api/upload/url/route.ts`
- `app/api/transcribe/route.ts`
- `app/api/generate-content/route.ts`
- `app/api/generate-selected-content/route.ts`
- `app/api/projects/[id]/generate/route.ts`
- `app/api/projects/[id]/generate/process/route.ts`, only if user-triggered path should enforce
- integration import routes already instrumented:
  - Zoom
  - Microsoft
  - YouTube

### Required Helper Work

Create or update helpers for:

- `getSubscriptionEnforcementMode()`
- `shouldEnforceSubscriptionEntitlements()`
- `buildEntitlementErrorResponse(...)`
- `runEntitlementGuard(...)`

Rules:

- default is `dry_run`
- only exact value `enforce` enables blocking
- invalid env values fall back to `dry_run` and log a warning
- tests must cover parsing/default behavior

### Error Response Shape

Use a stable response shape, for example:

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
  "upgradeRequired": true
}
```

Pick consistent status codes and document the choice:

- `402 Payment Required` for missing/inactive subscription
- `429 Too Many Requests` for usage limit exceeded
- `403 Forbidden` for access/org permission problems

### Credit Compatibility

Do not remove existing credit checks.

Document temporary double-gating if both credit and subscription checks run.

### Documentation

Create:

```text
PHASE_2F_HARD_ENFORCEMENT_FEATURE_FLAG.md
```

Document:

- env var
- default `dry_run`
- enforce behavior
- routes enforced
- routes intentionally not enforced
- error response shape
- status code choices
- credit/pay-as-you-go compatibility
- staging rollout
- rollback by setting `dry_run`

### Tests

Add focused tests for:

- dry-run default
- invalid env fallback
- enforce missing subscription
- enforce inactive subscription
- enforce limit exceeded
- enforce within limit
- blocked requests do not record counters where practical
- error response shape

### Review Checklist

After implementation, review:

- default mode is still `dry_run`
- only exact `enforce` blocks
- dry-run does not block any route
- enforce blocks only user-triggered expensive actions
- internal/background paths are not accidentally blocked
- blocking happens before provider/API work
- blocked actions do not increment counters
- existing credit checks remain
- error responses expose no secrets
- Stripe checkout/webhook unchanged
- no billing UI redesign
- no agency/Slack/Granola work

### Required Validation

Run:

```bash
npx tsc --noEmit
npm run -s lint
git diff --check
```

Run new Phase 2F tests and relevant existing entitlement/counter/billing/subscription tests.

### Commit Message

If review passes and Lucas approves committing:

```bash
git add .
git commit -m "Add feature-flagged subscription entitlement enforcement"
```

---

## [x] Phase 2G: Billing Permissions and Owner/Admin Controls

Completed commit: da3a338

### Objective

Restrict billing/subscription management actions to organization owners/admins while preserving read access where appropriate.

Right now, active membership may be enough in some routes. That is convenient, and also how random teammates end up discovering buttons they should not press. We fix that here.

### Read First

- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- `PHASE_1A_MULTI_TENANT_SCHEMA_FOUNDATION.md`
- `PHASE_1B_ORGANIZATION_CONTEXT_DUAL_WRITE.md`
- `PHASE_1F_BILLING_USAGE_ORG_CONTEXT.md`
- `PHASE_2A_SUBSCRIPTION_SCHEMA_ENTITLEMENTS.md`
- `PHASE_2B_STRIPE_SUBSCRIPTION_CHECKOUT.md`
- `PHASE_2C_SUBSCRIPTION_BILLING_UI.md`
- `PHASE_2F_HARD_ENFORCEMENT_FEATURE_FLAG.md`

### Implementation Scope

Add role-aware billing permission helpers and use them for billing management actions.

### Permission Model

Roles allowed to manage billing:

- `owner`
- `admin`
- `agency_admin` only for internal agency orgs if relevant

Roles allowed to read billing summary:

- start with active members if current behavior expects it
- document if read access remains broad
- tighten only if safe

### Routes to Review

- `app/api/subscriptions/checkout/route.ts`
- `app/api/subscriptions/portal/route.ts`
- `app/api/subscriptions/current/route.ts`
- `app/api/subscriptions/entitlements/route.ts`
- `app/api/subscriptions/usage-counters/route.ts`
- `app/api/billing/balance/route.ts`
- `app/api/billing/usage/route.ts`
- `app/api/billing/transactions/route.ts`
- `app/api/billing/transactions/grouped/route.ts`
- `app/api/billing/costs/route.ts`

### Required Helper Work

Create or update:

- `lib/authz/billing-permissions.ts`

Functions may include:

- `requireOrganizationBillingManager(...)`
- `canManageOrganizationBilling(role, organizationType?)`
- `canReadOrganizationBilling(role, organizationType?)`

### UI

Minimal UI only:

- hide/disable checkout/portal actions for non-managers if current org role is available
- do not redesign the billing page
- backend remains the source of truth

### Documentation

Create:

```text
PHASE_2G_BILLING_PERMISSIONS.md
```

Document:

- roles that can manage billing
- routes restricted
- routes left readable
- UI changes
- future team/seat implications

### Tests

Add focused tests for:

- owner can checkout
- admin can checkout
- member cannot checkout
- member cannot open portal
- read routes still behave as intended
- internal agency role behavior if implemented

### Review Checklist

After implementation, review:

- no cross-org billing access
- non-admin members cannot start checkout or portal sessions
- owner/admin can still manage billing
- current subscription read still works
- billing UI does not rely on client-only permission checks
- no subscription enforcement changes
- no Stripe webhook changes

### Commit Message

```bash
git add .
git commit -m "Restrict billing management to organization admins"
```

---

## [x] Phase 2H: Subscription Launch QA and Staging Checklist

Completed commit: 925b366

### Objective

Create the final QA checklist and staging verification tooling for subscription billing before switching enforcement on.

This phase is mostly documentation/tests/scripts, not product behavior.

### Implementation Scope

Do not add new product features.

Add:

- staging checklist
- Stripe test-mode checklist
- webhook event checklist
- plan/price setup checklist
- enforcement rollout checklist
- rollback checklist

### Documentation

Create:

```text
PHASE_2H_SUBSCRIPTION_LAUNCH_QA.md
```

Include:

- required env vars
- Stripe products/prices needed
- Billing Portal configuration
- webhook endpoint setup
- test checkout flow
- test customer portal flow
- test subscription status changes
- test payment failure
- test cancellation
- test dry_run mode
- test enforce mode in staging
- rollback procedure

### Optional Scripts

If safe, add scripts for read-only verification:

- plans exist
- active plans have Stripe price IDs
- current org has subscription
- usage counters exist
- enforcement mode display

Do not add scripts that mutate production data unless clearly marked and safe.

### Tests

Add missing smoke tests where practical.

### Review Checklist

Review that:

- checklist is usable by a human
- no secrets are included
- no production mutation scripts are dangerous
- staging and production instructions are separated
- rollback is clear

### Commit Message

```bash
git add .
git commit -m "Add subscription launch QA checklist"
```

---

## [x] Phase 3A: B2B SaaS Product Positioning Update

Completed commit: cd59d92

### Objective

Update authenticated/public product positioning for the B2B SaaS product without touching the separate agency business yet.

### Scope

Update SaaS-facing copy and product framing.

Do not build agency console yet.
Do not build agency website yet.
Do not implement Slack/Granola yet.

### Candidate Areas

- homepage
- authenticated dashboard empty states
- signup/onboarding copy
- product descriptions
- billing plan descriptions if needed

### Documentation

Create:

```text
PHASE_3A_B2B_SAAS_POSITIONING.md
```

### Commit Message

```bash
git add .
git commit -m "Update product positioning for B2B SaaS"
```

---

## [x] Phase 3B: Brand Voice Foundation

Completed commit: 48ca87f

### Objective

Create organization-scoped brand voice schema, APIs, and minimal UI.

### Scope

Add brand voice as a core SaaS feature.

Do not build agency clients yet.

### Documentation

Create:

```text
PHASE_3B_BRAND_VOICE_FOUNDATION.md
```

### Commit Message

```bash
git add .
git commit -m "Add organization brand voice foundation"
```

---

## [x] Phase 3C: Campaigns and Content Library Foundation

Completed commit: a816940

### Objective

Add campaigns and a proper organization-scoped content library foundation.

### Scope

Add schema/APIs/UI foundation for campaigns and content items.

Do not build agency clients yet.

### Documentation

Create:

```text
PHASE_3C_CAMPAIGNS_CONTENT_LIBRARY.md
```

### Commit Message

```bash
git add .
git commit -m "Add campaigns and content library foundation"
```

---

## [x] Phase 3D: Connect Brand Voice + Campaigns to Generation

Completed commit: 81db1a1

### Objective

Update the existing AI generation flow so generated content can use:

- organization brand voice
- campaign context
- selected content type
- selected channel
- saved templates if available
- organization-scoped content library output

### Scope

Do:

- connect brand voice into generation prompts
- connect campaign context into generation prompts
- save generated results into the new content library/content items model
- preserve existing outputs behavior if still needed
- keep existing generation endpoints working

Do not:

- rewrite the entire AI system
- change model providers
- implement agency clients
- implement Slack or Granola
- redesign the dashboard

### Files likely involved

- `app/api/generate-content/route.ts`
- `app/api/generate-selected-content/route.ts`
- `app/api/projects/[id]/generate/route.ts`
- `app/api/projects/[id]/generate/process/route.ts`
- `config/prompts.json`
- `lib/prompts/*`
- `lib/ai-providers/*`
- brand voice API/helper files
- campaign/content item API/helper files

### Required behavior

- When a generation request includes `brand_voice_id`, validate org access.
- When a generation request includes `campaign_id`, validate org access.
- Inject brand voice and campaign context into the prompt.
- Save outputs to organization-scoped content library records.
- Preserve existing legacy `outputs` records if current UI still depends on them.
- Do not break existing generation behavior for users without brand voice/campaigns.

### Review checklist

- Brand voice cannot be read cross-org.
- Campaign cannot be read cross-org.
- Generation still works without brand voice.
- Generation still works without campaign.
- Output is saved with `organization_id`.
- Existing tests pass.
- No agency/Slack/Granola work added.

### Documentation

Create:

```text
PHASE_3D_GENERATION_CONTEXT_INTEGRATION.md
```

### Commit message

```bash
git add .
git commit -m "Connect brand voice and campaigns to content generation"
```

---

## [x] Phase 3E: SaaS Onboarding Flow

Status: Ready after Phase 3D is committed.

### Objective

Create a simple onboarding flow for new B2B SaaS users so they can set up:

- organization profile
- brand voice
- first campaign or content goal
- billing/subscription entry point if needed

### Scope

Do:

- add onboarding state if needed
- guide user through basic setup
- keep it lightweight
- preserve existing dashboard access
- use existing organization/brand/campaign APIs

Do not:

- redesign the entire app
- force billing enforcement
- build agency onboarding
- build team invites unless trivial and already supported

### Candidate pages

- `/dashboard/onboarding`
- existing dashboard empty states
- first-login redirect logic if already clean

### Required behavior

- Existing users should not be trapped.
- New users should be able to skip or complete onboarding.
- Onboarding should create/update organization profile and brand voice.
- Onboarding should lead to content generation or campaign setup.

### Review checklist

- No redirect loops.
- Existing users still reach dashboard.
- Onboarding is org-scoped.
- Brand voice data is saved correctly.
- Campaign creation works if included.
- TypeScript/lint/tests pass.

### Documentation

Create:

```text
PHASE_3E_SAAS_ONBOARDING.md
```

### Commit message

```bash
git add .
git commit -m "Add SaaS onboarding flow"
```

---

## [ ] Phase 3F: SaaS Dashboard Polish and Empty States

Status: Ready after Phase 3E is committed.

### Objective

Make the B2B SaaS dashboard feel coherent now that organizations, brand voice, campaigns, billing, and content library exist.

### Scope

Do:

- improve dashboard empty states
- add clear quick actions
- show active campaign/content status
- show brand voice setup status
- show subscription status lightly
- preserve existing layout patterns

Do not:

- redesign the whole app
- change billing backend
- build agency features
- build integrations

### Candidate areas

- dashboard home
- nav
- projects/content library
- campaigns
- brand voice
- billing card/status card

### Review checklist

- UI changes are scoped and not a full redesign.
- Existing routes still work.
- Empty states point users to correct actions.
- No backend behavior changed unnecessarily.
- TypeScript/lint/tests pass.

### Documentation

Create:

```text
PHASE_3F_SAAS_DASHBOARD_POLISH.md
```

### Commit message

```bash
git add .
git commit -m "Polish SaaS dashboard experience"
```

---

## [ ] Phase 3G: SaaS MVP QA Pass

Status: Ready after Phase 3F is committed.

### Objective

Run an end-to-end QA pass for the B2B SaaS MVP before moving to agency-specific work.

### Scope

Mostly tests, docs, and small bug fixes.

Verify flows:

- signup/login
- organization creation/default org
- subscription plan display
- Stripe subscription checkout
- billing portal
- brand voice creation
- campaign creation
- content generation with brand voice/campaign
- content library save/read
- dashboard list APIs
- entitlement dry-run/enforce behavior
- legacy user fallback

### Do not

- add major features
- build agency console
- build Slack/Granola
- redesign UI

### Documentation

Create:

```text
PHASE_3G_SAAS_MVP_QA.md
```

### Commit message

```bash
git add .
git commit -m "Add SaaS MVP QA fixes and checklist"
```

---

## How to Update This Runbook

After a phase is safely committed:

1. Mark it as complete:

```md
## [x] Phase ...
```

2. Add the commit hash under the phase:

```md
Completed commit: abc1234
```

3. Do not delete old phase instructions.
4. Add new future phases at the bottom as needed.

The point of this file is operational memory. Do not turn it into a motivational poster. The repo has suffered enough.
