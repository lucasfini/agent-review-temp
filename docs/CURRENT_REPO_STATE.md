# Current Repo State

Last verified: June 24, 2026.

This document is the first stop for orientation before using older phase notes or archived planning docs.

## Branch Reality

- Local working branch: `codex-agency-style-pr`.
- Remote branch: `origin/codex-agency-style-pr`.
- GitHub `main` is older than this branch and does not fully represent the local workspace/subscription/internal-operations code.
- PR #5, `Stabilize billing and finance flows`, targets GitHub `main` and intentionally works against that older legacy user-credit billing surface.

Before reviewing, patching, or merging work, confirm which branch is the target. Do not assume `main`, this local branch, and existing handoff notes describe the same product state.

## Product Direction

AudioRepurpose is a B2B SaaS product. The public website in this repo is the product marketing surface, centered on `app/page.tsx`.

The public agency marketing site has been removed from this repo. Do not restore public agency landing pages, agency intake pages, agency pricing pages, or agency screenshot coverage here unless Lucas explicitly asks for a new standalone project or a deliberate migration.

## What Exists Locally

The local branch includes:

- B2B SaaS public launch page and auth/dashboard routes.
- Organization and team foundations.
- Subscription plans, entitlement checks, plan credits, product credits, and billing UI.
- Workspace Studio surfaces for profile, brand voice, and plans.
- Content library, campaigns, brand voices, creator profiles, and shared source management.
- Private internal agency operations under `/dashboard/agency` and `/api/agency/*`, gated by internal agency organization membership and permissions.
- Legacy public agency lead/event API routes at `/api/agency-leads` and `/api/agency-funnel-events`. These are not connected to a first-party public agency page in the current product direction and should be treated as paused legacy/compatibility surfaces.

## Documentation Priority

Use docs in this order:

1. `AGENTS.md`
2. `docs/CURRENT_REPO_STATE.md`
3. `README.md`
4. `docs/README.md`
5. Current deployment docs under `docs/DEPLOYMENT.md` and `docs/guides/`
6. Runtime code and tests

Root-level `PHASE_*.md` files, `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`, and `CODEX_PHASE_RUNBOOK.md` are historical implementation context unless Lucas explicitly says to resume that phase plan.

## Practical Rules

- Public product work should stay product-first and B2B SaaS-focused.
- Internal agency code can be maintained only as a private operations surface.
- Do not add public navigation or marketing links to agency routes.
- Do not treat older agency-site docs as current product direction.
- Billing and entitlement changes must be checked against the branch being targeted, because `main` and `codex-agency-style-pr` have materially different billing systems.
