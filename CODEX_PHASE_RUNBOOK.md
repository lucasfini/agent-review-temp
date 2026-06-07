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
