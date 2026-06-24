# AudioRepurpose Repo Instructions

## Scope
- This repo is a Next.js App Router application with React, TypeScript, Tailwind, and Framer Motion.
- AudioRepurpose is B2B SaaS/product only.
- Public product marketing pages live under `app/`.
- The main B2B SaaS launch page is `app/page.tsx`.
- The public agency marketing site has been removed from this repo.
- Do not add or restore public agency marketing routes, agency landing pages, agency intake pages, agency pricing pages, or agency marketing screenshot coverage here.
- Private internal agency operations may exist under `/dashboard/agency` and `/api/agency/*`. Treat those as internal operations surfaces only, not public product positioning.
- Legacy public agency lead/event APIs may exist for compatibility. Do not wire new first-party public pages to them unless Lucas explicitly reopens that direction.

## Source Of Truth
- Read `docs/CURRENT_REPO_STATE.md` before using older phase docs or handoff notes.
- `codex-agency-style-pr` contains newer local workspace, organization, subscription, and internal-operations work that GitHub `main` may not contain yet.
- Root-level `PHASE_*.md`, `B2B_AGENCY_PIVOT_PRODUCT_SPEC.md`, and `CODEX_PHASE_RUNBOOK.md` are historical context unless Lucas explicitly says to resume that phase plan.
- If docs conflict with runtime code, inspect the current branch and preserve the branch's actual product boundaries.

## Brand Direction
- The public site should feel premium, modern, sharp, and B2B-focused.
- Avoid generic AI SaaS visuals, cluttered text blocks, cheap gradients, and overly busy layouts.
- Use audio-to-content transformation visuals: waveform, transcript highlights, content cards, publishing calendar, campaign output previews, and dashboard-style product mockups.

## Design Principles
- One clear primary CTA per page.
- Strong visual hierarchy with minimal copy.
- High contrast, generous whitespace, and scannable sections.
- Responsive layouts for mobile, tablet, desktop, and large desktop.
- Animations should explain the product, not decorate randomly.
- Respect `prefers-reduced-motion`.
- Avoid placeholder copy and lorem ipsum.

## Technical Expectations
- Keep components reusable and follow existing repo patterns.
- Use existing `components/ui`, `components/site`, Tailwind conventions, and lucide icons where appropriate.
- Prefer semantic HTML and accessible labels.
- Do not touch backend, database, auth, billing, migrations, API, or infrastructure files during style-only work.
- Preserve existing tracking, form behavior, route boundaries, and public/private separation.

## Screenshot Workflow
- Playwright tests live in `tests/e2e`.
- Marketing screenshots should save to `artifacts/screenshots`.
- Capture changed public pages at 390px, 768px, 1440px, and 1920px widths.
- Review screenshots for overflow, crowding, visual hierarchy, CTA visibility, and responsive behavior.

## Review Checklist
- Hero CTA is visible above the fold.
- The page explains what AudioRepurpose does within 5 seconds.
- Text is scannable and does not crowd the layout.
- Mobile, tablet, desktop, and large desktop layouts are coherent.
- No public page links to agency marketing routes.
- No placeholder content remains.
- GitHub branch, local branch, and docs being used all describe the same target state.
