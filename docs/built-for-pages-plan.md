# Built For Pages Plan

Last updated: July 9, 2026

## July 9 Content Uniqueness Audit

Repeated copy found:
- The shared page structure is intentionally reused: centered hero, key features, problem/pain cards, benefits, workflow, outputs, source-backed section, collaboration/FAQ, final CTA, and footer.
- CTA button labels are intentionally consistent where the site already uses the pattern: "Sign up for free", "View pricing", and "Book a demo".
- The source-backed concept is intentionally repeated because it is core product positioning, but each audience should explain a different source, reviewer, and output context.
- "Key features" remains a repeated eyebrow, but the section titles and card copy should stay audience-specific.

Copy that needed more audience-specific treatment:
- Workflow steps were too close to the generic "upload, extract, draft, save" pattern.
- The cross-team card used the same "Source-backed work often crosses teams" message on every page.
- The final CTA right-side checklist used the same Source / Signal / Draft / Review sequence on every page.
- Several FAQs answered product-level questions instead of audience-specific concerns.
- Full-height section defaults created more vertical whitespace than these detail pages need after the hero.

Sections already sufficiently unique:
- Hero audience titles and subheadlines.
- Feature cards and output examples.
- Most pain/problem and benefits sections.
- Source-backed section titles and checks, with the source-backed framing intentionally preserved.

Implementation decisions:
- Preserve the shared layout and visual rhythm.
- Store collaboration copy and final CTA steps in `components/site/builtForContent.ts` so the template stays reusable.
- Keep claims grounded in existing source intake, analysis, Studio, Library, and supported content-output messaging.
- Avoid unsupported CRM, help desk, auto-publishing, renewal-management, client portal, finished deck generation, and video clip-editing claims.

## Existing Pages Discovered

Public product marketing routes:
- `/` -> `app/page.tsx`
- `/product` -> `app/product/page.tsx`
- `/product/studio` -> `app/product/studio/page.tsx`
- `/product/library` -> `app/product/library/page.tsx`
- `/product/analysis` -> `app/product/analysis/page.tsx`
- `/product/source-intake` -> `app/product/source-intake/page.tsx`
- `/pricing` -> `app/pricing/page.tsx`
- `/whats-new` -> `app/whats-new/page.tsx`
- `/built-for` -> `app/built-for/page.tsx`
- `/built-for/[slug]` -> `app/built-for/[slug]/page.tsx`
- `/contact`, `/privacy`, `/terms`

Existing Built For audiences already present in route data, nav, screenshot tests, and E2E tests:
- Marketing teams -> `/built-for/marketing-teams`
- Founders -> `/built-for/founders`
- Sales teams -> `/built-for/sales-teams`
- Customer success -> `/built-for/customer-success`
- Product marketers -> `/built-for/product-marketers`
- Consultants -> `/built-for/consultants`
- Creators -> `/built-for/creators`

Current source files relevant to this work:
- `components/site/BuiltForMarketingPage.tsx`: current Built For index, detail template, and audience copy.
- `components/site/builtForRouteData.ts`: current lightweight route data used by metadata and static params.
- `components/site/marketing.tsx`: shared marketing shell, nav, footer, buttons, cards, section primitives, nav links, theme tokens.
- `components/site/ProductMarketingPage.tsx`: strongest reusable product-page structure and supported product messaging.
- `components/site/PublicPricingPage.tsx`: pricing layout and final CTA pattern.
- `app/layout.tsx`: global metadata pattern with `metadataBase`, canonical, Open Graph, Twitter image.
- `lib/site-config.ts`: site name, domain, base URL, description.
- `lib/content-types.ts`: supported content output types.
- `lib/analysis-options.ts`: supported analysis modules.
- `README.md` and `docs/CURRENT_REPO_STATE.md`: current product boundaries.
- `tests/e2e/built-for-pages.spec.ts`: current Built For route coverage.
- `tests/e2e/marketing-screenshots.spec.ts`: screenshot capture for all Built For pages at 390, 768, 1440, and 1920 widths.

## Supported Product Claims

Claims supported by current public copy and code:
- AudioRepurpose turns calls, demos, webinars, podcasts, updates, meetings, videos, and recorded conversations into transcripts, summaries, insights, quotes, takeaways, chapters, and review-ready content.
- Source intake supports local files, URLs, supported connected sources, and transcript-only workflows.
- Analysis modules include named speakers, summary, insights, chapters, takeaways, and quotes.
- Studio supports profiles, voices, and campaign plans for reusable context.
- Library stores saved drafts, collections, source links, statuses, tags, plan context, and generation context.
- Content generation supports X threads, LinkedIn posts, Instagram carousel/captions, Facebook posts, blog posts, email newsletters, show notes, YouTube descriptions, podcast episode descriptions, short-form video scripts, and quote graphics.
- The product emphasizes source-backed outputs, speaker context, timestamps, transcript context, review-ready drafts, and reusable content operations.
- Navigation already supports the Built For dropdown and all target audiences.
- Pricing and final CTA patterns exist.

## Unsupported Claims Avoided

Avoided or softened:
- Fake customer testimonials, names, logos, or metrics.
- Claims of CRM, help desk, calendar, publishing, or marketing automation integrations.
- Claims that the product automatically detects renewal risk or expansion intent as a guaranteed feature. Use softer language such as "surface signals" or "capture moments."
- Claims of automatic clip/video editing. The product supports short-form video scripts and descriptions, but not verified clip editing.
- Claims that every external source provider works universally. Use "supported sources" or "where provider setup is available."
- Public agency service positioning. Internal agency routes are private operations surfaces only.

## Recommended Route Structure

Keep the existing route structure:
- `/built-for` remains the hub page.
- `/built-for/[slug]` renders every audience from a typed content config.
- Keep slugs as currently present: `marketing-teams`, `founders`, `sales-teams`, `customer-success`, `product-marketers`, `consultants`, `creators`.

## Reusable Component Strategy

1. Move audience content into a structured config module:
   - Recommended path: `components/site/builtForContent.ts`
   - Export `BUILT_FOR_PAGES`, `BUILT_FOR_PAGE_LIST`, `BUILT_FOR_ROUTE_PAGES`, `BUILT_FOR_ROUTE_PAGE_LIST`, `isBuiltForPageSlug`, and `isBuiltForRouteSlug` so existing imports can migrate cleanly.

2. Keep `components/site/BuiltForMarketingPage.tsx` as the reusable template:
   - Use shared marketing primitives from `components/site/marketing.tsx`.
   - Render identical page structure for every audience:
     - Hero
     - Problem cards
     - Key features
     - Workflow
     - Output examples
     - Source-backed confidence section
     - Related audiences
     - FAQ
     - Final CTA
   - Use visual UI cards instead of missing screenshots.

3. Update `components/site/builtForRouteData.ts` to re-export route data from the new content config or remove duplicated content.

4. Add page metadata from config:
   - Unique title and description per audience.
   - Canonical URL via `alternates.canonical`.
   - Open Graph and Twitter values using existing site image `/launch/product-overview-light.png`.

5. Keep navigation/footer:
   - `MarketingNav` already links all Built For pages.
   - `MarketingFooter` links the hub page.
   - No agency marketing links should be added.

## Audience Content Map

Note: this section records the original July 8 planning map. The live page copy after the July 9 uniqueness pass is in `components/site/builtForContent.ts`.

### Marketing Teams

- Page title: Marketing Teams
- URL slug: `marketing-teams`
- Meta title: Marketing Teams | AudioRepurpose
- Meta description: Turn webinars, customer calls, interviews, and campaign research into source-backed campaign drafts, customer proof, and reusable content assets.
- Hero eyebrow: Built for Marketing Teams
- Hero headline: Turn campaign conversations into source-backed content your team can ship
- Hero subheadline: AudioRepurpose helps marketing teams turn customer calls, webinars, founder interviews, and campaign research into transcripts, insights, quotes, and review-ready drafts for the channels they already manage.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - Customer language stays buried in calls.
  - Webinars and interviews create one-off assets instead of reusable campaigns.
  - Teams rewrite the same context for every draft.
  - Strong proof points are hard to trace back to the source.
  - Content review slows down when drafts arrive without evidence.
- Benefits:
  - Turn one recording into multiple channel-ready drafts.
  - Pull real customer phrases, objections, outcomes, and proof points.
  - Keep transcript, speaker, and source context attached.
  - Reuse Studio profile, voice, and plan context.
  - Save strong drafts and quotes in Library collections.
- Feature sections:
  - Campaign-ready drafts: Generate LinkedIn posts, newsletters, blog drafts, quote graphics, and short-form scripts from one source.
  - Customer language extraction: Find phrases, objections, and useful proof from transcripts.
  - Studio campaign context: Apply profile, voice, and plan guidance before generation.
  - Source-backed review: Keep claims tied to recordings, speakers, and transcript context.
  - Library workflow: Save drafts, tags, statuses, source links, and generation context.
  - Output controls: Choose only the content formats that match the source.
- Outputs:
  - LinkedIn posts
  - Email newsletter sections
  - Blog drafts and outlines
  - Quote graphics
  - Short-form video scripts
  - Campaign brief notes
- FAQs:
  - Can marketing teams use customer calls as source material? Yes. The current product messaging supports calls, webinars, demos, interviews, and updates as source material.
  - Does AudioRepurpose publish content automatically? No verified publishing automation exists in the site. Treat outputs as review-ready drafts.
  - Can outputs keep brand voice consistent? Studio supports reusable profiles, voices, and plans for generation context.
  - Can we save useful drafts for later campaigns? Yes. Library supports saved drafts, collections, statuses, tags, source links, and generation context.
  - What content formats are supported? Supported formats include LinkedIn posts, X threads, newsletters, blog posts, show notes, YouTube descriptions, podcast descriptions, short-form scripts, and quote graphics.
- Final CTA: Turn your next campaign recording into source-backed assets your team can review and reuse.

### Sales Teams

- Page title: Sales Teams
- URL slug: `sales-teams`
- Meta title: Sales Teams | AudioRepurpose
- Meta description: Turn sales calls into source-backed summaries, buyer language, objections, follow-up context, and enablement-ready content.
- Hero eyebrow: Built for Sales Teams
- Hero headline: Turn sales conversations into buyer language, objections, and useful follow-up assets
- Hero subheadline: AudioRepurpose helps sales teams capture the questions, objections, competitor mentions, and customer language already happening inside discovery calls, demos, and follow-up conversations.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - Objections are repeated but not organized.
  - Buyer language gets paraphrased after the call.
  - Follow-up context lives in scattered notes.
  - Marketing and sales lose the exact customer phrasing.
  - Team learning depends on who heard the call.
- Benefits:
  - Turn calls into concise summaries and takeaways.
  - Preserve buyer language and important quotes with speaker context.
  - Capture objections and competitor mentions for later review.
  - Create enablement snippets and follow-up material from real calls.
  - Build a source-backed loop between sales and marketing.
- Feature sections:
  - Objection capture: Surface repeated concerns, blockers, and decision questions.
  - Buyer language library: Save the phrases prospects use to describe pain and value.
  - Call summaries: Create concise summaries, decisions, takeaways, and follow-up notes.
  - Competitive context: Capture competitor mentions from transcripts without inventing claims.
  - Speaker-aware quotes: Keep important lines tied to the right speaker.
  - Enablement drafts: Turn source material into posts, FAQs, and internal notes.
- Outputs:
  - Discovery call summaries
  - Objection digests
  - Follow-up email context
  - Competitive note summaries
  - Customer quote banks
  - Sales enablement snippets
- FAQs:
  - Does this replace a CRM? No. The current site does not claim CRM functionality.
  - Can it summarize sales calls? Yes. Summaries, takeaways, insights, and quotes are supported analysis outputs.
  - Can it identify competitor mentions? It can extract useful transcript insights and themes; review is still required before using competitive claims.
  - Can marketing use sales-call language? Yes. Library and source-backed drafts can make useful buyer language easier to reuse.
  - Does it generate follow-up emails directly? Email newsletter/content outputs are supported, but not a dedicated CRM email-send workflow.
- Final CTA: Make every important sales call easier to summarize, search, and reuse.

### Product Marketers

- Page title: Product Marketers
- URL slug: `product-marketers`
- Meta title: Product Marketers | AudioRepurpose
- Meta description: Pull customer language, objections, competitive notes, proof points, and launch angles from recorded market conversations.
- Hero eyebrow: Built for Product Marketers
- Hero headline: Turn market conversations into positioning, proof, and launch angles
- Hero subheadline: AudioRepurpose helps product marketers extract customer language, objections, alternatives, outcomes, and campaign ideas from calls, interviews, webinars, and launch discussions.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - Positioning research is spread across transcripts and call notes.
  - Launch ideas lose their source context.
  - Customer proof is hard to trace back to specific recordings.
  - Objection and competitor patterns stay anecdotal.
  - Campaign drafts start without the market language behind them.
- Benefits:
  - Capture voice-of-customer language from recordings.
  - Organize objections, alternatives, themes, and proof points.
  - Turn launch discussions into posts, newsletters, briefs, and blog drafts.
  - Keep messaging claims source-backed.
  - Reuse plan and voice context across launch work.
- Feature sections:
  - Positioning signal: Pull pain, value, alternatives, and outcome language from transcripts.
  - Launch content drafts: Generate channel-ready drafts from launch source material.
  - Objection patterns: Capture repeated objections and unanswered questions.
  - Competitive notes: Keep competitor mentions as reviewable source context.
  - Proof point library: Save quotes, outcomes, and examples for campaigns.
  - Studio plan guidance: Tie drafts to campaign objective, channels, and audience.
- Outputs:
  - Messaging research summaries
  - Launch angle notes
  - Customer quote banks
  - Sales narrative snippets
  - Blog and newsletter drafts
  - Objection pattern digests
- FAQs:
  - Can this support voice-of-customer research? Yes, by turning recordings into transcripts, summaries, insights, quotes, and reusable Library assets.
  - Does it prove market claims automatically? No. It keeps source context attached so teams can review evidence before publishing.
  - Can it help with launches? Yes. Studio plans and supported content outputs can shape launch posts, newsletters, blog drafts, and campaign material.
  - Can product marketers save proof points? Yes. Library supports saved drafts and source-backed context.
  - Does it include win/loss analysis? Not as a named product feature. Use general insight extraction and summary language.
- Final CTA: Build clearer messaging from the conversations behind your product.

### Creators

- Page title: Creators
- URL slug: `creators`
- Meta title: Creators | AudioRepurpose
- Meta description: Repurpose podcasts, videos, interviews, voice notes, and demos into transcripts, highlights, posts, newsletters, show notes, and source-backed drafts.
- Hero eyebrow: Built for Creators
- Hero headline: Turn long-form recordings into consistent content across channels
- Hero subheadline: AudioRepurpose helps creators repurpose podcasts, interviews, videos, livestreams, demos, and voice notes into transcripts, highlights, show notes, posts, newsletters, scripts, and quote graphics.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - One recording contains too many ideas to process manually.
  - Good quotes and clips are hard to find later.
  - Show notes, posts, and newsletters take extra passes.
  - Drafts can drift away from the original point.
  - Reusing the same voice and audience context takes time.
- Benefits:
  - Turn one episode or video into multiple draft formats.
  - Extract quotes, takeaways, chapters, and summaries.
  - Keep drafts tied to transcript and speaker context.
  - Use Studio voice guidance for consistent tone.
  - Save reusable ideas and drafts in Library.
- Feature sections:
  - Multi-channel draft generation: Create posts, X threads, newsletters, show notes, scripts, and quote graphics.
  - Highlight extraction: Surface strong ideas, quotes, stories, and takeaways.
  - Show notes support: Generate episode summaries and timestamped notes.
  - Voice consistency: Use Studio profile and voice context.
  - Library reuse: Save ideas and drafts for future content.
  - Source-aware editing: Keep the transcript available during review.
- Outputs:
  - Podcast show notes
  - YouTube descriptions
  - LinkedIn posts
  - X threads
  - Email newsletters
  - Quote graphics
- FAQs:
  - Can creators upload video as source material? Yes. The site supports audio and video source intake.
  - Does AudioRepurpose edit video clips? No verified clip-editing workflow exists. It supports short-form video scripts and content drafts.
  - Can it create show notes? Yes. Show notes are a supported content type.
  - Can it keep quotes attached to speakers? Speaker-aware transcripts and quote attribution are supported product themes.
  - Can one recording become multiple outputs? Yes. Current copy and content types support multiple selected outputs from one source.
- Final CTA: Turn your next episode, interview, or video into a reusable content library.

### Founders

- Page title: Founders
- URL slug: `founders`
- Meta title: Founders | AudioRepurpose
- Meta description: Turn founder thinking, customer learning, product updates, investor updates, and internal recordings into clear source-backed drafts and notes.
- Hero eyebrow: Built for Founders
- Hero headline: Turn founder thinking and customer learning into clear, review-ready updates
- Hero subheadline: AudioRepurpose helps founders capture product thinking, customer calls, investor updates, voice notes, and team context before useful ideas disappear into recordings.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - Founder ideas are scattered across voice notes and calls.
  - Customer learning fades before it becomes useful content.
  - Investor and team updates take time to assemble.
  - Product decisions lose the customer language behind them.
  - Content work starts from a blank page.
- Benefits:
  - Turn raw thoughts and calls into summaries, drafts, and notes.
  - Capture customer language and repeated themes.
  - Build founder POV content from source material.
  - Keep transcript and proof attached for review.
  - Reuse company profile, voice, and plan context.
- Feature sections:
  - Founder POV capture: Turn voice notes, updates, and interviews into draft content.
  - Customer learning extraction: Pull themes, objections, outcomes, and useful language from calls.
  - Update drafting: Shape recordings into newsletters, posts, and internal notes.
  - Company context reuse: Store profile, audience, voice, and plans in Studio.
  - Source of record: Keep transcripts, speakers, summaries, and drafts connected.
  - Lean review workflow: Move from recording to draft without adding a heavy process.
- Outputs:
  - Founder LinkedIn posts
  - Investor update notes
  - Product narrative drafts
  - Customer learning summaries
  - Launch notes
  - Team update summaries
- FAQs:
  - Can founders use voice notes? The product supports recorded conversations and source intake; voice notes are safe to position as recorded source material.
  - Can it create investor updates? Use this as a draft/note use case, not as a financial reporting feature.
  - Can it help with founder-led content? Yes. Current copy supports founder POV, posts, newsletters, and source-backed drafts.
  - Can it keep company context reusable? Studio supports profile, voice, and plan context.
  - Does it replace strategy work? No. It helps turn source material into review-ready notes and drafts.
- Final CTA: Put your next founder recording to work before the context fades.

### Customer Success Teams

- Page title: Customer Success Teams
- URL slug: `customer-success`
- Meta title: Customer Success Teams | AudioRepurpose
- Meta description: Turn customer conversations into feedback, education ideas, onboarding notes, success story inputs, renewal context, and source-backed proof points.
- Hero eyebrow: Built for Customer Success Teams
- Hero headline: Turn customer conversations into feedback, education, and proof your team can reuse
- Hero subheadline: AudioRepurpose helps customer success teams turn onboarding calls, QBRs, interviews, and recurring customer conversations into summaries, insights, quotes, help-content ideas, and source-backed assets.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - Product feedback lives in recurring calls.
  - Help content ideas are repeated but not captured.
  - Customer proof points stay anecdotal.
  - Onboarding and QBR notes are hard to reuse.
  - Risks and follow-ups can be buried in long recordings.
- Benefits:
  - Capture feedback, blockers, wins, and recurring themes.
  - Turn customer education moments into reusable drafts.
  - Preserve customer quotes and outcomes for review.
  - Summarize onboarding and QBR calls with source context.
  - Share useful customer learning across teams.
- Feature sections:
  - Feedback capture: Extract product requests, blockers, and recurring themes.
  - Customer education drafts: Turn onboarding and support conversations into reusable guides and notes.
  - Success story inputs: Capture outcomes, before-and-after moments, and quotes.
  - Handoff context: Keep transcript, speaker, summary, and decisions together.
  - Signal review: Surface risks, opportunities, and follow-ups as reviewable notes.
  - Library reuse: Save proof points and education ideas for future work.
- Outputs:
  - Onboarding call summaries
  - QBR recap notes
  - Product feedback digests
  - Help content outlines
  - Customer quote banks
  - Success story source notes
- FAQs:
  - Can customer success teams use call recordings? Yes. Calls and customer conversations are core supported source material.
  - Does AudioRepurpose manage renewals? No. Use it to capture and review source-backed customer context, not as a renewal system.
  - Can it help create help content? It can turn recordings into drafts, outlines, summaries, and notes that can inform help content.
  - Can it capture product feedback? Yes, product feedback and customer language are supported public messaging.
  - Can other teams reuse CS insights? Yes. Library and source-backed drafts support reuse across teams.
- Final CTA: Turn customer calls into reusable context for feedback, education, and proof.

### Consultants

- Page title: Consultants
- URL slug: `consultants`
- Meta title: Consultants | AudioRepurpose
- Meta description: Turn workshops, client interviews, discovery calls, and strategy sessions into summaries, insights, recommendations, briefs, and client-ready drafts.
- Hero eyebrow: Built for Consultants
- Hero headline: Turn client recordings into source-backed briefs, insights, and deliverable drafts
- Hero subheadline: AudioRepurpose helps consultants turn workshops, client interviews, discovery calls, and strategy sessions into transcripts, summaries, quotes, themes, recommendations, and review-ready client materials.
- Primary CTA: Sign up for free
- Secondary CTA: View pricing
- Pain points:
  - Workshops and discovery calls are too long to process manually.
  - Recommendations need source context.
  - Client language gets lost between call and deliverable.
  - Follow-up notes take time to structure.
  - Useful ideas are hard to reuse across projects.
- Benefits:
  - Turn long sessions into summaries, decisions, and next steps.
  - Extract themes, priorities, quotes, and open questions.
  - Draft briefs, outlines, recommendations, and follow-up material.
  - Keep source context available during review.
  - Save reusable expertise and client assets in Library.
- Feature sections:
  - Client call summaries: Create concise summaries, decisions, open questions, and next steps.
  - Workshop signal extraction: Pull themes, priorities, blockers, and useful language.
  - Draft deliverables: Generate outlines, notes, recommendations, and client-facing content.
  - Source-backed review: Return to transcript and speaker context when claims need proof.
  - Library organization: Save reusable frameworks, drafts, and client source material.
  - Voice control: Use Studio voice settings for polished, consistent client materials.
- Outputs:
  - Workshop recaps
  - Discovery call summaries
  - Strategy notes
  - Recommendation outlines
  - Proposal inputs
  - Client quote capture
- FAQs:
  - Can consultants use workshops as source material? Yes. Workshops and client calls fit the recorded conversation workflow.
  - Does AudioRepurpose create finished consulting decks? No verified deck-generation feature exists. Use briefs, notes, outlines, summaries, and drafts.
  - Can it help with follow-up after calls? Yes, summaries, takeaways, decisions, and draft materials are supported.
  - Can client-specific context be reused? Library and Studio support saved context and reusable draft organization.
  - Are outputs source-backed? The product emphasizes retaining transcript, speaker, and source context for review.
- Final CTA: Turn your next client session into a clearer, source-backed deliverable draft.

## Questions And Assumptions

- Assumption: The current seven Built For audiences are the full set for this implementation because they already exist in the route data, nav dropdown, screenshot spec, and E2E spec.
- Assumption: Use `Sign up for free` as the primary CTA on Built For pages because the marketing nav and existing Built For pages use it.
- Assumption: Use `/pricing` as the hero secondary CTA and `Book a demo` in final CTAs where the current pattern already does.
- Assumption: Do not add a social proof/testimonial block with fabricated customers. Use source-backed proof and related audience sections instead.
- Assumption: Use UI mockups and existing visual primitives rather than new image assets unless a verified screenshot already exists for the product page.
