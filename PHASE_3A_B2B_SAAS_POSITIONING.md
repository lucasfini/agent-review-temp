# Phase 3A: B2B SaaS Product Positioning

## Objective

Update public and authenticated SaaS-facing copy so AudioRepurpose is presented as an AI content workspace for B2B teams, not only a podcast repurposing tool or an agency service.

## Positioning Statement

AudioRepurpose is an AI content workspace for startups and growing teams to turn calls, meetings, demos, webinars, audio, ideas, and company knowledge into polished LinkedIn posts, newsletters, founder updates, launch announcements, campaign drafts, summaries, and scripts.

## Audience

Primary SaaS customers:

- Startup founders
- Small marketing teams
- B2B SaaS companies
- Consultants and coaches
- Creator-led businesses
- Teams with regular calls, podcasts, webinars, demos, meetings, and updates to repurpose

## Copy Principles

- Present the product as self-serve SaaS software.
- Keep agency services separate from the SaaS journey.
- Use "source material" and "company knowledge" where the product handles more than podcast episodes.
- Keep transcription, speaker attribution, analysis, and content generation as the core value chain.
- Describe subscription plans around recurring content operations, source volume, and review workflows.

## Updated Surfaces

### Public Homepage

- Reframed the hero badge and hero copy around an AI content workspace for B2B teams.
- Removed the agency link from the SaaS homepage navigation to keep the SaaS journey separate.
- Expanded source examples beyond podcasts to calls, meetings, demos, founder updates, webinars, ideas, and company knowledge.
- Updated output examples to include founder updates, launch announcements, campaign drafts, newsletters, LinkedIn, and summaries.
- Reframed pricing and CTA copy around monthly source volume and content operations.

### Authentication

- Updated login and signup side-panel copy from a generic recording workflow to a source-material-to-content workflow.
- Reframed signup helper copy around creating a team workspace for B2B content.

### First-Run Onboarding

- Updated the first-login modal to describe source material, extracted ideas, and a team content pipeline.
- Changed the primary action label from a generic file upload to adding source material.

### Authenticated Dashboard

- Reframed the project hub as a content workspace.
- Updated empty-state copy to guide users toward adding calls, meetings, demos, webinars, founder updates, or podcasts.
- Updated upload page copy to describe source material and B2B content outputs.
- Updated usage empty-state copy to avoid podcast-only framing.

### Billing

- Updated visible subscription card copy around recurring B2B content operations.
- Updated public pricing copy and seeded subscription plan descriptions to match the B2B SaaS positioning.

## Explicit Non-Goals

This phase did not:

- Build an agency console
- Build or revise the separate agency website
- Implement Slack or Granola workflows
- Add brand voice, campaign, or content-library CRUD
- Change billing behavior, entitlement behavior, checkout, portal, or Stripe webhooks
- Change transcription, analysis, or generation logic

## Review Notes

- The SaaS homepage no longer routes users to the agency page through the main navigation.
- Existing source capabilities remain unchanged; this is a positioning and copy update.
- The current product still has deeper features planned in later phases, including brand voice, campaigns, and a content library.

## Follow-Up Considerations

- Phase 3B should use this positioning when naming brand voice fields and empty states.
- Phase 3C and later content-library work should prefer "source material", "content workspace", "campaign drafts", and "review workflow" language.
- If production databases already contain plan descriptions from the earlier seed, update the live `plans.description` rows to match this document.
