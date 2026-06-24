# Phase 3E: SaaS Onboarding Flow

## Summary

Phase 3E adds a lightweight B2B SaaS onboarding path at `/dashboard/onboarding`.

The flow helps organization owners and admins set up:

- organization profile context
- default brand voice
- first campaign context
- billing entry point

Existing dashboard access is preserved. There is no forced redirect into onboarding, and existing users can continue using `/dashboard/hub`, uploads, campaigns, billing, and settings as before.

## Implemented Behavior

- Added onboarding state fields to `organizations`:
  - `onboarding_completed_at`
  - `onboarding_skipped_at`
  - `onboarding_metadata_json`
- Extended `/api/organizations/current`:
  - `GET` returns onboarding state for the active/requested organization.
  - `PATCH` updates organization name, onboarding profile metadata, skipped state, and completed state.
  - Writes require owner/admin access and reject demo users.
  - Requested `organization_id` is resolved through the active organization access helper.
- Added `/dashboard/onboarding`:
  - Loads the current organization, brand voices, campaigns, and current subscription state.
  - Updates the organization profile through `/api/organizations/current`.
  - Creates or updates the first brand voice through existing brand voice APIs.
  - Creates or updates the first campaign through existing campaign APIs.
  - Lets users save, complete, or skip setup.
- Added optional entry points:
  - first-login welcome modal CTA
  - dashboard sidebar Setup link
  - empty project hub Setup link

## Scope Boundaries

This phase does not:

- redesign the dashboard
- enforce billing
- add agency onboarding
- add team invites
- build Slack or Granola integrations

## Review Checklist

- Existing users are not trapped in onboarding.
- No redirect loop was added.
- Onboarding state is stored on the organization record.
- Organization profile updates are org-scoped.
- Brand voice setup uses the existing organization-scoped brand voice APIs.
- Campaign setup uses the existing organization-scoped campaign APIs.
- Demo users cannot write onboarding state.
- Non-admin organization members cannot update organization setup.
- Dashboard routes remain accessible without completing onboarding.

## Validation

Checks run:

- `npm test -- tests/lib/current-organization.test.ts tests/lib/current-organization-route.test.ts --runInBand`
- `npm test -- tests/lib/brand-voices-route.test.ts tests/lib/campaigns-content-library-route.test.ts --runInBand`
- `npx tsc --noEmit`
- `npm run lint` (passes with existing warnings)
- `curl -I http://127.0.0.1:3000/dashboard/onboarding` against `npm run dev`

Runtime smoke result:

- Unauthenticated requests redirect to `/auth/login?redirect_to=%2Fdashboard%2Fonboarding`, matching existing dashboard protection.
