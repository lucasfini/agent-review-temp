# Phase 6A: Agency Positioning and Offer Definition

Status: Implemented and reviewed. Not committed.

## Objective

Define the public positioning, service offers, target customer, page strategy, and copy foundation for the separate public agency website.

This phase is documentation-only. No public routes, SaaS product behavior, billing, Slack/Granola workflows, internal agency console behavior, or content generation behavior were changed.

## Public Positioning

Primary positioning:

```text
Done-for-you content and customer communication systems for startups.
```

Expanded positioning:

```text
We help founder-led startups turn meetings, customer conversations, Slack discussions, product updates, and internal knowledge into useful content, customer updates, and communication assets.
```

Short homepage line:

```text
Turn the conversations your team already has into content customers, investors, and prospects can understand.
```

The agency should be presented as a managed service, not as software access. The public promise is practical output and operational support: clearer founder content, better customer updates, reusable communication assets, and a dependable production rhythm.

## Separation From SaaS

The public agency site must stay separate from the B2B SaaS product.

Agency visitors should understand:

- they are applying for or buying a done-for-you service
- they do not need to subscribe to software to work with the agency
- source material can come from calls, notes, Slack discussions, customer conversations, demos, product updates, or documents
- the agency team handles production, review, and delivery
- internal tools remain private

Agency visitors should not see:

- internal agency console routes
- agency client records
- production queue details
- prompt systems or AI-provider details
- Slack OAuth/channel import internals
- Granola import implementation details
- SaaS dashboard screenshots as the main sales proof
- credit or subscription language
- public SaaS signup as the primary CTA

Current repo note:

- `app/agency/page.tsx` already exists, but it is focused mostly on founder social content and links back to the product.
- Phase 6B should replace or expand that page into the broader service positioning defined here.
- `app/contact/page.tsx` and `app/api/contact/route.ts` are support-oriented, not agency lead intake. Phase 6D/E should create dedicated agency lead intake instead of reusing support copy as-is.

## Target Customer

Primary customers:

- early-stage startups
- founder-led B2B companies
- small teams without marketing or customer communication operations
- teams with useful calls, Slack discussions, customer notes, demos, and product updates that are not becoming consistent output
- teams that want managed execution rather than another workflow tool

Best-fit roles:

- founders and co-founders
- heads of growth or marketing at small startups
- customer success or support leaders at early teams
- product leaders responsible for releases, updates, and customer education
- operators managing recurring customer communication without a dedicated content team

Common pain points:

- founder knowledge stays trapped in meetings and Slack
- product updates are not turned into clear customer-facing messages
- customer conversations are not converted into insights or content
- newsletters, LinkedIn, launch notes, and customer updates happen inconsistently
- support/customer communication sounds different from person to person
- the team has source material but not a repeatable production system
- the company needs output, not another dashboard to manage

Buying triggers:

- launching a new product or feature
- starting founder-led content after months of inconsistency
- needing customer updates or newsletter cadence
- wanting to reuse sales calls, demos, or customer calls
- needing better support templates or customer-response patterns
- preparing for a funding, hiring, or growth push

## Core Differentiators

The agency should compete on operational leverage, not generic AI writing.

Differentiators:

- source-first: starts from real customer calls, meeting notes, founder updates, Slack discussions, and product context
- brand-aware: builds voice, positioning, and content pillars before producing volume
- customer-communication focused: covers updates, support templates, release messages, and newsletters, not only social posts
- managed rhythm: provides intake, production, review, and delivery cadence
- startup-specific: designed for small teams with high context and limited bandwidth
- practical outputs: creates drafts and communication assets that can be reviewed, copied, edited, and shipped
- private operating model: clients buy outcomes while the internal agency system stays private

Avoid claiming:

- fully automated publishing
- guaranteed growth, revenue, or investor outcomes
- replacement for all marketing/customer success work
- real-time Slack or Granola automation beyond approved future phases
- generic "AI writes everything for you" positioning

## Service Offers

### 1. Content Operations Setup

Type: one-time setup

Outcome:

The startup gets a repeatable content and communication operating system built around its actual voice, customers, and source material.

Includes:

- positioning and audience intake
- brand voice and tone notes
- founder voice notes
- content pillars
- customer pain point themes
- source workflow setup for calls, meeting notes, Slack summaries, product updates, or manual notes
- starter templates for founder posts, newsletters, product updates, and customer messages
- first production calendar or operating cadence

Best fit:

- teams with a lot of raw knowledge but no repeatable content system
- founders who want to start publishing without rebuilding process from scratch
- startups preparing for a launch, campaign, or consistent customer communication rhythm

Typical cadence:

- one setup sprint
- async intake plus one or two working sessions
- final delivery as a source workflow, messaging map, and reusable templates

Suggested CTA:

```text
Request a setup audit
```

### 2. Monthly Founder Content System

Type: recurring service

Outcome:

The founder has a dependable stream of point-of-view content built from real company context.

Includes:

- recurring source intake from founder notes, calls, demos, updates, or meeting notes
- LinkedIn post drafts
- optional X/thread drafts
- newsletter sections or founder update drafts
- campaign content for launches, hiring, product updates, or customer education
- review and delivery rhythm
- monthly content planning and iteration

Best fit:

- founder-led B2B startups
- companies where trust, expertise, and point of view drive sales
- teams that already have insights but do not publish consistently

Typical cadence:

- weekly or biweekly source intake
- weekly draft delivery
- monthly planning and refresh

Suggested CTA:

```text
Apply for monthly founder content
```

### 3. Customer Communication System

Type: recurring or setup service

Outcome:

Customer-facing updates, release notes, support responses, and education assets become clearer, more consistent, and easier to produce.

Includes:

- customer update framework
- release/update communication templates
- support response templates or macros
- meeting-to-message workflows
- customer pain point extraction
- newsletter or changelog draft support
- tone guidance for support and customer success teams
- recurring review of customer questions and communication gaps

Best fit:

- startups shipping quickly and struggling to explain what changed
- customer success/support teams with repeated questions
- product teams needing better customer education
- founders who want customer updates to sound clear, useful, and consistent

Typical cadence:

- setup sprint or monthly support
- source intake from customer calls, notes, product updates, and support themes
- recurring delivery of customer-facing drafts and templates

Suggested CTA:

```text
Build our customer communication system
```

### 4. Custom Startup Ops Package

Type: custom monthly package

Outcome:

The startup gets a tailored mix of content, communication, source intake, and internal workflow support.

Includes:

- custom source workflows
- founder content
- customer updates
- launch messages
- internal recap-to-output workflows
- support/customer response templates
- campaign or product communication support
- advisory on what source material should become public content, customer messaging, or internal documentation

Best fit:

- startups with multiple communication problems but no dedicated content/customer ops function
- companies preparing for launches, funding, onboarding improvements, or customer education pushes
- teams that need a practical done-for-you partner rather than a fixed template package

Typical cadence:

- scoped monthly retainer
- custom intake and delivery rhythm
- prioritized queue of content and communication assets

Suggested CTA:

```text
Talk through a custom workflow
```

## Public Website Structure

Recommended Phase 6B routes:

- `/agency`
- `/agency/services`
- `/agency/process`
- `/agency/packages`
- `/agency/contact`

Optional later routes:

- `/agency/case-studies`
- `/agency/about`
- `/agency/resources`
- `/agency/thank-you`

Domain note:

- The agency can live under `/agency` in the current repo for MVP.
- A separate agency domain can later point to these routes or to a separate deployment.
- Public route content should be domain-portable and avoid relying on SaaS dashboard context.

## Page Strategy and Copy Blocks

### Agency Home

Page purpose:

Explain the agency offer quickly, identify the right customer, show the core service outcomes, and route visitors to intake/contact.

Hero eyebrow:

```text
Done-for-you startup content and customer communication
```

Hero headline:

```text
Turn calls, meetings, and customer conversations into content your market can actually use.
```

Hero support copy:

```text
We help founder-led startups turn raw company knowledge into LinkedIn posts, newsletters, customer updates, release messages, and support-ready communication assets.
```

Primary CTA:

```text
Start agency intake
```

Secondary CTA:

```text
See service packages
```

Reassurance block:

```text
This is a managed service, not another SaaS login. You send source material, review drafts, and get useful communication assets back.
```

Outcome bullets:

- consistent founder content without starting from a blank page
- customer updates that explain what changed and why it matters
- reusable support and customer-success messaging
- a repeatable source-to-draft workflow for weekly output

Trust/credibility placeholder:

```text
Built from the operating system behind AudioRepurpose, adapted into a private service workflow for startup teams.
```

Phase 6B note:

Use this only as background credibility. Do not make the software the main thing being sold.

### Services Page

Page purpose:

Explain the four core offers and help visitors self-select.

Intro copy:

```text
Most startups do not have a shortage of ideas. They have a conversion problem: calls, demos, Slack threads, and product decisions rarely become clear content or customer communication. Our services turn that raw material into a repeatable output system.
```

Service sections:

1. Content Operations Setup
2. Monthly Founder Content System
3. Customer Communication System
4. Custom Startup Ops Package

CTA copy:

```text
Not sure which service fits? Start with intake and we will recommend the simplest useful path.
```

### Process Page

Page purpose:

Make the service feel practical and low-friction without exposing internal tooling.

Recommended process:

1. Discovery and intake
   - clarify goals, audience, channels, customer context, and current source material
2. Source setup
   - define how calls, notes, updates, Slack summaries, or documents will be shared
3. Brand/context setup
   - document voice, positioning, content pillars, customer pain points, and communication tone
4. Production
   - turn source material into drafts, updates, templates, or communication assets
5. Review and delivery
   - deliver organized drafts for review, edits, copy, export, or handoff
6. Ongoing improvement
   - refine based on feedback, campaign needs, customer questions, and what is working

Process headline:

```text
A simple rhythm for turning internal knowledge into external clarity.
```

Process CTA:

```text
Start with a source audit
```

### Packages Page

Page purpose:

Show service structure without requiring finalized public pricing.

Package card fields:

- outcome
- includes
- cadence
- best fit
- CTA

Package intro:

```text
Choose a starting point based on the communication problem you need solved. Exact scope is finalized after intake so the workflow matches your team, source material, and publishing rhythm.
```

Recommended package CTAs:

- Request a setup audit
- Apply for monthly founder content
- Build our customer communication system
- Talk through a custom workflow

Pricing note:

```text
Packages are scoped after intake. We do not force startup teams into software seats or credit bundles.
```

### Contact/Intake Page

Page purpose:

Collect enough lead context to qualify fit without creating a SaaS account or agency client automatically.

Intro copy:

```text
Tell us what your team is trying to turn into output: calls, customer conversations, meeting notes, product updates, Slack discussions, or founder ideas. We will review fit and recommend the simplest useful service path.
```

Suggested fields for Phase 6E:

- name
- email
- company
- website
- role
- package interest
- timeline
- budget range
- source material available
- biggest communication bottleneck
- message

Success copy:

```text
Thanks. We will review your intake and follow up with the most useful next step.
```

Safety note:

```text
Submitting this form does not create a SaaS account or client portal login.
```

## What Not To Reveal Publicly

Do not expose:

- internal agency console URLs or screenshots
- agency client names or records
- internal production queues
- draft status workflows
- prompt templates or prompt engineering internals
- Slack OAuth/token/channel details
- Granola parser/import details
- internal role names or authorization model
- service-role/API implementation details
- SaaS billing, credits, entitlements, or subscription enforcement

Safe public language:

- "source workflows"
- "meeting notes"
- "Slack discussions"
- "customer conversations"
- "review and delivery rhythm"
- "managed service"
- "communication assets"
- "content system"

Avoid public language:

- "internal agency console"
- "production task schema"
- "client_integrations table"
- "source_imports"
- "encrypted token storage"
- "AI provider abstraction"
- "prompt system"

## Phase 6B Page-Build Plan

Recommended build order:

1. Replace/expand `/agency` with the new broader positioning.
2. Add shared public agency content data for services, packages, and process steps.
3. Add `/agency/services`, `/agency/process`, `/agency/packages`, and `/agency/contact`.
4. Make CTAs point to `/agency/contact` or the future intake route.
5. Remove or de-emphasize public SaaS signup/product CTAs from agency pages.
6. Keep page metadata service-focused.
7. Add tests or static assertions that public agency pages do not link to internal dashboard routes.

Route notes:

- `/agency/contact` can be a placeholder in Phase 6B.
- Full lead storage should wait for Phase 6D.
- The public intake form should wait for Phase 6E.

## Review Results

Review checklist:

- Agency is clearly separate from SaaS: yes.
- Copy sells service outcomes, not internal tooling: yes.
- No internal system details are exposed as public copy: yes. Internal details are listed only as "do not reveal" guidance for builders.
- Offers are concrete enough to build pages: yes.
- No code behavior changed unnecessarily: yes. Documentation and runbook only.
- No SaaS product positioning was overwritten: yes.

## Validation

Run for this phase:

```bash
git diff --check
```

Result:

- passed

Additional direct whitespace scan for the new untracked Phase 6A document:

```bash
rg -n "[ \t]+$" CODEX_PHASE_RUNBOOK.md PHASE_6A_AGENCY_POSITIONING_OFFERS.md
```

Result:

- passed, no trailing whitespace found

TypeScript and lint were not required because Phase 6A changed only Markdown documentation/runbook files.
