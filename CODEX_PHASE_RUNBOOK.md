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

## [x] Phase 3F: SaaS Dashboard Polish and Empty States

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

## [x] Phase 3G: SaaS MVP QA Pass

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

## [x] Phase 4A: Internal Agency Schema Foundation

Status: Ready after Phase 3G is committed.

### Objective

Create the private internal agency data foundation.

This phase adds the schema and backend helpers needed for the agency console, but does not build the full UI yet.

The agency is separate from the public B2B SaaS product. Agency clients should not see or access the SaaS dashboard by default.

### Scope

Do:

- add agency client schema
- add client profile/context schema
- add client integration tracking schema
- add source import schema
- add production task schema
- add internal agency authorization helpers
- add minimal read/write APIs if useful
- document how the agency console remains private

Do not:

- build full agency UI yet
- build Slack integration yet
- build Granola integration yet
- expose agency clients to SaaS users
- add public agency website pages
- redesign SaaS dashboard
- change subscription billing
- change SaaS content generation behavior unless needed for shared types

### Read First

- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- `PHASE_3G_SAAS_MVP_QA.md`
- existing organization/role helpers
- existing authz helpers
- existing content/campaign/brand voice schema
- existing source/import/integration code

### Required Schema

Create a forward migration in `supabase/migrations/`.

#### `agency_clients`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `name text not null`
- `website text`
- `industry text`
- `primary_contact_name text`
- `primary_contact_email text`
- `package_type text`
- `status text not null default 'active'`
- `notes text`
- `created_by uuid references auth.users(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Status values:

- `active`
- `paused`
- `archived`
- `lead`

#### `agency_client_profiles`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `client_id uuid not null references agency_clients(id) on delete cascade`
- `business_overview text`
- `ideal_customer_profile text`
- `positioning text`
- `offers_json jsonb not null default '[]'::jsonb`
- `competitors_json jsonb not null default '[]'::jsonb`
- `content_pillars_json jsonb not null default '[]'::jsonb`
- `customer_pain_points_json jsonb not null default '[]'::jsonb`
- `voice_notes text`
- `customer_service_tone text`
- `metadata_json jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique:

- one profile per `client_id`

#### `client_integrations`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `client_id uuid not null references agency_clients(id) on delete cascade`
- `provider text not null`
- `status text not null default 'not_connected'`
- `metadata_json jsonb not null default '{}'::jsonb`
- `connected_at timestamptz`
- `last_sync_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Provider values:

- `slack`
- `granola`
- `manual`
- `other`

Status values:

- `not_connected`
- `connected`
- `needs_attention`
- `disabled`

#### `source_imports`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `client_id uuid references agency_clients(id) on delete set null`
- `campaign_id uuid`
- `provider text not null`
- `source_title text`
- `source_url text`
- `raw_text text`
- `summary text`
- `metadata_json jsonb not null default '{}'::jsonb`
- `imported_by uuid references auth.users(id) on delete set null`
- `created_at timestamptz not null default now()`

Provider values:

- `audio_upload`
- `transcript`
- `slack`
- `granola`
- `manual_note`
- `url`
- `document`

If campaigns table already exists, add FK to campaigns. If not, leave nullable without FK and document.

#### `production_tasks`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `client_id uuid references agency_clients(id) on delete cascade`
- `campaign_id uuid`
- `content_item_id uuid`
- `title text not null`
- `description text`
- `status text not null default 'todo'`
- `priority text not null default 'normal'`
- `assigned_to uuid references auth.users(id) on delete set null`
- `created_by uuid references auth.users(id) on delete set null`
- `due_date timestamptz`
- `metadata_json jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Status values:

- `todo`
- `in_progress`
- `needs_review`
- `ready_to_deliver`
- `delivered`
- `blocked`
- `archived`

Priority values:

- `low`
- `normal`
- `high`
- `urgent`

### RLS Requirements

Agency tables must be private.

Rules:

- Only active members of the owning internal agency organization can read agency client data.
- Normal SaaS organizations should not accidentally access agency data.
- Service role can manage all rows.
- Mutation policies should be restricted to internal agency roles where possible:
  - `agency_admin`
  - `agency_member`
  - maybe `owner` for internal agency organization

Use existing organization membership helpers and organization `type = 'internal_agency'` where possible.

If RLS gets too complex for this phase, implement safe service-role-only mutation and document API-level enforcement.

### Authorization Helpers

Create or update:

- `lib/authz/agency-permissions.ts`

Functions:

- `isInternalAgencyOrganization(...)`
- `canAccessAgencyConsole(role, organizationType)`
- `canManageAgencyClient(role, organizationType)`
- `requireAgencyAccess(...)`
- `requireAgencyClientAccess(...)`

Rules:

- agency console access requires active membership in an `internal_agency` organization.
- SaaS customer org members cannot access agency tables/routes.
- platform admins may access if existing admin model supports it.

### Minimal APIs

Create minimal APIs only if useful for testing and next phase:

- `GET /api/agency/clients`
- `POST /api/agency/clients`
- `GET /api/agency/clients/:id`
- `PATCH /api/agency/clients/:id`

Keep responses simple.

Do not build full UI.

### Documentation

Create:

```text
PHASE_4A_INTERNAL_AGENCY_SCHEMA.md
```

Document:

- tables added
- RLS model
- auth helpers
- APIs added
- what is private/internal-only
- what was intentionally not built
- next steps for Phase 4B

### Tests

Add focused tests for:

- agency permission helper behavior
- SaaS org member denied agency access
- internal agency member allowed
- client access scoped to internal agency org
- API auth if routes are added

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- relevant auth/org tests
- new agency tests
- `git diff --check`

### Review Checklist

After implementation, review:

- agency data cannot be accessed by SaaS org users
- only internal agency org members can access agency routes
- RLS does not expose agency data cross-org
- mutation rules are not too permissive
- no public UI was added
- no Slack/Granola integration was added
- no SaaS billing/generation behavior was changed
- tests and validation pass

### Commit message

```bash
git add .
git commit -m "Add internal agency schema foundation"
```

---

## [x] Phase 4B: Agency Client Management UI

Completed commit: fe19dfb

Status: Ready after Phase 4A is committed.

### Objective

Build the first private internal agency client management surface on top of the Phase 4A schema and APIs.

This phase should let internal agency users see and maintain basic agency client records without exposing agency workflow to normal SaaS organizations.

### Scope

Do:

- add a private agency client management page
- use the Phase 4A agency client APIs
- show client list, status, contact, industry, package, and notes
- support creating clients for internal agency admins
- support editing clients for internal agency admins
- show read-only/limited states for internal agency non-admin members
- block or redirect SaaS/customer organizations from the agency UI
- keep dashboard/nav changes minimal and hidden unless the user can resolve an internal agency org

Do not:

- build Slack integration
- build Granola integration
- build source import workflows
- build production queue workflows
- build draft review or delivery
- expose agency pages to SaaS customers
- add public agency marketing pages
- redesign the SaaS dashboard
- change billing or generation behavior

### Candidate Routes

- `/dashboard/agency`
- `/dashboard/agency/clients`

### Required Behavior

- Agency UI requires an active `internal_agency` organization.
- SaaS customer org members must not be able to use the agency UI.
- Internal agency `owner`, `admin`, and `agency_admin` can create/update clients.
- Internal agency `agency_member` can view clients but not create/update them.
- Demo users remain read-only.
- Client API failures show a recoverable state.
- No Slack/Granola status setup beyond passive fields already in schema.

### Files likely involved

- `app/dashboard/agency/*`
- `components/dashboard/nav.tsx`
- `lib/authz/agency-permissions.ts`
- `lib/agency-clients.ts`
- `tests/lib/agency-clients-route.test.ts`
- new UI tests/helpers if useful

### Documentation

Create:

```text
PHASE_4B_AGENCY_CLIENT_MANAGEMENT_UI.md
```

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- new or relevant agency tests
- relevant org/auth tests
- browser or route smoke for the new agency page
- `git diff --check`

### Review Checklist

- Agency pages are not public marketing pages.
- SaaS orgs cannot access the agency UI.
- Internal agency non-admins cannot mutate clients.
- Internal agency admins can create/update clients.
- Demo users cannot write.
- No Slack/Granola integration was added.
- No billing/generation behavior changed.
- Validation passes or gaps are documented.

### Commit message

```bash
git add .
git commit -m "Add agency client management UI"
```

---

## [x] Phase 4C: Client Source Imports

Completed commit: ada1689

Status: Ready after Phase 4B is committed.

### Objective

Add the first internal agency workflow for capturing client source material that can later feed production tasks and draft generation.

This phase should use the Phase 4A `source_imports` schema and keep imports private to the internal agency organization.

### Scope

Do:

- add source import helpers for the `source_imports` table
- add minimal internal agency source import APIs
- support listing source imports by internal agency organization
- support filtering source imports by agency client
- support creating manual source imports for agency clients
- support updating source import summary/metadata/status fields if useful
- add a private agency source imports page or section
- keep agency members able to capture sources where API/RLS allows it
- keep demo users read-only
- document how imported sources remain internal/private

Do not:

- build Slack integration
- build Granola integration
- build audio upload import workflow
- build production queue workflows
- build draft review or delivery
- expose source imports to SaaS customer orgs
- change SaaS generation or billing behavior
- redesign the agency dashboard

### Candidate Routes

- `/dashboard/agency/sources`
- `/api/agency/source-imports`
- `/api/agency/source-imports/:id`

### Required Behavior

- Source import UI requires an active `internal_agency` organization.
- SaaS customer org members must not be able to use source import APIs or UI.
- Source imports are saved with `organization_id`.
- If `client_id` is provided, validate the client belongs to the same internal agency organization.
- Internal agency users can list source imports for their agency organization.
- Internal agency operators can create manual imports where RLS allows it.
- Demo users cannot create or update imports.
- No Slack or Granola provider integration is added; providers are passive source labels only.

### Files likely involved

- `app/api/agency/source-imports/*`
- `app/dashboard/agency/*`
- `components/dashboard/nav.tsx`
- `lib/authz/agency-permissions.ts`
- `lib/agency-source-imports.ts`
- `tests/lib/agency-source-imports*.test.ts`

### Documentation

Create:

```text
PHASE_4C_CLIENT_SOURCE_IMPORTS.md
```

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- new agency source import tests
- relevant agency/client/org auth tests
- browser or route smoke for the new agency source imports page
- `git diff --check`

### Review Checklist

- SaaS orgs cannot access source import data.
- Client-scoped imports cannot reference cross-org agency clients.
- Imports are saved with internal agency `organization_id`.
- Demo users cannot write.
- No Slack/Granola integration was added.
- No billing/generation behavior changed.
- Validation passes or gaps are documented.

### Commit message

```bash
git add .
git commit -m "Add agency client source imports"
```

---

## [x] Phase 4D: Agency Production Queue

Completed commit: c692b6d

Status: Ready after Phase 4C is committed.

### Objective

Add the private internal agency production queue so agency operators can turn clients and captured source material into trackable production work.

This phase should use the Phase 4A `production_tasks` table and stay separate from SaaS customer workflows.

### Scope

Do:

- add production task helpers for `production_tasks`
- add minimal internal agency production task APIs
- support listing tasks by internal agency organization
- support filtering by client and status
- support creating/updating production tasks
- add a private agency production queue page
- show task status, priority, due date, assigned user, and client
- keep internal agency operators able to manage tasks where RLS allows it
- keep demo users read-only

Do not:

- build draft delivery
- build Slack integration
- build Granola integration
- build automated task generation
- expose production tasks to SaaS customers
- change SaaS billing or generation behavior

### Candidate Routes

- `/dashboard/agency/production`
- `/api/agency/production-tasks`
- `/api/agency/production-tasks/:id`

### Required Behavior

- Production queue UI requires an active `internal_agency` organization.
- SaaS customer org members must not be able to use production task APIs or UI.
- Tasks are saved with `organization_id`.
- If `client_id` is provided, validate the client belongs to the same internal agency organization.
- Internal agency users can list tasks for their agency organization.
- Internal agency operators can create/update tasks where RLS allows it.
- Demo users cannot create or update tasks.
- No Slack, Granola, draft delivery, or SaaS generation behavior is added.

### Files likely involved

- `app/api/agency/production-tasks/*`
- `app/dashboard/agency/production/*`
- `components/dashboard/nav.tsx`
- `lib/authz/agency-permissions.ts`
- `lib/agency-production-tasks.ts`
- `tests/lib/agency-production-tasks*.test.ts`

### Documentation

Create:

```text
PHASE_4D_AGENCY_PRODUCTION_QUEUE.md
```

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- new agency production task tests
- relevant agency/client/org auth tests
- browser or route smoke for the new production queue page
- `git diff --check`

### Review Checklist

- SaaS orgs cannot access production task data.
- Client-scoped tasks cannot reference cross-org agency clients.
- Tasks are saved with internal agency `organization_id`.
- Demo users cannot write.
- No Slack/Granola integration was added.
- No draft delivery behavior was added.
- No billing/generation behavior changed.
- Validation passes or gaps are documented.

### Commit message

```bash
git add .
git commit -m "Add agency production queue"
```

---

## [x] Phase 4E: Draft Review and Delivery

Completed commit: adb1419

Status: Ready after Phase 4D is committed.

### Objective

Add a private internal agency draft review and basic delivery/export workflow on top of the organization-scoped content library.

### Scope

Do:

- add agency draft helpers for client-linked content library items
- add minimal internal agency draft APIs
- support listing drafts by internal agency organization
- support filtering drafts by client and review status
- support creating/updating manual agency drafts
- support marking a draft delivered with delivery metadata
- add a private draft review page
- add manual copy, Markdown export, and CSV export controls
- keep draft writes restricted to roles compatible with existing content library RLS
- keep demo users read-only

Do not:

- build Slack delivery
- build Granola import
- build Google Docs integration
- build email sending
- expose agency drafts to SaaS customer organizations
- change public SaaS content library routes
- change billing or generation behavior

### Candidate Routes

- `/dashboard/agency/drafts`
- `/api/agency/drafts`
- `/api/agency/drafts/:id`

### Required Behavior

- Draft review UI requires an active `internal_agency` organization.
- SaaS customer org members must not be able to use agency draft APIs or UI.
- Drafts are saved as content library items with internal agency `organization_id`.
- If `client_id` is provided, validate the client belongs to the same internal agency organization.
- If campaign or brand voice references are provided, validate they belong to the same internal agency organization.
- Internal agency members can list drafts.
- Internal agency owners/admins/agency_admins can create/update drafts.
- Demo users cannot create or update drafts.
- Basic delivery means manual copy/export and internal delivered-status tracking only.

### Files likely involved

- `app/api/agency/drafts/*`
- `app/dashboard/agency/drafts/*`
- `components/dashboard/nav.tsx`
- `lib/authz/agency-permissions.ts`
- `lib/agency-drafts.ts`
- `tests/lib/agency-drafts*.test.ts`

### Documentation

Create:

```text
PHASE_4E_DRAFT_REVIEW_DELIVERY.md
```

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- new agency draft tests
- relevant agency/client/org auth tests
- browser or route smoke for the new draft review page
- `git diff --check`

### Review Checklist

- SaaS orgs cannot access agency draft data.
- Client-scoped draft operations cannot reference cross-org agency clients.
- Campaign/brand voice references cannot cross org boundaries.
- Drafts are saved with internal agency `organization_id`.
- Demo users cannot write.
- No Slack/Granola integration was added.
- No public delivery integration was added.
- No billing/generation behavior changed.
- Validation passes or gaps are documented.

### Commit message

```bash
git add .
git commit -m "Add agency draft review workflow"
```

---

## [x] Phase 4F: Granola Manual Import Workflow

Completed commit: e784162

Status: Ready after Phase 4E is committed.

### Objective

Add a private internal agency workflow for manually importing Granola notes into client source material.

### Scope

Do:

- add helper support for client integration tracking
- add a manual Granola import API
- save pasted Granola notes as `source_imports` with provider `granola`
- require a valid agency client for Granola imports
- update passive Granola integration tracking where existing RLS-compatible roles allow it
- add a private Granola import page
- show recent Granola imports and passive status
- keep demo users read-only

Do not:

- build Granola OAuth
- call Granola APIs
- upload files to Granola
- automate sync
- build Slack integration
- expose Granola imports to SaaS customer organizations
- change billing or generation behavior

### Candidate Routes

- `/dashboard/agency/granola`
- `/api/agency/granola/imports`

### Required Behavior

- Granola page requires an active `internal_agency` organization.
- SaaS customer org members must not be able to use Granola import APIs or UI.
- Granola imports are saved with internal agency `organization_id`.
- Granola imports require `client_id` and validate that the client belongs to the same internal agency organization.
- Internal agency operators can import pasted Granola notes into `source_imports`.
- Passive `client_integrations` tracking is updated only for roles compatible with existing client integration management.
- Demo users cannot import notes.
- No external Granola network/API integration is added.

### Files likely involved

- `app/api/agency/granola/*`
- `app/dashboard/agency/granola/*`
- `components/dashboard/nav.tsx`
- `lib/agency-client-integrations.ts`
- `tests/lib/agency-client-integrations.test.ts`
- `tests/lib/agency-granola-imports-route.test.ts`

### Documentation

Create:

```text
PHASE_4F_GRANOLA_MANUAL_IMPORT.md
```

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- new Granola import tests
- relevant source import/client/org auth tests
- browser or route smoke for the new Granola imports page
- `git diff --check`

### Review Checklist

- SaaS orgs cannot access Granola import data.
- Granola imports cannot reference cross-org agency clients.
- Imports are saved with internal agency `organization_id`.
- Client integration tracking does not bypass the existing admin-only RLS boundary.
- Demo users cannot write.
- No Granola external API/OAuth work was added.
- No Slack integration was added.
- No billing/generation behavior changed.
- Validation passes or gaps are documented.

### Commit message

```bash
git add .
git commit -m "Add Granola manual import workflow"
```

---

## [x] Phase 4G: Slack Integration Foundation

Status: Ready after Phase 4F is committed.

Completed commit: `eada4db`

### Objective

Add the private internal agency Slack foundation without building a real Slack integration.

### Scope

Do:

- add minimal internal agency Slack status APIs
- store per-client Slack readiness/status in `client_integrations`
- capture workspace/channel metadata needed for a later Slack integration
- add a private Slack foundation page
- keep Slack status writes restricted to roles compatible with existing client integration RLS
- keep demo users read-only

Do not:

- build Slack OAuth
- create a Slack app install flow
- store bot tokens
- call Slack APIs
- sync channels or messages
- import Slack source material automatically
- expose Slack surfaces to SaaS customer organizations
- change billing or generation behavior

### Candidate Routes

- `/dashboard/agency/slack`
- `/api/agency/slack/status`

### Required Behavior

- Slack foundation UI requires an active `internal_agency` organization.
- SaaS customer org members must not be able to use Slack foundation APIs or UI.
- Slack status is scoped to an agency client that belongs to the same internal agency organization.
- Slack status/config is stored as `client_integrations` provider `slack`.
- Internal agency owners/admins/agency_admins can update Slack status.
- Other internal agency members can read status but cannot update it.
- Demo users cannot update Slack status.
- No external Slack network/API integration is added.

### Files likely involved

- `app/api/agency/slack/*`
- `app/dashboard/agency/slack/*`
- `components/dashboard/nav.tsx`
- `lib/agency-client-integrations.ts`
- `tests/lib/agency-slack-status-route.test.ts`

### Documentation

Create:

```text
PHASE_4G_SLACK_INTEGRATION_FOUNDATION.md
```

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- new Slack status tests
- relevant client integration/client/org auth tests
- browser or route smoke for the new Slack foundation page
- `git diff --check`

### Review Checklist

- SaaS orgs cannot access Slack foundation data.
- Slack status cannot reference cross-org agency clients.
- Slack status writes stay aligned with client integration RLS.
- Demo users cannot write.
- No Slack OAuth/app/bot/API work was added.
- No channel sync or message import was added.
- No billing/generation behavior changed.
- Validation passes or gaps are documented.

### Commit message

```bash
git add .
git commit -m "Add Slack integration foundation"
```

---

## [x] Phase 4H: Internal Agency System QA + Security Review

Status: Ready after Phase 4G is committed.

Completed commit: `e363219`

### Objective

Perform a full review of the completed internal agency system before starting Phase 5 real integration/workflow work.

This phase should find bugs, security gaps, role-boundary issues, RLS issues, and workflow inconsistencies across Phase 4A-4G.

### Scope

Do:

- review agency schema/RLS
- review agency permission helpers
- review agency APIs
- review agency dashboard pages
- review client/profile/source/production/draft/Granola/Slack flows
- fix bugs found during review
- add missing focused tests where practical
- verify SaaS users cannot access agency data
- verify demo users cannot write
- verify agency member/admin boundaries

Do not:

- build Slack OAuth/API integration
- build Granola API integration
- add new major agency features
- change SaaS billing
- change SaaS generation behavior
- redesign the agency UI
- change public marketing pages

### Read First

- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- `PHASE_4A_INTERNAL_AGENCY_SCHEMA.md`
- `PHASE_4B_AGENCY_CLIENT_MANAGEMENT_UI.md`
- `PHASE_4C_CLIENT_SOURCE_IMPORTS.md`
- `PHASE_4D_AGENCY_PRODUCTION_QUEUE.md`
- `PHASE_4E_DRAFT_REVIEW_DELIVERY.md`
- `PHASE_4F_GRANOLA_MANUAL_IMPORT.md`
- `PHASE_4G_SLACK_INTEGRATION_FOUNDATION.md`

### Primary Areas to Review

- `supabase/migrations/20260606120000_phase_4a_internal_agency_schema.sql`
- `lib/authz/agency-permissions.ts`
- `lib/agency-*.ts`
- `app/api/agency/*`
- `app/dashboard/agency/*`
- `components/dashboard/nav.tsx`
- `tests/lib/agency-*.test.ts`

### Review Checklist

#### Security and Access

Confirm:

- SaaS/personal org members cannot access agency APIs.
- Agency access requires active membership in an `internal_agency` organization.
- Client-scoped APIs validate both `organization_id` and `client_id`.
- Service role is only used after route-level authorization.
- Platform admin email access is not accidentally an agency bypass.
- Demo users cannot write.
- `agency_member` cannot mutate integrations or restricted draft/client settings.
- `owner`, `admin`, and `agency_admin` can perform intended management actions.

#### RLS

Confirm:

- Agency tables are not readable by SaaS org users.
- Agency tables are scoped to internal agency organizations.
- Mutation policies are not too broad.
- Service-role policies are safe.
- Any API-level enforcement is documented where RLS is intentionally conservative.

#### Data Integrity

Confirm:

- `agency_clients` are always tied to internal agency organizations.
- `agency_client_profiles` are one-to-one with clients.
- `client_integrations` cannot be attached to a client from another org.
- `source_imports` validate client/org scope.
- `production_tasks` validate client/campaign/content references.
- `drafts` validate client/campaign/brand voice references.
- Granola imports write provider `granola`.
- Slack readiness writes provider `slack`.
- Metadata updates preserve existing metadata where intended.

#### Workflow

Manually or through tests verify:

- agency client list/create/edit
- client profile edit
- manual source import
- production task create/update/filter
- draft create/edit/filter/export/mark delivered
- Granola manual import
- Slack readiness edit
- read-only behavior for non-admins/demo users

#### SaaS Isolation

Confirm:

- no SaaS dashboard routes expose agency data
- no SaaS billing behavior changed
- no SaaS generation behavior changed
- public users cannot discover agency client data through APIs

### Fixes

If bugs are found:

- fix them within Phase 4H scope
- add focused tests when practical
- rerun validation

### Documentation

Create:

```text
PHASE_4H_AGENCY_SYSTEM_QA.md
```

Document:

- review areas
- bugs found
- fixes made
- tests added
- remaining risks
- whether Phase 5 is safe to start

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused agency Jest suites
- auth/org permission tests
- route smoke tests for agency pages if available
- `git diff --check`

### Review Checklist

After implementation/review:

- no cross-org agency access
- no SaaS org access to agency system
- demo users blocked from writes
- role boundaries correct
- agency routes/pages still work
- no Phase 5 integration work started
- validation passes

### Commit message

```bash
git add .
git commit -m "Review and harden internal agency system"
```

---

## [ ] Phase 5: Real Agency Integrations + Workflow Automation

Phase 5 builds real workflow power on top of the private internal agency system completed in Phase 4.

The goal of Phase 5 is to turn the agency console from a manual operating system into an integration-assisted production workflow.

Phase 5 must remain private/internal. None of this should become a public SaaS feature unless a later phase explicitly says so.

### Universal Phase 5 Rules

For every Phase 5 subphase:

1. Implement only the current subphase.
2. Review the implementation in the same Codex run.
3. Fix issues found during review.
4. Re-run validation.
5. Produce a final report.
6. Stop before the next phase.
7. Do not commit unless Lucas explicitly asks.

### Always Preserve

- Existing SaaS dashboard behavior
- Existing billing/subscription behavior
- Existing agency client/profile/source/task/draft behavior
- Existing auth and role boundaries
- Demo-user write restrictions
- Internal agency-only access

### Do Not Do Unless Explicitly Stated

- Do not expose agency workflows to SaaS customers.
- Do not build public agency website pages.
- Do not redesign the whole dashboard.
- Do not change subscription enforcement.
- Do not change Stripe checkout/webhook behavior.
- Do not remove credit/pay-as-you-go compatibility.
- Do not add broad new schema unless the phase requires it.
- Do not store raw third-party tokens in plain text.
- Do not import or store excessive third-party data without clear controls.
- Do not start the next phase automatically.

---

## [x] Phase 5A: Slack OAuth/App Install Foundation

Completed commit: 0dcc5cf

Status: Ready after Phase 4H is committed.

### Objective

Add the secure Slack OAuth/app installation foundation for internal agency clients.

This phase should allow an internal agency admin to connect a client's Slack workspace and store the connection metadata securely.

This phase must not import Slack messages yet.

### Scope

Do:

- Add Slack OAuth start route.
- Add Slack OAuth callback route.
- Validate agency/client access before install.
- Store Slack workspace metadata in `client_integrations`.
- Securely store encrypted Slack tokens if token storage is implemented.
- Update agency Slack status UI to show connected state.
- Add tests and docs.

Do not:

- Import Slack messages.
- Sync channels.
- Store Slack message content.
- Build Slack bot workflows.
- Expose Slack functionality to SaaS customers.
- Change billing.
- Change generation.
- Build Granola API integration.
- Redesign agency UI.

### Read First

- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- `PHASE_4G_SLACK_INTEGRATION_FOUNDATION.md`
- `PHASE_4H_AGENCY_SYSTEM_QA.md`
- `lib/authz/agency-permissions.ts`
- existing integration encryption code
- existing OAuth/integration patterns if any
- client_integrations schema

### Required Environment Variables

Use placeholders only. Do not commit secrets.

Expected env vars:

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_REDIRECT_URI`
- `SLACK_SIGNING_SECRET` if needed later
- `INTEGRATIONS_ENCRYPTION_KEY` if reusing existing encryption helpers

### OAuth Start Route

Create:

```text
GET /api/agency/slack/oauth/start
```

Requirements:

- Authenticated user only.
- Agency access required.
- `client_id` query param required.
- Validate client belongs to active internal agency organization.
- Only owner, admin, or agency_admin can start install.
- Demo users blocked.
- Generate CSRF/state token.
- Store state securely using existing safe mechanism if available.
- Redirect to Slack OAuth authorize URL.
- Scopes should be minimal and documented.
- Do not request message/history scopes yet unless required later and clearly documented.
- Include client/org identifiers in signed/encrypted state, not trusted plain query params.

### OAuth Callback Route

Create:

```text
GET /api/agency/slack/oauth/callback
```

Requirements:

- Validate OAuth state.
- Exchange code for Slack token.
- Validate Slack response.
- Store workspace/team metadata in `client_integrations`.
- Set provider slack.
- Set status connected.
- Metadata should include:
  - workspace/team id
  - workspace/team name
  - connected_by user id
  - connected_at
  - `externalConnection: true`
  - `mode: oauth_connected`
- If storing token, encrypt it before persistence.
- Never expose token to client.
- Redirect back to agency Slack page with success/failure status.

### Token Storage

If token storage is implemented:

- Do not store raw tokens in metadata_json.
- Either add dedicated encrypted fields via migration or use existing secure integration storage pattern.
- Document exactly where tokens are stored.
- Tests should assert raw token is not stored.

If safe token storage cannot be implemented confidently:

- Store only workspace metadata.
- Document token storage as deferred.
- Still complete OAuth validation if possible.

### UI

Update:

```text
/dashboard/agency/slack
```

Requirements:

- Show connected workspace state.
- Show connect/reconnect button only for admin roles.
- Demo users cannot connect.
- Non-admin agency members see read-only status.
- No message import UI yet.

### Documentation

Create:

```text
PHASE_5A_SLACK_OAUTH_FOUNDATION.md
```

Document:

- routes added
- env vars
- Slack app setup steps
- scopes requested
- state/CSRF handling
- token storage decision
- security model
- what is intentionally not built
- next phase: channel/message import planning

### Tests

Add focused tests for:

- start route requires agency admin
- SaaS org denied
- demo user denied
- client org mismatch denied
- OAuth state validation
- callback handles Slack error
- callback stores connected metadata
- raw tokens are not exposed/stored if token storage implemented

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused Slack/agency tests
- relevant agency permission tests
- `git diff --check`

### Review Checklist

After implementation, review:

- SaaS users cannot initiate Slack install.
- Agency members without admin role cannot install.
- Demo users cannot install.
- State validation prevents CSRF.
- No raw Slack token is exposed.
- Scopes are minimal.
- No message import/sync was added.
- Existing Slack readiness metadata still works.
- Validation passes.

### Commit Message

```bash
git add .
git commit -m "Add Slack OAuth foundation for agency clients"
```

---

## [x] Phase 5B: Slack Channel Selection + Message Import Foundation

Completed commit: 0dcc5cf

Status: Ready after Phase 5A is committed.

### Objective

Allow internal agency admins to select Slack channels for a connected client and manually import recent messages into `source_imports`.

This phase introduces controlled Slack data import, but should remain limited and manual.

### Scope

Do:

- Add channel listing for connected Slack workspaces.
- Allow agency admins to choose priority/import channels.
- Add manual message import from selected channels.
- Store imported Slack messages or summaries in `source_imports`.
- Preserve client/org scoping.
- Add rate/error handling.
- Add tests and docs.

Do not:

- Add automatic scheduled sync.
- Add Slack bot posting.
- Add real-time event subscriptions.
- Import entire workspace history.
- Expose Slack imports to SaaS customers.
- Generate drafts automatically from Slack yet.
- Change billing or subscription behavior.
- Build Granola API integration.

### Read First

- `PHASE_5A_SLACK_OAUTH_FOUNDATION.md`
- `PHASE_4C_CLIENT_SOURCE_IMPORTS.md`
- `PHASE_4G_SLACK_INTEGRATION_FOUNDATION.md`
- `PHASE_4H_AGENCY_SYSTEM_QA.md`
- Slack token storage implementation from 5A
- `source_imports` schema
- `client_integrations` schema

### Slack Channel Listing

Create or update API:

```text
GET /api/agency/slack/channels?client_id=<clientId>
```

Requirements:

- Authenticated internal agency user only.
- Client must belong to active internal agency org.
- User must have agency access.
- Slack connection must exist.
- Use encrypted token if available.
- Return minimal channel data:
  - id
  - name
  - is_private if available
  - is_archived if available
  - member count if available
- Do not store messages here.
- Handle Slack API errors clearly.

### Channel Selection

Create or update API:

```text
PATCH /api/agency/slack/status
```

or a dedicated route:

```text
POST /api/agency/slack/channels/selection
```

Requirements:

- Admin-only write.
- Demo users blocked.
- Store selected channel IDs/names in `client_integrations.metadata_json`.
- Preserve existing metadata.
- Do not store tokens in metadata.

### Manual Message Import

Create:

```text
POST /api/agency/slack/import
```

Request body:

- `client_id`
- `channel_id`
- optional `oldest`
- optional `latest`
- optional `limit`

Requirements:

- Authenticated agency user.
- Client/org access validated.
- Slack connection exists.
- Channel must either be selected or explicitly allowed for import by admin role.
- Fetch bounded recent messages.
- Do not import unlimited history.
- Suggested default limit: 50 messages.
- Suggested max limit: 200 messages.
- Store imported content in `source_imports` with:
  - `provider = 'slack'`
  - `organization_id`
  - `client_id`
  - `source_title`
  - `raw_text`
  - `summary` if cheaply produced or leave null
  - metadata with channel id/name, message count, time range, imported_by
- Do not auto-generate content from Slack yet.

### UI

Update:

```text
/dashboard/agency/slack
```

Requirements:

- Show connected workspace.
- Show channel list if connected.
- Allow admin to select priority/import channels.
- Allow manual import from selected channel.
- Show import success/failure.
- Show read-only view for non-admin agency members if appropriate.
- Demo users cannot import.

### Data Safety

- Avoid storing sensitive Slack metadata unnecessarily.
- Do not store bot/user tokens in visible metadata.
- Do not expose imported Slack content outside agency routes.
- Do not allow cross-client imports.

### Documentation

Create:

```text
PHASE_5B_SLACK_CHANNEL_IMPORT_FOUNDATION.md
```

Document:

- routes added
- scopes required
- message import limits
- metadata stored
- `source_imports` behavior
- security model
- what is intentionally not built
- next phase ideas

### Tests

Add focused tests for:

- SaaS org denied
- disconnected client cannot import
- non-admin channel selection denied
- demo write denied
- import limit capped
- imported source has correct provider/client/org
- token not returned to client
- cross-client/channel misuse denied where practical

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused Slack tests
- agency permission tests
- `git diff --check`

### Review Checklist

After implementation, review:

- no cross-org Slack data access
- no token exposure
- import limits enforced
- no automatic sync added
- source imports scoped correctly
- UI remains internal-only
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add Slack channel selection and manual import foundation"
```

---

## [x] Phase 5C: Granola Import Expansion

Completed commit: 0dcc5cf

Status: Ready after Phase 5B is committed.

### Objective

Improve the manual Granola workflow so agency users can turn meeting notes into structured internal source records more reliably.

This phase remains manual. Do not build Granola OAuth/API sync unless official integration details are confirmed and explicitly approved.

### Scope

Do:

- Improve manual Granola paste/import.
- Parse structured meeting fields when possible.
- Add meeting type, participants, date, title, decisions, action items, and customer insights.
- Store structured metadata in `source_imports`.
- Improve UI for reviewing imported notes.
- Add tests and docs.

Do not:

- Build Granola OAuth.
- Call Granola APIs unless already verified and approved.
- Add scheduled sync.
- Generate drafts automatically yet.
- Change billing.
- Change Slack behavior.
- Expose Granola workflow to SaaS users.

### Read First

- `PHASE_4F_GRANOLA_MANUAL_IMPORT_WORKFLOW.md`
- `PHASE_4H_AGENCY_SYSTEM_QA.md`
- `source_imports` schema
- existing Granola route/UI

### API Enhancements

Update:

```text
POST /api/agency/granola/imports
GET /api/agency/granola/imports
```

Requirements:

- Internal agency access only.
- Client/org validation.
- Support richer fields:
  - meeting title
  - meeting date
  - participants
  - meeting type
  - raw notes
  - summary
  - decisions
  - action items
  - customer pain points
  - notable quotes
  - follow-up opportunities
- Store raw notes in `raw_text`.
- Store structured fields in `metadata_json`.
- Preserve provider granola.

### Optional Parser

Add helper:

```text
lib/agency-granola-parser.ts
```

Requirements:

- Best-effort parsing only.
- Do not use AI unless explicitly already allowed and scoped.
- Should not fail import if parsing fails.
- Return parsed metadata plus warnings.

### UI

Update:

```text
/dashboard/agency/granola
```

Requirements:

- Better form fields for meeting metadata.
- Preview parsed structured fields if parser added.
- Show import history.
- Allow filtering by client.
- Keep non-admin/member permissions consistent with existing Phase 4F decisions.

### Documentation

Create:

```text
PHASE_5C_GRANOLA_IMPORT_EXPANSION.md
```

Document:

- manual-only design
- fields captured
- parser behavior
- metadata structure
- what is intentionally not built
- future API integration requirements

### Tests

Add focused tests for:

- manual import with structured fields
- parser behavior if added
- client/org validation
- provider remains granola
- SaaS users denied
- demo write blocked if applicable

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused Granola/agency tests
- `git diff --check`

### Review Checklist

After implementation, review:

- workflow remains manual
- no fake Granola API integration added
- imports scoped to internal agency org
- structured metadata is preserved
- no SaaS exposure
- validation passes

### Commit Message

```bash
git add .
git commit -m "Expand manual Granola import workflow"
```

---

## [x] Phase 5D: Source-to-Draft Generation Workflow

Completed commit: 0dcc5cf

Status: Ready after Phase 5C is committed.

### Objective

Allow internal agency users to generate draft content from agency source imports.

This connects the agency source/import system to the existing generation engine and draft review workflow.

### Scope

Do:

- Add source-to-draft generation for internal agency sources.
- Support manual source imports, Slack imports, and Granola imports.
- Use client profile/context where available.
- Use brand voice/campaign context where available.
- Save results as agency drafts/content library items.
- Add tests and docs.

Do not:

- Change public SaaS generation behavior.
- Rewrite the whole AI provider system.
- Build automated scheduled generation.
- Send content to clients automatically.
- Change billing/subscription behavior.
- Add Slack posting.

### Read First

- `PHASE_3D_GENERATION_CONTEXT_INTEGRATION.md`
- `PHASE_4E_DRAFT_REVIEW_DELIVERY.md`
- `PHASE_4C_CLIENT_SOURCE_IMPORTS.md`
- `PHASE_5B_SLACK_CHANNEL_IMPORT_FOUNDATION.md`
- `PHASE_5C_GRANOLA_IMPORT_EXPANSION.md`
- existing generation routes/helpers
- client profile helpers
- brand voice/campaign/content library helpers

### API

Create:

```text
POST /api/agency/source-imports/:id/generate
```

or:

```text
POST /api/agency/drafts/generate-from-source
```

Request body:

- `source_import_id`
- `client_id`
- optional `campaign_id`
- optional `brand_voice_id`
- `content_type`
- `channel`
- `instructions`
- `quantity`

Requirements:

- Internal agency access only.
- Validate source belongs to active internal agency org.
- Validate client/campaign/brand voice references belong to same org/client where applicable.
- Use source raw_text, summary, and metadata.
- Include client profile context if available.
- Include brand voice/campaign context if selected.
- Generate content through existing AI provider abstraction.
- Save generated content as agency draft/content library item.
- Link draft to source import in metadata if no direct column exists.
- Do not send externally.

### UI

Add to relevant pages:

- `/dashboard/agency/sources`
- `/dashboard/agency/granola`
- `/dashboard/agency/slack`
- `/dashboard/agency/drafts`

Requirements:

- From a source import, allow "Generate draft".
- Let user select content type/channel.
- Let user add instructions.
- Show generation loading/error state.
- Route user to created draft or draft list.
- Keep permissions consistent:
  - agency admins and members can generate if allowed by current draft rules
  - demo users blocked from writes

### Prompt Context

Prompt should include:

- source content
- client profile
- brand voice
- campaign context
- requested content type/channel
- agency quality instructions
- no unsupported claims instruction
- output format requirements

Do not overbuild prompt templating if existing system already handles enough.

### Documentation

Create:

```text
PHASE_5D_SOURCE_TO_DRAFT_GENERATION.md
```

Document:

- API added
- source/context composition
- output storage
- permission model
- limitations
- what is intentionally not built

### Tests

Add focused tests for:

- source/org/client validation
- SaaS org denied
- demo write blocked
- generate request creates draft metadata correctly
- invalid cross-client campaign/brand voice denied
- AI provider mocked cleanly

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused agency generation tests
- existing agency draft/source tests
- `git diff --check`

### Review Checklist

After implementation, review:

- no cross-org source access
- no cross-client context mixing
- SaaS generation behavior unchanged
- generated drafts are internal agency-scoped
- AI provider errors handled safely
- no external delivery performed
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency source-to-draft generation workflow"
```

---

## [x] Phase 5E: Client Delivery Workflow

Completed commit: 0dcc5cf

Status: Ready after Phase 5D is committed.

### Objective

Improve the internal agency delivery workflow so reviewed drafts can be packaged and delivered manually to clients.

This phase should support clean exports and delivery tracking, not automatic posting.

### Scope

Do:

- Add delivery package concept if needed.
- Improve export formats.
- Track delivery status and notes.
- Support manual delivery workflow.
- Add tests and docs.

Do not:

- Email clients automatically unless explicitly approved.
- Post to Slack automatically.
- Publish social posts automatically.
- Build client portal yet.
- Change SaaS content library behavior.
- Change billing.

### Read First

- `PHASE_4E_DRAFT_REVIEW_DELIVERY.md`
- `PHASE_5D_SOURCE_TO_DRAFT_GENERATION.md`
- content library/draft helpers
- production tasks helpers

### Optional Schema

If needed, add a forward migration for:

```text
agency_delivery_packages
```

Fields:

- `id uuid primary key`
- `organization_id`
- `client_id`
- `title`
- `status`
- `delivery_notes`
- `metadata_json`
- `created_by`
- `delivered_at`
- `created_at`
- `updated_at`

And optional join table:

```text
agency_delivery_package_items
```

Fields:

- `package_id`
- `content_item_id`
- `sort_order`

Only add schema if it clearly improves workflow. If existing content metadata is enough, avoid schema.

### API

Possible routes:

- `GET /api/agency/delivery/packages`
- `POST /api/agency/delivery/packages`
- `GET /api/agency/delivery/packages/:id`
- `PATCH /api/agency/delivery/packages/:id`
- `POST /api/agency/delivery/packages/:id/export`

Requirements:

- Internal agency only.
- Client/org scoped.
- Validate content items belong to same internal agency org/client.
- Demo writes blocked.
- No automatic external send.

### Exports

Support:

- Markdown export
- CSV export
- Copy-ready text bundle

Optional:

- JSON export for internal use

### UI

Add or update:

- `/dashboard/agency/delivery`
- existing drafts page delivery actions

Requirements:

- Select approved/ready drafts.
- Create delivery package.
- Export package.
- Mark package delivered.
- Add delivery notes.
- Keep UI simple.

### Documentation

Create:

```text
PHASE_5E_CLIENT_DELIVERY_WORKFLOW.md
```

Document:

- delivery model
- APIs/UI added
- export formats
- no automatic external sending
- future client portal/send options

### Tests

Add focused tests for:

- package scoping
- item/client mismatch denied
- export output shape
- mark delivered updates status/notes
- SaaS org denied
- demo writes blocked

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused delivery tests
- existing draft tests
- `git diff --check`

### Review Checklist

After implementation, review:

- delivery packages are internal-only
- no automatic client send/publish added
- content item scoping is safe
- exports are stable
- draft status handling remains correct
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency client delivery workflow"
```

---

## [x] Phase 5F: Agency Workflow QA and Integration Safety Pass

Completed commit: 0dcc5cf

Status: Ready after Phase 5E is committed.

### Objective

Perform a full QA and security pass across the Phase 5 agency integration/workflow features.

This phase should consolidate fixes before moving to public agency website or advanced automations.

### Scope

Do:

- Review Slack OAuth and manual import.
- Review Granola import expansion.
- Review source-to-draft generation.
- Review delivery workflow.
- Fix bugs found.
- Add missing tests.
- Add final QA docs.

Do not:

- Add major new features.
- Add scheduled Slack sync.
- Add automatic Slack posting.
- Add Granola API sync.
- Build public agency website.
- Change SaaS billing/generation unless fixing a regression caused by Phase 5.

### Read First

- `PHASE_5A_SLACK_OAUTH_FOUNDATION.md`
- `PHASE_5B_SLACK_CHANNEL_IMPORT_FOUNDATION.md`
- `PHASE_5C_GRANOLA_IMPORT_EXPANSION.md`
- `PHASE_5D_SOURCE_TO_DRAFT_GENERATION.md`
- `PHASE_5E_CLIENT_DELIVERY_WORKFLOW.md`
- `PHASE_4H_AGENCY_SYSTEM_QA.md`

### QA Checklist

Verify:

Access Control:

- SaaS users denied all agency integration routes.
- Internal agency members only see allowed clients.
- Admin-only actions are admin-only.
- Demo users cannot write.
- Client/org scoping is enforced everywhere.

Slack:

- OAuth state validation works.
- Tokens are never exposed.
- Channel list requires connected workspace.
- Message import is bounded.
- Imported Slack content is stored only as internal agency source imports.

Granola:

- Workflow is manual.
- Provider is granola.
- Structured metadata is stored safely.
- No fake API sync exists.

Source-to-Draft:

- Source/client/campaign/brand voice scoping is correct.
- AI errors are handled.
- Drafts are saved internally.
- SaaS generation behavior is unchanged.

Delivery:

- Package/item scoping is correct.
- Exports are stable.
- Mark delivered does not corrupt draft metadata.
- No automatic external sends exist.

Data Integrity:

- No cross-client references.
- No cross-org references.
- Metadata preservation works.
- RLS and API checks align.

### Documentation

Create:

```text
PHASE_5F_AGENCY_WORKFLOW_QA.md
```

Document:

- QA areas
- bugs found
- fixes made
- tests added
- remaining risks
- readiness for Phase 6

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused Phase 5 tests
- agency auth tests
- route smoke tests
- `git diff --check`

### Review Checklist

After implementation/review:

- all Phase 5 workflows are internal-only
- no cross-org/client data leaks
- no raw third-party tokens exposed
- no automated external publishing added
- validation passes

### Commit Message

```bash
git add .
git commit -m "Review and harden agency workflow integrations"
```

---

## Phase 5 Completion Summary Requirement

After Phase 5F is committed, Codex should produce a summary for Lucas.

Use this command:

```text
Read CODEX_PHASE_RUNBOOK.md and summarize all completed Phase 5 work.
Include:
- commits by phase
- features added
- files changed at a high level
- security model
- integrations added
- what was intentionally not built
- validation results
- recommended adjustments before Phase 6
```

Lucas and ChatGPT will then review the summary and adjust Phase 6 planning.

---

# Phase 6: Public Agency Website + Intake Funnel

Phase 6 builds the separate public-facing agency website and lead intake flow.

The agency website is **not** the SaaS product. It should sell done-for-you services, not software access.

The agency customer should not be shown the internal agency console, the SaaS dashboard, prompt systems, Slack import internals, Granola workflows, or production queue. They are buying outcomes and service, not a backstage tour of the robot factory.

## Universal Phase 6 Rules

For every Phase 6 subphase:

1. Implement only the current subphase.
2. Review the implementation in the same Codex run.
3. Fix issues found during review.
4. Re-run validation.
5. Produce a final report.
6. Stop before the next phase.
7. Do not commit unless Lucas explicitly asks.

### Always Preserve

- Existing B2B SaaS product behavior
- Existing SaaS billing/subscription behavior
- Existing internal agency console behavior
- Existing agency auth and role boundaries
- Existing Slack/Granola/internal integration behavior
- Existing content generation behavior
- Existing dashboard routes

### Do Not Do Unless Explicitly Stated

- Do not expose internal agency routes publicly.
- Do not expose agency clients publicly.
- Do not give agency leads SaaS dashboard access.
- Do not build a client portal yet.
- Do not add automatic client onboarding into paid SaaS accounts.
- Do not change Stripe subscription billing.
- Do not change subscription enforcement.
- Do not redesign the SaaS dashboard.
- Do not change Slack/Granola integration behavior.
- Do not send lead data to third-party tools unless explicitly approved.
- Do not store secrets in the repo.
- Do not start the next phase automatically.

---

## [ ] Phase 6A: Agency Positioning and Offer Definition

Status: Ready after Phase 5F is committed.

### Objective

Define the public agency positioning, service offers, and page content strategy before building pages.

This phase should create the content/spec foundation for the agency website.

The agency should be positioned as a done-for-you customer communication and content operations service for startups, not as a public wrapper around the SaaS product.

### Scope

Do:

- Create agency positioning documentation.
- Define core agency offers.
- Define target customer profile.
- Define website page structure.
- Draft copy blocks for homepage, services, process, packages, and intake.
- Clarify that the agency is service-based and separate from the SaaS product.
- Add docs/tests only if relevant.

Do not:

- Build website pages yet unless tiny placeholder routes are needed.
- Build intake forms yet.
- Build client portal.
- Expose internal agency tooling.
- Change SaaS landing page.
- Change billing.
- Change internal agency console behavior.
- Add Slack/Granola integration changes.

### Read First

- `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`
- `PHASE_4H_AGENCY_SYSTEM_QA.md`
- `PHASE_5F_AGENCY_WORKFLOW_QA.md`
- current public marketing pages
- current `/agency` page if it exists
- current contact/intake APIs if any

### Positioning Requirements

The agency should be positioned around:

- done-for-you content systems
- customer communication systems
- startup founder content
- customer updates/newsletters
- Slack/meeting-note workflow support
- turning meetings, Slack discussions, and customer conversations into useful content and communication assets

Suggested positioning:

```text
Done-for-you content and customer communication systems for startups.
```

Alternative positioning:

```text
We help startups turn meetings, customer conversations, and internal knowledge into content, customer updates, and support workflows.
```

### Target Customers

Define primary customers:

- early-stage startups
- founder-led B2B companies
- small teams without marketing/customer communication ops
- teams using Slack, meeting notes, customer calls, and internal knowledge but not turning them into consistent output

### Offers to Define

At minimum define:

#### Content Operations Setup

One-time setup:

- brand voice
- content pillars
- source workflows
- Slack/Granola/manual note intake
- newsletter/founder content templates

#### Monthly Founder Content System

Recurring:

- LinkedIn posts
- founder updates
- newsletter drafts
- campaign content
- review/delivery rhythm

#### Customer Communication System

Recurring or setup:

- customer updates
- support response templates
- release/update communication
- customer pain point extraction
- meeting-to-message workflows

#### Custom Startup Ops Package

Custom:

- mixed content + communication + integration workflow support

### Website Structure Proposal

Document proposed public pages:

- Agency home
- Services
- Process
- Packages
- About/Why us
- Contact/intake
- Optional case studies later

### Documentation

Create:

```text
PHASE_6A_AGENCY_POSITIONING_OFFERS.md
```

Document:

- positioning
- target customer
- service offers
- key differentiators
- page structure
- copy blocks
- what not to reveal publicly
- next phase page-build plan

### Review Checklist

After implementation, review:

- agency is clearly separate from SaaS
- copy sells service outcomes, not internal tooling
- no internal system details are exposed
- offers are concrete enough to build pages
- no code behavior changed unnecessarily
- no SaaS product positioning was accidentally overwritten

### Validation

Run:

- `npx tsc --noEmit` if code changed
- `npm run -s lint` if code changed
- `git diff --check`

### Commit Message

```bash
git add .
git commit -m "Define public agency positioning and offers"
```

---

## [ ] Phase 6B: Public Agency Website Foundation

Status: Ready after Phase 6A is committed.

### Objective

Build the public agency website foundation using the positioning and page structure from Phase 6A.

This should be a separate public surface from the SaaS product. It may live in the same repo, but the user experience and messaging must be separate.

### Scope

Do:

- Build public agency pages/routes.
- Add agency-specific layout/content sections.
- Add service-oriented copy.
- Add clear CTAs to intake/contact.
- Keep public agency website visually coherent.
- Add docs/tests.

Do not:

- Build full intake backend yet unless minimal contact CTA exists already.
- Build client portal.
- Expose internal agency console.
- Change SaaS dashboard.
- Change SaaS billing.
- Add Slack/Granola integration behavior.
- Add public SaaS signup CTAs as the primary conversion path.

### Candidate Routes

Use existing routing conventions.

Possible routes:

- `/agency`
- `/agency/services`
- `/agency/process`
- `/agency/packages`
- `/agency/contact`

If a separate domain will later point to these routes, document how.

### Page Requirements

#### Agency Home

Should include:

- hero positioning
- target customer
- core outcome
- service overview
- process summary
- CTA to intake/contact
- trust/credibility section if available
- "not another SaaS login" style reassurance, but phrase professionally

#### Services Page

Should describe:

- content operations setup
- founder content system
- customer communication system
- custom startup ops package

#### Process Page

Should describe:

1. discovery/intake
2. source setup
3. brand/context setup
4. content/customer communication production
5. review/delivery
6. ongoing improvement

#### Packages Page

Should show service package structure without needing exact pricing if pricing is not finalized.

Acceptable CTA:

- "Apply"
- "Book a call"
- "Request an audit"
- "Start intake"

#### Contact/Intake Placeholder

If Phase 6D will build full intake later, this page can initially link to existing contact form or placeholder CTA.

### Branding Separation

Agency pages should not feel like the SaaS pricing page.

Rules:

- Do not talk about "users subscribing to software."
- Do not emphasize credits.
- Do not expose dashboard internals.
- Do not show internal Slack/Granola workflows in detail.
- Sell service outcomes.

### Documentation

Create:

```text
PHASE_6B_PUBLIC_AGENCY_WEBSITE_FOUNDATION.md
```

Document:

- routes added
- components added
- copy approach
- domain/separation notes
- what was intentionally not built
- next phase

### Tests

Add focused tests if existing test setup supports:

- public pages render
- primary CTAs exist
- internal dashboard routes are not linked publicly
- no auth required for public pages

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- relevant page/render tests if available
- `git diff --check`

### Review Checklist

After implementation, review:

- public agency pages do not expose internal tooling
- agency is separate from SaaS
- CTAs point to appropriate next steps
- no internal agency auth routes are leaked
- no SaaS billing/generation behavior changed
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add public agency website foundation"
```

---

## [ ] Phase 6C: Agency Service Packages and Conversion Copy

Status: Ready after Phase 6B is committed.

### Objective

Refine the public agency website into a clearer conversion surface with stronger service package descriptions, objections, FAQs, and CTAs.

This phase improves the public-facing sales content without changing backend workflow.

### Scope

Do:

- Improve packages/services content.
- Add FAQ.
- Add objection handling.
- Add "who this is for / not for."
- Add CTA consistency.
- Add lightweight SEO metadata if current app conventions support it.
- Add docs/tests.

Do not:

- Build intake backend yet unless minimal frontend field changes are needed.
- Add payment.
- Add client portal.
- Change SaaS pricing.
- Change internal agency console.
- Add integration behavior.

### Content Sections to Add or Improve

#### Who This Is For

Examples:

- founder-led B2B startups
- teams with lots of calls/Slack knowledge but inconsistent content
- startups needing customer updates and founder presence
- teams that want done-for-you execution

#### Who This Is Not For

Examples:

- companies wanting generic AI spam
- teams unwilling to provide context/source material
- businesses needing fully automated publishing on day one
- consumer influencer brands if not target

#### FAQ

Include:

- Do clients get software access?
- How do you get source material?
- Can you work from Slack or meeting notes?
- Do you write in our brand voice?
- Do you support newsletters and LinkedIn?
- Do you post for us automatically?
- How is this different from a generic AI tool?
- How long does setup take?

#### Package Detail

For each package:

- outcome
- what is included
- typical cadence
- best-fit customer
- CTA

### Documentation

Create:

```text
PHASE_6C_AGENCY_PACKAGES_CONVERSION_COPY.md
```

Document:

- copy sections added
- package structure
- CTA strategy
- SEO metadata changes if any
- what was intentionally not built

### Tests

Add/adjust tests if practical:

- package cards render
- FAQ renders
- CTA links route correctly
- no internal-only links are public

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- relevant tests
- `git diff --check`

### Review Checklist

After implementation, review:

- copy is service-focused
- no internal tooling details exposed
- CTAs are consistent
- claims are not exaggerated
- no backend behavior changed unnecessarily
- validation passes

### Commit Message

```bash
git add .
git commit -m "Refine agency packages and conversion copy"
```

---

## [ ] Phase 6D: Agency Lead Intake Schema and API

Status: Ready after Phase 6C is committed.

### Objective

Add the backend foundation for public agency lead intake.

Public visitors should be able to submit an agency inquiry. Submissions should be stored safely and should not automatically create full agency clients unless explicitly approved in a later phase.

### Scope

Do:

- Add agency lead/intake schema.
- Add public intake API with spam/rate protections.
- Store inquiry data.
- Add admin/internal read path if useful.
- Add docs/tests.

Do not:

- Automatically create `agency_clients` from every lead.
- Give leads dashboard access.
- Send data to external CRMs unless explicitly approved.
- Add payment.
- Change SaaS signup.
- Change internal agency client workflows except optional lead review/read API.

### Read First

- existing contact/waitlist APIs
- `PHASE_6B_PUBLIC_AGENCY_WEBSITE_FOUNDATION.md`
- `PHASE_6C_AGENCY_PACKAGES_CONVERSION_COPY.md`
- existing agency client schema
- rate limit helpers
- contact mailer if any

### Schema

Create a forward migration.

Add table:

```text
agency_leads
```

Fields:

- `id uuid primary key default gen_random_uuid()`
- `name text`
- `email text not null`
- `company text`
- `website text`
- `role text`
- `package_interest text`
- `budget_range text`
- `timeline text`
- `message text`
- `source text not null default 'agency_website'`
- `status text not null default 'new'`
- `metadata_json jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Status values:

- `new`
- `reviewed`
- `qualified`
- `converted`
- `archived`
- `spam`

Indexes:

- email
- status
- created_at

### RLS

Public insert may be handled through API only, not direct table insert.

Recommended:

- no anonymous direct table access
- service role can manage
- platform/internal agency admin read access through API

### Public API

Create:

```text
POST /api/agency-leads
```

Requirements:

- Public route.
- Validate email.
- Validate length limits.
- Rate limit by IP/email if existing helper supports it.
- Honeypot field if frontend will use it.
- Store sanitized inquiry.
- Do not expose internal errors.
- Return safe success response.
- Do not create agency client automatically.

### Internal API

Optional but useful:

```text
GET /api/agency/leads
PATCH /api/agency/leads/:id
```

Requirements:

- Internal agency admin access only.
- Demo writes blocked.
- Allow status updates.
- Do not overbuild CRM.

### Documentation

Create:

```text
PHASE_6D_AGENCY_LEAD_INTAKE_SCHEMA_API.md
```

Document:

- schema
- public API
- validation/rate limits
- RLS/security
- why leads do not auto-create clients
- next phase frontend form

### Tests

Add focused tests for:

- valid lead submission
- invalid email rejected
- overly long fields rejected
- honeypot rejected if implemented
- rate limit behavior if practical
- no auto client creation
- internal read/update auth if implemented

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused lead tests
- `git diff --check`

### Review Checklist

After implementation, review:

- public route cannot leak data
- spam/rate handling exists
- no client auto-creation
- internal read/update is agency-admin protected
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency lead intake backend"
```

---

## [ ] Phase 6E: Public Agency Intake Form and Lead Review

Status: Ready after Phase 6D is committed.

### Objective

Add the public agency intake form and connect it to the `agency_leads` backend.

Also add a minimal internal lead review surface if not already added in Phase 6D.

### Scope

Do:

- Build public intake form.
- Submit to `/api/agency-leads`.
- Add validation/loading/success/error states.
- Add thank-you state/page.
- Add minimal internal lead review UI if useful.
- Add docs/tests.

Do not:

- Automatically create agency clients.
- Add payment.
- Add client portal.
- Add external CRM integration.
- Change SaaS signup.
- Expose internal agency console publicly.

### Public Form Fields

Suggested fields:

- name
- email
- company
- website
- role
- package interest
- timeline
- budget range
- message
- source hidden field
- honeypot hidden field

### Candidate Routes

Public:

- `/agency/contact`
- `/agency/apply`
- `/agency/intake`
- `/agency/thank-you`

Internal optional:

- `/dashboard/agency/leads`

### UX Requirements

Public form:

- clear service-focused intro
- no SaaS signup language
- safe field validation
- loading state
- success state
- user-safe error state
- no internal implementation details

Internal lead review:

- list leads
- filter by status
- update status
- view details
- optional "convert later" placeholder, not actual conversion unless explicitly scoped

### Documentation

Create:

```text
PHASE_6E_AGENCY_INTAKE_FORM_LEAD_REVIEW.md
```

Document:

- pages/components added
- form fields
- validation behavior
- internal review behavior
- what was intentionally not built

### Tests

Add focused tests for:

- form renders
- required email validation
- successful submit state
- API error state
- internal leads page protected if implemented
- no internal routes linked incorrectly on public pages

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- relevant form/API tests
- `git diff --check`

### Review Checklist

After implementation, review:

- form submits correctly
- public users cannot read leads
- internal review is protected
- no auto client creation
- no SaaS signup confusion
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add public agency intake form"
```

---

## [ ] Phase 6F: Lead-to-Client Conversion Workflow

Status: Ready after Phase 6E is committed.

### Objective

Allow an internal agency admin to convert a qualified agency lead into an `agency_client`.

This should be a deliberate internal action, not automatic.

### Scope

Do:

- Add conversion action from lead to client.
- Preserve original lead record.
- Link converted lead to created client if schema supports it.
- Add tests and docs.

Do not:

- Automatically convert all leads.
- Give lead/customer SaaS access.
- Send onboarding emails unless explicitly approved.
- Add payment.
- Build client portal.
- Change public form behavior except showing post-submit success.

### Schema Update

If useful, add fields to `agency_leads`:

- `converted_client_id uuid references agency_clients(id) on delete set null`
- `converted_at timestamptz`
- `converted_by uuid references auth.users(id) on delete set null`

Add via forward migration.

### API

Create:

```text
POST /api/agency/leads/:id/convert
```

Requirements:

- Internal agency admin only.
- Demo users blocked.
- Lead must exist.
- Lead should not already be converted.
- Creates `agency_clients` row in the active internal agency org.
- Maps lead fields:
  - company/name to client name
  - website
  - primary_contact_name
  - primary_contact_email
  - package interest
  - notes/message
- Updates lead status to `converted`.
- Stores converted client link.
- Returns created client.

### UI

Update internal leads page:

- show convert action for qualified/new leads
- show converted status/link
- confirm before conversion
- show success/error states

### Documentation

Create:

```text
PHASE_6F_LEAD_TO_CLIENT_CONVERSION.md
```

Document:

- conversion behavior
- field mapping
- permissions
- why conversion is manual
- what was intentionally not built

### Tests

Add focused tests for:

- admin can convert
- member cannot convert
- demo cannot convert
- already converted lead cannot convert twice
- created client is internal agency scoped
- lead status/link updated
- SaaS org denied

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused lead/client tests
- `git diff --check`

### Review Checklist

After implementation, review:

- conversion is manual/admin-only
- no SaaS access is granted
- client org scope is correct
- duplicate conversion prevented
- original lead data preserved
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency lead to client conversion"
```

---

## [ ] Phase 6G: Public Agency Website QA and Launch Checklist

Status: Ready after Phase 6F is committed.

### Objective

Run a full QA pass on the public agency website and lead funnel before considering it launch-ready.

This phase should mostly be review, bug fixes, tests, and documentation.

### Scope

Do:

- QA all public agency pages.
- QA intake submission.
- QA internal lead review.
- QA lead conversion.
- Fix bugs found.
- Add launch checklist.
- Add SEO/social metadata checks if current app supports it.

Do not:

- Add major new features.
- Add client portal.
- Add payment.
- Add external CRM integration.
- Change SaaS billing/generation.
- Add Slack/Granola behavior.

### QA Checklist

#### Public Pages

Verify:

- `/agency`
- `/agency/services`
- `/agency/process`
- `/agency/packages`
- `/agency/contact` or intake route
- thank-you page if present

Check:

- pages render unauthenticated
- CTAs work
- no internal links exposed
- no SaaS dashboard confusion
- service positioning is clear
- mobile layout is acceptable
- metadata exists where practical

#### Lead Intake

Verify:

- valid form submission works
- invalid email blocked
- long/spam fields blocked
- honeypot works if implemented
- safe success/error states
- no lead data exposed publicly

#### Internal Lead Review

Verify:

- unauthenticated users denied
- SaaS users denied
- internal agency admins can view/update leads
- demo users cannot mutate
- conversion works
- duplicate conversion blocked

#### Isolation

Verify:

- SaaS dashboard unaffected
- billing unaffected
- agency console unaffected
- Slack/Granola unaffected

### Documentation

Create:

```text
PHASE_6G_AGENCY_WEBSITE_QA_LAUNCH.md
```

Document:

- QA results
- bugs found/fixed
- remaining risks
- launch checklist
- domain/deployment notes
- next recommended phase

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- public page tests if available
- lead API tests
- agency permission tests
- route smoke tests
- `git diff --check`

### Review Checklist

After implementation/review:

- public agency site is launch-ready enough for early traffic
- lead funnel works
- internal lead review works
- no internal tools exposed publicly
- validation passes

### Commit Message

```bash
git add .
git commit -m "QA public agency website and lead funnel"
```

---

## Phase 6 Completion Summary Requirement

After Phase 6G is committed, Codex should produce a summary for Lucas.

Use this command:

```text
Read CODEX_PHASE_RUNBOOK.md and summarize all completed Phase 6 work.

Include:
- commits by phase
- public pages added
- lead intake/backend features added
- internal lead review/conversion features
- security model
- what was intentionally not built
- validation results
- remaining risks
- recommended adjustments before Phase 7
```

Lucas and ChatGPT will then review the summary and decide whether Phase 7 should focus on:

- client portal
- advanced agency automations
- production launch hardening
- public SaaS marketing
- deeper analytics/reporting

---

# Phase 7: Public Agency Funnel Enhancements

Phase 7 improves the public agency website lead funnel.

The goal is to make the agency website more useful for real lead capture, internal follow-up, lead qualification, analytics, and conversion tracking.

This phase focuses on the public agency funnel only.

It should not build a client portal, advanced Slack/Granola automation, SaaS marketing, or production infrastructure hardening unless explicitly scoped.

## Universal Phase 7 Rules

For every Phase 7 subphase:

1. Implement only the current subphase.
2. Review the implementation in the same Codex run.
3. Fix issues found during review.
4. Re-run validation.
5. Produce a final report.
6. Stop before the next phase.
7. Do not commit unless Lucas explicitly asks.

### Always Preserve

- Existing public agency pages
- Existing public lead intake form
- Existing internal agency lead review
- Existing lead-to-client conversion workflow
- Existing internal agency console security
- Existing SaaS dashboard behavior
- Existing SaaS billing/subscription behavior
- Existing Slack/Granola workflows
- Existing content generation behavior

### Do Not Do Unless Explicitly Stated

- Do not build a client portal.
- Do not give leads dashboard access.
- Do not auto-create agency clients from public submissions.
- Do not send lead data to third-party CRMs unless explicitly approved.
- Do not change SaaS subscription billing.
- Do not change subscription enforcement.
- Do not change Stripe checkout/webhook behavior.
- Do not redesign the entire public agency website.
- Do not expose internal agency tools publicly.
- Do not expose agency client data publicly.
- Do not add advanced Slack/Granola automations.
- Do not store secrets in the repo.
- Do not start the next phase automatically.

---

## [x] Phase 7A: Durable Lead Rate Limiting and Spam Protection
Completed commit: f3a45aa

Status: Ready after Phase 6G is committed.

### Objective

Replace or supplement the current in-memory public lead rate limiting with a more production-suitable anti-spam foundation.

Phase 6 noted that lead rate limiting is in-memory. That is fine for light local traffic, not great for real traffic.

### Scope

Do:

- Review current public lead intake protection.
- Add durable rate limiting if an existing Redis/Upstash/edge rate-limit helper exists.
- Add stronger validation and spam protections.
- Preserve public lead submission behavior.
- Add tests and docs.

Do not:

- Add CAPTCHA unless explicitly approved.
- Add third-party anti-spam vendors unless already configured.
- Change lead schema broadly unless needed.
- Change internal lead review workflow.
- Auto-create clients.
- Send emails yet.
- Add analytics yet.

### Read First

- `PHASE_6D_AGENCY_LEAD_INTAKE_SCHEMA_API.md`
- `PHASE_6E_AGENCY_INTAKE_FORM_LEAD_REVIEW.md`
- `PHASE_6G_AGENCY_WEBSITE_QA_LAUNCH.md`
- `app/api/agency-leads/route.ts`
- `lib/agency-leads.ts`
- existing rate limit helpers
- existing Upstash/Redis configuration if present

### Implementation Requirements

Review and improve protections for:

- IP-based rate limiting
- email-based rate limiting
- honeypot validation
- field length validation
- suspicious repeated submissions
- safe user-facing error messages

If durable rate limiting support already exists:

- use it for public agency lead intake
- keep graceful fallback if Redis is unavailable
- log failures without exposing internals

If durable rate limiting support does not exist:

- add a clean abstraction, but do not overbuild
- document that production should configure durable backend
- keep current in-memory fallback

### Suggested Helper

Create or update:

```text
lib/agency-lead-rate-limit.ts
```

Possible functions:

- `checkAgencyLeadRateLimit(...)`
- `buildLeadRateLimitKey(...)`
- `isLikelySpamLead(...)`

### Documentation

Create:

```text
PHASE_7A_AGENCY_LEAD_RATE_LIMITING.md
```

Document:

- previous in-memory risk
- new rate limit behavior
- durable backend used or fallback decision
- validation/spam rules
- remaining production recommendations

### Tests

Add focused tests for:

- valid lead allowed
- repeated email submissions rate-limited
- repeated IP submissions rate-limited if practical
- honeypot rejected
- overly long fields rejected
- rate limit failure fails safe or graceful according to design

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused lead/rate-limit tests
- `git diff --check`

### Review Checklist

After implementation, review:

- public lead intake still works
- spam/rate limiting is stronger than Phase 6
- user-facing errors are safe
- no public lead data exposure
- no client auto-creation
- no email/analytics added yet
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add durable agency lead spam protection"
```

---

## [ ] Phase 7B: Agency Lead Notification Emails

Status: Ready after Phase 7A is committed.

### Objective

Send internal notification emails when a new agency lead is submitted.

This helps Lucas respond quickly without living inside the dashboard.

### Scope

Do:

- Add internal lead notification email.
- Use existing email/mailer provider if present.
- Keep failure non-blocking where appropriate.
- Add env placeholders/docs.
- Add tests.

Do not:

- Send public lead confirmation emails yet.
- Add newsletters.
- Add CRM sync.
- Auto-create agency clients.
- Change lead conversion workflow.
- Change SaaS email behavior unless shared mailer types need safe updates.

### Read First

- `PHASE_6D_AGENCY_LEAD_INTAKE_SCHEMA_API.md`
- `PHASE_7A_AGENCY_LEAD_RATE_LIMITING.md`
- existing contact mailer files
- existing Resend/email configuration
- `app/api/agency-leads/route.ts`
- `lib/agency-leads.ts`

### Required Behavior

When a valid public agency lead is stored:

- send an internal notification email to configured recipient(s)
- include safe lead summary:
  - name
  - email
  - company
  - website
  - package interest
  - timeline
  - budget range
  - message excerpt
  - dashboard review link if safe
- do not include secrets
- do not include raw oversized content
- do not block lead submission if email send fails, unless current app convention says otherwise
- log email failure safely

### Environment Variables

Add placeholders only:

```text
AGENCY_LEAD_NOTIFICATION_EMAIL=
AGENCY_LEAD_FROM_EMAIL=
```

If existing mailer uses shared sender envs, document reuse.

### Suggested Helper

Create or update:

```text
lib/agency-lead-notifications.ts
```

Possible functions:

- `sendAgencyLeadNotification(...)`
- `buildAgencyLeadNotificationEmail(...)`

### Documentation

Create:

```text
PHASE_7B_AGENCY_LEAD_NOTIFICATIONS.md
```

Document:

- env vars
- email provider used
- email contents
- failure behavior
- privacy/security notes
- what is intentionally not built

### Tests

Add focused tests for:

- notification email payload formatting
- send called after valid lead creation
- email failure does not delete/lose lead
- no notification sent for invalid lead
- message excerpt truncation
- env missing behavior

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused lead notification tests
- existing lead intake tests
- `git diff --check`

### Review Checklist

After implementation, review:

- valid leads still store correctly
- internal notification sends safely
- email failure is handled
- no public confirmation email added yet
- no CRM/external sync added
- no secrets in email/logs
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency lead notification emails"
```

---

## [ ] Phase 7C: Public Lead Confirmation Email and Thank-You Flow

Status: Ready after Phase 7B is committed.

### Objective

Send a safe confirmation email to the person who submitted the agency intake form and improve the thank-you flow.

This is not a newsletter system. This is just confirmation that the form submission was received.

### Scope

Do:

- Add public lead confirmation email.
- Improve thank-you page if needed.
- Keep email copy service-focused and safe.
- Add tests and docs.

Do not:

- Add email marketing automation.
- Add drip sequences.
- Add calendar booking integration unless already present and explicitly scoped.
- Add CRM sync.
- Auto-create clients.
- Give leads dashboard access.
- Change internal notification behavior except shared helper cleanup.

### Read First

- `PHASE_6E_AGENCY_INTAKE_FORM_LEAD_REVIEW.md`
- `PHASE_7B_AGENCY_LEAD_NOTIFICATIONS.md`
- existing agency thank-you page
- existing email/mailer helpers

### Required Behavior

After a valid lead submission:

- optionally send confirmation email to submitter
- email should include:
  - thank-you message
  - what happens next
  - expected response window if desired
  - safe link back to agency site
- do not include internal notes
- do not expose lead ID if not needed
- failure should not break lead submission unless explicitly documented

### Copy Requirements

Keep copy professional and service-focused.

Avoid:

- implying guaranteed acceptance
- exposing internal workflows
- promising instant deliverables
- saying they now have an account

### Thank-You Page

Update:

```text
/agency/thank-you
```

Requirements:

- clear confirmation
- next steps
- optional CTA to review services/process
- no dashboard/internal links

### Documentation

Create:

```text
PHASE_7C_AGENCY_LEAD_CONFIRMATION_EMAIL.md
```

Document:

- email behavior
- failure behavior
- thank-you page changes
- privacy notes
- what was intentionally not built

### Tests

Add focused tests for:

- confirmation email payload
- no internal data exposed
- failure behavior
- thank-you page renders expected content
- invalid lead does not trigger confirmation

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused confirmation email tests
- relevant lead tests
- `git diff --check`

### Review Checklist

After implementation, review:

- lead confirmation email is safe
- no internal data exposed
- thank-you page is clear
- no marketing automation added
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency lead confirmation email"
```

---

## [ ] Phase 7D: Agency Funnel Analytics Events

Status: Ready after Phase 7C is committed.

### Objective

Add lightweight first-party analytics events for the public agency funnel.

The goal is to understand conversion behavior without immediately adding third-party trackers.

### Scope

Do:

- Add first-party funnel event tracking.
- Track important agency funnel events.
- Add internal/admin-safe read access if useful.
- Add tests and docs.

Do not:

- Add Google Analytics, Meta Pixel, LinkedIn Insight Tag, or third-party trackers unless explicitly approved.
- Store excessive personal data in analytics events.
- Track internal agency console activity unless explicitly scoped.
- Change lead intake behavior.
- Change SaaS analytics.

### Events to Track

Suggested events:

```text
agency_page_view
agency_cta_click
agency_intake_view
agency_intake_started
agency_intake_submitted
agency_intake_validation_error
agency_thank_you_view
```

### Schema

Create forward migration if no existing suitable analytics table exists.

Suggested table:

```text
agency_funnel_events
```

Fields:

- `id uuid primary key default gen_random_uuid()`
- `event_name text not null`
- `anonymous_id text`
- `lead_id uuid references agency_leads(id) on delete set null`
- `path text`
- `referrer text`
- `utm_source text`
- `utm_medium text`
- `utm_campaign text`
- `utm_content text`
- `utm_term text`
- `metadata_json jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Security:

- public insert only via API
- no public read
- service role manage
- internal agency admin read if API added

### Public Event API

Create:

```text
POST /api/agency-funnel-events
```

Requirements:

- public route
- validates allowed event names
- rate limits if practical
- strips sensitive data
- stores UTM/referrer/path metadata
- returns safe success
- does not expose event records

### Client Tracking Helper

Create if useful:

```text
lib/agency-funnel-client.ts
```

or component-level tracking.

Requirements:

- do not break page rendering if tracking fails
- no excessive client-side complexity
- avoid storing PII in analytics metadata
- associate lead_id only after successful form submission if safe

### Internal Read API

Optional:

```text
GET /api/agency/funnel-events
```

Requirements:

- internal agency admin only
- basic filtering by date/event
- no broad dashboard build unless simple

### Documentation

Create:

```text
PHASE_7D_AGENCY_FUNNEL_ANALYTICS.md
```

Document:

- events tracked
- schema/API
- privacy decisions
- what is intentionally not tracked
- future third-party analytics options

### Tests

Add focused tests for:

- allowed event stored
- disallowed event rejected
- public read impossible
- PII stripping/sanitization
- invalid payload rejected
- lead submission links event if implemented

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused analytics tests
- `git diff --check`

### Review Checklist

After implementation, review:

- no third-party tracker added
- no sensitive PII stored unnecessarily
- public users cannot read analytics
- tracking failure does not break funnel
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency funnel analytics events"
```

---

## [ ] Phase 7E: Lead Qualification, Scoring, and Routing

Status: Ready after Phase 7D is committed.

### Objective

Add internal lead qualification fields, scoring, and routing so agency leads are easier to prioritize.

### Scope

Do:

- Add lead scoring/qualification fields.
- Add deterministic scoring helper.
- Add internal UI for qualification.
- Add tests and docs.

Do not:

- Use AI scoring unless explicitly approved.
- Auto-reject leads.
- Auto-create clients.
- Send to external CRM.
- Change public form drastically unless needed.
- Build full sales pipeline CRM.

### Schema Update

Add forward migration to `agency_leads` if fields do not exist:

```text
qualification_score integer
qualification_tier text
assigned_to uuid references auth.users(id) on delete set null
review_notes text
last_contacted_at timestamptz
next_follow_up_at timestamptz
```

Suggested tier values:

- `high`
- `medium`
- `low`
- `unqualified`

### Scoring Helper

Create or update:

```text
lib/agency-lead-qualification.ts
```

Scoring should be deterministic and explainable.

Possible factors:

- package interest present
- company/website present
- realistic timeline
- budget range present
- message length/detail
- role/title indicates decision-maker
- spam/low-quality signals

Do not overfit. This is a helper, not a predictive system.

### API Updates

Update internal lead APIs:

- list leads with score/tier filters
- update qualification fields
- assign lead to user if safe
- update follow-up dates/notes

Public API may compute initial score after lead creation.

### UI Updates

Update:

```text
/dashboard/agency/leads
```

Requirements:

- show score/tier
- filter by status/tier
- edit review notes
- set next follow-up date
- assign lead if practical
- preserve existing conversion flow

### Documentation

Create:

```text
PHASE_7E_LEAD_QUALIFICATION_ROUTING.md
```

Document:

- fields added
- scoring factors
- routing behavior
- limitations
- what is intentionally not built

### Tests

Add focused tests for:

- score calculation
- tier assignment
- public lead gets initial score
- internal admin can update qualification
- agency member permission behavior
- demo write blocked
- conversion still works after scoring

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused qualification tests
- existing lead conversion tests
- `git diff --check`

### Review Checklist

After implementation, review:

- scoring is deterministic
- no AI/external service added
- no auto-client creation
- no auto-rejection
- permissions preserved
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency lead qualification and routing"
```

---

## [ ] Phase 7F: Lead Export and Lightweight CRM Handoff

Status: Ready after Phase 7E is committed.

### Objective

Allow internal agency admins to export leads for lightweight CRM/manual follow-up workflows.

This phase does not integrate with an external CRM by default.

### Scope

Do:

- Add CSV export for agency leads.
- Add JSON export if useful.
- Add filtered export by status/tier/date.
- Add tests and docs.

Do not:

- Send lead data to external CRM automatically.
- Add HubSpot/Salesforce integration.
- Add Zapier/webhooks unless explicitly approved.
- Change lead submission behavior.
- Auto-create clients.

### API

Create or update:

```text
GET /api/agency/leads/export
```

Query filters:

- status
- qualification_tier
- date_from
- date_to
- package_interest

Requirements:

- internal agency admin only
- demo users may read/export only if existing policy allows; otherwise block
- no public access
- export only allowed org's leads
- sanitize CSV fields
- prevent CSV injection by prefixing risky cells if needed

### UI

Update:

```text
/dashboard/agency/leads
```

Requirements:

- add export button for admins
- preserve filters
- clear loading/error states
- no broad CRM UI

### Documentation

Create:

```text
PHASE_7F_LEAD_EXPORT_CRM_HANDOFF.md
```

Document:

- export formats
- filters
- CSV injection protection
- permissions
- what was intentionally not built

### Tests

Add focused tests for:

- admin export allowed
- SaaS user denied
- public denied
- export respects filters
- CSV injection fields sanitized
- cross-org leads not included

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused export tests
- `git diff --check`

### Review Checklist

After implementation, review:

- exports are internal-only
- filters work
- CSV injection protected
- no external CRM sync added
- validation passes

### Commit Message

```bash
git add .
git commit -m "Add agency lead export workflow"
```

---

## [ ] Phase 7G: Public Agency Funnel QA and Conversion Review

Status: Ready after Phase 7F is committed.

### Objective

Run a complete QA and conversion review of the public agency funnel enhancements from Phase 7.

This phase should consolidate fixes before moving to any client portal, launch hardening, or advanced automation work.

### Scope

Do:

- Review public funnel pages and intake.
- Review spam/rate limiting.
- Review notification/confirmation emails.
- Review analytics events.
- Review qualification/routing.
- Review export workflow.
- Fix bugs.
- Add missing tests.
- Create final Phase 7 summary.

Do not:

- Add major new funnel features.
- Add client portal.
- Add external CRM sync.
- Add payment.
- Change SaaS billing/generation.
- Change Slack/Granola workflows.

### Read First

- all Phase 7 docs
- `PHASE_6G_AGENCY_WEBSITE_QA_LAUNCH.md`
- lead intake APIs
- agency public pages
- internal lead review UI

### QA Checklist

#### Public Funnel

Verify:

- agency pages render
- CTAs work
- intake form works
- thank-you page works
- invalid submissions fail safely
- spam protections work
- no internal links exposed

#### Emails

Verify:

- internal notification sends on valid lead
- confirmation email sends if enabled
- email failures are safe
- no secrets/internal notes exposed

#### Analytics

Verify:

- allowed events store
- invalid events reject
- public users cannot read analytics
- no excessive PII stored

#### Lead Management

Verify:

- internal lead list works
- qualification score/tier works
- status updates work
- follow-up fields work
- conversion still works
- export works
- CSV injection protection works

#### Isolation

Verify:

- SaaS dashboard unaffected
- billing unaffected
- internal agency clients unaffected
- Slack/Granola workflows unaffected

### Documentation

Create:

```text
PHASE_7G_PUBLIC_AGENCY_FUNNEL_QA.md
```

Document:

- QA results
- bugs found/fixed
- validation results
- remaining risks
- recommended Phase 8 options

### Validation

Run:

- `npx tsc --noEmit`
- `npm run -s lint`
- focused Phase 7 tests
- lead API tests
- agency permission tests
- route smoke tests
- `git diff --check`

### Review Checklist

After implementation/review:

- public funnel is safer and more useful
- leads notify/confirm/track/qualify/export correctly
- no public data exposure
- no external CRM sync added
- validation passes

### Commit Message

```bash
git add .
git commit -m "Review and harden public agency funnel"
```

---

## Phase 7 Completion Summary Requirement

After Phase 7G is committed, Codex should produce a summary for Lucas.

Use this command:

```text
Read CODEX_PHASE_RUNBOOK.md and summarize all completed Phase 7 work.

Include:
- commits by phase
- public funnel features added
- email/notification behavior
- analytics events added
- lead qualification/routing behavior
- export/CRM handoff behavior
- security model
- what was intentionally not built
- validation results
- remaining risks
- recommended adjustments before Phase 8
```

Lucas and ChatGPT will then review the summary and decide whether Phase 8 should focus on:

- production launch hardening
- client portal
- advanced agency automation
- public SaaS marketing
- deeper analytics/reporting

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
