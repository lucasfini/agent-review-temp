# Phase 6C: Agency Service Packages and Conversion Copy

Status: Implemented and reviewed. Not committed.

## Objective

Refine the public agency website into a clearer conversion surface with package details, fit guidance, objections, FAQs, and consistent intake CTAs.

## Copy Sections Added

Shared package and conversion copy lives in `lib/public-agency-content.ts`.

Sections include:

- service packages
- service outcomes
- package inclusions
- cadence and best-fit guidance
- who this is for
- who this is not for
- public FAQ
- public agency routes
- contact form field strategy

## Package Structure

The four public service packages are:

- Content Operations Setup
- Monthly Founder Content System
- Customer Communication System
- Custom Startup Ops Package

Each package includes:

- outcome
- inclusions
- cadence
- best-fit customer
- CTA to `/agency/contact`

## FAQ and Objection Handling

The FAQ covers:

- whether clients get software access
- how source material is shared
- Slack or meeting-note source material
- brand voice support
- newsletters and LinkedIn
- whether automatic posting is included
- difference from generic AI tools
- setup timing

## CTA Strategy

All package CTAs lead to agency intake. Package pages do not route visitors to SaaS pricing, credits, billing, or internal dashboard access.

## SEO Metadata

Metadata was added to public agency pages using existing Next.js route metadata conventions:

- page title
- description
- canonical alternate route

## Intentionally Not Built

- exact public pricing
- payment
- SaaS signup changes
- client portal
- external CRM integration
- backend intake changes beyond later Phase 6D/E work

## Review Notes

- Copy is service-focused and startup-specific.
- Claims avoid exaggerated growth guarantees.
- Internal workflow names and internal routes are not exposed publicly.

## Validation

Focused content tests passed:

```bash
npm test -- tests/lib/public-agency-content.test.ts --runInBand
```

Full validation is tracked in Phase 6G.
