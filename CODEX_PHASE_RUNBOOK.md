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
