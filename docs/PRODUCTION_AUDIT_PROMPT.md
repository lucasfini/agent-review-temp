# Production Audit Prompt

Use this prompt with Claude when you want a full production-readiness audit of the AudioRepurpose site and app.

## Prompt

```text
You are acting as a principal engineer and production-readiness auditor.

Your job is to perform a COMPLETE production-readiness audit of this repository and tell me exactly what must be fixed before this site is safe and reliable to launch publicly.

This is not just a security review. This is a full-site production audit across product, infrastructure, operations, security, reliability, and user experience.

You must inspect the actual repository and reason from the code, configs, API routes, auth model, billing flows, upload pipeline, storage usage, admin/debug surfaces, landing pages, dashboard UX, and deployment assumptions.

Do not give me generic SaaS advice.
Do not give me a shallow checklist.
Do not give me high-level platitudes.
Ground every finding in what you actually observe in the repo.

## Repo Context
This project is AudioRepurpose, an AI-powered audio repurposing SaaS built with:
- Next.js 16 App Router
- React 19
- TypeScript
- Supabase auth, database, and some storage integrations
- Cloudflare R2 / S3-style signed upload flows
- Stripe billing
- AI providers including Anthropic, OpenAI, AssemblyAI, and Perplexity
- Public marketing site + authenticated dashboard + admin/debug routes
- Audio upload, transcription, speaker attribution, insights, content generation, billing, credits, and operational cleanup flows

Important repo areas likely in scope include:
- `app/page.tsx` and public marketing pages
- `app/auth/*`
- `app/dashboard/*`
- `app/api/*`
- `lib/*`
- `next.config.ts`
- deployment docs / Docker / reverse proxy assumptions
- billing, upload, storage, auth, admin, and internal maintenance endpoints

## Audit Goal
Tell me whether this product is actually ready for production.
If not, identify everything material that blocks or weakens launch readiness.

Audit from the perspective of:
- a real public launch
- paying users
- real file uploads
- real billing
- real abuse attempts
- real operational incidents
- real support burden
- real compliance/privacy expectations
- real browser/device usage
- real SEO / performance expectations for the marketing site

## Required Audit Domains
You must audit ALL of these areas with the same level of detail a senior security reviewer would use for a security section.

### 1. Security
Check and explain risks such as:
- AuthN / AuthZ correctness
- project ownership enforcement
- admin route protection
- internal/maintenance route protection
- debug endpoint exposure
- secrets handling
- bearer token handling
- SSR/auth cookie behavior
- CSRF risk
- XSS risk
- injection risk
- file upload abuse vectors
- signed URL misuse
- webhook verification
- privilege escalation
- rate limiting coverage
- SSRF / URL import risks
- object storage exposure
- public vs private asset handling
- insecure defaults
- missing security headers
- CORS / CSP / clickjacking / MIME-sniffing protections
- demo account restrictions
- unsafe logging of sensitive data
- environment variable misuse
- dependency or package-risk concerns if materially visible

For each issue, explain the actual exploit or failure mode.

### 2. Authentication, Sessions, and Access Control
Audit:
- login/signup/reset/update-password flows
- cookie vs bearer-token auth paths
- route protection consistency
- dashboard page protection
- API route auth consistency
- admin user checks
- account deletion flow
- user preference / profile / avatar flows
- multi-surface auth assumptions between browser and API routes

Call out any inconsistent trust boundaries.

### 3. Billing and Payments
Audit:
- Stripe checkout flow
- session verification
- webhook usage
- credit reservations
- hold/release/settle logic
- duplicate-charge / double-credit risks
- idempotency gaps
- race conditions
- insufficient-balance enforcement
- admin billing tools
- reconciliation logic
- auditability of financial events
- failure recovery when external providers succeed but DB updates fail

Treat this as high-stakes and be extremely concrete.

### 4. Upload, Audio, Storage, and Processing Pipeline
Audit:
- direct upload/init/finalize flow
- file validation
- content type / extension validation
- file size enforcement
- storage key safety
- presigned URL generation and abuse potential
- upload token lifecycle
- orphaned file risk
- cleanup flows
- stale reservation handling
- long-running processing assumptions
- retry/reconciliation behavior
- pipeline consistency between DB state and storage state
- data retention / expiry handling
- potential abuse costs from uploads or AI processing

### 5. AI / Generation / Content Safety
Audit:
- prompt handling
- external provider failure handling
- billing around AI calls
- model selection / personal API key flows
- malformed model output handling
- strict JSON expectations
- content persistence safety
- insight refresh / regeneration flows
- background job assumptions
- prompt injection surfaces from transcripts or imported content
- guardrails against costly repeated runs
- user-visible failure modes

### 6. Product UX and Functional Readiness
Audit whether the product feels launch-ready for real users:
- landing page clarity and conversion readiness
- onboarding clarity
- upload flow usability
- empty states
- loading states
- error recovery
- speaker review UX
- content generation UX
- dashboard consistency
- account/billing/settings clarity
- dangerous actions confirmation quality
- resilience when backend data is partial, stale, or missing

Call out places where users are likely to get confused, stuck, overcharged, or distrust the product.

### 7. Performance and Frontend Quality
Audit:
- public-site rendering quality
- hydration/client-heavy patterns
- bundle risk
- image/video/media strategy
- expensive components
- unnecessary re-renders if obvious
- loading strategy
- network waterfall concerns if visible
- dashboard responsiveness
- large transcript rendering concerns
- upload-page performance
- mobile behavior
- desktop/mobile layout breakpoints
- Core Web Vitals risks if inferable from code

### 8. Accessibility
Audit:
- semantic structure
- keyboard reachability
- focus management
- color contrast concerns visible from code/classes
- screen reader affordances
- form labeling
- dialog accessibility
- dropdown/menu/button semantics
- loading and error announcement concerns
- motion concerns

### 9. SEO and Marketing-Site Production Readiness
Audit:
- metadata quality
- crawlability
- canonical/share metadata if present or missing
- performance implications on the landing page
- public trust signals
- CTA clarity
- pricing clarity
- production polish issues on the public site

### 10. Operations, Observability, and Incident Readiness
Audit:
- error logging strategy
- monitoring gaps
- alerting assumptions
- debug pages in production
- admin observability usefulness
- cron / maintenance protection
- cleanup jobs
- deployment docs realism
- backup/recovery assumptions if inferable
- operational runbook gaps
- what happens when external providers fail
- whether support teams would have enough information to debug user issues

### 11. Data Integrity, Privacy, and Compliance Readiness
Audit:
- PII handling
- transcript/audio retention
- user deletion implications
- storage cleanup
- public URL exposure
- profile/avatar handling
- personal API key handling
- user-generated data retention
- billing/audit log retention expectations
- privacy-policy / terms readiness implied by the product behavior
- whether the app behavior appears aligned with reasonable user expectations

### 12. Testing and Release Confidence
Audit:
- presence and quality of tests
- critical-path coverage gaps
- missing integration or e2e coverage
- risky subsystems without meaningful tests
- launch-blocking flows that appear undertested
- whether the current test setup would give confidence for a production deploy

## Output Format
Return your answer in exactly this structure:

# Production Readiness Verdict
- Overall verdict: Ready / Not ready / Conditionally ready
- Launch recommendation: Blocked / Can launch with caveats / Ready to launch
- Top 5 launch blockers

# Executive Summary
Brief but concrete summary of the biggest issues and what kind of product risk they create.

# Findings By Domain
For each domain above:
- Overall status
- Findings list ordered by severity

For every finding use this exact structure:
- Title
- Severity: Critical / High / Medium / Low
- Why it matters
- Evidence
  - include file paths, route names, functions, or config references
- Failure or attack scenario
- Recommended fix
- Launch impact: Must fix before launch / Should fix soon / Can defer briefly

## Severity Rules
- Critical: exploitable security flaw, billing correctness risk, auth bypass, data exposure, or likely production incident
- High: serious launch risk, operational fragility, harmful UX/billing/data issue, or major missing protection
- Medium: important but not necessarily launch-blocking
- Low: polish, non-blocking hardening, or quality improvements

# Prioritized Production Fix Plan
Group into:
- Phase 0: Must fix before launch
- Phase 1: Fix immediately after launch if not blocking
- Phase 2: Hardening and optimization

For each item:
- objective
- exact area to change
- expected outcome
- acceptance criteria

# Critical Test Plan Before Launch
List the exact manual and automated checks that must pass before launch, especially for:
- auth
- billing
- uploads
- processing pipeline
- data deletion
- speaker review
- AI generation
- admin/internal route protection
- public landing page
- mobile responsiveness

# Quick Wins
List the highest-value improvements that are low effort.

# Open Questions / Assumptions
Only include if truly blocked by missing repo context.

## Additional Instructions
- Be harsh, specific, and practical.
- Prefer concrete repo-grounded observations over theory.
- If something looks suspicious but not fully provable from the code shown, label it as `likely risk` and explain why.
- Call out inconsistent patterns across routes, not just isolated bugs.
- Pay special attention to:
  - admin/debug/internal endpoints
  - billing correctness and idempotency
  - auth boundary consistency
  - upload/storage abuse risks
  - AI cost explosion paths
  - missing headers / browser protections
  - weak operational readiness
  - user trust issues on the public site and dashboard
- Do not stop at security. I want a true production-readiness audit.
```

## Notes

- Best used when Claude has direct repo access.
- Intended for whole-product launch readiness, not just the landing page.
- Output should be audit plus prioritized remediation plan, not only a checklist.
