# B2B SaaS + Internal Agency Operating System Product Spec

## 1. Product Vision

This codebase will evolve from a B2C pay-as-you-go AI audio repurposing tool into a shared AI content and customer communication platform that supports two separate business lines:

1. **A public B2B SaaS product** for companies that want to generate and manage content themselves.
2. **A separate service-based agency business** that uses the platform internally to deliver content, customer communication, and integration workflows for clients.

The B2B SaaS and the agency should be publicly separate. They should have separate positioning, separate domains, and separate customer journeys. The customer-facing SaaS product sells software. The agency sells done-for-you service and operational support. The agency customer should not need to know exactly what internal software is being used.

The shared platform should power both businesses behind the scenes through common infrastructure for AI generation, transcription, brand voice, content organization, client management, integrations, usage tracking, and admin controls.

---

## 2. Current Product Summary

The current product is an audio-first AI content repurposing platform. Users can upload or import audio, transcribe it, analyze it, extract insights, and generate written content from it.

Current core capabilities include:

* Audio upload and external import
* Transcription and diarization
* Speaker naming and role classification
* Summary, chapters, takeaways, and quote extraction
* Insight extraction
* Multi-platform content generation
* Narrative coverage analysis
* Usage tracking
* Stripe pay-as-you-go credit purchases
* Admin monitoring tools

The current product is primarily single-user and B2C-oriented. The existing architecture ties most data directly to `user_id`. It does not yet have a complete organization, team, client, campaign, or approval model.

The pivot should preserve the strong existing AI, transcription, content generation, usage, and admin foundation while replacing the single-user/pay-as-you-go model with a multi-tenant subscription and internal agency operating model.

---

## 3. Public Business Separation

### 3.1 B2B SaaS Product

The B2B SaaS product is the main software product.

It should have:

* Its own domain or subdomain
* Its own landing page
* Its own pricing page
* Subscription billing
* Self-serve onboarding
* Organization/team accounts
* A customer-facing dashboard
* Clear SaaS positioning

Customers should understand that they are subscribing to an AI content workspace.

Suggested positioning:

> An AI content workspace for startups and growing teams to turn calls, meetings, audio, ideas, and company knowledge into polished LinkedIn posts, newsletters, founder updates, launch announcements, and campaign content.

### 3.2 Agency Business

The agency is a separate service business, hosted on a different domain.

The agency should be customer-service and operations focused, not just a generic content agency.

The agency sells done-for-you systems and services such as:

* Founder content creation
* LinkedIn content systems
* Newsletter creation
* Customer update workflows
* Customer service communication workflows
* Slack workflow support
* Granola AI meeting-note workflows
* AI-powered content and communication systems
* Internal knowledge-to-content systems
* Startup launch and announcement support

Agency customers should not be asked to log into the SaaS product by default. They are buying a managed service. They may only interact through calls, email, Slack, forms, deliverables, or a future lightweight client portal.

Suggested positioning:

> Done-for-you content and customer communication systems for startups.

Alternative positioning:

> We help startups turn meetings, customer conversations, and internal knowledge into content, customer updates, and support workflows.

### 3.3 Internal Agency Console

The internal agency console is private and used only by Lucas or the agency team.

It should live inside the same core platform but be hidden behind internal roles and access controls.

It should manage:

* Agency clients
* Client profiles
* Client brand voice
* Client integrations
* Slack connection status
* Granola AI imports
* Content requests
* Production queue
* Draft review
* Delivery/export
* Client notes
* Internal tasks
* Recurring content workflows

The agency customer should not see the internal console.

---

## 4. Recommended Architecture

The recommended model is one shared core platform with separated public surfaces.

```text
Shared Core Platform
├── Public B2B SaaS App
├── Private Internal Agency Console
└── Separate Public Agency Marketing Website
```

### 4.1 Why one shared core platform?

A single shared core keeps development efficient and allows the SaaS product and agency workflow to reuse the same AI and content infrastructure.

Shared systems can include:

* Authentication
* Organizations
* Roles and permissions
* AI generation
* Transcription
* Content storage
* Brand voice
* Templates
* Campaigns
* Integrations
* Usage tracking
* Admin tools

### 4.2 What should be separate?

The following should be separate:

* Public brand identity
* Domain names
* Landing pages
* Customer messaging
* Pricing model
* Customer journey
* Navigation visibility
* Access control

### 4.3 Suggested domain structure

Option A: cleaner long-term setup

```text
saasdomain.com                  → B2B SaaS marketing site
app.saasdomain.com              → B2B SaaS app/dashboard
agencydomain.com                → Agency marketing site
internal.saasdomain.com/agency  → Private agency console
```

Option B: simpler MVP setup

```text
saasdomain.com                  → B2B SaaS marketing site and app
agencydomain.com                → Agency marketing site
saasdomain.com/admin/agency     → Private agency console
```

The MVP should prioritize clean access control over perfect domain architecture. A separate agency marketing domain can be launched first, while the internal agency console remains behind admin-only routes in the existing app.

---

## 5. Product Modes

### 5.1 SaaS Mode

SaaS mode is for external B2B customers who subscribe to the software.

Core goals:

* Let companies create an organization workspace
* Let teams add company context and brand voice
* Let users generate content across channels
* Let content be saved, edited, organized, and exported
* Let owners manage billing, seats, and usage

SaaS customers should see only SaaS features.

### 5.2 Internal Agency Mode

Internal agency mode is for Lucas and agency team members.

Core goals:

* Manage clients
* Store client brand/context
* Connect client integrations
* Import client meeting notes and conversations
* Generate content and communication assets
* Track internal production workflows
* Review and approve drafts
* Package and deliver content to clients

Agency mode should be hidden from SaaS customers.

### 5.3 Agency Website Mode

The agency website is public, but it does not expose the internal system.

Core goals:

* Explain agency services
* Sell outcomes, not software
* Capture leads
* Book calls
* Collect intake information
* Present packages or custom service options

---

## 6. Target Customers

### 6.1 B2B SaaS Customers

Primary SaaS customers:

* Startup founders
* Small marketing teams
* B2B SaaS companies
* Consultants and coaches
* Creator-led businesses
* Teams producing regular LinkedIn/newsletter content
* Companies with calls, podcasts, webinars, or meetings they want to repurpose

Main pain points:

* Inconsistent content creation
* Hard to turn ideas into polished posts
* Founder has knowledge but no time to write
* Meeting/call insights are lost
* Content lacks consistent brand voice
* Marketing output is scattered

### 6.2 Agency Customers

Primary agency customers:

* Early-stage startups
* Founder-led companies
* Small teams without marketing ops
* Companies needing customer communication support
* Teams using Slack, meeting notes, and internal knowledge but lacking structured output

Main pain points:

* Customer conversations are not turned into content or insights
* Internal knowledge stays trapped in meetings and Slack
* Founder wants content but does not want to use tools
* Customer updates and newsletters are inconsistent
* Support/customer-service communication is ad hoc
* Team needs done-for-you systems, not another SaaS login

---

## 7. New Business Model

### 7.1 B2B SaaS Subscription Model

The SaaS product should move away from visible pay-as-you-go credits and toward monthly subscription plans.

Potential plans:

#### Starter

* For solo founders or very small teams
* 1 seat
* Limited monthly content generations
* Limited transcription/import minutes
* Basic brand voice
* Basic templates

#### Growth

* For small teams
* 3-5 seats
* Higher generation limits
* Brand voice
* Campaigns
* Content library
* Team collaboration

#### Scale

* For active content teams
* 10-15 seats
* Higher limits
* Approval workflows
* Advanced templates
* Analytics
* Priority processing

#### Enterprise

* Custom pricing
* Custom limits
* SSO later
* Dedicated support
* Custom integrations

### 7.2 Usage and Limits

The existing usage tracking system should be preserved internally, but the customer-facing model should become plan limits and subscription entitlements.

Track:

* Monthly AI generations
* Transcription minutes
* Imported files
* Storage usage
* Seats
* Connected integrations
* AI provider cost

The customer does not need to see “credits” unless overage/top-up pricing is intentionally kept later.

### 7.3 Agency Business Model

The agency should use service packages, not SaaS pricing.

Potential service offers:

#### Content System Setup

One-time setup to define brand voice, content pillars, Slack/Granola workflows, and content templates.

#### Monthly Content Operations

Recurring package that includes a fixed number of posts, newsletters, updates, and review cycles.

#### Customer Communication System

Setup and management of customer update workflows, support-response templates, Slack workflows, and meeting-note-to-action systems.

#### Custom Startup Ops Package

Custom monthly package for startups needing content plus internal communication/integration support.

---

## 8. User Roles and Permissions

### 8.1 Platform Roles

#### Platform Owner/Admin

Usually Lucas.

Can access:

* All organizations
* All users
* Billing overview
* Admin console
* Internal agency console
* Usage/cost analytics
* Maintenance tools
* Feature flags

#### Platform Support/Admin Team

Future role.

Can access:

* Selected admin tools
* Customer support information
* Usage troubleshooting
* Limited billing support

Cannot access:

* Sensitive billing controls unless granted
* Platform owner-only settings

### 8.2 SaaS Organization Roles

#### Organization Owner

Can access:

* Organization settings
* Billing
* Subscription
* Seats/team members
* All organization content
* Brand voice
* Campaigns
* Templates
* Usage

#### Organization Admin

Can access:

* Most workspace settings
* Team content
* Brand voice
* Campaigns
* Templates

Cannot access:

* Billing unless permission is granted

#### Organization Member

Can access:

* Content generation
* Content library
* Assigned campaigns
* Templates allowed by org

Cannot access:

* Billing
* Seat management
* Admin tools

### 8.3 Internal Agency Roles

#### Internal Agency Admin

Can access:

* All agency clients
* All client profiles
* Client integrations
* Production queue
* Team assignments
* Internal review/approval
* Agency analytics

#### Internal Agency Member

Can access:

* Assigned clients
* Assigned campaigns
* Draft creation
* Internal notes
* Production tasks

Cannot access:

* Global platform admin
* Billing controls unless allowed
* Unassigned sensitive clients if restricted

### 8.4 Future Client Reviewer Role

A future version may allow limited client reviewer access.

Can access:

* Specific draft packages
* Specific approval requests
* Comment/approve/reject actions

Cannot access:

* Internal prompts
* AI generation system
* Internal notes
* Other clients
* SaaS dashboard

For MVP, client review can happen outside the system through email, Slack, Notion, Google Docs, or exported content packages.

---

## 9. Core Product Modules

## 9.1 Shared Core Modules

These modules power both SaaS and internal agency operations.

### Authentication

* Supabase Auth remains the base auth provider.
* Existing single-user assumptions need to be expanded into organizations and roles.

### Organizations

* Every SaaS customer belongs to an organization.
* Internal agency operations should also belong to a special internal organization.
* Existing personal users should be migrated into default organizations.

### Brand Voice

Stores reusable voice, tone, audience, writing style, example content, banned phrases, content pillars, and positioning.

Brand voice can belong to:

* A SaaS organization
* An agency client

### Content Generator

Generates content from:

* Audio/transcripts
* Meeting notes
* Manual briefs
* Slack conversations
* Granola AI notes
* Existing company context
* Campaign briefs

Output types:

* LinkedIn post
* X/Twitter thread
* Newsletter
* Blog outline
* Founder update
* Launch announcement
* Customer update
* Support/customer-service response templates
* Email drafts

### Content Library

Stores generated and edited content.

Should support:

* Search
* Filter by type/channel/status
* Version history
* Associated campaign
* Associated client
* Approval status
* Export/copy

### Campaigns

Groups content around a goal.

Examples:

* Product launch
* Weekly founder content
* Monthly newsletter
* Customer education series
* Investor update series
* New feature announcement

### Templates

Reusable AI instructions and output formats.

Examples:

* Founder LinkedIn post
* Customer newsletter
* Product launch announcement
* Customer support macro
* Meeting recap to content batch

### Usage Tracking

Tracks actual usage for internal accounting and subscription enforcement.

Should be organization-scoped.

### Admin Console

Platform-level monitoring and control.

---

## 9.2 B2B SaaS Modules

### SaaS Dashboard

Purpose:

* Show recent content
* Show usage
* Show active campaigns
* Show quick actions

Required sections:

* Generate content
* Recent outputs
* Campaigns
* Brand voice status
* Usage summary

### Organization Settings

Purpose:

* Manage company profile
* Manage team
* Manage billing
* Manage workspace preferences

### Brand Voice Setup

Purpose:

* Capture company style and positioning
* Improve AI output quality

Inputs:

* Company name
* Website
* Industry
* Audience
* Tone
* Writing examples
* Content pillars
* Banned topics/phrases
* Preferred CTA style

### Content Generator

Purpose:

* Generate channel-specific content

Inputs:

* Source type: transcript, idea, meeting notes, URL/import, manual brief
* Channel
* Goal
* Audience
* Tone
* Brand voice
* Campaign

### Content Library

Purpose:

* Store and manage generated content

Statuses:

* Draft
* Edited
* Approved
* Published manually
* Archived

### Billing

Purpose:

* Manage subscription
* Seats
* Usage
* Plan upgrades

---

## 9.3 Internal Agency Console Modules

### Agency Home

Purpose:

* Show internal workload
* Show clients needing attention
* Show drafts awaiting review
* Show upcoming deliverables

### Clients

Purpose:

* Manage agency clients

Fields:

* Name
* Website
* Industry
* Primary contact
* Slack workspace status
* Granola AI status
* Retainer/package
* Notes
* Status

### Client Profile

Purpose:

* Store strategic context

Fields:

* Business overview
* ICP
* Offers/products
* Positioning
* Competitors
* Founder voice
* Customer pain points
* Content pillars
* Customer service tone

### Client Integrations

Purpose:

* Track and manage client integration connections

Initial integrations:

* Slack
* Granola AI

Future integrations:

* Google Drive
* Notion
* HubSpot
* Intercom
* Zendesk
* Gmail
* Calendar

### Production Queue

Purpose:

* Manage internal work

Views:

* To generate
* In draft
* Needs review
* Needs revision
* Ready to deliver
* Delivered

### Client Campaigns

Purpose:

* Organize content by initiative

Examples:

* Weekly founder content
* Monthly customer newsletter
* Product launch
* Support knowledge base updates
* Customer success stories

### Draft Review

Purpose:

* Internal QA before sending to clients

Checks:

* Brand voice match
* Accuracy
* No unsupported claims
* Good CTA
* Correct channel format
* Customer-service tone if relevant

### Delivery / Export

Purpose:

* Package content for delivery

MVP delivery can be:

* Copy to clipboard
* Markdown export
* CSV export
* Google Doc later
* Slack message draft later
* Email package later

---

## 10. Integrations Roadmap

## 10.1 Slack Integration

### Agency Use Case

The agency can connect to a client’s Slack workspace or specific channels to understand customer questions, product updates, team discussions, and content opportunities.

Potential capabilities:

* Import selected channel messages
* Summarize customer themes
* Identify repeated support questions
* Generate customer update ideas
* Generate support-response templates
* Generate content ideas from team discussions

### SaaS Use Case

SaaS customers may connect Slack themselves to generate content from internal discussions.

### MVP Scope

For the MVP, Slack can start as an agency-only integration.

Initial features:

* Store Slack connection status
* Import manually selected messages or channels
* Generate summaries and content ideas
* Associate imports with a client/campaign

## 10.2 Granola AI Integration

### Agency Use Case

Granola AI notes can provide meeting context from client calls, sales calls, support calls, customer interviews, and founder discussions.

Potential capabilities:

* Import meeting notes
* Extract customer pain points
* Generate LinkedIn posts from meetings
* Generate newsletters from weekly calls
* Generate customer follow-up drafts
* Generate internal action summaries

### MVP Scope

If Granola does not provide a direct API or the integration is limited, MVP can support:

* Manual paste/import of Granola notes
* File upload/import
* Email forwarding later
* API integration later if available

### Data Model Needs

Create a general `source_imports` or `client_sources` table that can store imported content from:

* Audio uploads
* Transcripts
* Slack messages
* Granola notes
* Manual briefs
* Documents
* URLs

This avoids building every integration as a totally separate workflow.

---

## 11. Database Schema Plan

## 11.1 New Core Tables

### organizations

Purpose: Represents a SaaS customer organization or the internal agency organization.

Fields:

* `id`
* `name`
* `slug`
* `type` enum: `saas_customer`, `internal_agency`, `personal_legacy`
* `owner_user_id`
* `created_at`
* `updated_at`

### organization_members

Purpose: Users belonging to organizations.

Fields:

* `id`
* `organization_id`
* `user_id`
* `role` enum: `owner`, `admin`, `member`, `agency_admin`, `agency_member`
* `status` enum: `active`, `invited`, `removed`
* `invited_by`
* `created_at`
* `joined_at`

### subscriptions

Purpose: Subscription records for SaaS organizations.

Fields:

* `id`
* `organization_id`
* `stripe_customer_id`
* `stripe_subscription_id`
* `plan_id`
* `status`
* `current_period_start`
* `current_period_end`
* `cancel_at_period_end`
* `created_at`
* `updated_at`

### plans

Purpose: Plan catalog and entitlements.

Fields:

* `id`
* `name`
* `slug`
* `stripe_price_id`
* `monthly_price_cents`
* `seat_limit`
* `generation_limit`
* `transcription_minute_limit`
* `integration_limit`
* `features_json`
* `is_active`

### usage_counters

Purpose: Monthly usage counters by organization.

Fields:

* `id`
* `organization_id`
* `period_start`
* `period_end`
* `ai_generations_used`
* `transcription_minutes_used`
* `storage_bytes_used`
* `imports_used`
* `estimated_ai_cost_cents`

### brand_voices

Purpose: Stores brand voice and writing rules.

Fields:

* `id`
* `organization_id`
* `client_id` nullable
* `name`
* `description`
* `tone`
* `audience`
* `content_pillars_json`
* `writing_examples_json`
* `banned_phrases_json`
* `cta_preferences`
* `created_by`
* `created_at`
* `updated_at`

### campaigns

Purpose: Groups content around goals.

Fields:

* `id`
* `organization_id`
* `client_id` nullable
* `name`
* `goal`
* `description`
* `status`
* `start_date`
* `end_date`
* `created_by`
* `created_at`
* `updated_at`

### content_items

Purpose: Unified future content model. This can wrap or gradually replace `outputs`.

Fields:

* `id`
* `organization_id`
* `client_id` nullable
* `campaign_id` nullable
* `project_id` nullable
* `source_import_id` nullable
* `title`
* `content_type`
* `channel`
* `body`
* `status`
* `approval_status`
* `version`
* `parent_content_item_id` nullable
* `created_by`
* `assigned_to` nullable
* `created_at`
* `updated_at`

### prompt_templates

Purpose: Reusable AI templates.

Fields:

* `id`
* `organization_id` nullable
* `client_id` nullable
* `name`
* `content_type`
* `channel`
* `template_body`
* `variables_json`
* `version`
* `is_system`
* `created_by`
* `created_at`
* `updated_at`

### ai_generation_runs

Purpose: Immutable log of AI requests and outputs.

Fields:

* `id`
* `organization_id`
* `client_id` nullable
* `campaign_id` nullable
* `content_item_id` nullable
* `prompt_template_id` nullable
* `model_provider`
* `model_name`
* `prompt_version_hash`
* `input_summary`
* `tokens_in`
* `tokens_out`
* `estimated_cost_cents`
* `status`
* `error_message`
* `created_by`
* `created_at`

## 11.2 Agency Tables

### agency_clients

Purpose: Clients managed by the internal agency.

Fields:

* `id`
* `organization_id` references internal agency organization
* `name`
* `website`
* `industry`
* `primary_contact_name`
* `primary_contact_email`
* `package_type`
* `status`
* `notes`
* `created_at`
* `updated_at`

### client_integrations

Purpose: Tracks client integration connections.

Fields:

* `id`
* `client_id`
* `provider` enum: `slack`, `granola`, `manual`, `other`
* `status`
* `metadata_json`
* `connected_at`
* `last_sync_at`
* `created_at`
* `updated_at`

### source_imports

Purpose: Stores imported source material from any input channel.

Fields:

* `id`
* `organization_id`
* `client_id` nullable
* `campaign_id` nullable
* `provider` enum: `audio_upload`, `transcript`, `slack`, `granola`, `manual_note`, `url`, `document`
* `source_title`
* `source_url` nullable
* `raw_text`
* `summary`
* `metadata_json`
* `imported_by`
* `created_at`

### production_tasks

Purpose: Internal agency task tracking.

Fields:

* `id`
* `client_id`
* `campaign_id` nullable
* `content_item_id` nullable
* `title`
* `description`
* `status`
* `priority`
* `assigned_to`
* `due_date`
* `created_by`
* `created_at`
* `updated_at`

### approval_requests

Purpose: Internal or future external approval workflow.

Fields:

* `id`
* `content_item_id`
* `requested_by`
* `reviewer_user_id` nullable
* `reviewer_email` nullable
* `status` enum: `pending`, `approved`, `changes_requested`, `rejected`
* `comments`
* `created_at`
* `decided_at`

## 11.3 Existing Table Modifications

### projects

Add:

* `organization_id`
* `client_id` nullable
* `campaign_id` nullable
* `source_import_id` nullable

### outputs

Add:

* `organization_id`
* `client_id` nullable
* `campaign_id` nullable
* `content_item_id` nullable
* `approval_status`
* `version`
* `parent_output_id` nullable

### usage_events

Add:

* `organization_id`
* `subscription_period_key`

### billing_reservations

Add:

* `organization_id`
* `subscription_period_key`

---

## 12. API / Backend Plan

## 12.1 Auth and Authorization

Create:

* `lib/authz/permissions.ts`
* `lib/authz/require-org-access.ts`
* `lib/authz/require-platform-admin.ts`
* `lib/authz/require-agency-access.ts`

Replace user-only checks with organization-aware access checks.

Current pattern to move away from:

```text
project.user_id === user.id
```

Future pattern:

```text
user has permission for project.organization_id
```

## 12.2 New API Routes

### Organizations

* `GET /api/organizations`
* `POST /api/organizations`
* `GET /api/organizations/:id`
* `PATCH /api/organizations/:id`

### Organization Members

* `GET /api/organizations/:id/members`
* `POST /api/organizations/:id/members/invite`
* `PATCH /api/organizations/:id/members/:memberId`
* `DELETE /api/organizations/:id/members/:memberId`

### Subscriptions

* `POST /api/subscriptions/checkout`
* `GET /api/subscriptions/current`
* `POST /api/subscriptions/portal`

### Brand Voices

* `GET /api/brand-voices`
* `POST /api/brand-voices`
* `GET /api/brand-voices/:id`
* `PATCH /api/brand-voices/:id`
* `DELETE /api/brand-voices/:id`

### Campaigns

* `GET /api/campaigns`
* `POST /api/campaigns`
* `GET /api/campaigns/:id`
* `PATCH /api/campaigns/:id`
* `DELETE /api/campaigns/:id`

### Content Items

* `GET /api/content-items`
* `POST /api/content-items`
* `GET /api/content-items/:id`
* `PATCH /api/content-items/:id`
* `DELETE /api/content-items/:id`
* `POST /api/content-items/:id/regenerate`
* `POST /api/content-items/:id/approve`

### Agency Clients

* `GET /api/agency/clients`
* `POST /api/agency/clients`
* `GET /api/agency/clients/:id`
* `PATCH /api/agency/clients/:id`
* `DELETE /api/agency/clients/:id`

### Agency Integrations

* `GET /api/agency/clients/:id/integrations`
* `POST /api/agency/clients/:id/integrations/slack/connect`
* `POST /api/agency/clients/:id/integrations/granola/import`

### Source Imports

* `GET /api/source-imports`
* `POST /api/source-imports`
* `GET /api/source-imports/:id`
* `POST /api/source-imports/:id/generate`

### Production Tasks

* `GET /api/agency/production-tasks`
* `POST /api/agency/production-tasks`
* `PATCH /api/agency/production-tasks/:id`

## 12.3 Refactor Existing APIs

Existing project and generation APIs should be updated to accept and enforce:

* `organization_id`
* `client_id` when agency/internal
* `campaign_id` when relevant
* subscription entitlements
* usage counters

Important existing areas to refactor:

* Stripe checkout and webhook routes
* Billing balance/usage routes
* Project CRUD routes
* Upload init/finalize routes
* Transcription route
* Generate content routes
* Dashboard project routes
* Admin routes

---

## 13. Stripe Subscription Plan

## 13.1 Replace Primary Checkout Flow

The current product uses one-time Stripe checkout for credit packs. The new SaaS product should use subscription checkout.

Create or update:

* `POST /api/subscriptions/checkout`
* `POST /api/subscriptions/portal`
* Stripe webhook handlers for subscription lifecycle events

Webhook events to support:

* `checkout.session.completed`
* `customer.subscription.created`
* `customer.subscription.updated`
* `customer.subscription.deleted`
* `invoice.paid`
* `invoice.payment_failed`

## 13.2 Entitlement Enforcement

Before expensive actions, check:

* Active subscription status
* Plan generation limit
* Plan transcription limit
* Seat limit
* Integration limit
* Feature access

Expensive actions include:

* Transcription
* AI generation
* Batch generation
* Slack imports
* Large Granola imports

## 13.3 Credit Ledger Future

The existing credit ledger can be kept internally for:

* AI cost accounting
* usage reporting
* overage support
* abuse detection

But user-facing UX should say:

* Plan usage
* Monthly limit
* Current usage
* Upgrade options

Not:

* Buy credits
* Credit balance
* Credit packages

---

## 14. AI Prompt System

## 14.1 Current Issue

Current prompt logic is split between hardcoded strings, config files, and route logic. The generation route is too monolithic for the future product.

## 14.2 Future Prompt Architecture

Use layered prompt composition.

Prompt layers:

1. System core rules
2. Organization profile
3. Client profile if agency mode
4. Brand voice
5. Campaign brief
6. Source material
7. Channel-specific format
8. Output instructions
9. Safety/quality guardrails

Example composition:

```text
SYSTEM_CORE
+ ORG_CONTEXT
+ CLIENT_CONTEXT
+ BRAND_VOICE
+ CAMPAIGN_CONTEXT
+ SOURCE_IMPORT
+ CHANNEL_TEMPLATE
+ TASK_INSTRUCTIONS
+ QUALITY_CHECKS
```

## 14.3 Required AI Features

### For SaaS

* Generate from idea
* Generate from transcript/audio
* Generate from meeting notes
* Generate LinkedIn posts
* Generate X/Twitter posts
* Generate newsletters
* Generate launch announcements
* Generate founder updates
* Regenerate with tone controls
* Save to content library

### For Agency

* Generate from client notes
* Generate from Slack import
* Generate from Granola notes
* Generate batch content packages
* Generate customer-service responses
* Generate internal client insights
* Generate newsletter drafts
* Generate founder content in client voice
* Run QA checks before delivery

## 14.4 AI Quality Controls

Add checks for:

* Brand voice match
* Unsupported claims
* Repetition
* CTA quality
* Channel formatting
* Customer-service tone
* Client-specific banned topics
* Compliance-sensitive phrasing if relevant

---

## 15. UX and Navigation

## 15.1 SaaS Navigation

Suggested SaaS nav:

* Home / Dashboard
* Generate
* Content Library
* Campaigns
* Brand Voice
* Templates
* Analytics
* Team
* Billing
* Settings

## 15.2 Internal Agency Navigation

Suggested internal agency nav:

* Agency Home
* Clients
* Production Queue
* Campaigns
* Source Imports
* Content Drafts
* Approvals
* Integrations
* Templates
* Analytics
* Settings

## 15.3 Platform Admin Navigation

Suggested admin nav:

* Overview
* Users
* Organizations
* Subscriptions
* Usage
* Costs
* Admin Logs
* Maintenance
* Feature Flags
* Agency Console

---

## 16. Page-by-Page Requirements

## 16.1 SaaS Pages

### `/`

Public SaaS landing page.

Should position product as B2B AI content workspace.

### `/pricing`

Subscription pricing page.

Should show Starter, Growth, Scale, Enterprise.

### `/auth/signup`

Signup flow.

After signup, create or join organization.

### `/dashboard`

Main SaaS dashboard.

Shows quick generate, recent content, active campaigns, usage.

### `/dashboard/generate`

Content generation workspace.

Inputs:

* Source type
* Channel
* Goal
* Campaign
* Brand voice

### `/dashboard/content`

Content library.

### `/dashboard/campaigns`

Campaign list and campaign details.

### `/dashboard/brand-voice`

Brand voice setup and editing.

### `/dashboard/templates`

Reusable templates.

### `/dashboard/billing`

Subscription and usage management.

### `/dashboard/team`

Seats and members.

## 16.2 Internal Agency Pages

### `/admin/agency`

Agency overview dashboard.

### `/admin/agency/clients`

Client list.

### `/admin/agency/clients/:id`

Client profile.

### `/admin/agency/clients/:id/integrations`

Client integration status and setup.

### `/admin/agency/clients/:id/campaigns`

Client campaigns.

### `/admin/agency/production`

Production queue.

### `/admin/agency/imports`

Source imports from audio, Slack, Granola, notes.

### `/admin/agency/drafts`

Draft content review.

### `/admin/agency/approvals`

Internal approval queue.

## 16.3 Agency Marketing Website Pages

These may be in the same repo or separate later.

Suggested pages:

* Home
* Services
* Process
* Case Studies
* Pricing / Packages
* Book a Call
* Intake Form

The agency website should not reveal the internal platform in detail.

---

## 17. Security Fixes Required Before Launch

Before the B2B pivot goes live, address known security risks from the audit.

Required fixes:

* Ensure all write routes require authenticated users.
* Remove routes that trust `userId` from request body.
* Add auth to project cleanup/cache routes.
* Fix unauthenticated content-writing routes.
* Move from email allowlist admin model to database-backed roles.
* Add organization-aware row-level checks.
* Ensure all project/output/content access is scoped by organization.
* Audit all internal endpoints.
* Add admin audit logs for sensitive actions.

---

## 18. Implementation Roadmap

## Phase 0: Product Spec and Planning

Goal: Lock the product architecture and implementation plan.

Tasks:

* Create this master product spec
* Confirm SaaS and agency separation
* Confirm pricing model
* Confirm MVP module list
* Confirm integration priorities
* Confirm domain strategy

Acceptance criteria:

* Product spec exists in repo
* Codex can use it as source of truth
* No product code changed yet

## Phase 1: Multi-Tenant Foundation

Goal: Move from single-user ownership to organization-aware access.

Tasks:

* Create organization schema
* Create organization member schema
* Create role/permission helper files
* Add `organization_id` to core tables
* Backfill existing users into default organizations
* Update project access checks
* Update dashboard queries
* Add organization switcher if needed

Acceptance criteria:

* Each user has at least one organization
* Projects belong to organizations
* API routes enforce organization access
* Existing users still work

## Phase 2: Subscription Billing

Goal: Replace pay-as-you-go credit UX with subscription billing.

Tasks:

* Create plans table
* Create subscriptions table
* Add Stripe subscription checkout
* Add Stripe customer portal
* Add subscription webhooks
* Build usage/entitlement checks
* Replace billing UI
* Hide/remove credit package UI

Acceptance criteria:

* Organization can subscribe to a plan
* Webhook updates subscription status
* Generation/transcription checks subscription limits
* Customer sees plan usage, not credits

## Phase 3: SaaS Core Product

Goal: Ship the public B2B SaaS MVP.

Tasks:

* Redesign landing page for B2B
* Build SaaS dashboard
* Build brand voice setup
* Build content generator page
* Build content library
* Build campaigns
* Build templates
* Add usage summary

Acceptance criteria:

* Customer can sign up, create org, subscribe, set brand voice, generate content, save outputs, and manage usage.

## Phase 4: Internal Agency Console

Goal: Build private internal tools for service delivery.

Tasks:

* Create internal agency org
* Build agency client schema
* Build clients UI
* Build client profile UI
* Build source imports
* Build production queue
* Build draft review flow
* Build basic delivery/export

Acceptance criteria:

* Lucas/team can create clients, store context, generate content, review drafts, and track delivery internally.

## Phase 5: Slack and Granola Workflows

Goal: Add integration-powered agency workflows.

Tasks:

* Add client integrations table
* Add Slack connection tracking
* Add Slack import workflow
* Add Granola manual import workflow
* Generate content/customer insights from imports
* Associate imports with clients and campaigns

Acceptance criteria:

* Agency can import source material from Slack/manual Granola notes and generate usable client content.

## Phase 6: Agency Marketing Site

Goal: Launch separate public agency brand.

Tasks:

* Create agency domain/landing page
* Write service positioning
* Add service packages
* Add intake form
* Add book-a-call CTA
* Add lead capture route

Acceptance criteria:

* Agency website is publicly separate from SaaS product
* Leads can submit inquiries
* The site sells services, not software

## Phase 7: Polish and Launch

Goal: Harden product for real users.

Tasks:

* Security audit
* QA all auth and billing flows
* Improve onboarding
* Add empty states
* Add loading/error states
* Add admin monitoring
* Add analytics
* Add documentation

Acceptance criteria:

* Product is ready for early B2B customers and internal agency operations.

---

## 19. Codex Build Prompt Strategy

Do not ask Codex to implement the entire pivot at once.

Use this spec as the source of truth and assign one phase at a time.

General Codex instruction format:

```text
Read B2B_AGENCY_PIVOT_PRODUCT_SPEC.md first.
Implement only Phase X.
Do not implement future phases.
Preserve existing functionality unless explicitly instructed.
List all files changed.
Explain migration steps.
Add tests or validation where appropriate.
Stop and report blockers if schema assumptions are unclear.
```

## 19.1 Codex Prompt: Phase 1 Foundation

```text
Read B2B_AGENCY_PIVOT_PRODUCT_SPEC.md.

Implement Phase 1: Multi-Tenant Foundation.

Goals:
- Add organization and organization member support.
- Add organization-aware access helpers.
- Add organization_id to core project/content/billing usage tables where needed.
- Backfill existing users into default organizations.
- Preserve existing user flows.

Do not implement subscription billing, SaaS redesign, agency clients, Slack, or Granola yet.

Tasks:
1. Inspect current Supabase migrations and schema assumptions.
2. Create a new migration for organizations and organization_members.
3. Add organization_id to projects and other minimum required tables.
4. Create authz helper files.
5. Update project access APIs to check organization membership.
6. Update dashboard queries so existing users still see their projects.
7. Add a safe backfill strategy for existing users and projects.
8. Document all changed files and migration instructions.

Acceptance criteria:
- Existing users can still access their content.
- Each project belongs to an organization.
- Unauthorized users cannot access another organization’s projects.
- The app builds without TypeScript errors.
```

## 19.2 Codex Prompt: Phase 2 Subscription Billing

```text
Read B2B_AGENCY_PIVOT_PRODUCT_SPEC.md.

Implement Phase 2: Subscription Billing.

Goals:
- Replace user-facing credit packages with organization subscription plans.
- Use Stripe subscription checkout.
- Add subscription records and entitlement checks.
- Preserve existing usage tracking internally.

Do not build agency clients, Slack, Granola, or advanced content workflows yet.

Tasks:
1. Add plans and subscriptions schema.
2. Add organization-level subscription checkout.
3. Add Stripe customer portal route.
4. Update Stripe webhook handling for subscription lifecycle events.
5. Add entitlement checking helpers.
6. Update generation/transcription/upload guards to check plan limits.
7. Replace billing UI from credits to plan/usage/subscription status.
8. Keep credit ledger only as internal accounting if needed.
9. Document setup for Stripe products/prices and env vars.

Acceptance criteria:
- Organization owners can subscribe.
- Subscription status syncs from Stripe webhooks.
- Expensive actions are blocked or limited when subscription is inactive or usage limit is reached.
- Credit packages are no longer the primary customer-facing billing model.
```

## 19.3 Codex Prompt: Phase 3 SaaS MVP

```text
Read B2B_AGENCY_PIVOT_PRODUCT_SPEC.md.

Implement Phase 3: SaaS Core Product.

Goals:
- Build the customer-facing B2B SaaS MVP.
- Add brand voice, campaigns, content generator, and content library around the new organization model.

Do not build agency console, Slack, or Granola yet.

Tasks:
1. Update public landing page positioning for B2B SaaS.
2. Create or update dashboard navigation.
3. Build brand voice CRUD.
4. Build campaign CRUD.
5. Build organization-aware content generator UI.
6. Build content library UI.
7. Save generated outputs as organization-scoped content items.
8. Add basic template support if feasible.
9. Ensure all routes respect roles and organization access.

Acceptance criteria:
- A subscribed organization can set brand voice, create a campaign, generate content, and save/view content in a library.
```

## 19.4 Codex Prompt: Phase 4 Internal Agency Console

```text
Read B2B_AGENCY_PIVOT_PRODUCT_SPEC.md.

Implement Phase 4: Internal Agency Console.

Goals:
- Build private internal agency tools for Lucas/team.
- Keep this hidden from normal SaaS customers.

Tasks:
1. Add agency_clients schema.
2. Add source_imports schema if not already present.
3. Add production_tasks schema.
4. Add internal agency routes under /admin/agency or another clearly private path.
5. Build clients list and client detail pages.
6. Build client brand/context fields.
7. Build production queue.
8. Build draft review workflow using existing generation/content systems.
9. Enforce agency-only permissions.

Acceptance criteria:
- Internal agency users can create clients, store client context, create/import source material, generate drafts, and track production status.
- SaaS customers cannot access agency routes or APIs.
```

## 19.5 Codex Prompt: Phase 5 Integrations

```text
Read B2B_AGENCY_PIVOT_PRODUCT_SPEC.md.

Implement Phase 5: Slack and Granola Workflows.

Goals:
- Add initial integration workflows for internal agency operations.
- Start with safe MVP behavior.

Tasks:
1. Add client_integrations table if not already present.
2. Add Slack integration status and import workflow.
3. Add Granola manual import workflow for pasted notes or uploaded notes.
4. Store imported material in source_imports.
5. Allow generating content from source_imports.
6. Associate imports with clients and campaigns.
7. Add permissions so only internal agency users can use agency integrations at first.

Acceptance criteria:
- Agency users can import Slack/manual Granola source material, attach it to a client/campaign, and generate content from it.
```

---

## 20. MVP Priority Recommendation

The fastest path to a polished and useful product is:

1. Build multi-tenant foundation.
2. Add subscription billing.
3. Launch B2B SaaS MVP around brand voice + content generation + content library.
4. Build private internal agency console.
5. Add Slack and Granola workflows for agency operations.
6. Launch the separate agency marketing site.

Do not start with the agency website or integrations before the core organization, auth, and billing foundation is stable.

---

## 21. Final Product Definition

The final product ecosystem should be:

### B2B SaaS Product

A self-serve AI content workspace for B2B teams to generate, organize, and manage polished content from calls, meetings, audio, notes, and company knowledge.

### Agency Business

A separate done-for-you customer communication and content operations agency for startups.

### Internal Agency Console

A private operating system used by the agency team to manage clients, integrations, source material, production workflows, drafts, and delivery.

### Shared Core Platform

The technical foundation powering both the SaaS product and the internal agency operation.
