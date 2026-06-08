# Phase 6B: Public Agency Website Foundation

Status: Implemented and reviewed. Not committed.

## Objective

Build the separate public agency website foundation for the done-for-you startup content and customer communication service.

## Routes Added or Updated

- `/agency`
- `/agency/services`
- `/agency/process`
- `/agency/packages`
- `/agency/contact`
- `/agency/thank-you`

The public routes are unauthenticated and intentionally separate from `/dashboard` and `/dashboard/agency`.

## Components Added

- `components/site/AgencySite.tsx`
- `components/site/AgencyLeadForm.tsx`

`AgencySite.tsx` centralizes the public agency header, hero, service grid, process steps, fit sections, FAQ, CTA sections, and contact section.

## Copy Approach

The website positions the agency as:

```text
Done-for-you startup content and customer communication.
```

The copy emphasizes:

- source-first content operations
- startup founder content
- customer updates and support communication
- human review and manual delivery
- service outcomes instead of software seats, usage credits, or SaaS signup

## Separation Notes

The public agency site does not link to internal agency console routes, agency APIs, SaaS billing, or SaaS dashboard signup paths as the primary conversion flow.

The primary CTA is agency intake at `/agency/contact`.

## Intentionally Not Built

- client portal
- payment or package checkout
- public SaaS signup flow changes
- public access to agency dashboard
- Slack or Granola workflow details
- automatic content generation from the public site

## Review Notes

- Public CTAs point to agency intake/contact.
- Public copy presents a managed service, not a software product.
- The agency site does not expose internal table names, route names, or operational implementation details.

## Validation

Focused tests passed:

```bash
npm test -- tests/lib/public-agency-content.test.ts tests/lib/agency-leads.test.ts tests/lib/agency-leads-route.test.ts tests/lib/agency-schema.test.ts --runInBand
```

Full TypeScript, lint, and diff validation are tracked in Phase 6G.
