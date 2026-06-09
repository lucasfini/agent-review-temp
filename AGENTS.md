# AudioRepurpose Website Instructions

## Scope
- This repo is a Next.js App Router application with React, TypeScript, Tailwind, and Framer Motion.
- Public marketing pages live under `app/`.
- The main B2B SaaS launch page is `app/page.tsx`.
- Agency page routes may exist only on feature branches. Verify the active branch and actual route/path before editing agency pages.
- If `/agency` exists, keep it positioned as the managed-service page, not a SaaS signup flow.

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
- No internal dashboard/API links appear on public agency pages.
- No placeholder content remains.
