# Launch Page Product Expansion Plan

Last updated: July 3, 2026

## Goal

Expand the public AudioRepurpose launch surface from one long landing page into a small product marketing system that clearly explains the core B2B SaaS product areas:

- Studio: reusable brand, voice, and campaign context.
- Library: saved drafts, collections, source links, statuses, and reusable assets.
- Analysis: transcript analysis modules, project coaching, topic coverage, goals, and performance analytics.
- Source intake: upload, URL import, integrations, transcript-only mode, and analysis module selection.

The public site must remain product-first. Do not add public agency positioning, agency routes, agency CTAs, or screenshot coverage.

## Source Context

Graphify was used first against the existing `graphify-out/graph.json`. The shell did not have the `graphify` CLI or `networkx` installed, so the graph JSON was traversed directly using the documented fallback approach.

Graph vocabulary terms used: `launch`, `page`, `nav`, `site`, `product`, `products`, `feature`, `features`, `studio`, `library`, `analytics`, `analysis`, `dashboard`, `content`, `campaign`, `brand`, `voice`, `profile`, `source`, `upload`, `transcript`, `workspace`.

Important current files:

- `app/page.tsx`: current single-page public launch page. It defines `NAV_LINKS`, `HeaderNav`, `HeroSection`, `AboutSection`, `HowItWorksSection`, `FeaturesSection`, `PricingSection`, footer columns, and local marketing primitives.
- `components/dashboard/nav.tsx`: authenticated app nav. Workspace contains Upload, All Projects, Studio, and Library. Studio children are Profile, Voice, and Plans. Analytics is a separate nav section.
- `components/dashboard/studio/studio-page-header.tsx`: Studio step model: Profile, Voice, Plans.
- `app/dashboard/studio/profile/page.tsx`: creator profile CRUD, defaults, workspace switching, private/team sharing.
- `app/dashboard/studio/voice/page.tsx`: brand voice CRUD, tone chips, audience, positioning notes, content pillars, writing examples, banned phrases, CTA preferences, duplicate/reset, private/team sharing.
- `app/dashboard/studio/plans/page.tsx`: campaign/content plans, status, dates, brand voice selection, objective, audience, output channels, generation guidance, generated draft counts, team sharing.
- `app/dashboard/library/page.tsx`: content libraries and saved drafts. Includes collections, filters, statuses, source project links, plan links, tags, body/excerpt editing, generation context snapshots, version history, and sharing.
- `app/dashboard/upload/page.tsx`: source intake. Includes local upload, URL import, integrations, transcript-only mode, source history, speaker roster controls, and analysis module selection.
- `lib/analysis-options.ts`: analysis modules: Named speakers, Summary, Insights, Chapters, Takeaways, Quotes.
- `app/dashboard/analytics/page.tsx`: analytics and analysis reporting. Includes project switcher, run/rerun analysis, topic coverage, coaching gaps, missed opportunities, AI spend, content mix, topic intensity, creator coaching, goals, snapshots, and time ranges.
- `tests/e2e/marketing-screenshots.spec.ts`: existing marketing screenshot workflow for `/` and `/contact` at 390, 768, 1440, and 1920 px widths.

## Recommendation: Use `Product`, Not `Products`

Use a top-level nav item named `Product`.

Reason: AudioRepurpose is one product with several capabilities. `Products` suggests multiple SKUs or separate applications. A singular `Product` menu is standard for B2B SaaS and can still contain multiple feature pages.

Recommended public routes:

- `/product` - product overview and hub.
- `/product/studio` - Studio feature page.
- `/product/library` - Library feature page.
- `/product/analysis` - Analysis and analytics feature page.
- `/product/source-intake` - Upload, import, integrations, and transcript intake page.

Alternative if SEO clarity matters more than product hierarchy:

- `/features/studio`
- `/features/library`
- `/features/analysis`
- `/features/source-intake`

For this repo, prefer `/product/...` because it pairs naturally with the nav label and keeps the existing launch-page `#features` anchor from becoming overloaded.

## Navigation Plan

Current launch nav:

- Home
- About Us
- How it works
- Features
- Pricing

Proposed launch nav:

- Product
  - Overview: `/product`
  - Studio: `/product/studio`
  - Library: `/product/library`
  - Analysis: `/product/analysis`
  - Source intake: `/product/source-intake`
- How it works: `/#how-it-works`
- Pricing: `/#pricing`

Optional secondary links:

- About: `/#about`
- Log in: `/auth/login`
- Start free: `#pricing` on home, `/#pricing` on product pages.

Implementation notes:

- Replace the flat `NAV_LINKS` model in `app/page.tsx` with a shared marketing nav model that supports anchors, routes, and dropdown groups.
- Desktop: `Product` should open a compact dropdown with feature labels, one-line descriptions, and icons.
- Mobile: the menu should render `Product` as an expandable group, not a hover-only dropdown.
- Active state must distinguish anchor sections on `/` from route pages under `/product/*`.
- Use `usePathname()` for route active state and keep `useActiveSection()` only for home-page anchors.
- Update footer `Product` links to point to the new route pages.

## Shared Marketing Architecture

The current launch page keeps most marketing components local to `app/page.tsx`. Before adding several pages, extract shared primitives.

Recommended files:

- `components/site/marketing/nav.tsx`
- `components/site/marketing/footer.tsx`
- `components/site/marketing/page-shell.tsx`
- `components/site/marketing/buttons.tsx`
- `components/site/marketing/surface.tsx`
- `components/site/marketing/product-page.tsx`
- `components/site/marketing/product-mockups.tsx`

Keep the current visual direction:

- Premium, sharp B2B SaaS feel.
- Product mockups built from waveform, transcript, library, calendar, topic, and dashboard visuals.
- No generic AI art, lorem ipsum, or agency marketing language.
- Respect `prefers-reduced-motion` through `MotionConfig reducedMotion="user"` and CSS fallbacks.

## Page Plan

### `/product`

Purpose: product overview and route hub.

Core message: AudioRepurpose turns recorded business knowledge into a repeatable content operation.

Sections:

1. Hero: "One content system for every useful recording."
2. Product loop: Source intake -> Analysis -> Studio context -> Draft generation -> Library.
3. Capability cards linking to Studio, Library, Analysis, and Source intake.
4. Workflow proof: show a recording becoming transcript, summary, insights, campaign drafts, and saved library assets.
5. CTA band: Start free / Book a demo.

Visual direction:

- Full-width product-system diagram.
- Keep copy minimal and scannable.
- Use real product terms from the app: Profile, Voice, Plans, Library, Analysis modules, Goals.

### `/product/studio`

Purpose: explain Studio as the reusable context layer that keeps generated content on brand.

Source-backed functionality:

- Profile: brand, website, positioning, audience, content goals, default profile, private/team sharing.
- Voice: tone chips, audience, positioning notes, content pillars, writing examples, banned phrases, CTA preferences, duplicate/reset, sharing.
- Plans: campaign objective, audience, dates, status, selected brand voice, output channels, generation guidance, generated draft counts, shared plans.

Sections:

1. Hero: "Give every draft the context your team already knows."
2. Three-step Studio walkthrough: Profile -> Voice -> Plans.
3. Profile panel mockup: positioning, audience, content goals.
4. Voice panel mockup: tone chips, pillars, examples, banned phrases.
5. Plan panel mockup: campaign objective, channels, generation guidance, link to Library.
6. Team workflow: private vs team-shared assets and workspace selector.
7. CTA: Start free / See pricing.

Copy guardrails:

- Do not call Studio "automation" in a way that implies publishing without review.
- Emphasize reusable context, review-ready generation, and grounded claims.

### `/product/library`

Purpose: show Library as the system of record for generated and manually saved content.

Source-backed functionality:

- Collections and unfiled saved drafts.
- Search and status filtering.
- Saved draft fields: title, type, platform, status, library, plan, source label, published date, tags, excerpt, body.
- Source project linkage.
- Generation context snapshot: profile, voice, plan, generated timestamp.
- Version history exists; restore does not exist yet.
- Team/private sharing and read-only roles.

Sections:

1. Hero: "A home for every useful draft after generation."
2. Library browser mockup: collections, saved drafts, statuses, source/project/plan metadata.
3. Draft detail mockup: body, tags, status, source label, platform, campaign plan.
4. Generation context: show profile, voice, plan, and generated timestamp attached to a saved item.
5. Team review: approved/published statuses and read-only role messaging.
6. CTA: Start free / Explore Studio.

Copy guardrails:

- Do not market "Favorites" until it is implemented.
- Do not claim version restore; say "version history" only.
- Avoid saying Library publishes directly unless that workflow is implemented and verified.

### `/product/analysis`

Purpose: explain both upload-time analysis modules and post-transcription analytics/coaching.

Source-backed functionality:

- Analysis modules: Named speakers, Summary, Insights, Chapters, Takeaways, Quotes.
- Transcript-only mode.
- Run/Rerun Analysis for projects with transcripts.
- Project analytics: topic coverage, coaching gaps, missed opportunities, AI spend.
- Project analysis visuals: content mix and topic intensity.
- Creator coaching, opportunities, goals, snapshots, stale analysis state, time ranges.

Sections:

1. Hero: "Turn every transcript into decisions, coaching, and reusable insight."
2. Module picker mockup: Named speakers, Summary, Insights, Chapters, Takeaways, Quotes.
3. Analysis dashboard mockup: topic coverage, coaching gaps, missed opportunities, AI spend.
4. Topic intensity and content mix: show how one recording maps to themes and output formats.
5. Goals and coaching: show recurring topics/CTAs and improvement opportunities.
6. CTA: Start free / Upload a source.

Naming note:

- Public page can be called "Analysis".
- Internal route is `/dashboard/analytics`; do not confuse public users by making the page only about generic analytics. Lead with transcript analysis and coaching, then show analytics reporting as the measurement layer.

Copy guardrails:

- Do not promise business outcome attribution beyond what the app computes.
- Describe AI spend as usage/cost visibility, not financial accounting.

### `/product/source-intake`

Purpose: show how source material enters AudioRepurpose.

Source-backed functionality:

- Local file upload for audio/video.
- URL import.
- Integrations tab and connected-source import patterns.
- Transcript-only mode.
- Analysis module defaults for queued uploads and URL imports.
- Upload history.
- Advanced controls: expected speaker count, known speaker roster, named speaker auto-fix.

Sections:

1. Hero: "Bring in the conversations your team already has."
2. Source options: file upload, URL import, connected sources.
3. Transcript-only vs analysis modules.
4. Speaker controls: roster and named speaker help for known participants.
5. Upload history and next-step handoff to Analysis, Studio, and Library.
6. CTA: Start free / See how it works.

Copy guardrails:

- Some integrations may be gated by provider setup or app availability. Use wording like "connect supported sources" and avoid implying every provider is universally available.
- Do not expose internal agency source import language.

## Launch Page Changes

Keep `app/page.tsx` as the main conversion page, but make it less responsible for explaining every feature in depth.

Recommended changes:

- Keep the hero message broad: upload once, repurpose everywhere.
- Update nav to the shared `Product` dropdown.
- Add a compact "Explore the product" section after How It Works or before Features with four cards:
  - Studio
  - Library
  - Analysis
  - Source intake
- Convert the existing Features section into a teaser, not the full explanation.
- Add cross-links from feature cards to `/product/*`.
- Update final CTA and footer product links.
- Preserve `#pricing` as the primary signup conversion anchor.

## Implementation Phases

### Phase 1: Marketing Shell and Navigation

- Extract shared marketing shell components from `app/page.tsx`.
- Add route-aware nav with Product dropdown and mobile accordion.
- Update launch page and footer to use shared components.
- Keep visual parity with current launch page.

Acceptance criteria:

- `/` looks the same or better at existing screenshot sizes.
- Product dropdown works with keyboard and mobile touch.
- Anchor links still scroll correctly on `/`.
- No public nav links point to agency routes.

### Phase 2: Product Pages

- Add `app/product/page.tsx`.
- Add `app/product/studio/page.tsx`.
- Add `app/product/library/page.tsx`.
- Add `app/product/analysis/page.tsx`.
- Add `app/product/source-intake/page.tsx`.
- Build mockups as static marketing components; do not call dashboard APIs.

Acceptance criteria:

- Pages use real product terminology and avoid unsupported claims.
- Each page has one primary CTA.
- Each page is coherent on mobile, tablet, desktop, and wide desktop.
- Pages do not require auth and do not import dashboard client logic.

### Phase 3: Launch Page Cross-Linking

- Add product teaser cards to `/`.
- Update Features section copy to point to deeper pages.
- Update footer Product links.
- Confirm launch page still explains what AudioRepurpose does within 5 seconds.

Acceptance criteria:

- Hero CTA remains above the fold.
- Product pages are discoverable from nav and homepage.
- Public pages remain B2B SaaS/product-focused.

### Phase 4: QA and Screenshots

- Update `tests/e2e/marketing-screenshots.spec.ts` to include:
  - `/product`
  - `/product/studio`
  - `/product/library`
  - `/product/analysis`
  - `/product/source-intake`
- Save screenshots to `artifacts/screenshots`.
- Capture 390, 768, 1440, and 1920 px widths.
- Review for overflow, crowding, CTA visibility, nav behavior, and page hierarchy.

Suggested verification:

- `npm run lint`
- `npx playwright test tests/e2e/marketing-screenshots.spec.ts`

## Risks and Decisions

- Route name: recommended `/product/...`. If Lucas prefers the nav label `Products`, use `/products/...` consistently.
- Shared component extraction may touch a large `app/page.tsx` file. Keep Phase 1 focused and avoid unrelated visual redesign.
- Library has visible "Favorites" tab text, but the current code does not implement meaningful tab behavior for it. Do not market Favorites yet.
- Library version restore is explicitly not available yet. Market version history only.
- Analytics has an "Export Report" button in UI, but this plan should not claim export behavior unless implementation is verified.
- Source integrations should be described as supported/connected sources, not guaranteed universal imports.
- Do not touch backend, database, auth, billing, migrations, API, or infrastructure files for this marketing expansion.

## Implementation Checklist

- [ ] Create shared marketing shell components.
- [ ] Replace launch page local nav/footer usage with shared components.
- [ ] Add Product dropdown and mobile accordion.
- [ ] Add `/product` overview page.
- [ ] Add `/product/studio` page.
- [ ] Add `/product/library` page.
- [ ] Add `/product/analysis` page.
- [ ] Add `/product/source-intake` page.
- [ ] Add homepage product teaser cards.
- [ ] Update footer product links.
- [ ] Update marketing screenshot test route list.
- [ ] Run lint.
- [ ] Run Playwright screenshot test.
- [ ] Review generated screenshots at 390, 768, 1440, and 1920 px.

## Content Direction Summary

The public story should be:

1. Bring in useful source material.
2. Generate transcript and optional analysis modules.
3. Use Studio to keep every output aligned with profile, voice, and plan context.
4. Generate review-ready content.
5. Save and organize the best assets in Library.
6. Use Analysis to understand coverage, gaps, opportunities, goals, and performance over time.

This gives the launch page room to convert while the product pages do the heavier explanation work.
